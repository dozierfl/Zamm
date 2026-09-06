import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSql } from "../../../db";
import { apiError, requireUser } from "../../../lib/auth";
import type { AppBindings } from "../../../lib/config";

const bindings = env as unknown as AppBindings;
const createRepairSchema = z
  .object({
    generationId: z.string().uuid(),
    vocalProfileId: z.string().uuid().nullable().optional(),
    lyricText: z.string().trim().min(1).max(500),
    startSeconds: z.number().finite().min(0),
    endSeconds: z.number().finite().positive(),
    crossfadeMs: z.number().int().min(0).max(500).default(80),
  })
  .strict();

type RepairRow = {
  id: string;
  songId: string;
  sourceVersionId: string;
  sourceVocalAssetId: string | null;
  renderedAudioAssetId: string | null;
  vocalProfileId: string | null;
  lyricText: string;
  startSeconds: number;
  endSeconds: number;
  crossfadeMs: number;
  status: string;
  createdAt: string;
};

export async function GET(request: Request) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      generationId = new URL(request.url).searchParams.get("generationId"),
      parsedId = z.string().uuid().safeParse(generationId);
    if (!parsedId.success) throw new Error("INVALID_VOCAL_REPAIR");
    const sql = getSql(bindings.DATABASE_URL),
      jobs = await sql<{ versionId: string }[]>`
        select version_id as "versionId"
        from generation_jobs
        where id=${parsedId.data} and user_id=${user.id}
        limit 1
      `,
      job = jobs[0];
    if (!job)
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Song not found.", retryable: false } },
        { status: 404 },
      );
    const repairs = await sql<RepairRow[]>`
        select id,song_id as "songId",source_version_id as "sourceVersionId",
          source_vocal_asset_id as "sourceVocalAssetId",
          rendered_audio_asset_id as "renderedAudioAssetId",
          vocal_profile_id as "vocalProfileId",lyric_text as "lyricText",
          start_seconds::float8 as "startSeconds",end_seconds::float8 as "endSeconds",
          crossfade_ms as "crossfadeMs",status,created_at as "createdAt"
        from vocal_repair_sessions
        where owner_id=${user.id} and source_version_id=${job.versionId}
        order by created_at desc
      `,
      candidates = repairs.length
        ? await sql<
            Array<{
              id: string;
              repairSessionId: string;
              audioAssetId: string | null;
              method: string;
              label: string;
              status: string;
              createdAt: string;
            }>
          >`
            select c.id,c.repair_session_id as "repairSessionId",
              c.audio_asset_id as "audioAssetId",c.method,c.label,c.status,
              c.created_at as "createdAt"
            from vocal_repair_candidates c
            join vocal_repair_sessions r on r.id=c.repair_session_id
            where r.owner_id=${user.id} and r.source_version_id=${job.versionId}
            order by c.created_at desc
          `
        : [];
    return Response.json({
      repairs: repairs.map((repair) => ({
        ...repair,
        sourceVocalAudioUrl: repair.sourceVocalAssetId
          ? `/api/audio/${repair.sourceVocalAssetId}`
          : undefined,
        renderedAudioUrl: repair.renderedAudioAssetId
          ? `/api/audio/${repair.renderedAudioAssetId}`
          : undefined,
        candidates: candidates
          .filter((candidate) => candidate.repairSessionId === repair.id)
          .map((candidate) => ({
            ...candidate,
            audioUrl: candidate.audioAssetId
              ? `/api/audio/${candidate.audioAssetId}`
              : undefined,
          })),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      input = createRepairSchema.safeParse(await request.json());
    if (!input.success) throw new Error("INVALID_VOCAL_REPAIR");
    const sql = getSql(bindings.DATABASE_URL),
      jobs = await sql<
        Array<{
          songId: string;
          sourceVersionId: string;
          status: string;
          durationSeconds: number;
          sourceVocalAssetId: string | null;
        }>
      >`
        select j.song_id as "songId",j.version_id as "sourceVersionId",j.status,
          v.duration_seconds::float8 as "durationSeconds",
          (
            select va.audio_asset_id
            from version_assets va
            where va.song_version_id=v.id and (
              va.instrument_group='VOCALS' or
              lower(coalesce(va.instrument,'')) like '%vocal%'
            )
            order by va.is_primary desc,va.sort_order
            limit 1
          ) as "sourceVocalAssetId"
        from generation_jobs j
        join song_versions v on v.id=j.version_id and v.song_id=j.song_id
        where j.id=${input.data.generationId} and j.user_id=${user.id}
        limit 1
      `,
      job = jobs[0];
    if (!job)
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Song not found.", retryable: false } },
        { status: 404 },
      );
    if (job.status !== "COMPLETE")
      return Response.json(
        {
          error: {
            code: "VOCAL_REPAIR_NOT_READY",
            message: "Wait for the song to finish before repairing a phrase.",
            retryable: true,
          },
        },
        { status: 409 },
      );
    if (
      input.data.endSeconds <= input.data.startSeconds ||
      input.data.endSeconds > job.durationSeconds
    )
      throw new Error("INVALID_VOCAL_REPAIR");
    if (input.data.vocalProfileId) {
      const profiles = await sql<{ id: string }[]>`
        select id from artist_vocal_profiles
        where id=${input.data.vocalProfileId} and owner_id=${user.id}
          and verified_at is not null and status<>'REVOKED'
        limit 1
      `;
      if (!profiles[0])
        return Response.json(
          {
            error: {
              code: "VOCAL_PROFILE_NOT_VERIFIED",
              message: "Choose a verified private artist voice.",
              retryable: false,
            },
          },
          { status: 409 },
        );
    }
    const rows = await sql<RepairRow[]>`
      insert into vocal_repair_sessions(
        owner_id,song_id,source_version_id,source_vocal_asset_id,
        vocal_profile_id,lyric_text,
        start_seconds,end_seconds,crossfade_ms,status
      ) values(
        ${user.id},${job.songId},${job.sourceVersionId},
        ${job.sourceVocalAssetId},
        ${input.data.vocalProfileId || null},${input.data.lyricText},
        ${input.data.startSeconds},${input.data.endSeconds},
        ${input.data.crossfadeMs},'AWAITING_TAKE'
      )
      returning id,song_id as "songId",source_version_id as "sourceVersionId",
        source_vocal_asset_id as "sourceVocalAssetId",
        rendered_audio_asset_id as "renderedAudioAssetId",
        vocal_profile_id as "vocalProfileId",lyric_text as "lyricText",
        start_seconds::float8 as "startSeconds",end_seconds::float8 as "endSeconds",
        crossfade_ms as "crossfadeMs",status,created_at as "createdAt"
    `;
    const repair = rows[0];
    return Response.json(
      {
        repair: {
          ...repair,
          sourceVocalAudioUrl: repair.sourceVocalAssetId
            ? `/api/audio/${repair.sourceVocalAssetId}`
            : undefined,
          candidates: [],
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
