# Song deletion and archive retention

The Library's **Delete failed** action permanently removes a failed song and its
generation records after confirmation. The server rejects this action if a song
has saved versions or active generations. Successful songs use **Archive**.

An archive's 30-day retention period starts at `songs.archived_at`. The hourly
Cloudflare Worker scheduled handler purges up to 25 expired songs per run and
processes up to 100 pending audio deletions. Active generations are deferred.
At the hourly boundary, an expired song is eligible for the next run; large
backlogs take additional runs.

Before deleting metadata, the service records each candidate audio file in
`audio_deletion_jobs`. Private objects are deleted only after their metadata is
no longer referenced by another song, source lineage, or a vocal profile.
Shared files remain queued until their last reference is removed. Storage
failures leave durable requests for the next scheduled run. Partial generation
uploads are tracked too; cleanup waits while a generation can reuse those keys
on retry.

Apply the database migrations before deploying this version:

```sh
npm run db:migrate
```

The hourly cron is configured in `wrangler.jsonc`. It runs in deployed Workers;
the local development server does not automatically execute cron triggers.
Deploying the application is required to activate unattended retention in the
hosted environment. This change does not deploy it or immediately purge existing
archives on startup.

To run the PostgreSQL checks against a migrated test database:

```sh
TEST_DATABASE_URL=postgres://... node --import tsx --test tests/song-retention.test.ts
```

The fixtures use temporary accounts. Purge calls in these tests are restricted
to each fixture's owner, so other accounts' archives are not touched.
