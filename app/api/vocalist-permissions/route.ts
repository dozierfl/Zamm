import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSql } from "../../../db";
import { apiError, randomToken, requireUser, sha256 } from "../../../lib/auth";
import type { AppBindings } from "../../../lib/config";

const bindings = env as unknown as AppBindings;
const POLICY_VERSION = "remote-vocalist-permission-v1";
const allowedUses = [
  "private voice profile training",
  "assigned vocal sections in the named Dozi project",
  "authorized cover performances in the named Dozi project",
];
const createSchema = z.object({
  vocalistName: z.string().trim().min(2).max(80),
  projectTitle: z.string().trim().min(2).max(120),
  profileId: z.string().uuid().optional(),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL);
    const sql = getSql(bindings.DATABASE_URL);
    const permissions = await sql<Record<string, unknown>[]>`
      select permission.id,permission.vocalist_name as "vocalistName",
        permission.project_title as "projectTitle",permission.status,
        permission.accepted_at as "acceptedAt",permission.expires_at as "expiresAt",
        permission.created_at as "createdAt",profile.id as "profileId",profile.name as "profileName"
      from vocalist_permissions permission
      join artist_vocal_profiles profile on profile.id=permission.profile_id
      where permission.owner_id=${user.id}
      order by permission.created_at desc
    `;
    return Response.json({ permissions });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL);
    const input = createSchema.parse(await request.json());
    const sql = getSql(bindings.DATABASE_URL);
    let profileId = input.profileId;
    if (profileId) {
      const profile = await sql<{ id: string }[]>`
        select id from artist_vocal_profiles
        where id=${profileId} and owner_id=${user.id} and status<>'REVOKED' limit 1
      `;
      if (!profile[0]) throw new Error("VOCAL_PROFILE_UNAVAILABLE");
    } else {
      const existing = await sql<{ id: string }[]>`
        select id from artist_vocal_profiles
        where owner_id=${user.id} and lower(name)=lower(${input.vocalistName}) limit 1
      `;
      if (existing[0]) profileId = existing[0].id;
      else {
        const created = await sql<{ id: string }[]>`
          insert into artist_vocal_profiles(owner_id,name,status,is_private)
          values(${user.id},${input.vocalistName},'DRAFT',true) returning id
        `;
        profileId = created[0]?.id;
      }
    }
    if (!profileId) throw new Error("VOCAL_PERMISSION_CREATE_FAILED");
    const token = randomToken(), tokenHash = await sha256(token), expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const rows = await sql<Record<string, unknown>[]>`
      insert into vocalist_permissions(
        owner_id,profile_id,token_hash,vocalist_name,project_title,allowed_uses,
        policy_version,status,expires_at
      ) values(
        ${user.id},${profileId},${tokenHash},${input.vocalistName},${input.projectTitle},
        ${sql.json(allowedUses)},${POLICY_VERSION},'PENDING',${expiresAt}
      ) returning id,vocalist_name as "vocalistName",project_title as "projectTitle",
        profile_id as "profileId",status,expires_at as "expiresAt",created_at as "createdAt"
    `;
    const publicUrl = new URL(`/consent/${token}`, request.url).toString();
    return Response.json({
      permission: rows[0],
      publicUrl,
      shareText: `Hi ${input.vocalistName}, please review and confirm this private Dozi vocal permission for ${input.projectTitle}: ${publicUrl}`,
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
