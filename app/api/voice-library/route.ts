import { env } from "cloudflare:workers";
import { getSql } from "../../../db";
import { apiError, requireUser } from "../../../lib/auth";
import type { AppBindings } from "../../../lib/config";

const bindings = env as unknown as AppBindings;

export async function GET(request: Request) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL);
    const sql = getSql(bindings.DATABASE_URL);
    const voices = await sql<Record<string, unknown>[]>`
      select p.id,p.name as "displayName",p.status,p.is_private as "isPrivate",
        p.consented_at as "consentedAt",p.verified_at as "verifiedAt",
        p.usable_singing_seconds as "usableSingingSeconds",p.quality_score as "qualityScore",
        v.id as "activeVersionId",v.version_number as "activeVersionNumber",
        v.provider,v.provider_model as "providerModel"
      from artist_vocal_profiles p
      left join vocal_profile_versions v on v.profile_id=p.id and v.is_active=true
      where p.owner_id=${user.id} and p.revoked_at is null
      order by p.updated_at desc
    `;
    return Response.json({
      voices: voices.map((voice) => ({
        ...voice,
        permissionScope: "PRIVATE_OWNER",
        authorizationStatus:
          voice.consentedAt && voice.verifiedAt ? "VERIFIED" : "INCOMPLETE",
        usageStatus:
          voice.status === "ACTIVE" && voice.activeVersionId
            ? "AVAILABLE"
            : "ENROLLMENT_REQUIRED",
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
