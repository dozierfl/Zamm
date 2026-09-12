import { env } from "cloudflare:workers";
import { getSql } from "../../../../../../db";
import { apiError, requireUser } from "../../../../../../lib/auth";
import type { AppBindings } from "../../../../../../lib/config";

const bindings = env as unknown as AppBindings;

function importName(filename: string | null) {
  return (filename || "Imported vocal").replace(
    /\.part-\d+-of-\d+\.wav$/i,
    "",
  );
}

type Source = {
  id: string;
  audioAssetId: string;
  storageKey: string;
  sourceType: string;
  originalFilename: string | null;
  usableSeconds: number;
};

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id, sourceId } = await params,
      sql = getSql(bindings.DATABASE_URL),
      sources = await sql<Source[]>`
        select s.id,s.audio_asset_id as "audioAssetId",a.storage_key as "storageKey",
          s.source_type as "sourceType",s.original_filename as "originalFilename",
          s.usable_duration_seconds::float8 as "usableSeconds"
        from vocal_profile_sources s
        join artist_vocal_profiles p on p.id=s.profile_id
        join audio_assets a on a.id=s.audio_asset_id
        where s.profile_id=${id} and p.owner_id=${user.id}
      `,
      selected = sources.find((source) => source.id === sourceId);
    if (!selected)
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Vocal import not found.", retryable: false } },
        { status: 404 },
      );
    if (selected.sourceType !== "OWNED_VOCAL_BOUNCE")
      return Response.json(
        { error: { code: "INVALID_SOURCE", message: "Only imported vocal files can be deleted here.", retryable: false } },
        { status: 400 },
      );
    const versions = await sql<{ count: number }[]>`
        select count(*)::int as count from vocal_profile_versions where profile_id=${id}
      `;
    if ((versions[0]?.count || 0) > 0)
      return Response.json(
        { error: { code: "SOURCE_IN_USE", message: "This profile already has a trained version, so its source history must remain intact.", retryable: false } },
        { status: 409 },
      );
    const selectedImport = importName(selected.originalFilename),
      targets = sources.filter(
        (source) =>
          source.sourceType === "OWNED_VOCAL_BOUNCE" &&
          importName(source.originalFilename) === selectedImport,
      ),
      usableSecondsRemoved = targets.reduce(
        (total, source) => total + Number(source.usableSeconds || 0),
        0,
      );
    await sql.begin(async (tx) => {
      for (const source of targets) {
        await tx`delete from vocal_profile_sources where id=${source.id} and profile_id=${id}`;
        await tx`delete from audio_assets where id=${source.audioAssetId} and owner_id=${user.id}`;
      }
      const totals = await tx<
        { usableSeconds: number; qualityScore: number | null }[]
      >`
        select coalesce(sum(usable_duration_seconds) filter(where included_in_training),0)::float8 as "usableSeconds",
          avg(quality_score) filter(where included_in_training)::float8 as "qualityScore"
        from vocal_profile_sources where profile_id=${id}
      `,
        total = totals[0] || { usableSeconds: 0, qualityScore: null };
      await tx`
        update artist_vocal_profiles set
          usable_singing_seconds=${Number(total.usableSeconds) || 0},
          quality_score=${total.qualityScore},
          status=case
            when status in ('TRAINING','ACTIVE','REVOKED') then status
            when ${Number(total.usableSeconds) || 0}::double precision>=45 then 'READY'::vocal_profile_status
            else 'COLLECTING'::vocal_profile_status
          end,
          updated_at=now()
        where id=${id} and owner_id=${user.id}
      `;
    });
    const removals = await Promise.allSettled(
      targets.map((source) => bindings.AUDIO.delete(source.storageKey)),
    );
    removals.forEach((result, index) => {
      if (result.status === "rejected")
        console.error("Vocal import object cleanup failed", targets[index].storageKey);
    });
    return Response.json({
      deleted: {
        importName: selectedImport,
        sourceCount: targets.length,
        usableSecondsRemoved,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
