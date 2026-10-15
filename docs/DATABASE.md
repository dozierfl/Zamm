# Database

The schema is defined in `db/schema.ts` and migrated with checked-in Drizzle SQL. Core tables are users, sessions, projects, project_members, songs, jobs, job_events, generation_jobs, tracks, song_version_tracks, audio_assets, and song_versions.

Ownership is stored on every private aggregate and enforced in server queries. Unique constraints enforce email identity, session tokens, request idempotency, one audio asset per generation job, one version per generation job, and version numbers within a song. Audio bytes never enter D1.
# PostgreSQL migration

Run `docker compose up -d postgres`, set `DATABASE_URL`, then run `npm run db:migrate`. Drizzle migrations live in `drizzle-pg`; the former `drizzle` directory is retained as the legacy D1 schema and is not silently deleted.

For an MVP D1 export, import users/songs/jobs/assets/versions into matching PostgreSQL identifiers, convert JSON strings to JSONB, copy R2 objects unchanged, and insert one `version_assets` row (`MASTER`, `GENERATED_NATIVE`, `is_primary=true`) for each legacy `song_versions.audio_asset_id`. Validate counts and playback before retiring D1. This compatibility backfill preserves prompt, plan, seed, provider, and master references.

Artist vocal identity uses five normalized tables: `artist_vocal_profiles`, `vocal_profile_sources`, `vocal_identity_verifications`, `vocal_profile_versions`, and `vocal_profile_training_jobs`. Source audio remains in `audio_assets`; profile/source rows store consent, quality, and provenance rather than duplicating binary data. Composite foreign keys guarantee that training jobs, generation jobs, and song versions cannot pair a model version with a different profile. Existing songs remain valid because vocalist lineage is nullable; a non-null profile version always requires its matching profile.

Phase 1 adds a compatibility foundation without removing the established generation path. Every account has one personal project and an OWNER membership; existing projects and songs are backfilled. The generalized `jobs` and append-only `job_events` tables mirror existing `generation_jobs` through a database trigger while workers migrate one operation at a time. `tracks` identify stable musical roles and `song_version_tracks` map each immutable version to its current audio assets. Existing `version_assets` writes are mirrored into that model. Managed voice-model files are cataloged by `voice_model_artifacts`; the binary files remain in private object storage.

Phase 2 adds `voice_conversion_runs` as the owner/project-scoped link between a durable `VOICE_CONVERSION` job, one immutable profile version, its preserved source audio asset, and the resulting private master and vocal assets. `voice_model_artifacts.provider_ref` keeps the engine-specific root-relative model reference separate from its stable managed storage key. Preview and full conversions share the same lineage model; preview duration is an inference constraint, not a destructive source edit.
