import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { MemoryAudioStorage } from "../lib/audio-storage.ts";
import { compose } from "../lib/domain.ts";
import { GenerationOrchestrator } from "../lib/generation-orchestrator.ts";
import { MockMusicProvider } from "../lib/providers.ts";
import type { MusicGenerationProvider } from "../lib/provider-types.ts";
const url=process.env.TEST_DATABASE_URL;
const integration=url?test:test.skip;
integration("queue recovery, multi-user authorization, idempotency, and failures",async()=>{
  const sql=postgres(url!,{prepare:false}),suffix=crypto.randomUUID().slice(0,8),userA=crypto.randomUUID(),userB=crypto.randomUUID();
  await sql`insert into users(id,email,display_name,password_hash,password_salt) values(${userA},${`a-${suffix}@test.invalid`},'A','x','x'),(${userB},${`b-${suffix}@test.invalid`},'B','x','x')`;
  const makeJob=async(mode:"MASTER_ONLY"|"MULTI_ASSET",provider="mock")=>{const songId=crypto.randomUUID(),jobId=crypto.randomUUID(),versionId=crypto.randomUUID(),input={prompt:"warm reflective soul integration",lyrics:"",instrumental:false,durationSeconds:1,outputMode:mode},plan=compose(input);await sql`insert into songs(id,user_id,title,next_version_number) values(${songId},${userA},'Test',2)`;await sql`insert into generation_jobs(id,version_id,user_id,song_id,reserved_version_number,idempotency_key,provider,provider_model,request_payload,composition_plan,seed) values(${jobId},${versionId},${userA},${songId},1,${crypto.randomUUID()},${provider},'test',${sql.json(input)},${sql.json(plan)},42)`;return{jobId,versionId}};
  try{
    const storage=new MemoryAudioStorage(),orchestrator=new GenerationOrchestrator(sql,storage,()=>new MockMusicProvider()),multi=await makeJob("MULTI_ASSET");await orchestrator.process(multi.jobId);await orchestrator.process(multi.jobId);
    const counts=await sql<{versions:number;assets:number;mappings:number}[]>`select (select count(*)::int from song_versions where generation_job_id=${multi.jobId}) versions,(select count(*)::int from audio_assets where generation_job_id=${multi.jobId}) assets,(select count(*)::int from version_assets where song_version_id=${multi.versionId}) mappings`;assert.deepEqual(counts[0],{versions:1,assets:6,mappings:6});
    const primary=await sql`select 1 from version_assets where song_version_id=${multi.versionId} and role='MASTER' and is_primary=true`;assert.equal(primary.length,1);const unauthorized=await sql`select 1 from audio_assets where generation_job_id=${multi.jobId} and owner_id=${userB}`;assert.equal(unauthorized.length,0);assert.equal(storage.objects.size,6);
    const single=await makeJob("MASTER_ONLY");await orchestrator.process(single.jobId);const singleCount=await sql<{n:number}[]>`select count(*)::int n from audio_assets where generation_job_id=${single.jobId}`;assert.equal(singleCount[0].n,1);
    const failed=await makeJob("MASTER_ONLY","broken"),badProvider:MusicGenerationProvider={name:"broken",model:"x",capabilities:()=>new MockMusicProvider().capabilities(),healthCheck:async()=>({available:false,latencyMs:0,message:"broken"}),generate:async()=>{throw new Error("PROVIDER_FAILURE")}};await assert.rejects(new GenerationOrchestrator(sql,new MemoryAudioStorage(),()=>badProvider).process(failed.jobId));const failedRow=await sql<{status:string;retryable:boolean}[]>`select status,error_retryable retryable from generation_jobs where id=${failed.jobId}`;assert.equal(failedRow[0].status,"FAILED");assert.equal((await sql`select 1 from song_versions where generation_job_id=${failed.jobId}`).length,0);
    const storageFailed=await makeJob("MASTER_ONLY"),brokenStorage=new MemoryAudioStorage();brokenStorage.fail=true;await assert.rejects(new GenerationOrchestrator(sql,brokenStorage,()=>new MockMusicProvider()).process(storageFailed.jobId));assert.equal((await sql<{status:string}[]>`select status from generation_jobs where id=${storageFailed.jobId}`)[0].status,"FAILED");assert.equal((await sql`select 1 from song_versions where generation_job_id=${storageFailed.jobId}`).length,0);
  }finally{await sql`delete from users where id in (${userA},${userB})`;await sql.end()}
});
