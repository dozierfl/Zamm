import { env } from "cloudflare:workers";
import { clearSessionCookie, cookieToken, sha256 } from "../../../../lib/auth";
export async function POST(request:Request){const token=cookieToken(request);if(token)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();return Response.json({ok:true},{headers:{"set-cookie":clearSessionCookie()}})}
