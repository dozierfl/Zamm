import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSql } from "../../../../../db";
import { apiError, randomToken, requireUser, sha256 } from "../../../../../lib/auth";
import type { AppBindings } from "../../../../../lib/config";

const bindings=env as unknown as AppBindings;
const CONSENT_POLICY_VERSION="artist-vocal-identity-v1";
const inputSchema=z.object({rightsAttested:z.literal(true),consentAccepted:z.literal(true)}).strict();
const openings=["Today I choose","My true voice carries","I freely record","This living voice follows"];
const endings=["silver morning light","the rhythm beyond the blue","four bright notes home","a quiet river south"];
function pick(values:string[]){const random=new Uint32Array(1);crypto.getRandomValues(random);return values[random[0]%values.length]}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const user=await requireUser(request,bindings.DATABASE_URL),input=inputSchema.safeParse(await request.json());
  if(!input.success)throw new Error("VOCAL_CONSENT_REQUIRED");
  const {id}=await params,sql=getSql(bindings.DATABASE_URL),profiles=await sql<{id:string;status:string}[]>`select id,status from artist_vocal_profiles where id=${id} and owner_id=${user.id} limit 1`,profile=profiles[0];
  if(!profile)return Response.json({error:{code:"NOT_FOUND",message:"Vocal profile not found.",retryable:false}},{status:404});
  if(profile.status==="REVOKED")return Response.json({error:{code:"VOCAL_PROFILE_REVOKED",message:"A revoked profile cannot restart enrollment.",retryable:false}},{status:409});
  const phrase=`${pick(openings)} ${pick(endings)}.`,challengeToken=randomToken(),challengeHash=await sha256(`${challengeToken}:${phrase.toLowerCase()}`),verificationId=crypto.randomUUID(),expiresAt=new Date(Date.now()+10*60*1000);
  await sql.begin(async tx=>{
   await tx`insert into vocal_identity_verifications(id,profile_id,challenge_hash,status,expires_at) values(${verificationId},${id},${challengeHash},'PENDING',${expiresAt})`;
   await tx`update artist_vocal_profiles set status=case when status='DRAFT' then 'COLLECTING' else status end,consent_policy_version=${CONSENT_POLICY_VERSION},consented_at=coalesce(consented_at,now()),updated_at=now() where id=${id}`;
  });
  return Response.json({challenge:{verificationId,phrase,challengeToken,expiresAt:expiresAt.toISOString(),minimumSeconds:10,maximumSeconds:15}});
 }catch(error){return apiError(error)}
}
