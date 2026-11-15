import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import postgres from "postgres";
import { MemoryAudioStorage } from "../lib/audio-storage.ts";
import { compose, createGenerationSchema } from "../lib/domain.ts";
import { GenerationOrchestrator } from "../lib/generation-orchestrator.ts";
import { MockMusicProvider } from "../lib/providers.ts";
import { drainAudioDeletions, purgeArchivedSongs, removeSong, SongRemovalError } from "../lib/song-retention.ts";

const integration = process.env.TEST_DATABASE_URL ? test : test.skip;

async function fixture(t: TestContext) {
  const sql = postgres(process.env.TEST_DATABASE_URL!, { prepare: false });
  const ownerId = crypto.randomUUID(), otherOwnerId = crypto.randomUUID();
  const owners = [ownerId, otherOwnerId];
  await sql`insert into users(id,email,display_name,password_hash,password_salt) values
    (${ownerId},${`${ownerId}@test.invalid`},'Retention test','x','x'),
    (${otherOwnerId},${`${otherOwnerId}@test.invalid`},'Other owner','x','x')`;
  t.after(async () => {
    await sql`delete from vocal_identity_verifications where profile_id in (select id from artist_vocal_profiles where owner_id in ${sql(owners)})`;
    await sql`delete from songs where user_id in ${sql(owners)}`;
    await sql`delete from audio_deletion_jobs where owner_id in ${sql(owners)}`;
    await sql`delete from users where id in ${sql(owners)}`;
    await sql.end();
  });
  const storage = new MemoryAudioStorage();
  const input = createGenerationSchema.parse({ prompt: "Warm funk retention test", durationSeconds: 1, outputMode: "MASTER_ONLY" });
  const plan = compose(input);
  async function makeJob(status: "QUEUED" | "GENERATING" | "FAILED" | "COMPLETE" = "COMPLETE") {
    const songId = crypto.randomUUID(), jobId = crypto.randomUUID(), versionId = crypto.randomUUID();
    await sql`insert into songs(id,user_id,title,next_version_number) values(${songId},${ownerId},'Retention test',2)`;
    await sql`insert into generation_jobs(id,version_id,user_id,song_id,reserved_version_number,idempotency_key,provider,provider_model,status,request_payload,composition_plan,seed)
      values(${jobId},${versionId},${ownerId},${songId},1,${jobId},'mock','test',${status === "COMPLETE" ? "QUEUED" : status},${sql.json(input)},${sql.json(plan)},42)`;
    if (status === "COMPLETE") await new GenerationOrchestrator(sql, storage, () => new MockMusicProvider()).process(jobId);
    return { songId, jobId, versionId };
  }
  const purge = (targetStorage: Pick<MemoryAudioStorage, "delete"> = storage) => purgeArchivedSongs(sql, targetStorage, { ownerId });
  return { sql, ownerId, otherOwnerId, storage, makeJob, purge };
}

integration("failed-song deletion removes records, is owner scoped, and makes stale queue messages harmless", async (t) => {
  const { sql, ownerId, otherOwnerId, storage, makeJob } = await fixture(t);
  const failed = await makeJob("FAILED");
  await assert.rejects(removeSong(sql, failed.songId, otherOwnerId, "failed"), (e) => e instanceof SongRemovalError && e.status === 404);
  assert.equal((await sql`select 1 from songs where id=${failed.songId}`).length, 1);
  assert.equal(await removeSong(sql, failed.songId, ownerId, "failed"), true);
  assert.equal((await sql`select 1 from songs where id=${failed.songId}`).length, 0);
  assert.equal((await sql`select 1 from generation_jobs where id=${failed.jobId}`).length, 0);
  await new GenerationOrchestrator(sql, storage, () => { throw new Error("Deleted jobs must not contact a provider"); }).process(failed.jobId);
  await assert.rejects(removeSong(sql, failed.songId, ownerId, "failed"), (e) => e instanceof SongRemovalError && e.status === 404);
});

integration("permanent failed-song deletion protects saved versions and active work", async (t) => {
  const { sql, ownerId, makeJob } = await fixture(t);
  const complete = await makeJob(), queued = await makeJob("QUEUED"), active = await makeJob("GENERATING");
  for (const job of [complete, queued, active]) {
    await assert.rejects(removeSong(sql, job.songId, ownerId, "failed"), (e) => e instanceof SongRemovalError && e.status === 409);
    assert.equal((await sql`select 1 from songs where id=${job.songId}`).length, 1);
  }
  // Even a stale FAILED badge must not permit deleting an existing master.
  await sql`update generation_jobs set status='FAILED' where id=${complete.jobId}`;
  await assert.rejects(removeSong(sql, complete.songId, ownerId, "failed"), (e) => e instanceof SongRemovalError && e.code === "SONG_HAS_SAVED_VERSIONS");
});

integration("the purge removes only expired archives and skips active generations", async (t) => {
  const { sql, ownerId, storage, makeJob, purge } = await fixture(t);
  const old = await makeJob(), recent = await makeJob(), live = await makeJob(), active = await makeJob("GENERATING");
  await sql`update songs set archived_at=now()-interval '30 days' where id=${old.songId}`;
  await sql`update songs set archived_at=now()-interval '29 days' where id=${recent.songId}`;
  await sql`update songs set archived_at=now()-interval '31 days' where id=${active.songId}`;
  const result = await purge();
  assert.equal(result.purged, 1);
  assert.equal(result.deleted, 1);
  assert.equal((await sql`select 1 from songs where id=${old.songId}`).length, 0);
  for (const job of [recent, live, active]) assert.equal((await sql`select 1 from songs where id=${job.songId}`).length, 1);
  assert.equal(storage.objects.size, 2);
  assert.equal(await removeSong(sql, recent.songId, ownerId, "expired"), false);
  assert.equal(await removeSong(sql, old.songId, ownerId, "expired"), false);
  assert.equal((await purge()).purged, 0);
});

integration("purging source songs preserves shared audio until the last dependent song is purged", async (t) => {
  const { sql, storage, makeJob, purge } = await fixture(t);
  const source = await makeJob(), dependent = await makeJob();
  const [{ assetId }] = await sql<{ assetId: string }[]>`select audio_asset_id as "assetId" from song_versions where id=${source.versionId}`;
  await sql`update version_assets set source_asset_id=${assetId} where song_version_id=${dependent.versionId}`;
  await sql`update songs set archived_at=now()-interval '31 days' where id=${source.songId}`;
  assert.equal((await purge()).purged, 1);
  assert.equal((await sql`select 1 from audio_assets where id=${assetId}`).length, 1);
  assert.equal(storage.objects.size, 2);
  await sql`update songs set archived_at=now()-interval '31 days' where id=${dependent.songId}`;
  const result = await purge();
  assert.equal(result.purged, 1);
  assert.equal(result.deleted, 2);
  assert.equal(storage.objects.size, 0);
  assert.equal((await sql`select 1 from audio_assets where id=${assetId}`).length, 0);
});

integration("voice references survive song purging and release audio when no longer needed", async (t) => {
  const { sql, ownerId, storage, makeJob, purge } = await fixture(t);
  const source = await makeJob(), profileId = crypto.randomUUID(), verificationId = crypto.randomUUID();
  const [{ assetId }] = await sql<{ assetId: string }[]>`select audio_asset_id as "assetId" from song_versions where id=${source.versionId}`;
  await sql`insert into artist_vocal_profiles(id,owner_id,name) values(${profileId},${ownerId},'Saved voice')`;
  await sql`insert into vocal_identity_verifications(id,profile_id,challenge_hash,spoken_audio_asset_id,expires_at) values(${verificationId},${profileId},'test',${assetId},now()+interval '1 day')`;
  await sql`update songs set archived_at=now()-interval '31 days' where id=${source.songId}`;
  assert.equal((await purge()).purged, 1);
  assert.equal(storage.objects.size, 1);
  assert.equal((await sql`select 1 from artist_vocal_profiles where id=${profileId}`).length, 1);
  await sql`delete from vocal_identity_verifications where id=${verificationId}`;
  assert.equal((await drainAudioDeletions(sql, storage, { ownerId })).deleted, 1);
  assert.equal(storage.objects.size, 0);
});

integration("storage outages leave a durable cleanup request that succeeds on retry", async (t) => {
  const { sql, ownerId, storage, makeJob, purge } = await fixture(t);
  const song = await makeJob();
  await sql`update songs set archived_at=now()-interval '31 days' where id=${song.songId}`;
  const brokenStorage = { async delete() { throw new Error("storage unavailable"); } };
  const result = await purge(brokenStorage);
  assert.equal(result.purged, 1);
  assert.equal(result.failed, 1);
  assert.equal((await sql`select 1 from songs where id=${song.songId}`).length, 0);
  assert.equal((await sql`select 1 from audio_deletion_jobs where owner_id=${ownerId}`).length, 1);
  assert.equal(storage.objects.size, 1);
  assert.equal((await drainAudioDeletions(sql, storage, { ownerId })).deleted, 1);
  assert.equal(storage.objects.size, 0);
  assert.equal((await drainAudioDeletions(sql, storage, { ownerId })).deleted, 0);
});

integration("partial uploads are tracked without erasing a retry's deterministic files", async (t) => {
  const { sql, ownerId, storage, makeJob, purge } = await fixture(t);
  const failed = await makeJob("QUEUED");
  await sql`update generation_jobs set request_payload=jsonb_set(request_payload,'{outputMode}','"MULTI_ASSET"') where id=${failed.jobId}`;
  let uploads = 0;
  const partialStorage = {
    async put(key: string, bytes: Uint8Array) { if (++uploads === 2) throw new Error("STORAGE_UNAVAILABLE"); await storage.put(key, bytes); },
    get: (key: string) => storage.get(key),
    delete: (key: string) => storage.delete(key),
  };
  await assert.rejects(new GenerationOrchestrator(sql, partialStorage, () => new MockMusicProvider()).process(failed.jobId));
  assert.equal(storage.objects.size, 1);
  assert.equal((await drainAudioDeletions(sql, storage, { ownerId })).deferred, 1);
  // A retry completes using the same object keys; its master must survive.
  await new GenerationOrchestrator(sql, storage, () => new MockMusicProvider()).process(failed.jobId);
  await drainAudioDeletions(sql, storage, { ownerId });
  assert.equal(storage.objects.size, 6);
  await sql`update songs set archived_at=now()-interval '31 days' where id=${failed.songId}`;
  await purge();
  assert.equal(storage.objects.size, 0);
  // Deleting a failure also removes a partial upload without any saved version.
  const discarded = await makeJob("QUEUED");
  await sql`update generation_jobs set request_payload=jsonb_set(request_payload,'{outputMode}','"MULTI_ASSET"') where id=${discarded.jobId}`;
  uploads = 0;
  await assert.rejects(new GenerationOrchestrator(sql, partialStorage, () => new MockMusicProvider()).process(discarded.jobId));
  assert.equal(storage.objects.size, 1);
  await removeSong(sql, discarded.songId, ownerId, "failed");
  assert.equal((await drainAudioDeletions(sql, storage, { ownerId })).deleted, 1);
  assert.equal(storage.objects.size, 0);
});
