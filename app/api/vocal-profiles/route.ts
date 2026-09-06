import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSql } from "../../../db";
import { apiError, requireUser } from "../../../lib/auth";
import type { AppBindings } from "../../../lib/config";

const bindings=env as unknown as AppBindings;
const createProfileSchema=z.object({name:z.string().trim().min(2).max(80)}).strict();

export async function GET(request:Request){
 try{
  const user=await requireUser(request,bindings.DATABASE_URL),sql=getSql(bindings.DATABASE_URL);
  const profiles=await sql<Record<string,unknown>[]>`select p.id,p.name,p.status,p.is_private as "isPrivate",p.usable_singing_seconds as "usableSingingSeconds",p.quality_score as "qualityScore",p.range_low_midi as "rangeLowMidi",p.range_high_midi as "rangeHighMidi",p.consented_at as "consentedAt",p.verified_at as "verifiedAt",p.created_at as "createdAt",count(s.id)::int as "sourceCount",(select v.phrase_match_score::float8 from vocal_identity_verifications v where v.profile_id=p.id and v.status='PASSED' order by v.verified_at desc limit 1) as "latestPhraseMatchScore" from artist_vocal_profiles p left join vocal_profile_sources s on s.profile_id=p.id where p.owner_id=${user.id} group by p.id order by p.created_at desc`;
  const sources=await sql<{id:string;profileId:string;audioAssetId:string;sourceType:string;originalFilename:string|null;durationSeconds:number;qualityScore:number|null;includedInTraining:boolean;qualityMetrics:Record<string,unknown>;createdAt:string}[]>`select s.id,s.profile_id as "profileId",s.audio_asset_id as "audioAssetId",s.source_type as "sourceType",s.original_filename as "originalFilename",s.duration_seconds as "durationSeconds",s.quality_score as "qualityScore",s.included_in_training as "includedInTraining",s.quality_metrics as "qualityMetrics",s.created_at as "createdAt" from vocal_profile_sources s join artist_vocal_profiles p on p.id=s.profile_id where p.owner_id=${user.id} order by s.created_at desc`;
  return Response.json({profiles:profiles.map(profile=>({...profile,sources:sources.filter(source=>source.profileId===profile.id).map(source=>({...source,audioUrl:`/api/audio/${source.audioAssetId}`,analysisStatus:String(source.qualityMetrics.analysisStatus||"PENDING")}))}))});
 }catch(error){return apiError(error)}
}

export async function POST(request:Request){
 try{
  const user=await requireUser(request,bindings.DATABASE_URL),input=createProfileSchema.safeParse(await request.json());
  if(!input.success)throw new Error("INVALID_VOCAL_PROFILE");
  const sql=getSql(bindings.DATABASE_URL);
  const existing=await sql`select id from artist_vocal_profiles where owner_id=${user.id} and lower(name)=lower(${input.data.name}) limit 1`;
  if(existing[0])return Response.json({error:{code:"VOCAL_PROFILE_EXISTS",message:"You already have a vocal profile with that name.",retryable:false}},{status:409});
  const rows=await sql<Record<string,unknown>[]>`insert into artist_vocal_profiles(owner_id,name,status,is_private) values(${user.id},${input.data.name},'DRAFT',true) returning id,name,status,is_private as "isPrivate",usable_singing_seconds as "usableSingingSeconds",quality_score as "qualityScore",range_low_midi as "rangeLowMidi",range_high_midi as "rangeHighMidi",consented_at as "consentedAt",verified_at as "verifiedAt",created_at as "createdAt"`;
  return Response.json({profile:{...rows[0],sourceCount:0,sources:[]}},{status:201});
 }catch(error){return apiError(error)}
}
