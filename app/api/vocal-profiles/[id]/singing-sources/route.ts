import { env } from "cloudflare:workers";
import { getSql } from "../../../../../db";
import { apiError, requireUser } from "../../../../../lib/auth";
import type { AppBindings } from "../../../../../lib/config";

const bindings=env as unknown as AppBindings;
const allowedTypes:Record<string,{extension:string;codec:string}>={"audio/webm":{extension:"webm",codec:"opus"},"audio/mp4":{extension:"m4a",codec:"aac"},"audio/x-m4a":{extension:"m4a",codec:"aac"},"audio/ogg":{extension:"ogg",codec:"opus"},"audio/wav":{extension:"wav",codec:"pcm"},"audio/x-wav":{extension:"wav",codec:"pcm"},"audio/flac":{extension:"flac",codec:"flac"},"audio/mpeg":{extension:"mp3",codec:"mp3"}};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 let storedKey:string|undefined;
 try{
  const user=await requireUser(request,bindings.DATABASE_URL),{id}=await params,form=await request.formData(),audio=form.get("audio"),durationSeconds=Number(form.get("durationSeconds")),channelCount=Number(form.get("channelCount")||1),requestedSourceType=String(form.get("sourceType")||"LIVE_SINGING"),sourceType=requestedSourceType==="OWNED_VOCAL_BOUNCE"?"OWNED_VOCAL_BOUNCE":"LIVE_SINGING",captureMethod=sourceType==="OWNED_VOCAL_BOUNCE"?"IMPORTED_OWNED_VOCAL_BOUNCE":"GUIDED_LIVE_SINGING";
  if(!(audio instanceof File))throw new Error("INVALID_VOCAL_RECORDING");
  const media=allowedTypes[audio.type.split(";")[0]],maximumBytes=500*1024*1024,maximumDuration=sourceType==="OWNED_VOCAL_BOUNCE"?1200:90,minimumDuration=sourceType==="OWNED_VOCAL_BOUNCE"?5:15;
  if(!media||audio.size<1024||audio.size>maximumBytes||!Number.isFinite(durationSeconds)||durationSeconds<minimumDuration||durationSeconds>maximumDuration||![1,2].includes(channelCount))throw new Error("INVALID_VOCAL_RECORDING");
  const sql=getSql(bindings.DATABASE_URL),profiles=await sql<{id:string;status:string;consentPolicyVersion:string|null}[]>`select id,status,consent_policy_version as "consentPolicyVersion" from artist_vocal_profiles where id=${id} and owner_id=${user.id} limit 1`,profile=profiles[0];
  if(!profile)return Response.json({error:{code:"NOT_FOUND",message:"Vocal profile not found.",retryable:false}},{status:404});
  if(profile.status==="DRAFT"||profile.status==="REVOKED"||!profile.consentPolicyVersion)return Response.json({error:{code:"VOCAL_ENROLLMENT_NOT_READY",message:"Complete consent and begin identity enrollment first.",retryable:false}},{status:409});
  const bytes=await audio.arrayBuffer(),checksumBytes=await crypto.subtle.digest("SHA-256",bytes),checksum=[...new Uint8Array(checksumBytes)].map(value=>value.toString(16).padStart(2,"0")).join(""),assetId=crypto.randomUUID(),sourceId=crypto.randomUUID(),storageKey=`vocal-profiles/${user.id}/${id}/singing/${assetId}.${media.extension}`;storedKey=storageKey;
  await bindings.AUDIO.put(storageKey,bytes,{httpMetadata:{contentType:audio.type},customMetadata:{ownerId:user.id,profileId:id,purpose:sourceType}});
  try{
   await sql.begin(async tx=>{
    await tx`insert into audio_assets(id,owner_id,storage_key,mime_type,codec,sample_rate,bit_depth,channels,duration_seconds,file_size,checksum,waveform_data,analysis_metadata) values(${assetId},${user.id},${storageKey},${audio.type},${media.codec},48000,16,${channelCount},${durationSeconds},${audio.size},${checksum},${tx.json([])},${tx.json({purpose:"VOCAL_PROFILE_SOURCE",analysisStatus:"PENDING",captureMethod})})`;
    await tx`insert into vocal_profile_sources(id,profile_id,audio_asset_id,source_type,original_filename,duration_seconds,usable_duration_seconds,rights_attested,consent_policy_version,consented_at,quality_metrics) values(${sourceId},${id},${assetId},${sourceType},${audio.name},${durationSeconds},0,true,${profile.consentPolicyVersion},now(),${tx.json({analysisStatus:"PENDING"})})`;
    await tx`update artist_vocal_profiles set status=case when status='DRAFT' then 'COLLECTING' else status end,updated_at=now() where id=${id}`;
   });
  }catch(error){await bindings.AUDIO.delete(storageKey);storedKey=undefined;throw error}
  return Response.json({source:{id:sourceId,audioAssetId:assetId,sourceType,durationSeconds,usableDurationSeconds:0,analysisStatus:"PENDING"}},{status:202});
 }catch(error){if(storedKey)await bindings.AUDIO.delete(storedKey);return apiError(error)}
}
