import type postgres from "postgres";
import type { AudioStorage } from "./audio-storage";

type Sql = ReturnType<typeof postgres>;
export const ARCHIVE_RETENTION_DAYS = 30;

export class SongRemovalError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

/** Metadata and the durable audio cleanup request commit together. */
export async function removeSong(
  sql: Sql,
  songId: string,
  ownerId: string,
  mode: "failed" | "expired",
) {
  try {
    return await sql.begin(async (tx) => {
      const songs = await tx<{ archivedAt: Date | null; expired: boolean }[]>`
        select archived_at as "archivedAt",
          coalesce(archived_at <= now() - ${ARCHIVE_RETENTION_DAYS} * interval '1 day', false) as expired
        from songs where id=${songId} and user_id=${ownerId} for update
      `;
      if (!songs[0]) {
        if (mode === "expired") return false;
        throw new SongRemovalError("NOT_FOUND", "Song not found.", 404);
      }
      if (mode === "expired" && !songs[0].expired) return false;

      // Do not race a worker that is committing a version or retrying a failure.
      const jobs = await tx<{ status: string }[]>`
        select status from generation_jobs where song_id=${songId} for update nowait
      `;
      const active = jobs.some((job) => !["COMPLETE", "FAILED", "CANCELLED"].includes(job.status));
      if (active) {
        if (mode === "expired") return false;
        throw new SongRemovalError("SONG_BUSY", "Cancel the active generation before deleting this song.", 409);
      }
      if (mode === "failed") {
        const versions = await tx`select 1 from song_versions where song_id=${songId} limit 1`;
        if (!jobs.some((job) => job.status === "FAILED") || jobs.some((job) => job.status === "COMPLETE") || versions.length) {
          throw new SongRemovalError("SONG_HAS_SAVED_VERSIONS", "This song has saved versions. Archive it instead to keep them for 30 days.", 409);
        }
      }

      // Include repair recordings and source lineage. The cleanup worker checks
      // every live reference before removing an asset shared with another song.
      await tx`
        insert into audio_deletion_jobs(owner_id,audio_asset_id,storage_key)
        select a.owner_id,a.id,a.storage_key from audio_assets a
        where a.owner_id=${ownerId} and (
          a.generation_job_id in (select id from generation_jobs where song_id=${songId})
          or a.id in (select audio_asset_id from song_versions where song_id=${songId})
          or a.id in (
            select va.audio_asset_id from version_assets va join song_versions v on v.id=va.song_version_id where v.song_id=${songId}
            union
            select va.source_asset_id from version_assets va join song_versions v on v.id=va.song_version_id where v.song_id=${songId}
          )
          or a.id in (
            select source_vocal_asset_id from vocal_repair_sessions where song_id=${songId}
            union select rendered_audio_asset_id from vocal_repair_sessions where song_id=${songId}
            union select c.audio_asset_id from vocal_repair_candidates c join vocal_repair_sessions r on r.id=c.repair_session_id where r.song_id=${songId}
          )
        ) on conflict (storage_key) do nothing
      `;
      await tx`delete from songs where id=${songId} and user_id=${ownerId}`;
      return true;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "55P03") {
      if (mode === "expired") return false;
      throw new SongRemovalError("SONG_BUSY", "The generation is still finishing. Try deleting it again in a moment.", 409);
    }
    throw error;
  }
}

/** Failed R2 deletions remain queued; repeated or concurrent runs are safe. */
export async function drainAudioDeletions(
  sql: Sql,
  storage: Pick<AudioStorage, "delete">,
  options: { ownerId?: string; limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(200, options.limit ?? 100));
  const ownerId = options.ownerId ?? null;
  const candidates = await sql<{ id: string }[]>`
    select id from audio_deletion_jobs
    where (${ownerId}::uuid is null or owner_id=${ownerId})
    order by last_attempt_at nulls first,created_at limit ${limit}
  `;
  let deleted = 0, deferred = 0, failed = 0;
  for (const candidate of candidates) {
    const storageKey = await sql.begin(async (tx) => {
      const rows = await tx<{ assetId: string | null; generationJobId: string | null; storageKey: string }[]>`
        select audio_asset_id as "assetId",generation_job_id as "generationJobId",storage_key as "storageKey"
        from audio_deletion_jobs where id=${candidate.id} for update skip locked
      `;
      const job = rows[0];
      if (!job) return null;
      await tx`update audio_deletion_jobs set last_attempt_at=now(),attempt_count=attempt_count+1 where id=${candidate.id}`;
      // Retries reuse deterministic asset keys. Wait until the originating job
      // is gone or complete so cleanup cannot erase a retry's new upload.
      if (job.generationJobId && (await tx`select 1 from generation_jobs where id=${job.generationJobId} and status<>'COMPLETE'`).length) return null;
      if (job.assetId) {
        // Hold the asset against new FK references, then check references in
        // the next statement's fresh snapshot before any cascading deletion.
        await tx`select id from audio_assets where id=${job.assetId} for update`;
        const removed = await tx`
          delete from audio_assets a where a.id=${job.assetId}
          and not exists (select 1 from generation_jobs j where j.id=a.generation_job_id or j.request_payload#>>'{cover,sourceAssetId}'=a.id::text)
          and not exists (select 1 from song_versions v where v.audio_asset_id=a.id)
          and not exists (select 1 from version_assets va where va.audio_asset_id=a.id or va.source_asset_id=a.id)
          and not exists (select 1 from vocal_profile_sources s where s.audio_asset_id=a.id)
          and not exists (select 1 from vocal_identity_verifications v where v.spoken_audio_asset_id=a.id)
          and not exists (select 1 from vocal_repair_sessions r where r.source_vocal_asset_id=a.id or r.rendered_audio_asset_id=a.id)
          and not exists (select 1 from vocal_repair_candidates c where c.audio_asset_id=a.id)
          returning id
        `;
        if (!removed.length && (await tx`select 1 from audio_assets where id=${job.assetId}`).length) return null;
        // Commit metadata removal first: a new reference can no longer attach
        // to this asset while its private blob is being removed.
        await tx`update audio_deletion_jobs set audio_asset_id=null where id=${candidate.id}`;
      }
      return job.storageKey;
    });
    if (!storageKey) { deferred++; continue; }
    try {
      await storage.delete(storageKey);
      await sql`delete from audio_deletion_jobs where id=${candidate.id}`;
      deleted++;
    } catch {
      failed++;
    }
  }
  return { deleted, deferred, failed };
}

export async function purgeArchivedSongs(sql: Sql, storage: Pick<AudioStorage, "delete">, options: { ownerId?: string } = {}) {
  const ownerId = options.ownerId ?? null;
  const candidates = await sql<{ id: string; ownerId: string }[]>`
    select s.id,s.user_id as "ownerId" from songs s
    where s.archived_at <= now() - ${ARCHIVE_RETENTION_DAYS} * interval '1 day'
      and (${ownerId}::uuid is null or s.user_id=${ownerId})
      and not exists (select 1 from generation_jobs j where j.song_id=s.id and j.status not in ('COMPLETE','FAILED','CANCELLED'))
    order by s.archived_at limit 25
  `;
  let purged = 0;
  for (const song of candidates) {
    if (await removeSong(sql, song.id, song.ownerId, "expired")) purged++;
  }
  return { purged, ...await drainAudioDeletions(sql, storage, options) };
}
