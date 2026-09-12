import { env } from "cloudflare:workers";
import { getSql } from "../../../../db";
import { apiError, requireUser } from "../../../../lib/auth";
import type { AppBindings } from "../../../../lib/config";

const bindings = env as unknown as AppBindings;
const allowedKeys = new Set([
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
]);

function readAscii(view: DataView, offset: number, length: number) {
  return String.fromCharCode(
    ...Array.from({ length }, (_, index) => view.getUint8(offset + index)),
  );
}

function inspectPcm16Wav(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  if (
    bytes.byteLength < 44 ||
    readAscii(view, 0, 4) !== "RIFF" ||
    readAscii(view, 8, 4) !== "WAVE"
  )
    throw new Error("INVALID_SONG_IMPORT_AUDIO");
  let offset = 12,
    channels = 0,
    sampleRate = 0,
    bitDepth = 0,
    format = 0,
    dataOffset = 0,
    dataSize = 0;
  while (offset + 8 <= view.byteLength) {
    const name = readAscii(view, offset, 4),
      size = view.getUint32(offset + 4, true),
      start = offset + 8;
    if (start + size > view.byteLength) throw new Error("INVALID_SONG_IMPORT_AUDIO");
    if (name === "fmt " && size >= 16) {
      format = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      bitDepth = view.getUint16(start + 14, true);
    }
    if (name === "data") {
      dataOffset = start;
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (
    format !== 1 ||
    channels !== 2 ||
    bitDepth !== 16 ||
    sampleRate !== 48000 ||
    !dataOffset ||
    !dataSize
  )
    throw new Error("INVALID_SONG_IMPORT_AUDIO");
  const durationSeconds = dataSize / (sampleRate * channels * 2);
  if (durationSeconds < 1 || durationSeconds > 600)
    throw new Error("INVALID_SONG_IMPORT_AUDIO");
  const waveform = Array.from({ length: 96 }, (_, part) => {
    const frameCount = dataSize / (channels * 2),
      first = Math.floor((part * frameCount) / 96),
      last = Math.floor(((part + 1) * frameCount) / 96);
    let peak = 0;
    for (let frame = first; frame < last; frame += 32) {
      const sampleOffset = dataOffset + frame * channels * 2;
      peak = Math.max(
        peak,
        Math.abs(view.getInt16(sampleOffset, true)) / 32768,
        Math.abs(view.getInt16(sampleOffset + 2, true)) / 32768,
      );
    }
    return Number(peak.toFixed(4));
  });
  return { channels, sampleRate, bitDepth, durationSeconds, waveform };
}

export async function POST(request: Request) {
  let storedKey: string | undefined;
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      form = await request.formData(),
      audio = form.get("audio"),
      rightsAttested = String(form.get("rightsAttested")) === "true",
      title = String(form.get("title") || "Imported song").trim().slice(0, 120),
      bpm = Number(form.get("bpm")),
      musicalKey = String(form.get("key") || ""),
      scale = String(form.get("scale") || "");
    if (!rightsAttested) throw new Error("SONG_IMPORT_RIGHTS_REQUIRED");
    if (
      !(audio instanceof File) ||
      !["audio/wav", "audio/x-wav"].includes(audio.type) ||
      audio.size < 512 ||
      audio.size > 120 * 1024 * 1024 ||
      !title ||
      !Number.isInteger(bpm) ||
      bpm < 40 ||
      bpm > 220 ||
      !allowedKeys.has(musicalKey) ||
      !["major", "minor"].includes(scale)
    )
      throw new Error("INVALID_SONG_IMPORT_AUDIO");
    const bytes = await audio.arrayBuffer(),
      media = inspectPcm16Wav(bytes),
      digest = await crypto.subtle.digest("SHA-256", bytes),
      checksum = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
      songId = crypto.randomUUID(),
      jobId = crypto.randomUUID(),
      versionId = crypto.randomUUID(),
      assetId = crypto.randomUUID(),
      mappingId = crypto.randomUUID(),
      now = new Date().toISOString(),
      storageKey = `users/${user.id}/songs/${songId}/versions/${versionId}/master/${assetId}.wav`,
      prompt = "Private owned full mix imported for multitrack editing",
      compositionPlan = {
        titleSuggestions: [title],
        genre: "Imported audio",
        subgenres: [],
        mood: [],
        bpm,
        key: musicalKey,
        scale,
        timeSignature: "4/4",
        durationSeconds: media.durationSeconds,
        instrumentation: [],
        vocal: { enabled: true, role: "", tone: "", delivery: "" },
        structure: [],
        generationCaption: prompt,
        negativeInstructions: [],
      },
      requestPayload = {
        prompt,
        lyrics: "",
        instrumental: false,
        durationSeconds: media.durationSeconds,
        outputMode: "MASTER_ONLY",
        rightsAttested: true,
      };
    storedKey = storageKey;
    await bindings.AUDIO.put(storageKey, bytes, {
      httpMetadata: { contentType: "audio/wav" },
      customMetadata: {
        ownerId: user.id,
        songId,
        versionId,
        purpose: "OWNED_FULL_MIX_IMPORT",
      },
    });
    const sql = getSql(bindings.DATABASE_URL);
    try {
      await sql.begin(async (tx) => {
        await tx`
          insert into songs(id,user_id,title,description,lyrics,is_instrumental,next_version_number)
          values(${songId},${user.id},${title},${prompt},'',false,2)
        `;
        await tx`
          insert into generation_jobs(
            id,version_id,user_id,song_id,reserved_version_number,idempotency_key,
            operation_type,provider,provider_model,status,progress,request_payload,
            composition_plan,seed,attempt_count,max_attempts,started_at,completed_at
          ) values(
            ${jobId},${versionId},${user.id},${songId},1,${`song-import:${jobId}`},
            'IMPORT_SONG','user-upload','owned-master-v1','COMPLETE',100,
            ${tx.json(requestPayload)},${tx.json(compositionPlan)},0,1,1,now(),now()
          )
        `;
        await tx`
          insert into audio_assets(
            id,owner_id,generation_job_id,storage_key,mime_type,codec,sample_rate,
            bit_depth,channels,duration_seconds,file_size,checksum,waveform_data,
            analysis_metadata
          ) values(
            ${assetId},${user.id},${jobId},${storageKey},'audio/wav','pcm_s16le',
            ${media.sampleRate},${media.bitDepth},${media.channels},${media.durationSeconds},
            ${audio.size},${checksum},${tx.json(media.waveform)},${tx.json({
              purpose: "OWNED_FULL_MIX_IMPORT",
              rightsAttested: true,
              originalFilename: audio.name,
            })}
          )
        `;
        await tx`
          insert into song_versions(
            id,song_id,generation_job_id,version_number,audio_asset_id,duration_seconds,
            bpm,musical_key,scale,lyrics,prompt,style_prompt,composition_plan,provider,
            provider_model,provider_metadata,seed
          ) values(
            ${versionId},${songId},${jobId},1,${assetId},${media.durationSeconds},${bpm},
            ${musicalKey},${scale},'',${prompt},${prompt},${tx.json(compositionPlan)},
            'user-upload','owned-master-v1',${tx.json({
              purpose: "OWNED_FULL_MIX_IMPORT",
              originalFilename: audio.name,
            })},0
          )
        `;
        await tx`
          insert into version_assets(
            id,song_version_id,audio_asset_id,generation_method,role,source_type,
            sort_order,is_primary,source_end_seconds,metadata
          ) values(
            ${mappingId},${versionId},${assetId},'UPLOAD','MASTER','UPLOADED',0,true,
            ${media.durationSeconds},${tx.json({
              purpose: "OWNED_FULL_MIX_IMPORT",
              rightsAttested: true,
            })}
          )
        `;
      });
    } catch (error) {
      await bindings.AUDIO.delete(storageKey);
      storedKey = undefined;
      throw error;
    }
    return Response.json(
      {
        song: {
          id: jobId,
          songId,
          title,
          prompt,
          createdAt: now,
          version: 1,
          duration: media.durationSeconds,
          bpm,
          musicalKey: `${musicalKey} ${scale}`,
          genre: "Imported audio",
          provider: "user-upload",
          status: "COMPLETE",
          progress: 100,
          waveform: media.waveform,
          seed: 0,
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
