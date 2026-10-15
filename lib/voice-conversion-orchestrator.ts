import type postgres from "postgres";
import type { AudioStorage } from "./audio-storage";
import type { GeneratedAsset, GenerationResult, GenerationStatus } from "./domain";
import type { VoiceProvider } from "./voice-provider";

type Sql = ReturnType<typeof postgres>;
type ConversionJob = {
  id: string;
  ownerId: string;
  runId: string;
  profileId: string;
  profileVersionId: string;
  sourceAssetId: string;
  sourceStorageKey: string;
  sourceMimeType: string;
  sourceCodec: string;
  sourceSampleRate: number;
  sourceBitDepth: number;
  sourceChannels: number;
  sourceDurationSeconds: number;
  sourceChecksum: string;
  mode: "PREVIEW" | "FULL";
  voiceIdentityStrength: number;
  provider: string;
  providerModel: string;
  modelRef: string | null;
  indexRef: string | null;
};

export class VoiceConversionOrchestrator {
  constructor(
    private readonly sql: Sql,
    private readonly storage: AudioStorage,
    private readonly providerFor: (name: string) => VoiceProvider,
  ) {}

  async process(jobId: string) {
    const claimed = await this.sql<{ id: string }[]>`
      update jobs set status='PREPARING',progress=15,attempt_count=attempt_count+1,
        last_attempt_at=now(),started_at=coalesce(started_at,now()),heartbeat_at=now(),updated_at=now()
      where id=${jobId} and type='VOICE_CONVERSION' and status in ('QUEUED','FAILED')
        and cancellation_requested_at is null and attempt_count<max_attempts
      returning id
    `;
    if (!claimed[0]) {
      const existing = await this.sql<{ status: GenerationStatus }[]>`
        select status from jobs where id=${jobId} and type='VOICE_CONVERSION'
      `;
      if (existing[0] && ["COMPLETE", "CANCELLED"].includes(existing[0].status)) return;
      throw new Error("JOB_NOT_CLAIMABLE");
    }
    await this.event(jobId, "STATUS", "PREPARING", 15, "Preparing private vocal conversion");
    const uploaded: string[] = [];
    try {
      const rows = await this.sql<ConversionJob[]>`
        select j.id,j.owner_id as "ownerId",r.id as "runId",r.profile_id as "profileId",
          r.profile_version_id as "profileVersionId",r.source_asset_id as "sourceAssetId",
          source.storage_key as "sourceStorageKey",source.mime_type as "sourceMimeType",
          source.codec as "sourceCodec",source.sample_rate as "sourceSampleRate",
          source.bit_depth as "sourceBitDepth",source.channels as "sourceChannels",
          source.duration_seconds::float8 as "sourceDurationSeconds",source.checksum as "sourceChecksum",
          r.mode,r.voice_identity_strength::float8 as "voiceIdentityStrength",
          v.provider,v.provider_model as "providerModel",
          coalesce(checkpoint.provider_ref,v.provider_model_ref) as "modelRef",
          coalesce(retrieval.provider_ref,v.training_config->>'retrievalIndexRef') as "indexRef"
        from jobs j join voice_conversion_runs r on r.job_id=j.id and r.owner_id=j.owner_id
        join audio_assets source on source.id=r.source_asset_id and source.owner_id=j.owner_id
        join artist_vocal_profiles p on p.id=r.profile_id and p.owner_id=j.owner_id
        join vocal_profile_versions v on v.id=r.profile_version_id and v.profile_id=p.id
        left join voice_model_artifacts checkpoint on checkpoint.profile_version_id=v.id
          and checkpoint.kind='CHECKPOINT' and checkpoint.deleted_at is null
        left join voice_model_artifacts retrieval on retrieval.profile_version_id=v.id
          and retrieval.kind='INDEX' and retrieval.deleted_at is null
        where j.id=${jobId} and j.type='VOICE_CONVERSION' and p.status='ACTIVE'
          and p.revoked_at is null and v.status='READY' and v.revoked_at is null
        limit 1
      `;
      const job = rows[0];
      if (!job?.modelRef || !job.indexRef) throw new Error("VOCAL_PROFILE_MODEL_UNAVAILABLE");
      const sourceBytes = await this.storage.get(job.sourceStorageKey);
      if (!sourceBytes?.byteLength) throw new Error("VOCAL_IDENTITY_SOURCE_MISSING");
      await this.transition(jobId, "GENERATING", 40, "Applying the authorized voice model");
      const source: GeneratedAsset = {
        assetKey: "voice-conversion-source",
        role: "MASTER",
        provenance: "UPLOADED",
        isPrimary: true,
        sortOrder: 0,
        audio: { bytes: sourceBytes },
        metadata: {
          mimeType: job.sourceMimeType,
          codec: job.sourceCodec,
          sampleRate: job.sourceSampleRate,
          bitDepth: job.sourceBitDepth,
          channels: job.sourceChannels,
          durationSeconds: job.sourceDurationSeconds,
          checksum: job.sourceChecksum,
          waveformData: [],
        },
      };
      const provider = this.providerFor(job.provider),
        request = {
          jobId,
          profileId: job.profileId,
          profileVersionId: job.profileVersionId,
          modelRef: job.modelRef,
          indexRef: job.indexRef,
          source,
          voiceIdentityStrength: job.voiceIdentityStrength,
          mode: job.mode,
        } as const,
        result = job.mode === "PREVIEW"
          ? await provider.preview(request)
          : await provider.convert(request);
      this.validate(result);
      await this.transition(jobId, "UPLOADING", 82, "Saving private conversion outputs");
      const assets: Array<{
        asset: GeneratedAsset;
        id: string;
        key: string;
        bytes: Uint8Array;
        checksum: string;
      }> = [];
      for (const asset of result.assets) {
        const bytes = asset.audio.bytes;
        if (!bytes?.byteLength) throw new Error("VOCAL_IDENTITY_INVALID_RESULT");
        const id = await stableUuid(`${jobId}:${asset.assetKey}`),
          checksum = asset.metadata.checksum || await sha256(bytes),
          folder = asset.role === "MASTER" ? "master" : "vocal",
          key = `users/${job.ownerId}/voice-conversions/${job.runId}/${folder}/${id}.wav`;
        await this.storage.put(key, bytes, {
          contentType: asset.metadata.mimeType,
          customMetadata: { ownerId: job.ownerId, jobId, checksum, purpose: "VOICE_CONVERSION" },
        });
        uploaded.push(key);
        assets.push({ asset, id, key, bytes, checksum });
      }
      await this.sql.begin(async (tx) => {
        const current = await tx<{ status: GenerationStatus; cancellation: Date | null }[]>`
          select status,cancellation_requested_at as cancellation from jobs where id=${jobId} for update
        `;
        if (!current[0] || current[0].status === "CANCELLED" || current[0].cancellation)
          throw new Error("GENERATION_CANCELLED");
        for (const item of assets)
          await tx`
            insert into audio_assets(
              id,owner_id,storage_key,mime_type,codec,sample_rate,bit_depth,channels,
              duration_seconds,file_size,checksum,waveform_data,analysis_metadata
            ) values(
              ${item.id},${job.ownerId},${item.key},${item.asset.metadata.mimeType},
              ${item.asset.metadata.codec},${item.asset.metadata.sampleRate},${item.asset.metadata.bitDepth},
              ${item.asset.metadata.channels},${item.asset.metadata.durationSeconds},${item.bytes.byteLength},
              ${item.checksum},${tx.json(item.asset.metadata.waveformData || [])},
              ${tx.json({
                purpose: "VOICE_CONVERSION",
                runId: job.runId,
                profileId: job.profileId,
                profileVersionId: job.profileVersionId,
                sourceAssetId: job.sourceAssetId,
                ...item.asset.providerMetadata,
              })}
            ) on conflict(id) do nothing
          `;
        const master = assets.find((item) => item.asset.role === "MASTER" && item.asset.isPrimary),
          vocal = assets.find((item) => item.asset.instrumentGroup === "VOCALS");
        if (!master || !vocal) throw new Error("VOCAL_IDENTITY_INVALID_RESULT");
        await tx`
          update voice_conversion_runs set output_master_asset_id=${master.id},
            output_vocal_asset_id=${vocal.id},updated_at=now()
          where id=${job.runId} and owner_id=${job.ownerId}
        `;
        await tx`
          update jobs set status='COMPLETE',progress=100,result_payload=${tx.json({
            runId: job.runId,
            masterAssetId: master.id,
            vocalAssetId: vocal.id,
            providerMetadata: JSON.parse(JSON.stringify(result.providerMetadata || {})),
          })},completed_at=now(),heartbeat_at=now(),error_code=null,error_message=null,
            error_retryable=null,updated_at=now()
          where id=${jobId} and status='UPLOADING' and cancellation_requested_at is null
        `;
        await tx`
          insert into job_events(job_id,type,status,progress,message,metadata)
          values(${jobId},'RESULT','COMPLETE',100,'Voice conversion ready',${tx.json({ runId: job.runId })})
        `;
      });
    } catch (error) {
      await Promise.all(uploaded.map((key) => this.storage.delete(key)));
      const cancelled = error instanceof Error && error.message === "GENERATION_CANCELLED",
        message = error instanceof Error ? error.message : "VOCAL_IDENTITY_CONVERSION_FAILED",
        retryable = !cancelled && [
          "VOCAL_IDENTITY_PROCESSOR_UNAVAILABLE",
          "VOCAL_IDENTITY_SEPARATION_FAILED",
          "VOCAL_IDENTITY_CONVERSION_FAILED",
        ].includes(message);
      await this.sql.begin(async (tx) => {
        await tx`
          update jobs set status=${cancelled ? "CANCELLED" : "FAILED"},
            progress=case when ${cancelled} then progress else 0 end,error_code=${message},
            error_message=${message},error_retryable=${retryable},
            next_retry_at=${retryable ? new Date(Date.now() + 30_000) : null},updated_at=now()
          where id=${jobId} and status<>'COMPLETE'
        `;
        await tx`
          insert into job_events(job_id,type,status,progress,message,metadata)
          select id,${cancelled ? "CANCELLED" : "ERROR"}::job_event_type,
            ${cancelled ? "CANCELLED" : "FAILED"}::generation_status,progress,${message},'{}'::jsonb
          from jobs where id=${jobId}
        `;
      });
      throw error;
    }
  }

  private async transition(
    id: string,
    status: GenerationStatus,
    progress: number,
    message: string,
  ) {
    const rows = await this.sql`
      update jobs set status=${status},progress=${progress},heartbeat_at=now(),updated_at=now()
      where id=${id} and status not in ('COMPLETE','CANCELLED')
        and cancellation_requested_at is null returning id
    `;
    if (!rows[0]) throw new Error("GENERATION_CANCELLED");
    await this.event(id, "STATUS", status, progress, message);
  }

  private async event(
    id: string,
    type: "STATUS" | "PROGRESS",
    status: GenerationStatus,
    progress: number,
    message: string,
  ) {
    await this.sql`
      insert into job_events(job_id,type,status,progress,message,metadata)
      values(${id},${type},${status},${progress},${message},'{}'::jsonb)
    `;
  }

  private validate(result: GenerationResult) {
    const master = result.assets.find((asset) => asset.role === "MASTER" && asset.isPrimary),
      vocal = result.assets.find((asset) => asset.instrumentGroup === "VOCALS");
    if (!master || !vocal) throw new Error("VOCAL_IDENTITY_INVALID_RESULT");
    if (Math.abs(master.metadata.durationSeconds - vocal.metadata.durationSeconds) > 0.001)
      throw new Error("VOCAL_IDENTITY_INVALID_RESULT");
  }
}

async function sha256(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function stableUuid(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  ).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
