import { env } from "cloudflare:workers";
import { getSql } from "../../../../../db";
import { apiError, requireUser } from "../../../../../lib/auth";
import type { AppBindings } from "../../../../../lib/config";

const bindings = env as unknown as AppBindings;
const allowedTypes: Record<string, { extension: string; codec: string }> = {
  "audio/webm": { extension: "webm", codec: "opus" },
  "audio/mp4": { extension: "m4a", codec: "aac" },
  "audio/x-m4a": { extension: "m4a", codec: "aac" },
  "audio/ogg": { extension: "ogg", codec: "opus" },
  "audio/wav": { extension: "wav", codec: "pcm" },
  "audio/x-wav": { extension: "wav", codec: "pcm" },
  "audio/flac": { extension: "flac", codec: "flac" },
  "audio/mpeg": { extension: "mp3", codec: "mp3" },
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let storedKey: string | undefined;
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id } = await params,
      form = await request.formData(),
      audio = form.get("audio"),
      rightsAttested = String(form.get("rightsAttested")) === "true",
      durationSeconds = Number(form.get("durationSeconds")),
      channelCount = Number(form.get("channelCount") || 1),
      sampleRate = Number(form.get("sampleRate") || 48000),
      label = String(form.get("label") || "Owned artist punch-in").trim().slice(0, 100);
    if (!rightsAttested)
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_RIGHTS_REQUIRED",
            message: "Confirm that you own or control this punch-in recording.",
            retryable: false,
          },
        },
        { status: 400 },
      );
    if (!(audio instanceof File)) throw new Error("INVALID_VOCAL_REPAIR_AUDIO");
    const mimeType = audio.type.split(";")[0],
      media = allowedTypes[mimeType],
      maximumBytes = 100 * 1024 * 1024;
    if (
      !media ||
      audio.size < 512 ||
      audio.size > maximumBytes ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0.25 ||
      durationSeconds > 90 ||
      ![1, 2].includes(channelCount) ||
      !Number.isFinite(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000
    )
      throw new Error("INVALID_VOCAL_REPAIR_AUDIO");
    const sql = getSql(bindings.DATABASE_URL),
      repairs = await sql<
        Array<{
          id: string;
          songId: string;
          startSeconds: number;
          endSeconds: number;
          status: string;
        }>
      >`
        select id,song_id as "songId",start_seconds::float8 as "startSeconds",
          end_seconds::float8 as "endSeconds",status
        from vocal_repair_sessions
        where id=${id} and owner_id=${user.id}
        limit 1
      `,
      repair = repairs[0];
    if (!repair)
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Repair not found.", retryable: false } },
        { status: 404 },
      );
    if (["APPLIED", "CANCELLED"].includes(repair.status))
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_CLOSED",
            message: "This repair can no longer accept new takes.",
            retryable: false,
          },
        },
        { status: 409 },
      );
    const bytes = await audio.arrayBuffer(),
      checksumBytes = await crypto.subtle.digest("SHA-256", bytes),
      checksum = [...new Uint8Array(checksumBytes)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
      assetId = crypto.randomUUID(),
      candidateId = crypto.randomUUID(),
      storageKey = `vocal-repairs/${user.id}/${id}/${assetId}.${media.extension}`;
    storedKey = storageKey;
    await bindings.AUDIO.put(storageKey, bytes, {
      httpMetadata: { contentType: mimeType },
      customMetadata: {
        ownerId: user.id,
        repairId: id,
        purpose: "OWNED_PUNCH_IN",
      },
    });
    try {
      await sql.begin(async (tx) => {
        await tx`
          insert into audio_assets(
            id,owner_id,storage_key,mime_type,codec,sample_rate,bit_depth,
            channels,duration_seconds,file_size,checksum,waveform_data,analysis_metadata
          ) values(
            ${assetId},${user.id},${storageKey},${mimeType},${media.codec},
            ${sampleRate},16,${channelCount},${durationSeconds},${audio.size},
            ${checksum},${tx.json([])},${tx.json({
              purpose: "VOCAL_REPAIR_CANDIDATE",
              repairId: id,
              source: "OWNED_PUNCH_IN",
              region: [repair.startSeconds, repair.endSeconds],
            })}
          )
        `;
        await tx`
          insert into vocal_repair_candidates(
            id,repair_session_id,audio_asset_id,method,label,status,metadata
          ) values(
            ${candidateId},${id},${assetId},'OWNED_PUNCH_IN',${label},'READY',
            ${tx.json({ rightsAttested: true, originalFilename: audio.name })}
          )
        `;
        await tx`
          update vocal_repair_sessions
          set status=case when status='SELECTED' then status else 'READY' end,
            updated_at=now()
          where id=${id}
        `;
      });
    } catch (error) {
      await bindings.AUDIO.delete(storageKey);
      storedKey = undefined;
      throw error;
    }
    return Response.json(
      {
        candidate: {
          id: candidateId,
          repairSessionId: id,
          audioAssetId: assetId,
          method: "OWNED_PUNCH_IN",
          label,
          status: "READY",
          audioUrl: `/api/audio/${assetId}`,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (storedKey) await bindings.AUDIO.delete(storedKey);
    return apiError(error);
  }
}
