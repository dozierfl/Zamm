import { env } from "cloudflare:workers";
import { getSql } from "../../../db";
import { apiError, requireUser } from "../../../lib/auth";
import type { AppBindings } from "../../../lib/config";

const bindings=env as unknown as AppBindings;
export async function GET(request:Request){try{const user=await requireUser(request,bindings.DATABASE_URL),sql=getSql(bindings.DATABASE_URL),sessions=await sql<Record<string,unknown>[]>`select p.id,p.title,p.created_at as "createdAt",p.updated_at as "updatedAt",count(s.id)::int as "songCount" from projects p left join songs s on s.project_id=p.id and s.user_id=${user.id} and s.archived_at is null where p.user_id=${user.id} group by p.id order by p.updated_at desc`;return Response.json({sessions})}catch(error){return apiError(error)}}
export async function POST(request:Request){try{const user=await requireUser(request,bindings.DATABASE_URL),body=await request.json() as {title?:unknown},title=typeof body.title==="string"?body.title.trim():"";if(!title||title.length>120)return Response.json({error:{message:"Session name must be between 1 and 120 characters."}},{status:400});const sql=getSql(bindings.DATABASE_URL),rows=await sql<Record<string,unknown>[]>`insert into projects(user_id,title) values(${user.id},${title}) returning id,title,created_at as "createdAt",updated_at as "updatedAt"`;return Response.json({session:{...rows[0],songCount:0}},{status:201})}catch(error){return apiError(error)}}
