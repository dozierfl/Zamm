import { getSql } from "../db";
const COOKIE="dozi_session",enc=new TextEncoder();
function bytesToHex(bytes:ArrayBuffer){return[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")}
export async function sha256(value:string){return bytesToHex(await crypto.subtle.digest("SHA-256",enc.encode(value)))}
export function randomToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
export async function hashPassword(password:string,salt:string){const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);return bytesToHex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:210000},key,256))}
export function sessionCookie(token:string,maxAge=2592000){return`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
export function clearSessionCookie(){return`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
export function cookieToken(request:Request){return(request.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1)||null}
export type AppUser={id:string;email:string;displayName:string};
export async function currentUser(request:Request,databaseUrl?:string):Promise<AppUser|null>{const token=cookieToken(request);if(!token)return null;const sql=getSql(databaseUrl),hash=await sha256(token),rows=await sql<AppUser[]>`select u.id,u.email,u.display_name as "displayName" from sessions s join users u on u.id=s.user_id where s.token_hash=${hash} and s.expires_at>now() limit 1`;return rows[0]||null}
export async function requireUser(request:Request,databaseUrl?:string){const user=await currentUser(request,databaseUrl);if(!user)throw new Response(JSON.stringify({error:{code:"AUTH_REQUIRED",message:"Sign in to continue.",retryable:false}}),{status:401,headers:{"content-type":"application/json"}});return user}
export function apiError(error:unknown){if(error instanceof Response)return error;const code=error instanceof Error?error.message:"INTERNAL_ERROR",client=code.startsWith("INVALID_")||code==="ZodError",requestId=crypto.randomUUID();console.error(JSON.stringify({event:"api_error",code,requestId}));return Response.json({error:{code,message:client?"Please check the submitted values.":"Something went wrong.",retryable:!client,requestId}},{status:client?400:500})}
