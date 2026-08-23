# Database

The schema is defined in `db/schema.ts` and migrated with checked-in Drizzle SQL. Core tables are users, sessions, projects, songs, generation_jobs, audio_assets, and song_versions.

Ownership is stored on every private aggregate and enforced in server queries. Unique constraints enforce email identity, session tokens, request idempotency, one audio asset per generation job, one version per generation job, and version numbers within a song. Audio bytes never enter D1.
