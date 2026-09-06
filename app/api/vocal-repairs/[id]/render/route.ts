import { env } from "cloudflare:workers";
import { getSql } from "../../../../../db";
import { apiError, requireUser } from "../../../../../lib/auth";
import { appConfig, type AppBindings } from "../../../../../lib/config";

const bindings = env as unknown as AppBindings;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value),
    bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

type RenderResult = {
  audioBase64: string;
  mimeType: string;
  codec: string;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  durationSeconds: number;
  checksum: string;
  waveformData: number[];
  metadata: Record<string, unknown>;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let storedKey: string | undefined;
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id } = await params,
      sql = getSql(bindings.DATABASE_URL),
      config = appConfig(bindings),
      rows = await sql<
        Array<{
          id: string;
          status: string;
          sourceVersionId: string;
          sourceAssetId: string | null;
          sourceStorageKey: string | null;
          sourceFileSize: number | null;
          replacementAssetId: string;
          replacementStorageKey: string;
          replacementFileSize: number;
          startSeconds: number;
          endSeconds: number;
          crossfadeMs: number;
        }>
      >`
        select r.id,r.status,r.source_version_id as "sourceVersionId",
          r.source_vocal_asset_id as "sourceAssetId",
          source.storage_key as "sourceStorageKey",
          source.file_size as "sourceFileSize",
          replacement.id as "replacementAssetId",
          replacement.storage_key as "replacementStorageKey",
          replacement.file_size as "replacementFileSize",
          r.start_seconds::float8 as "startSeconds",
          r.end_seconds::float8 as "endSeconds",r.crossfade_ms as "crossfadeMs"
        from vocal_repair_sessions r
        join vocal_repair_candidates c on c.repair_session_id=r.id
          and c.status='SELECTED'
        join audio_assets replacement on replacement.id=c.audio_asset_id
          and replacement.owner_id=r.owner_id
        left join audio_assets source on source.id=r.source_vocal_asset_id
          and source.owner_id=r.owner_id
        where r.id=${id} and r.owner_id=${user.id}
        limit 1
      `,
      repair = rows[0];
    if (!repair)
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_NOT_SELECTED",
            message: "Select a replacement take before rendering.",
            retryable: false,
          },
        },
        { status: 409 },
      );
    if (repair.status === "APPLIED")
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_ALREADY_RENDERED",
            message: "This repair has already been rendered.",
            retryable: false,
          },
        },
        { status: 409 },
      );
    if (repair.status === "RENDERING")
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_RENDERING",
            message: "This repair is already rendering.",
            retryable: true,
          },
        },
        { status: 409 },
      );
    if (!repair.sourceAssetId || !repair.sourceStorageKey)
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_STEM_REQUIRED",
            message: "Import the aligned original vocal stem before rendering.",
            retryable: false,
          },
        },
        { status: 409 },
      );
    if (!config.aiServiceBaseUrl)
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_RENDERER_UNAVAILABLE",
            message: "The local vocal repair renderer is not available.",
            retryable: true,
          },
        },
        { status: 503 },
      );
    if (
      (repair.sourceFileSize || 0) > 120 * 1024 * 1024 ||
      repair.replacementFileSize > 20 * 1024 * 1024
    )
      throw new Error("INVALID_VOCAL_REPAIR_AUDIO");
    const claimed = await sql<{ id: string }[]>`
      update vocal_repair_sessions set status='RENDERING',updated_at=now()
      where id=${id} and owner_id=${user.id} and status in ('SELECTED','FAILED')
      returning id
    `;
    if (!claimed[0])
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_NOT_READY",
            message: "This repair is not ready to render.",
            retryable: true,
          },
        },
        { status: 409 },
      );
    try {
      const [sourceObject, replacementObject] = await Promise.all([
        bindings.AUDIO.get(repair.sourceStorageKey),
        bindings.AUDIO.get(repair.replacementStorageKey),
      ]);
      if (!sourceObject || !replacementObject)
        throw new Error("VOCAL_REPAIR_AUDIO_MISSING");
      const [sourceBytes, replacementBytes] = await Promise.all([
          sourceObject.arrayBuffer(),
          replacementObject.arrayBuffer(),
        ]),
        response = await fetch(`${config.aiServiceBaseUrl}/v1/phrase-repair-render`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(config.aiServiceToken
              ? { authorization: `Bearer ${config.aiServiceToken}` }
              : {}),
          },
          body: JSON.stringify({
            sourceAudioBase64: bytesToBase64(new Uint8Array(sourceBytes)),
            replacementAudioBase64: bytesToBase64(new Uint8Array(replacementBytes)),
            startSeconds: repair.startSeconds,
            endSeconds: repair.endSeconds,
            crossfadeMs: repair.crossfadeMs,
          }),
        });
      if (!response.ok) {
        console.error("Phrase repair renderer failed", response.status, await response.text());
        throw new Error("VOCAL_REPAIR_RENDER_FAILED");
      }
      const render = (await response.json()) as RenderResult,
        audioBytes = base64ToBytes(render.audioBase64),
        digest = await crypto.subtle.digest("SHA-256", audioBytes),
        checksum = [...new Uint8Array(digest)]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      if (
        render.mimeType !== "audio/wav" ||
        checksum !== render.checksum ||
        !Number.isFinite(render.durationSeconds) ||
        audioBytes.byteLength < 512
      )
        throw new Error("VOCAL_REPAIR_RENDER_INVALID");
      const assetId = crypto.randomUUID(),
        mappingId = crypto.randomUUID(),
        storageKey = `vocal-repairs/${user.id}/${id}/render-${assetId}.wav`;
      storedKey = storageKey;
      await bindings.AUDIO.put(storageKey, audioBytes, {
        httpMetadata: { contentType: "audio/wav" },
        customMetadata: {
          ownerId: user.id,
          repairId: id,
          purpose: "RENDERED_VOCAL_REPAIR",
        },
      });
      try {
        await sql.begin(async (tx) => {
          await tx`
            insert into audio_assets(
              id,owner_id,storage_key,mime_type,codec,sample_rate,bit_depth,
              channels,duration_seconds,file_size,checksum,waveform_data,analysis_metadata
            ) values(
              ${assetId},${user.id},${storageKey},${render.mimeType},${render.codec},
              ${render.sampleRate},${render.bitDepth},${render.channels},
              ${render.durationSeconds},${audioBytes.byteLength},${checksum},
              ${tx.json(render.waveformData)},${tx.json({
                purpose: "VOCAL_REPAIR_RENDER",
                repairId: id,
                sourceVocalAssetId: repair.sourceAssetId,
                replacementAssetId: repair.replacementAssetId,
                ...render.metadata,
              })}
            )
          `;
          await tx`
            insert into version_assets(
              id,song_version_id,audio_asset_id,source_asset_id,generation_method,
              role,instrument,instrument_group,source_type,sort_order,is_primary,metadata
            ) values(
              ${mappingId},${repair.sourceVersionId},${assetId},${repair.sourceAssetId},
              'VOCAL_REPAIR','ALTERNATIVE','Repaired Lead Vocal','VOCALS','RENDERED',
              100,false,${tx.json({
                repairId: id,
                replacementAssetId: repair.replacementAssetId,
              })}
            )
          `;
          await tx`
            update vocal_repair_sessions
            set rendered_audio_asset_id=${assetId},status='APPLIED',updated_at=now()
            where id=${id} and owner_id=${user.id}
          `;
        });
      } catch (error) {
        await bindings.AUDIO.delete(storageKey);
        storedKey = undefined;
        throw error;
      }
      return Response.json({
        render: {
          repairId: id,
          audioAssetId: assetId,
          audioUrl: `/api/audio/${assetId}`,
          status: "APPLIED",
          metadata: render.metadata,
        },
      });
    } catch (error) {
      await sql`
        update vocal_repair_sessions set status='FAILED',updated_at=now()
        where id=${id} and owner_id=${user.id} and status='RENDERING'
      `;
      throw error;
    }
  } catch (error) {
    if (storedKey) await bindings.AUDIO.delete(storedKey);
    return apiError(error);
  }
}
