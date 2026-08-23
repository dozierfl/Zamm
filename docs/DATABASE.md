# Database

The schema is defined in `db/schema.ts` and migrated with checked-in Drizzle SQL. Core tables are users, sessions, projects, songs, generation_jobs, audio_assets, and song_versions.

Ownership is stored on every private aggregate and enforced in server queries. Unique constraints enforce email identity, session tokens, request idempotency, one audio asset per generation job, one version per generation job, and version numbers within a song. Audio bytes never enter D1.
# PostgreSQL migration

Run `docker compose up -d postgres`, set `DATABASE_URL`, then run `npm run db:migrate`. Drizzle migrations live in `drizzle-pg`; the former `drizzle` directory is retained as the legacy D1 schema and is not silently deleted.

For an MVP D1 export, import users/songs/jobs/assets/versions into matching PostgreSQL identifiers, convert JSON strings to JSONB, copy R2 objects unchanged, and insert one `version_assets` row (`MASTER`, `GENERATED_NATIVE`, `is_primary=true`) for each legacy `song_versions.audio_asset_id`. Validate counts and playback before retiring D1. This compatibility backfill preserves prompt, plan, seed, provider, and master references.
