import { env } from "cloudflare:workers";
import { getSql } from "../../../db";
import { apiError, requireUser } from "../../../lib/auth";
import type { AppBindings } from "../../../lib/config";
import { compose, createGenerationSchema } from "../../../lib/domain";
import { CloudflareGenerationQueue, InlineTestGenerationQueue } from "../../../lib/generation-queue";
import { GenerationOrchestrator } from "../../../lib/generation-orchestrator";
import { R2AudioStorage } from "../../../lib/audio-storage";
import { createProvider } from "../../../lib/providers";
import { HttpVocalIdentityProcessor } from "../../../lib/vocal-identity-processor";

const bindings=env as unknown as AppBindings;
const dto=(r:Record<string,unknown>)=>({id:r.id,songId:r.songId,title:r.title,prompt:r.prompt,createdAt:r.createdAt,version:r.version||1,duration:r.duration||r.planDuration,bpm:r.bpm,musicalKey:`${r.musicalKey} ${r.scale}`,genre:r.genre,provider:r.provider,vocalist:r.vocalist||undefined,status:r.status,errorMessage:r.errorMessage,progress:r.progress,seed:r.seed,waveform:r.waveform||[],audioUrl:r.audioAssetId?`/api/audio/${r.audioAssetId}`:undefined});

export async function POST(request:Request){try{
  const user=await requireUser(request,bindings.DATABASE_URL),input=createGenerationSchema.parse(await request.json()),cover=input.cover;
  if(!cover?.rightsAttested)throw new Error("COVER_RIGHTS_REQUIRED");
  if(cover.mode==="EXACT"&&(!input.vocalProfileId||cover.voiceIdentityStrength<=0))throw new Error("COVER_VOCALIST_REQUIRED");
  const database=getSql(bindings.DATABASE_URL),sources=await database<{songId:string;title:string;versionId:string;assetId:string}[]>`select s.id as "songId",s.title,v.id as "versionId",a.id as "assetId" from songs s join song_versions v on v.song_id=s.id join audio_assets a on a.id=v.audio_asset_id and a.owner_id=${user.id} where s.id=${cover.sourceSongId} and s.user_id=${user.id} and s.archived_at is null order by v.version_number desc limit 1`,source=sources[0];
  if(!source)throw new Error("COVER_SOURCE_NOT_FOUND");
  const providerName=cover.mode==="EXACT"?"dozi-private-vocal-cover":bindings.MUSIC_PROVIDER||"acestep",castProfileIds=[...new Set(input.vocalCast.flatMap(assignment=>assignment.profileIds))];
  if(cover.mode==="REIMAGINE"&&providerName==="acestep"&&!bindings.AI_SERVICE_BASE_URL)throw new Error("GENERATION_PROVIDER_UNAVAILABLE");
  if(castProfileIds.length){const active=await database<{id:string}[]>`select p.id from artist_vocal_profiles p join vocal_profile_versions v on v.profile_id=p.id and v.is_active=true and v.status='READY' and v.revoked_at is null where p.id in ${database(castProfileIds)} and p.owner_id=${user.id} and p.status='ACTIVE' and p.revoked_at is null`;if(active.length!==castProfileIds.length)throw new Error("VOCAL_PROFILE_UNAVAILABLE")}
  let vocalist:{profileId:string;profileVersionId:string;name:string;versionNumber:number}|null=null;
  if(input.vocalProfileId){const rows=await database<{profileId:string;profileVersionId:string;name:string;versionNumber:number}[]>`select p.id as "profileId",v.id as "profileVersionId",p.name,v.version_number as "versionNumber" from artist_vocal_profiles p join vocal_profile_versions v on v.profile_id=p.id and v.is_active=true and v.status='READY' where p.id=${input.vocalProfileId} and p.owner_id=${user.id} and p.status='ACTIVE' and p.revoked_at is null and v.revoked_at is null limit 1`;vocalist=rows[0]||null;if(!vocalist)throw new Error("VOCAL_PROFILE_UNAVAILABLE")}
  const providerConfig={aiServiceBaseUrl:bindings.AI_SERVICE_BASE_URL,aiServiceToken:bindings.AI_SERVICE_TOKEN,aceStepModel:bindings.ACESTEP_MODEL,minimaxModel:bindings.MINIMAX_MODEL,elevenLabsApiKey:bindings.ELEVENLABS_API_KEY,elevenLabsModel:bindings.ELEVENLABS_MODEL,kieApiKey:bindings.KIE_API_KEY,kieModel:bindings.KIE_MODEL},selectedProvider=cover.mode==="EXACT"?null:createProvider(providerName,providerConfig),storedInput={...input,cover:{...cover,sourceVersionId:source.versionId,sourceAssetId:source.assetId,sourceTitle:source.title}},plan=compose(storedInput),songId=crypto.randomUUID(),jobId=crypto.randomUUID(),versionId=crypto.randomUUID(),seed=input.seed??Math.floor(Math.random()*2147483647),title=input.title||`${source.title} · Cover`,providerModel=cover.mode==="EXACT"?"rvc-v2":selectedProvider!.model,idempotencyKey=request.headers.get("idempotency-key")||crypto.randomUUID();
  await database.begin(async tx=>{await tx`insert into songs(id,user_id,title,description,lyrics,is_instrumental,next_version_number) values(${songId},${user.id},${title},${input.prompt},${input.lyrics||""},${input.instrumental},2)`;await tx`insert into generation_jobs(id,version_id,user_id,song_id,vocal_profile_id,vocal_profile_version_id,reserved_version_number,idempotency_key,operation_type,provider,provider_model,status,progress,request_payload,composition_plan,seed) values(${jobId},${versionId},${user.id},${songId},${vocalist?.profileId||null},${vocalist?.profileVersionId||null},1,${idempotencyKey},'COVER_SONG',${providerName},${providerModel},'QUEUED',4,${tx.json(storedInput)},${tx.json(plan)},${seed})`});
  const processor=bindings.AI_SERVICE_BASE_URL?new HttpVocalIdentityProcessor(bindings.AI_SERVICE_BASE_URL,bindings.AI_SERVICE_TOKEN):undefined,orchestrator=new GenerationOrchestrator(database,new R2AudioStorage(bindings.AUDIO),name=>createProvider(name,providerConfig),processor),queue=bindings.GENERATION_QUEUE?new CloudflareGenerationQueue(bindings.GENERATION_QUEUE):new InlineTestGenerationQueue(id=>orchestrator.process(id));
  await queue.enqueue(jobId);
  return Response.json({song:dto({id:jobId,songId,title,prompt:input.prompt,createdAt:new Date().toISOString(),version:1,duration:plan.durationSeconds,bpm:plan.bpm,musicalKey:plan.key,scale:plan.scale,genre:plan.genre,provider:providerName,vocalist:vocalist?`${vocalist.name} · My Voice V${vocalist.versionNumber}`:undefined,status:"QUEUED",progress:4,seed,waveform:[]})},{status:202});
}catch(error){return apiError(error)}}
