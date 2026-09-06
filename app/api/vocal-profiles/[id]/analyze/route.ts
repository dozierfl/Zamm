import { env } from "cloudflare:workers";
import { getSql } from "../../../../../db";
import { apiError, requireUser } from "../../../../../lib/auth";
import { appConfig, type AppBindings } from "../../../../../lib/config";

const bindings = env as unknown as AppBindings;
type Analysis = {
  passed: boolean;
  qualityScore: number;
  usableDurationSeconds: number;
  metrics: Record<string, number>;
  reasons: string[];
};
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id } = await params,
      sql = getSql(bindings.DATABASE_URL),
      config = appConfig(bindings),
      pendingRows = await sql<{ count: number }[]>`
        select count(*)::int as count from vocal_profile_sources s
        join artist_vocal_profiles p on p.id=s.profile_id
        where s.profile_id=${id} and p.owner_id=${user.id}
          and s.source_type in ('LIVE_SINGING','OWNED_VOCAL_BOUNCE','SEPARATED_OWNED_MIX')
          and coalesce(s.quality_metrics->>'analysisStatus','PENDING')='PENDING'
      `,
      pendingBefore = pendingRows[0]?.count || 0,
      sources = await sql<
        { id: string; storageKey: string; mimeType: string; sourceType: string }[]
      >`select s.id,a.storage_key as "storageKey",a.mime_type as "mimeType",s.source_type as "sourceType" from vocal_profile_sources s join artist_vocal_profiles p on p.id=s.profile_id join audio_assets a on a.id=s.audio_asset_id where s.profile_id=${id} and p.owner_id=${user.id} and s.source_type in ('LIVE_SINGING','OWNED_VOCAL_BOUNCE','SEPARATED_OWNED_MIX') and coalesce(s.quality_metrics->>'analysisStatus','PENDING')='PENDING' order by s.created_at desc limit 1`;
    if (!config.aiServiceBaseUrl) throw new Error("VOCAL_ANALYSIS_UNAVAILABLE");
    const results = [];
    for (const source of sources) {
      const object = await bindings.AUDIO.get(source.storageKey);
      if (!object) continue;
      const bytes = new Uint8Array(await object.arrayBuffer()),
        response = await fetch(`${config.aiServiceBaseUrl}/v1/vocal-analysis-audio`, {
          method: "POST",
          headers: {
            "content-type": source.mimeType,
            "x-minimum-usable-seconds":
              source.sourceType === "OWNED_VOCAL_BOUNCE" ? "5" : "15",
            ...(config.aiServiceToken
              ? { authorization: `Bearer ${config.aiServiceToken}` }
              : {}),
          },
          body: bytes,
        });
      if (!response.ok) {
        const detail = await response.text();
        console.error("Vocal analysis service failed", response.status, detail);
        throw new Error("VOCAL_ANALYSIS_FAILED");
      }
      const analysis = (await response.json()) as Analysis;
      const usableDurationSeconds = analysis.passed
        ? Math.max(
            0,
            analysis.usableDurationSeconds ||
              analysis.metrics.durationSeconds *
                (1 - analysis.metrics.silenceRatio),
          )
        : 0;
      await sql`update vocal_profile_sources set usable_duration_seconds=${usableDurationSeconds},quality_score=${analysis.qualityScore},included_in_training=${analysis.passed},quality_metrics=${sql.json({ analysisStatus: analysis.passed ? "PASSED" : "REJECTED", ...analysis.metrics, reasons: analysis.reasons })} where id=${source.id}`;
      results.push({ sourceId: source.id, ...analysis, usableDurationSeconds });
    }
    const totals = await sql<
      { usableSeconds: number; qualityScore: number | null }[]
    >`select coalesce(sum(usable_duration_seconds) filter(where included_in_training),0)::float as "usableSeconds",avg(quality_score) filter(where included_in_training)::float as "qualityScore" from vocal_profile_sources where profile_id=${id}`;
    const aggregate = totals[0] || { usableSeconds: 0, qualityScore: null },
      total = {
        usableSeconds: Number(aggregate.usableSeconds) || 0,
        qualityScore:
          aggregate.qualityScore === null
            ? null
            : Number(aggregate.qualityScore),
      };
    await sql`update artist_vocal_profiles set usable_singing_seconds=${total.usableSeconds},quality_score=${total.qualityScore},status=case when ${total.usableSeconds}::double precision>=45::double precision then 'READY'::vocal_profile_status else 'COLLECTING'::vocal_profile_status end,updated_at=now() where id=${id} and owner_id=${user.id}`;
    return Response.json({
      results,
      pendingBefore,
      pendingRemaining: Math.max(0, pendingBefore - results.length),
      usableSingingSeconds: total.usableSeconds,
    });
  } catch (error) {
    return apiError(error);
  }
}
