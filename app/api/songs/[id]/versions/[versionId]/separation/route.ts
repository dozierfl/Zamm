import { env } from "cloudflare:workers";
import { getSql } from "../../../../../../../db";
import { apiError, requireUser } from "../../../../../../../lib/auth";
import { appConfig, type AppBindings } from "../../../../../../../lib/config";

const bindings = env as unknown as AppBindings;

type Source = {
  songId: string;
  versionId: string;
  sourceAssetId: string;
  storageKey: string;
  mimeType: string;
  durationSeconds: number;
};
type RemoteAsset = {
  assetKey: string;
  role: "DERIVED_STEM";
  instrument: string;
  instrumentGroup: string;
  provenance: "SEPARATED";
  sortOrder: number;
  audio: { sourceUrl: string };
  metadata: {
    mimeType: string;
    codec: string;
    sampleRate: number;
    bitDepth: number;
    channels: number;
    durationSeconds: number;
    checksum: string;
    waveformData: number[];
  };
  providerMetadata: Record<string, unknown>;
};
type SeparationState = {
  jobId: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED";
  progress: number;
  message: string;
  errorCode?: string;
  assets?: RemoteAsset[];
};

async function stableUuid(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  ).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function ownedSource(userId: string, songId: string, versionId: string) {
  const sql = getSql(bindings.DATABASE_URL),
    rows = await sql<Source[]>`
      select s.id as "songId",v.id as "versionId",a.id as "sourceAssetId",
        a.storage_key as "storageKey",a.mime_type as "mimeType",
        v.duration_seconds::float8 as "durationSeconds"
      from songs s
      join song_versions v on v.song_id=s.id
      join audio_assets a on a.id=v.audio_asset_id and a.owner_id=s.user_id
      where s.id=${songId} and v.id=${versionId} and s.user_id=${userId}
        and s.archived_at is null
      limit 1
    `;
  return rows[0];
}

function serviceHeaders(token?: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id, versionId } = await params,
      source = await ownedSource(user.id, id, versionId),
      config = appConfig(bindings),
      sql = getSql(bindings.DATABASE_URL);
    if (!source)
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Song version not found.", retryable: false } },
        { status: 404 },
      );
    const existing = await sql<{ count: number }[]>`
      select count(*)::int count from version_assets
      where song_version_id=${versionId} and generation_method='SEPARATION'
        and role='DERIVED_STEM'
    `;
    if ((existing[0]?.count || 0) >= 4)
      return Response.json({
        job: { jobId: "persisted", status: "COMPLETE", progress: 100, message: "Separated tracks are already ready." },
      });
    if (!config.aiServiceBaseUrl)
      return Response.json(
        { error: { code: "SEPARATION_UNAVAILABLE", message: "The local stem separator is not running.", retryable: true } },
        { status: 503 },
      );
    const object = await bindings.AUDIO.get(source.storageKey);
    if (!object) throw new Error("SOURCE_AUDIO_MISSING");
    const response = await fetch(`${config.aiServiceBaseUrl}/v1/stem-separation`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-audio-mime-type": source.mimeType,
        ...serviceHeaders(config.aiServiceToken),
      },
      body: await object.arrayBuffer(),
    });
    if (!response.ok) {
      console.error("Stem separation start failed", response.status, await response.text());
      throw new Error("SEPARATION_START_FAILED");
    }
    return Response.json({ job: (await response.json()) as SeparationState }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const uploaded: string[] = [];
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id, versionId } = await params,
      jobId = new URL(request.url).searchParams.get("jobId") || "",
      source = await ownedSource(user.id, id, versionId),
      config = appConfig(bindings),
      sql = getSql(bindings.DATABASE_URL);
    if (!source)
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Song version not found.", retryable: false } },
        { status: 404 },
      );
    const persisted = await sql<{ count: number }[]>`
      select count(*)::int count from version_assets
      where song_version_id=${versionId} and generation_method='SEPARATION'
        and role='DERIVED_STEM'
    `;
    if ((persisted[0]?.count || 0) >= 4)
      return Response.json({
        job: { jobId, status: "COMPLETE", progress: 100, message: "Separated tracks are ready.", persisted: true },
      });
    if (!jobId || !config.aiServiceBaseUrl)
      return Response.json(
        { error: { code: "SEPARATION_JOB_REQUIRED", message: "Start separation again.", retryable: true } },
        { status: 400 },
      );
    const statusResponse = await fetch(
      `${config.aiServiceBaseUrl}/v1/stem-separation/${encodeURIComponent(jobId)}`,
      { headers: serviceHeaders(config.aiServiceToken) },
    );
    if (!statusResponse.ok) {
      console.error("Stem separation status failed", statusResponse.status, await statusResponse.text());
      throw new Error("SEPARATION_STATUS_FAILED");
    }
    const state = (await statusResponse.json()) as SeparationState;
    if (state.status !== "COMPLETE") return Response.json({ job: state });
    if (!state.assets || state.assets.length < 4) throw new Error("SEPARATION_INCOMPLETE_RESULT");
    const prepared = [] as Array<{
      asset: RemoteAsset;
      id: string;
      mappingId: string;
      storageKey: string;
      bytes: Uint8Array;
    }>;
    for (const asset of state.assets) {
      if (
        asset.role !== "DERIVED_STEM" ||
        asset.provenance !== "SEPARATED" ||
        !asset.audio.sourceUrl ||
        Math.abs(asset.metadata.durationSeconds - source.durationSeconds) > 0.2
      )
        throw new Error("SEPARATION_INVALID_RESULT");
      const audioResponse = await fetch(asset.audio.sourceUrl, {
        headers: serviceHeaders(config.aiServiceToken),
      });
      if (!audioResponse.ok) throw new Error("SEPARATION_ASSET_DOWNLOAD_FAILED");
      const bytes = new Uint8Array(await audioResponse.arrayBuffer()),
        digest = await crypto.subtle.digest("SHA-256", bytes),
        checksum = [...new Uint8Array(digest)]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      if (checksum !== asset.metadata.checksum) throw new Error("SEPARATION_CHECKSUM_MISMATCH");
      const assetId = await stableUuid(`${versionId}:${jobId}:${asset.assetKey}`),
        mappingId = await stableUuid(`${versionId}:mapping:${jobId}:${asset.assetKey}`),
        storageKey = `users/${user.id}/songs/${id}/versions/${versionId}/stems/${assetId}.wav`;
      await bindings.AUDIO.put(storageKey, bytes, {
        httpMetadata: { contentType: "audio/wav" },
        customMetadata: { ownerId: user.id, songId: id, versionId, sourceAssetId: source.sourceAssetId, role: "DERIVED_STEM" },
      });
      uploaded.push(storageKey);
      prepared.push({ asset, id: assetId, mappingId, storageKey, bytes });
    }
    try {
      await sql.begin(async (tx) => {
        for (const item of prepared) {
          const metadata = item.asset.metadata;
          await tx`
            insert into audio_assets(
              id,owner_id,storage_key,mime_type,codec,sample_rate,bit_depth,channels,
              duration_seconds,file_size,checksum,waveform_data,analysis_metadata
            ) values(
              ${item.id},${user.id},${item.storageKey},${metadata.mimeType},${metadata.codec},
              ${metadata.sampleRate},${metadata.bitDepth},${metadata.channels},
              ${metadata.durationSeconds},${item.bytes.byteLength},${metadata.checksum},
              ${tx.json(metadata.waveformData)},${tx.json({
                ...item.asset.providerMetadata,
                separationJobId: jobId,
                sourceAssetId: source.sourceAssetId,
              })}
            ) on conflict (id) do nothing
          `;
          await tx`
            insert into version_assets(
              id,song_version_id,audio_asset_id,source_asset_id,generation_method,
              role,instrument,instrument_group,source_type,sort_order,is_primary,
              source_end_seconds,metadata
            ) values(
              ${item.mappingId},${versionId},${item.id},${source.sourceAssetId},'SEPARATION',
              'DERIVED_STEM',${item.asset.instrument},${item.asset.instrumentGroup},
              'SEPARATED',${item.asset.sortOrder},false,${item.asset.metadata.durationSeconds},
              ${tx.json({ ...item.asset.providerMetadata, separationJobId: jobId })}
            ) on conflict (song_version_id,audio_asset_id) do nothing
          `;
        }
      });
    } catch (error) {
      await Promise.all(uploaded.map((key) => bindings.AUDIO.delete(key)));
      throw error;
    }
    return Response.json({
      job: { ...state, assets: undefined, persisted: true, message: `${prepared.length} separated tracks are ready.` },
    });
  } catch (error) {
    if (uploaded.length) await Promise.all(uploaded.map((key) => bindings.AUDIO.delete(key)));
    return apiError(error);
  }
}
