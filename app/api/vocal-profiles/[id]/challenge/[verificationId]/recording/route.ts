import { env } from "cloudflare:workers";
import { getSql } from "../../../../../../../db";
import { apiError, requireUser, sha256 } from "../../../../../../../lib/auth";
import { appConfig, type AppBindings } from "../../../../../../../lib/config";

const bindings=env as unknown as AppBindings;
const allowedTypes:Record<string,{extension:string;codec:string}>={"audio/webm":{extension:"webm",codec:"opus"},"audio/mp4":{extension:"m4a",codec:"aac"},"audio/ogg":{extension:"ogg",codec:"opus"}};
function base64(bytes:Uint8Array){let binary="";for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));return btoa(binary)}

export async function POST(request:Request,{params}:{params:Promise<{id:string;verificationId:string}>}){
 let storedKey:string|undefined;
 try{
  const user=await requireUser(request,bindings.DATABASE_URL),{id,verificationId}=await params,form=await request.formData(),audio=form.get("audio"),challengeToken=String(form.get("challengeToken")||""),phrase=String(form.get("phrase")||""),durationSeconds=Number(form.get("durationSeconds")),channelCount=Number(form.get("channelCount")||1);
  if(!(audio instanceof File)||!challengeToken||!phrase)throw new Error("INVALID_VOCAL_RECORDING");
  const media=allowedTypes[audio.type.split(";")[0]],maximumBytes=15*1024*1024;
  if(!media||audio.size<1024||audio.size>maximumBytes||!Number.isFinite(durationSeconds)||durationSeconds<8||durationSeconds>20||![1,2].includes(channelCount))throw new Error("INVALID_VOCAL_RECORDING");
  const sql=getSql(bindings.DATABASE_URL),rows=await sql<{challengeHash:string;expiresAt:Date;status:string}[]>`select v.challenge_hash as "challengeHash",v.expires_at as "expiresAt",v.status from vocal_identity_verifications v join artist_vocal_profiles p on p.id=v.profile_id where v.id=${verificationId} and v.profile_id=${id} and p.owner_id=${user.id} limit 1`,verification=rows[0];
  if(!verification)return Response.json({error:{code:"NOT_FOUND",message:"Verification challenge not found.",retryable:false}},{status:404});
  if(verification.status!=="PENDING"||new Date(verification.expiresAt).getTime()<=Date.now())return Response.json({error:{code:"VOCAL_CHALLENGE_EXPIRED",message:"This phrase has expired. Create a new one and try again.",retryable:false}},{status:409});
  const submittedHash=await sha256(`${challengeToken}:${phrase.toLowerCase()}`);
  if(submittedHash!==verification.challengeHash)throw new Error("INVALID_VOCAL_CHALLENGE");
  const bytes=await audio.arrayBuffer(),byteArray=new Uint8Array(bytes),config=appConfig(bindings);
  if(!config.aiServiceBaseUrl)throw new Error("VOCAL_ANALYSIS_UNAVAILABLE");
  const analysisResponse=await fetch(`${config.aiServiceBaseUrl}/v1/identity-verification`,{method:"POST",headers:{"content-type":"application/json",...(config.aiServiceToken?{authorization:`Bearer ${config.aiServiceToken}`}:{})},body:JSON.stringify({audioBase64:base64(byteArray),mimeType:audio.type,expectedPhrase:phrase})});
  if(!analysisResponse.ok)throw new Error("VOCAL_ANALYSIS_FAILED");
  const identityAnalysis=await analysisResponse.json() as {passed:boolean;phraseSimilarity:number;signal:{qualityScore:number;metrics:Record<string,number>};reasons:string[]};
  const checksumBytes=await crypto.subtle.digest("SHA-256",bytes),checksum=[...new Uint8Array(checksumBytes)].map(value=>value.toString(16).padStart(2,"0")).join(""),assetId=crypto.randomUUID(),sourceId=crypto.randomUUID();
  const storageKey=`vocal-profiles/${user.id}/${id}/verification/${assetId}.${media.extension}`;storedKey=storageKey;
  await bindings.AUDIO.put(storageKey,bytes,{httpMetadata:{contentType:audio.type},customMetadata:{ownerId:user.id,profileId:id,verificationId}});
  try{
   await sql.begin(async tx=>{
    await tx`insert into audio_assets(id,owner_id,storage_key,mime_type,codec,sample_rate,bit_depth,channels,duration_seconds,file_size,checksum,waveform_data,analysis_metadata) values(${assetId},${user.id},${storageKey},${audio.type},${media.codec},48000,16,${channelCount},${durationSeconds},${audio.size},${checksum},${tx.json([])},${tx.json({purpose:"VOCAL_IDENTITY_VERIFICATION",analysisStatus:identityAnalysis.passed?"PASSED":"REJECTED",phraseSimilarity:identityAnalysis.phraseSimilarity,reasons:identityAnalysis.reasons,...identityAnalysis.signal.metrics})})`;
    await tx`insert into vocal_profile_sources(id,profile_id,audio_asset_id,source_type,original_filename,duration_seconds,usable_duration_seconds,rights_attested,consent_policy_version,consented_at,quality_score,quality_metrics) values(${sourceId},${id},${assetId},'LIVE_SPEECH',${audio.name},${durationSeconds},0,true,'artist-vocal-identity-v1',now(),${identityAnalysis.signal.qualityScore},${tx.json({analysisStatus:identityAnalysis.passed?"PASSED":"REJECTED",phraseSimilarity:identityAnalysis.phraseSimilarity,reasons:identityAnalysis.reasons})})`;
    await tx`update vocal_identity_verifications set spoken_audio_asset_id=${assetId},status=${identityAnalysis.passed?"PASSED":"FAILED"},phrase_match_score=${identityAnalysis.phraseSimilarity},liveness_score=${identityAnalysis.passed?1:0},attempted_at=now(),verified_at=${identityAnalysis.passed?new Date():null},failure_code=${identityAnalysis.passed?null:identityAnalysis.reasons.join(",")} where id=${verificationId} and profile_id=${id}`;
    if(identityAnalysis.passed)await tx`update artist_vocal_profiles set verified_at=now(),updated_at=now() where id=${id}`;
   });
  }catch(error){await bindings.AUDIO.delete(storageKey);storedKey=undefined;throw error}
  return Response.json({verification:{id:verificationId,status:identityAnalysis.passed?"PASSED":"FAILED",audioAssetId:assetId,analysisStatus:identityAnalysis.passed?"PASSED":"REJECTED",phraseMatchScore:identityAnalysis.phraseSimilarity,reasons:identityAnalysis.reasons}},{status:202});
 }catch(error){if(storedKey)await bindings.AUDIO.delete(storedKey);return apiError(error)}
}
