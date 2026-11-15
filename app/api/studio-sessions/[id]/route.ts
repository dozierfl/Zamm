import { env } from "cloudflare:workers";
import { getSql } from "../../../../db";
import { apiError, requireUser } from "../../../../lib/auth";
import type { AppBindings } from "../../../../lib/config";

const bindings=env as unknown as AppBindings;
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser(request,bindings.DATABASE_URL),{id}=await params,body=await request.json() as {title?:unknown},title=typeof body.title==="string"?body.title.trim():"";if(!title||title.length>120)return Response.json({error:{message:"Session name must be between 1 and 120 characters."}},{status:400});const sql=getSql(bindings.DATABASE_URL),rows=await sql<Record<string,unknown>[]>`update projects set title=${title},updated_at=now() where id=${id} and user_id=${user.id} returning id,title,created_at as "createdAt",updated_at as "updatedAt"`;if(!rows[0])return Response.json({error:{message:"Studio Session not found."}},{status:404});return Response.json({session:rows[0]})}catch(error){return apiError(error)}}
