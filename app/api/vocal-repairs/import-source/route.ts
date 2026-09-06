import { env } from "cloudflare:workers";
import { getSql } from "../../../../db";
import { apiError, requireUser } from "../../../../lib/auth";
import type { AppBindings } from "../../../../lib/config";

const bindings = env as unknown as AppBindings;

export async function POST(request: Request) {
  let storedKey: string | undefined;
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      form = await request.formData(),
      audio = form.get("audio"),
      rightsAttested = String(form.get("rightsAttested")) === "true",
      durationSeconds = Number(form.get("durationSeconds")),
      sampleRate = Number(form.get("sampleRate") || 48000),
      title = String(form.get("title") || "Imported vocal repair source")
        .trim()
        .slice(0, 120);
    if (!rightsAttested)
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_RIGHTS_REQUIRED",
            message: "Confirm that you own or control this vocal recording.",
            retryable: false,
          },
        },
        { status: 400 },
      );
    if (
      !(audio instanceof File) ||
      !["audio/wav", "audio/x-wav"].includes(audio.type) ||
      audio.size < 512 ||
      audio.size > 120 * 1024 * 1024 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0.25 ||
      durationSeconds > 600 ||
      !Number.isFinite(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000
    )
      throw new Error("INVALID_VOCAL_REPAIR_AUDIO");
    const bytes = await audio.arrayBuffer(),
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
      storageKey = `vocal-repair-sources/${user.id}/${songId}/${assetId}.wav`,
      safeTitle = title || "Imported vocal repair source",
      compositionPlan = {
        titleSuggestions: [safeTitle],
        genre: "Vocal repair",
        subgenres: [],
        mood: ["Source"],
        bpm: 120,
        key: "C",
        scale: "major",
        timeSignature: "4/4",
        durationSeconds,
        instrumentation: [],
        vocal: { enabled: true, role: "Lead Vocal", tone: "", delivery: "" },
        structure: [],
        generationCaption: "Private owned vocal imported for phrase repair.",
        negativeInstructions: [],
      },
      requestPayload = {
        prompt: "Private owned vocal imported for phrase repair",
        lyrics: "",
        instrumental: false,
        durationSeconds,
        outputMode: "MULTI_ASSET",
      };
    storedKey = storageKey;
    await bindings.AUDIO.put(storageKey, bytes, {
      httpMetadata: { contentType: "audio/wav" },
      customMetadata: {
        ownerId: user.id,
        songId,
        purpose: "VOCAL_REPAIR_SOURCE_IMPORT",
      },
    });
    const sql = getSql(bindings.DATABASE_URL);
    try {
      await sql.begin(async (tx) => {
        await tx`
          insert into songs(id,user_id,title,description,lyrics,is_instrumental,next_version_number)
          values(${songId},${user.id},${safeTitle},'Private vocal repair source','',false,2)
        `;
        await tx`
          insert into generation_jobs(
            id,version_id,user_id,song_id,reserved_version_number,idempotency_key,
            operation_type,provider,provider_model,status,progress,request_payload,
            composition_plan,seed,attempt_count,max_attempts,started_at,completed_at
          ) values(
            ${jobId},${versionId},${user.id},${songId},1,${`vocal-repair-import:${jobId}`},
            'IMPORT_VOCAL_REPAIR_SOURCE','user-upload','owned-vocal','COMPLETE',100,
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
            ${sampleRate},16,1,${durationSeconds},${audio.size},${checksum},${tx.json([])},
            ${tx.json({
              purpose: "VOCAL_REPAIR_SOURCE_IMPORT",
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
            ${versionId},${songId},${jobId},1,${assetId},${durationSeconds},120,'C','major',
            '','Private owned vocal imported for phrase repair',
            'Private owned vocal imported for phrase repair',${tx.json(compositionPlan)},
            'user-upload','owned-vocal',${tx.json({
              purpose: "VOCAL_REPAIR_SOURCE_IMPORT",
              originalFilename: audio.name,
            })},0
          )
        `;
        await tx`
          insert into version_assets(
            id,song_version_id,audio_asset_id,generation_method,role,instrument,
            instrument_group,source_type,sort_order,is_primary,metadata
          ) values(
            ${mappingId},${versionId},${assetId},'UPLOAD','NATIVE_TRACK','Lead Vocal',
            'VOCALS','UPLOADED',0,false,${tx.json({ purpose: "VOCAL_REPAIR_SOURCE" })}
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
          title: safeTitle,
          prompt: "Private owned vocal imported for phrase repair",
          createdAt: now,
          version: 1,
          duration: durationSeconds,
          bpm: 120,
          musicalKey: "C major",
          genre: "Vocal repair",
          provider: "user-upload",
          status: "COMPLETE",
          progress: 100,
          waveform: [],
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
