import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSql } from "../../../../db";
import { apiError, sha256 } from "../../../../lib/auth";
import type { AppBindings } from "../../../../lib/config";

const bindings = env as unknown as AppBindings;
const acceptSchema = z.object({
  signedName: z.string().trim().min(2).max(80),
  acknowledged: z.literal(true),
  attestationText: z.string().trim().min(20).max(600),
});
type Permission = {
  id: string;
  profileId: string;
  vocalistName: string;
  projectTitle: string;
  ownerName: string;
  allowedUses: string[];
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: Date;
  signedName: string | null;
  acceptedAt: Date | null;
};

async function findPermission(token: string) {
  const sql = getSql(bindings.DATABASE_URL);
  const rows = await sql<Permission[]>`
    select permission.id,permission.profile_id as "profileId",
      permission.vocalist_name as "vocalistName",permission.project_title as "projectTitle",
      owner.display_name as "ownerName",permission.allowed_uses as "allowedUses",
      permission.status,permission.expires_at as "expiresAt",
      permission.signed_name as "signedName",permission.accepted_at as "acceptedAt"
    from vocalist_permissions permission
    join users owner on owner.id=permission.owner_id
    where permission.token_hash=${await sha256(token)} limit 1
  `;
  return rows[0] || null;
}
function publicPermission(permission: Permission) {
  const expired = permission.status === "PENDING" && permission.expiresAt.getTime() <= Date.now();
  return {
    vocalistName: permission.vocalistName,
    projectTitle: permission.projectTitle,
    ownerName: permission.ownerName,
    allowedUses: permission.allowedUses,
    status: expired ? "EXPIRED" : permission.status,
    expiresAt: permission.expiresAt,
    signedName: permission.signedName,
    acceptedAt: permission.acceptedAt,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const permission = await findPermission(token);
    if (!permission) return Response.json({ error: { message: "This permission link is unavailable." } }, { status: 404 });
    return Response.json({ permission: publicPermission(permission) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const input = acceptSchema.parse(await request.json());
    const permission = await findPermission(token);
    if (!permission) return Response.json({ error: { message: "This permission link is unavailable." } }, { status: 404 });
    if (permission.status !== "PENDING" || permission.expiresAt.getTime() <= Date.now())
      return Response.json({ error: { message: "This permission link is no longer awaiting confirmation." } }, { status: 409 });
    const sql = getSql(bindings.DATABASE_URL);
    await sql.begin(async (tx) => {
      const updated = await tx`
        update vocalist_permissions set status='ACCEPTED',signed_name=${input.signedName},
          attestation_text=${input.attestationText},accepted_at=now(),updated_at=now()
        where id=${permission.id} and status='PENDING' and expires_at>now() returning id
      `;
      if (!updated[0]) throw new Error("VOCAL_PERMISSION_UNAVAILABLE");
      await tx`
        update artist_vocal_profiles set consent_policy_version='remote-vocalist-permission-v1',
          consented_at=now(),status=case when status='DRAFT' then 'COLLECTING' else status end,
          updated_at=now() where id=${permission.profileId}
      `;
    });
    return Response.json({ permission: { ...publicPermission(permission), status: "ACCEPTED", signedName: input.signedName, acceptedAt: new Date().toISOString() } });
  } catch (error) {
    return apiError(error);
  }
}
