import { env } from "cloudflare:workers";
import { getSql } from "../../../../db";
import { apiError, requireUser } from "../../../../lib/auth";
import type { AppBindings } from "../../../../lib/config";

const bindings = env as unknown as AppBindings;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id } = await params,
      sql = getSql(bindings.DATABASE_URL),
      rows = await sql<Record<string, unknown>[]>`
        select j.id,j.project_id as "projectId",r.profile_id as "profileId",
          p.name as "profileName",v.version_number as "profileVersion",r.mode,
          r.voice_identity_strength::float8 as "voiceIdentityStrength",j.status,j.progress,
          j.error_code as "errorCode",j.error_message as "errorMessage",j.created_at as "createdAt",
          r.source_asset_id as "sourceAssetId",r.output_master_asset_id as "masterAssetId",
          r.output_vocal_asset_id as "vocalAssetId"
        from jobs j join voice_conversion_runs r on r.job_id=j.id
        join artist_vocal_profiles p on p.id=r.profile_id
        join vocal_profile_versions v on v.id=r.profile_version_id
        where j.id=${id} and j.owner_id=${user.id} limit 1
      `,
      row = rows[0];
    if (!row)
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Conversion not found.", retryable: false } },
        { status: 404 },
      );
    const events = await sql<Record<string, unknown>[]>`
      select id,type,status,progress,message,created_at as "createdAt"
      from job_events where job_id=${id} order by created_at,id
    `;
    return Response.json({
      conversion: {
        ...row,
        sourceAudioUrl: row.sourceAssetId ? `/api/audio/${row.sourceAssetId}` : undefined,
        masterAudioUrl: row.masterAssetId ? `/api/audio/${row.masterAssetId}` : undefined,
        vocalAudioUrl: row.vocalAssetId ? `/api/audio/${row.vocalAssetId}` : undefined,
        events,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
