import { env } from "cloudflare:workers";
import { getSql } from "../../../../../db";
import { apiError, requireUser } from "../../../../../lib/auth";
import type { AppBindings } from "../../../../../lib/config";

const bindings = env as unknown as AppBindings;

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
      sampleRate = Number(form.get("sampleRate") || 48000);
    if (!rightsAttested)
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_RIGHTS_REQUIRED",
            message: "Confirm that you own or control this source vocal stem.",
            retryable: false,
          },
        },
        { status: 400 },
      );
    if (!(audio instanceof File) || !["audio/wav", "audio/x-wav"].includes(audio.type))
      throw new Error("INVALID_VOCAL_REPAIR_AUDIO");
    if (
      audio.size < 512 ||
      audio.size > 500 * 1024 * 1024 ||
      !Number.isFinite(durationSeconds) ||
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
          versionDuration: number;
          repairEndSeconds: number;
          status: string;
        }>
      >`
        select r.id,v.duration_seconds::float8 as "versionDuration",
          r.end_seconds::float8 as "repairEndSeconds",r.status
        from vocal_repair_sessions r
        join song_versions v on v.id=r.source_version_id
        where r.id=${id} and r.owner_id=${user.id}
        limit 1
      `,
      repair = repairs[0];
    if (!repair)
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Repair not found.", retryable: false } },
        { status: 404 },
      );
    if (["RENDERING", "APPLIED", "CANCELLED"].includes(repair.status))
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_CLOSED",
            message: "This repair can no longer replace its source vocal.",
            retryable: false,
          },
        },
        { status: 409 },
      );
    if (
      durationSeconds + 0.02 < repair.repairEndSeconds ||
      durationSeconds > repair.versionDuration + 1
    )
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_SOURCE_DURATION_MISMATCH",
            message:
              "Choose an aligned vocal stem that begins at 0:00 and extends through the repair region.",
            retryable: false,
          },
        },
        { status: 400 },
      );
    const bytes = await audio.arrayBuffer(),
      digest = await crypto.subtle.digest("SHA-256", bytes),
      checksum = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
      assetId = crypto.randomUUID(),
      storageKey = `vocal-repairs/${user.id}/${id}/source-${assetId}.wav`;
    storedKey = storageKey;
    await bindings.AUDIO.put(storageKey, bytes, {
      httpMetadata: { contentType: "audio/wav" },
      customMetadata: { ownerId: user.id, repairId: id, purpose: "SOURCE_VOCAL" },
    });
    try {
      await sql.begin(async (tx) => {
        await tx`
          insert into audio_assets(
            id,owner_id,storage_key,mime_type,codec,sample_rate,bit_depth,
            channels,duration_seconds,file_size,checksum,waveform_data,analysis_metadata
          ) values(
            ${assetId},${user.id},${storageKey},'audio/wav','pcm_s16le',
            ${sampleRate},16,${channelCount},${durationSeconds},${audio.size},
            ${checksum},${tx.json([])},${tx.json({
              purpose: "VOCAL_REPAIR_SOURCE",
              repairId: id,
              rightsAttested: true,
              originalFilename: audio.name,
            })}
          )
        `;
        await tx`
          update vocal_repair_sessions
          set source_vocal_asset_id=${assetId},updated_at=now()
          where id=${id} and owner_id=${user.id}
        `;
      });
    } catch (error) {
      await bindings.AUDIO.delete(storageKey);
      storedKey = undefined;
      throw error;
    }
    return Response.json(
      {
        source: {
          audioAssetId: assetId,
          audioUrl: `/api/audio/${assetId}`,
          durationSeconds,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (storedKey) await bindings.AUDIO.delete(storedKey);
    return apiError(error);
  }
}
