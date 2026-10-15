# Dozi Voice Engine — Phase 1 Foundation

## Outcome

Phase 1 adds the shared persistence and UI foundation for the Voice Engine without replacing Dozi's working generation, cover, private-voice, multitrack, mix, replacement, or vocal-repair paths.

The new Voice Studio is intentionally a foundation. It persists projects, exposes only the signed-in owner's private voice library, displays project access, and provides the three-panel arrangement shell. Voice conversion, lyric alignment, editable vocal regions, harmony generation, and rendering remain disabled until their implementation phases; the interface does not simulate those operations.

## Files changed

- `db/schema.ts`
- `drizzle-pg/0009_dusty_mandroid.sql`
- `drizzle-pg/meta/0009_snapshot.json`
- `drizzle-pg/meta/_journal.json`
- `lib/project-access.ts`
- `app/api/projects/route.ts`
- `app/api/jobs/[id]/route.ts`
- `app/api/voice-library/route.ts`
- `app/voice-studio.tsx`
- `app/studio-app.tsx`
- `app/globals.css`
- `tests/architecture.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/decisions/0007-phase-one-foundation.md`
- `docs/DOZI_VOICE_ENGINE_PHASE_1.md`

## Database changes

Migration `0009_dusty_mandroid.sql` adds:

- `project_members` with OWNER, ADMIN, EDITOR, VOCALIST, and VIEWER roles.
- One protected personal project per user, owner-membership backfill, and automatic personal-project assignment for new users and songs.
- Provider-neutral `jobs` and append-only `job_events` with progress, retry, cancellation, error, heartbeat, idempotency, result, and ownership fields.
- `tracks` for stable song-level musical roles and `song_version_tracks` for immutable version-to-audio mappings.
- `voice_model_artifacts` for managed checkpoint, index, manifest, and configuration metadata in private object storage.
- Compatibility backfills and triggers from `generation_jobs` and `version_assets`. Existing writers continue working while later phases move to the generalized contracts.

The migration was applied from zero to an isolated PostgreSQL database. Runtime checks confirmed personal-project creation, owner membership, song assignment, generation-job event mirroring, cancellation history, and vocal asset mapping to a semantic LEAD_VOCAL track.

## API changes

- `GET /api/projects` returns projects visible through the authenticated user's membership, including role and active song count.
- `POST /api/projects` creates a project and an OWNER membership in one transaction.
- `GET /api/jobs/:id` returns an owner-scoped generalized job and ordered event history.
- `DELETE /api/jobs/:id` requests cancellation and bridges current music-generation jobs to the established worker contract.
- `GET /api/voice-library` returns only the authenticated owner's non-revoked profiles with explicit authorization and usage status. It does not expose model storage keys.

All routes require the existing session authentication and PostgreSQL binding. `requireProjectRole` centralizes the role hierarchy for future project-scoped write routes.

## UI changes

- Added Voice Studio to the existing main navigation.
- Added a responsive three-panel editor shell matching the Dozi visual system:
  - Audio and private voice library.
  - Arrangement timeline and lead/background/harmony lanes.
  - Processing, permission, and project-status panel.
- Added a persistent project selector and database-backed project creation.
- The last selected project is retained locally for convenience; project data and roles remain server-authoritative.
- Preview and render controls are visibly disabled until real Phase 2 processing is connected.

## Asset handling

Audio continues to use the existing private R2/object-storage flow and normalized `audio_assets` records. Model binaries must also remain outside PostgreSQL; `voice_model_artifacts` stores only immutable identity, checksum, size, storage location, encryption-key version, and metadata. No private provider host path is exposed through the new API.

## Processing jobs

Current generation workers continue writing `generation_jobs`. The migration mirrors their durable state into `jobs` and records meaningful transitions in `job_events`. This provides one status contract for future analysis, voice training, conversion, render, repair, and export jobs without a risky rewrite of current workers.

## AI backend changes

None in Phase 1. Existing authorized RVC training/conversion, provider integrations, separation, transcription, and repair services are preserved. Phase 2 will connect enrollment, managed artifact import, capability detection, preview, and voice-to-voice conversion to the new foundation.

## Tests and verification

Executed successfully:

```text
npm run typecheck
npm run lint
npm test
```

Result: production build succeeded; 77 tests discovered, 76 passed, 1 existing database integration suite skipped. The skip remains explicit and is not counted as a pass.

Clean migration validation used PostgreSQL 14.20 in a disposable local database:

```text
DATABASE_URL=postgresql://<local-user>@127.0.0.1:5432/<temporary-db> npm run db:migrate
```

The disposable database was removed after the assertions completed.

## Known limitations

- Voice Studio is an editor shell, not yet an operational arrangement editor.
- No Phase 2 voice preview or conversion job is started from Voice Studio.
- No Phase 3 transcript, token alignment, waveform region, or lyric editing exists in this shell.
- No Phase 4 singer/word assignment, Phase 5 harmony, or Phase 6 choir rendering is implemented.
- Existing compatibility tracks initially map one-to-one from version assets; deliberate stable-track reuse across versions begins when direct writers adopt `song_version_tracks`.
- The generalized job model mirrors established generation work; other operation types will move onto it as their vertical slices are built.
- The queue recovery/multi-user database integration test remains skipped unless its required test database is configured.

## Deployment requirements

1. Back up PostgreSQL before production migration.
2. Deploy the database migration before or with the application build.
3. Keep existing `DATABASE_URL`, session configuration, R2 binding, queue binding, and provider secrets unchanged.
4. No new npm package, Python model, hardware requirement, or environment variable is introduced.
5. Verify that each existing account has one personal project and OWNER membership after migration.

## Rollback plan

The migration is additive and preserves existing tables and routes. If the application release must roll back, deploy the prior application version first; its `generation_jobs` and `version_assets` writes remain valid. Leave the additive tables and triggers in place to avoid destructive data loss. After taking and validating a database backup, a separate reviewed cleanup migration may remove the compatibility triggers and new objects only if no new project, job-event, track, or artifact data must be retained.

## Next phase

Phase 2 delivers a real, end-to-end authorized voice workflow: enrollment validation, model registry/artifact management, resumable training or adaptation, provider capability detection, voice preview, and voice-to-voice singing conversion.
