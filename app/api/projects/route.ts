import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSql } from "../../../db";
import { apiError, requireUser } from "../../../lib/auth";
import type { AppBindings } from "../../../lib/config";

const bindings = env as unknown as AppBindings;
const createProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional().default(""),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL);
    const sql = getSql(bindings.DATABASE_URL);
    const projects = await sql<Record<string, unknown>[]>`
      select p.id,p.title,p.description,p.is_personal as "isPersonal",pm.role,
        p.created_at as "createdAt",p.updated_at as "updatedAt",
        count(s.id) filter (where s.archived_at is null)::int as "songCount"
      from projects p
      join project_members pm on pm.project_id=p.id and pm.user_id=${user.id}
      left join songs s on s.project_id=p.id
      group by p.id,pm.role
      order by p.is_personal desc,p.updated_at desc
    `;
    return Response.json({ projects });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL);
    const input = createProjectSchema.parse(await request.json());
    const sql = getSql(bindings.DATABASE_URL);
    const project = await sql.begin(async (tx) => {
      const rows = await tx<{
        id: string;
        title: string;
        description: string;
        isPersonal: boolean;
        createdAt: Date;
        updatedAt: Date;
      }[]>`
        insert into projects(user_id,title,description,is_personal)
        values(${user.id},${input.title},${input.description},false)
        returning id,title,description,is_personal as "isPersonal",created_at as "createdAt",updated_at as "updatedAt"
      `;
      await tx`
        insert into project_members(project_id,user_id,role)
        values(${rows[0].id},${user.id},'OWNER')
      `;
      return { ...rows[0], role: "OWNER", songCount: 0 };
    });
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
