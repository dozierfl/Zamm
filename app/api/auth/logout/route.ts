import { getSql } from "../../../../db";
import { clearSessionCookie, cookieToken, sha256 } from "../../../../lib/auth";
export async function POST(request:Request){const token=cookieToken(request);if(token)await getSql()`delete from sessions where token_hash=${await sha256(token)}`;return Response.json({ok:true},{headers:{"set-cookie":clearSessionCookie()}})}
