import { env } from "cloudflare:workers";
import { getSql } from "../../../../../../../../../db";
import { apiError, requireUser } from "../../../../../../../../../lib/auth";
import type { AppBindings } from "../../../../../../../../../lib/config";

const bindings = env as unknown as AppBindings;

type SourceVersion = {
  id: string;
  duration: number;
  bpm: number;
  musicalKey: string;
  scale: string;
  lyrics: string;
  prompt: string;
  stylePrompt: string;
  compositionPlan: Record<string, unknown>;
  seed: number;
  vocalProfileId: string | null;
  vocalProfileVersionId: string | null;
};

type Mapping = {
  id: string;
  audioAssetId: string;
  sourceAssetId: string | null;
  generationMethod: string;
  role: string;
  instrument: string | null;
  instrumentGroup: string | null;
  sourceType: string;
  sortOrder: number;
  timelineStartSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number | null;
  gainDb: number;
  pan: number;
  metadata: Record<string, unknown>;
};

function analyzePcm16Wav(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    ascii = (offset: number, length: number) =>
      String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.length < 44 || ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE")
    throw new Error("INVALID_REPLACEMENT_AUDIO");
  let offset = 12,
    channels = 0,
    sampleRate = 0,
    bitDepth = 0,
    format = 0,
    dataOffset = 0,
    dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = ascii(offset, 4),
      size = view.getUint32(offset + 4, true),
      start = offset + 8;
    if (id === "fmt " && size >= 16) {
      format = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      bitDepth = view.getUint16(start + 14, true);
    }
    if (id === "data") {
      dataOffset = start;
      dataSize = Math.min(size, bytes.length - start);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (
    format !== 1 ||
    channels !== 2 ||
    bitDepth !== 16 ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    !dataSize
  )
    throw new Error("INVALID_REPLACEMENT_AUDIO");
  const frameCount = Math.floor(dataSize / (channels * 2)),
    waveform = Array.from({ length: 96 }, (_, index) => {
      const start = Math.floor((index * frameCount) / 96),
        end = Math.floor(((index + 1) * frameCount) / 96);
      let peak = 0;
      for (let frame = start; frame < end; frame += 8)
        for (let channel = 0; channel < channels; channel += 1)
          peak = Math.max(
            peak,
            Math.abs(view.getInt16(dataOffset + (frame * channels + channel) * 2, true)) /
              32768,
          );
      return Number(peak.toFixed(4));
    });
  return { channels, sampleRate, bitDepth, duration: frameCount / sampleRate, waveform };
}

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; versionId: string; trackId: string }> },
) {
  let storedKey: string | undefined;
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id, versionId, trackId } = await params,
      form = await request.formData(),
      audio = form.get("audio"),
      rightsAttested = String(form.get("rightsAttested")) === "true";
    if (!rightsAttested) throw new Error("TRACK_REPLACEMENT_RIGHTS_REQUIRED");
    if (
      !(audio instanceof File) ||
      !["audio/wav", "audio/x-wav"].includes(audio.type) ||
      audio.size < 512 ||
      audio.size > 120 * 1024 * 1024
    )
      throw new Error("INVALID_REPLACEMENT_AUDIO");

    const sql = getSql(bindings.DATABASE_URL),
      versions = await sql<SourceVersion[]>`
        select v.id,v.duration_seconds::float8 duration,v.bpm,
          v.musical_key as "musicalKey",v.scale,v.lyrics,v.prompt,
          v.style_prompt as "stylePrompt",v.composition_plan as "compositionPlan",v.seed,
          v.vocal_profile_id as "vocalProfileId",
          v.vocal_profile_version_id as "vocalProfileVersionId"
        from song_versions v join songs s on s.id=v.song_id
        where v.id=${versionId} and s.id=${id} and s.user_id=${user.id}
          and s.archived_at is null limit 1
      `,
      mappings = await sql<Mapping[]>`
        select va.id,va.audio_asset_id as "audioAssetId",va.source_asset_id as "sourceAssetId",
          va.generation_method as "generationMethod",va.role,va.instrument,
          va.instrument_group as "instrumentGroup",va.source_type as "sourceType",
          va.sort_order as "sortOrder",va.timeline_start_seconds::float8 as "timelineStartSeconds",
          va.source_start_seconds::float8 as "sourceStartSeconds",
          va.source_end_seconds::float8 as "sourceEndSeconds",va.gain_db::float8 as "gainDb",
          va.pan::float8 pan,va.metadata
        from version_assets va join audio_assets a on a.id=va.audio_asset_id
        where va.song_version_id=${versionId} and a.owner_id=${user.id}
          and va.role in ('NATIVE_TRACK','DERIVED_STEM','EFFECT_RETURN')
        order by va.sort_order
      `,
      version = versions[0],
      target = mappings.find((mapping) => mapping.id === trackId);
    if (!version)
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Song version not found.", retryable: false } },
        { status: 404 },
      );
    if (
      !target ||
      !["NATIVE_TRACK", "DERIVED_STEM"].includes(target.role) ||
      mappings.length < 2
    )
      throw new Error("INVALID_REPLACEMENT_TRACK");

    const bytes = new Uint8Array(await audio.arrayBuffer()),
      analysis = analyzePcm16Wav(bytes);
    if (Math.abs(analysis.duration - version.duration) > 0.2)
      throw new Error("REPLACEMENT_DURATION_MISMATCH");
    const digest = await crypto.subtle.digest("SHA-256", bytes),
      checksum = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
      jobId = crypto.randomUUID(),
      newVersionId = crypto.randomUUID(),
      assetId = crypto.randomUUID(),
      storageKey = `users/${user.id}/songs/${id}/versions/${newVersionId}/tracks/${assetId}.wav`;
    storedKey = storageKey;
    await bindings.AUDIO.put(storageKey, bytes, {
      httpMetadata: { contentType: "audio/wav" },
      customMetadata: {
        ownerId: user.id,
        songId: id,
        versionId: newVersionId,
        role: target.role,
        purpose: "TRACK_REPLACEMENT",
      },
    });

    let versionNumber = 0;
    try {
      await sql.begin(async (tx) => {
        const counters = await tx<{ nextVersion: number }[]>`
          select next_version_number as "nextVersion" from songs
          where id=${id} and user_id=${user.id} for update
        `;
        versionNumber = counters[0]?.nextVersion || 0;
        if (!versionNumber) throw new Error("SONG_NOT_FOUND");
        await tx`update songs set next_version_number=next_version_number+1,updated_at=now() where id=${id}`;
        await tx`
          insert into generation_jobs(
            id,version_id,user_id,song_id,parent_version_id,reserved_version_number,
            idempotency_key,operation_type,provider,provider_model,status,progress,
            request_payload,composition_plan,seed,attempt_count,max_attempts,started_at,completed_at
          ) values(
            ${jobId},${newVersionId},${user.id},${id},${versionId},${versionNumber},
            ${`track-replace:${jobId}`},'TRACK_REPLACE','user-upload','aligned-track-v1',
            'COMPLETE',100,${tx.json({
              prompt: version.prompt,
              outputMode: "MULTI_ASSET",
              replacedTrackId: trackId,
              originalFilename: audio.name,
              rightsAttested: true,
            })},${tx.json(JSON.parse(JSON.stringify(version.compositionPlan)))},${version.seed},1,1,now(),now()
          )
        `;
        await tx`
          insert into audio_assets(
            id,owner_id,generation_job_id,storage_key,mime_type,codec,sample_rate,
            bit_depth,channels,duration_seconds,file_size,checksum,waveform_data,analysis_metadata
          ) values(
            ${assetId},${user.id},${jobId},${storageKey},'audio/wav','pcm_s16le',
            ${analysis.sampleRate},${analysis.bitDepth},${analysis.channels},${analysis.duration},
            ${bytes.byteLength},${checksum},${tx.json(analysis.waveform)},${tx.json({
              purpose: "TRACK_REPLACEMENT",
              sourceVersionId: versionId,
              replacedTrackId: trackId,
              replacedAudioAssetId: target.audioAssetId,
              originalFilename: audio.name,
              rightsAttested: true,
            })}
          )
        `;
        await tx`
          insert into song_versions(
            id,song_id,parent_version_id,generation_job_id,version_number,audio_asset_id,
            vocal_profile_id,vocal_profile_version_id,duration_seconds,bpm,musical_key,scale,
            lyrics,prompt,style_prompt,composition_plan,provider,provider_model,provider_metadata,seed
          ) values(
            ${newVersionId},${id},${versionId},${jobId},${versionNumber},null,
            ${version.vocalProfileId},${version.vocalProfileVersionId},${version.duration},${version.bpm},
            ${version.musicalKey},${version.scale},${version.lyrics},${version.prompt},
            ${version.stylePrompt},${tx.json(JSON.parse(JSON.stringify(version.compositionPlan)))},
            'dozi-track-editor','aligned-track-v1',${tx.json({
              sourceVersionId: versionId,
              replacedTrackId: trackId,
              replacementAudioAssetId: assetId,
              nonDestructive: true,
              draftRequiresRender: true,
            })},${version.seed}
          )
        `;
        for (const mapping of mappings) {
          const replacement = mapping.id === trackId;
          await tx`
            insert into version_assets(
              id,song_version_id,audio_asset_id,source_asset_id,generation_method,role,
              instrument,instrument_group,source_type,sort_order,is_primary,
              timeline_start_seconds,source_start_seconds,source_end_seconds,gain_db,pan,metadata
            ) values(
              ${crypto.randomUUID()},${newVersionId},${replacement ? assetId : mapping.audioAssetId},
              ${replacement ? mapping.audioAssetId : mapping.sourceAssetId},
              ${replacement ? "UPLOAD" : mapping.generationMethod},${mapping.role},${mapping.instrument},
              ${mapping.instrumentGroup},${replacement ? "UPLOADED" : mapping.sourceType},
              ${mapping.sortOrder},false,${replacement ? 0 : mapping.timelineStartSeconds},
              ${replacement ? 0 : mapping.sourceStartSeconds},
              ${replacement ? analysis.duration : mapping.sourceEndSeconds},${mapping.gainDb},${mapping.pan},
              ${tx.json(
                JSON.parse(
                  JSON.stringify(
                    replacement
                      ? {
                          ...mapping.metadata,
                          purpose: "TRACK_REPLACEMENT",
                          replacedMappingId: mapping.id,
                          originalFilename: audio.name,
                          rightsAttested: true,
                        }
                      : mapping.metadata,
                  ),
                ),
              )}
            )
          `;
        }
      });
    } catch (error) {
      await bindings.AUDIO.delete(storageKey);
      storedKey = undefined;
      throw error;
    }
    return Response.json(
      {
        version: {
          id: newVersionId,
          version: versionNumber,
          duration: version.duration,
          audioAssetId: null,
          audioUrl: undefined,
          createdAt: new Date().toISOString(),
          draftRequiresRender: true,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (storedKey) await bindings.AUDIO.delete(storedKey);
    return apiError(error);
  }
}
