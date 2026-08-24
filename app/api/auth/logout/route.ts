import { getSql } from "../../../../db";
import { clearSessionCookie, cookieToken, sha256 } from "../../../../lib/auth";
import type { AppBindings } from "../../../../lib/config";
const bindings=env as unknown as AppBindings;
export async function POST(request:Request){const token=cookieToken(request);if(token)await getSql(bindings.DATABASE_URL)`delete from sessions where token_hash=${await sha256(token)}`;return Response.json({ok:true},{headers:{"set-cookie":clearSessionCookie()}})}
import { env } from "cloudflare:workers";
