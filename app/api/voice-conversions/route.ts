import { env } from "cloudflare:workers";
import { getSql } from "../../../db";
import { R2AudioStorage } from "../../../lib/audio-storage";
import { apiError, requireUser } from "../../../lib/auth";
import { appConfig, type AppBindings } from "../../../lib/config";
import { requireProjectRole } from "../../../lib/project-access";
import { VoiceConversionOrchestrator } from "../../../lib/voice-conversion-orchestrator";
import {
  CloudflareVoiceConversionQueue,
  InlineVoiceConversionQueue,
} from "../../../lib/voice-conversion-queue";
import { createVoiceProvider } from "../../../lib/voice-provider";

const bindings = env as unknown as AppBindings;
const acceptedAudio = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
]);

function conversionDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.projectId,
    profileId: row.profileId,
    profileName: row.profileName,
    profileVersion: row.profileVersion,
    mode: row.mode,
    voiceIdentityStrength: row.voiceIdentityStrength,
    status: row.status,
    progress: row.progress,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    sourceAudioUrl: row.sourceAssetId ? `/api/audio/${row.sourceAssetId}` : undefined,
    masterAudioUrl: row.masterAssetId ? `/api/audio/${row.masterAssetId}` : undefined,
    vocalAudioUrl: row.vocalAssetId ? `/api/audio/${row.vocalAssetId}` : undefined,
  };
}

const select = `select j.id,j.project_id as "projectId",r.profile_id as "profileId",
  p.name as "profileName",v.version_number as "profileVersion",r.mode,
  r.voice_identity_strength::float8 as "voiceIdentityStrength",j.status,j.progress,
  j.error_code as "errorCode",j.error_message as "errorMessage",j.created_at as "createdAt",
  r.source_asset_id as "sourceAssetId",r.output_master_asset_id as "masterAssetId",
  r.output_vocal_asset_id as "vocalAssetId"
  from jobs j join voice_conversion_runs r on r.job_id=j.id
  join artist_vocal_profiles p on p.id=r.profile_id
  join vocal_profile_versions v on v.id=r.profile_version_id`;

export async function GET(request: Request) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      sql = getSql(bindings.DATABASE_URL),
      rows = await sql<Record<string, unknown>[]>`
        ${sql.unsafe(select)} where j.owner_id=${user.id}
        order by j.created_at desc limit 30
      `;
    return Response.json({ conversions: rows.map(conversionDto) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  let storedKey: string | undefined;
  let committed = false;
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      form = await request.formData(),
      audio = form.get("audio"),
      profileId = String(form.get("profileId") || ""),
      projectId = String(form.get("projectId") || ""),
      submittedMode = String(form.get("mode") || "FULL"),
      mode = submittedMode as "PREVIEW" | "FULL",
      rightsAttested = String(form.get("rightsAttested")) === "true",
      durationSeconds = Number(form.get("durationSeconds")),
      sampleRate = Number(form.get("sampleRate") || 48000),
      channels = Number(form.get("channels") || 2),
      voiceIdentityStrength = Number(form.get("voiceIdentityStrength") || 100),
      idempotencyKey = request.headers.get("idempotency-key") || crypto.randomUUID();
    if (!rightsAttested) throw new Error("VOICE_CONVERSION_RIGHTS_REQUIRED");
    if (
      !projectId ||
      !profileId ||
      !["PREVIEW", "FULL"].includes(submittedMode) ||
      idempotencyKey.length > 200
    ) throw new Error("INVALID_VOICE_CONVERSION");
    if (
      !(audio instanceof File) ||
      !acceptedAudio.has(audio.type) ||
      audio.size < 512 ||
      audio.size > 120 * 1024 * 1024 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 1 ||
      durationSeconds > 600 ||
      (mode === "PREVIEW" && durationSeconds > 600) ||
      !Number.isFinite(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      !Number.isInteger(channels) ||
      channels < 1 ||
      channels > 8 ||
      !Number.isFinite(voiceIdentityStrength) ||
      voiceIdentityStrength < 0 ||
      voiceIdentityStrength > 100
    ) throw new Error("INVALID_VOICE_CONVERSION");
    await requireProjectRole(bindings.DATABASE_URL, user.id, projectId, "VOCALIST");
    const sql = getSql(bindings.DATABASE_URL),
      existing = await sql<Record<string, unknown>[]>`
        ${sql.unsafe(select)} where j.owner_id=${user.id} and j.idempotency_key=${idempotencyKey}
        limit 1
      `;
    if (existing[0]) return Response.json({ conversion: conversionDto(existing[0]) });
    const versions = await sql<{
      profileId: string;
      profileVersionId: string;
      profileName: string;
      versionNumber: number;
      provider: string;
      providerModel: string;
    }[]>`
      select p.id as "profileId",p.name as "profileName",v.id as "profileVersionId",
        v.version_number as "versionNumber",v.provider,v.provider_model as "providerModel"
      from artist_vocal_profiles p join vocal_profile_versions v
        on v.profile_id=p.id and v.is_active=true and v.status='READY' and v.revoked_at is null
      where p.id=${profileId} and p.owner_id=${user.id} and p.status='ACTIVE'
        and p.revoked_at is null and p.consented_at is not null and p.verified_at is not null
      limit 1
    `,
      version = versions[0];
    if (!version) throw new Error("VOCAL_PROFILE_UNAVAILABLE");
    const bytes = new Uint8Array(await audio.arrayBuffer()),
      checksum = await sha256(bytes),
      sourceAssetId = crypto.randomUUID(),
      jobId = crypto.randomUUID(),
      runId = crypto.randomUUID(),
      extension = audio.type.includes("flac")
        ? "flac"
        : audio.type.includes("mpeg")
          ? "mp3"
          : audio.type.includes("ogg")
            ? "ogg"
            : audio.type.includes("mp4") || audio.type.includes("m4a")
              ? "m4a"
              : "wav",
      storageKey = `users/${user.id}/voice-conversions/${runId}/source/${sourceAssetId}.${extension}`;
    storedKey = storageKey;
    await bindings.AUDIO.put(storageKey, bytes, {
      httpMetadata: { contentType: audio.type },
      customMetadata: { ownerId: user.id, jobId, purpose: "VOICE_CONVERSION_SOURCE" },
    });
    await sql.begin(async (tx) => {
      await tx`
        insert into audio_assets(
          id,owner_id,storage_key,mime_type,codec,sample_rate,bit_depth,channels,
          duration_seconds,file_size,checksum,waveform_data,analysis_metadata
        ) values(
          ${sourceAssetId},${user.id},${storageKey},${audio.type},${extension},${sampleRate},
          16,${channels},${durationSeconds},${bytes.byteLength},${checksum},${tx.json([])},
          ${tx.json({
            purpose: "VOICE_CONVERSION_SOURCE",
            rightsAttested: true,
            originalFilename: audio.name,
          })}
        )
      `;
      await tx`
        insert into jobs(
          id,owner_id,project_id,type,status,progress,idempotency_key,provider,
          provider_model,request_payload,result_payload,max_attempts
        ) values(
          ${jobId},${user.id},${projectId},'VOICE_CONVERSION','QUEUED',4,${idempotencyKey},
          ${version.provider},${version.providerModel},${tx.json({
            sourceAssetId,
            profileId,
            profileVersionId: version.profileVersionId,
            mode,
            voiceIdentityStrength,
          })},'{}'::jsonb,3
        )
      `;
      await tx`
        insert into voice_conversion_runs(
          id,job_id,owner_id,project_id,profile_id,profile_version_id,source_asset_id,
          mode,voice_identity_strength
        ) values(
          ${runId},${jobId},${user.id},${projectId},${profileId},${version.profileVersionId},
          ${sourceAssetId},${mode},${voiceIdentityStrength}
        )
      `;
      await tx`
        insert into job_events(job_id,type,status,progress,message,metadata)
        values(${jobId},'STATUS','QUEUED',4,'Voice conversion queued',${tx.json({ runId, mode })})
      `;
    });
    committed = true;
    const config = appConfig(bindings),
      orchestrator = new VoiceConversionOrchestrator(
        sql,
        new R2AudioStorage(bindings.AUDIO),
        (name) => createVoiceProvider(name, config),
      ),
      queue = bindings.GENERATION_QUEUE
        ? new CloudflareVoiceConversionQueue(bindings.GENERATION_QUEUE)
        : new InlineVoiceConversionQueue((id) => orchestrator.process(id));
    try {
      await queue.enqueue(jobId);
    } catch {
      await sql.begin(async (tx) => {
        await tx`
          update jobs set status='FAILED',progress=0,error_code='VOICE_QUEUE_UNAVAILABLE',
            error_message='VOICE_QUEUE_UNAVAILABLE',error_retryable=true,updated_at=now()
          where id=${jobId}
        `;
        await tx`
          insert into job_events(job_id,type,status,progress,message,metadata)
          values(${jobId},'ERROR','FAILED',0,'VOICE_QUEUE_UNAVAILABLE','{}'::jsonb)
        `;
      });
      throw new Error("VOICE_QUEUE_UNAVAILABLE");
    }
    return Response.json({
      conversion: {
        id: jobId,
        projectId,
        profileId,
        profileName: version.profileName,
        profileVersion: version.versionNumber,
        mode,
        voiceIdentityStrength,
        status: "QUEUED",
        progress: 4,
        sourceAudioUrl: `/api/audio/${sourceAssetId}`,
        createdAt: new Date().toISOString(),
      },
    }, { status: 202 });
  } catch (error) {
    if (storedKey && !committed) await bindings.AUDIO.delete(storedKey);
    return apiError(error);
  }
}

async function sha256(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
