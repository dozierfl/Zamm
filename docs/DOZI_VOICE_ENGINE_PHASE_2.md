# Dozi Voice Engine — Phase 2 Voice Enrollment and Conversion

## Outcome

Phase 2 connects Dozi's existing consent-verified voice enrollment and local RVC training workflow to a real, provider-neutral Voice Studio conversion path. An authorized user can select an active private voice, upload an owned vocal or song performance, render a server-capped 30-second preview or a full conversion, monitor the durable job, cancel it, and audition the private converted master and isolated vocal stem.

This phase performs singing voice conversion; it does not synthesize melody or timing from lyrics and does not claim to generate harmonies. The uploaded performance supplies melody, timing, expression, and pronunciation. Phase 3 adds lyric analysis and alignment, and Phase 5 adds harmony generation.

## Files changed

- `db/schema.ts`
- `drizzle-pg/0010_absurd_big_bertha.sql`
- `drizzle-pg/meta/0010_snapshot.json`
- `drizzle-pg/meta/_journal.json`
- `lib/config.ts`
- `lib/auth.ts`
- `lib/voice-provider.ts`
- `lib/voice-conversion-queue.ts`
- `lib/voice-conversion-orchestrator.ts`
- `lib/vocal-identity-processor.ts`
- `worker/index.ts`
- `app/api/voice-engine/capabilities/route.ts`
- `app/api/voice-conversions/route.ts`
- `app/api/voice-conversions/[id]/route.ts`
- `app/api/voice-library/route.ts`
- `app/voice-studio.tsx`
- `app/globals.css`
- `ai-service/app/main.py`
- `ai-service/app/artist_vocal.py`
- `ai-service/tests/test_api.py`
- `scripts/activate-vocal-profile-version.ts`
- `tests/architecture.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/DOZI_VOICE_ENGINE_PHASE_2.md`

## Database changes

Migration `0010_absurd_big_bertha.sql` adds:

- `voice_conversion_mode` with `PREVIEW` and `FULL` values.
- `voice_conversion_runs`, which connects an owner/project-scoped durable job to the immutable voice-profile version, preserved source asset, and optional converted master/vocal assets.
- `voice_model_artifacts.provider_ref`, an internal provider-relative reference distinct from the stable managed storage key. Existing rows are backfilled before the column becomes required.
- Ownership, project, profile-version, source/output asset, strength-range, lookup, and one-run-per-job constraints.

The source asset is never overwritten. Output assets are inserted only after successful inference and are removed from object storage if the completion transaction fails.

## API changes

### `GET /api/voice-engine/capabilities`

Returns the configured voice provider, model, supported capabilities, training mode, and live availability. The endpoint requires an authenticated Dozi session.

### `GET /api/voice-conversions`

Returns the authenticated owner's 30 most recent conversion jobs and private playback URLs.

### `POST /api/voice-conversions`

Accepts `multipart/form-data` with:

- `audio`: WAV, FLAC, MP3, M4A, OGG, or WebM; 512 bytes to 120 MiB.
- `projectId`: a project in which the user has at least VOCALIST access.
- `profileId`: the owner's consented, verified, active private voice with a READY active model version.
- `mode`: `PREVIEW` or `FULL`.
- `voiceIdentityStrength`: 0–100.
- `durationSeconds`, `sampleRate`, and `channels`: bounded source metadata.
- `rightsAttested=true`: required ownership/control attestation.
- `Idempotency-Key`: optional; duplicate owner keys return the existing conversion.

The route preserves the private source in R2, creates the normalized source asset, durable job, run, and initial event in one database transaction, then dispatches the queue message. It returns `202 Accepted`.

### `GET /api/voice-conversions/:id`

Returns one owner-scoped conversion with ordered job events and private source/master/vocal URLs. Status reads never start inference.

Existing `DELETE /api/jobs/:id` cancels an active generalized conversion job without deleting its source or previous successful outputs.

## Provider and AI backend

`VoiceProvider` is the application boundary for provider capabilities, health, preview, and full conversion. `RvcVoiceProvider` is the first implementation and delegates only to the separately deployed private AI service. Other compatible engines can be added without changing Voice Studio or the durable orchestration contract.

The AI service now:

- Advertises RVC-v2 singing conversion and isolated-vocal output capability.
- Resolves checkpoint and retrieval-index references strictly beneath `DOZI_RVC_ROOT`.
- Enforces the preview duration in the service request schema and truncates decoded source audio to at most 30 seconds before separation and conversion.
- Returns an aligned converted master plus editable lead-vocal stem.

The existing training launcher remains the adaptation workflow. Activation now records immutable checkpoint, index, and manifest artifact metadata with checksums, sizes, stable storage keys, and provider references.

## UI changes

Voice Studio now provides:

- Live engine readiness and capability state.
- Project and authorized private-voice selection.
- Owned source-performance upload and rights attestation.
- Voice-identity strength control.
- 30-second preview and full conversion actions.
- Durable progress polling, recent conversion history, cancellation, failure recovery messaging, and private master/vocal playback.
- Explicit placeholders for BGV and harmony work planned for later phases; no simulated harmony output is presented.

## Tests and verification

Executed successfully in the isolated implementation checkout:

```text
npm run typecheck
npm run lint
node --import tsx --test tests/architecture.test.ts
python3 -m py_compile ai-service/app/main.py ai-service/app/artist_vocal.py ai-service/tests/test_api.py
git diff --check
```

The architecture suite passes 64/64 tests, including new provider-boundary, preview-cap, queue-independence, owner/project scope, migration, and UI contract checks.

The full Python test command requires the AI-service virtual environment:

```text
python3 -m venv ai-service/.venv
ai-service/.venv/bin/pip install -r ai-service/requirements.txt
npm run test:ai
```

It was not executed in the temporary checkout because that virtual environment is not present. The modified Python files and test compile successfully.

## Known limitations

- RVC requires a source performance. Lyrics alone do not supply melody, timing, expression, or pronunciation in this phase.
- Training/adaptation remains a reviewed local CLI workflow rather than a browser-started GPU job.
- The first provider is local RVC-v2 with BS-RoFormer separation; availability depends on configured model artifacts, binaries, and compute.
- Conversion sends the bounded source to the private AI service as base64 JSON. A streaming/binary transport is a later optimization.
- Cancellation is non-destructive but cannot interrupt a native subprocess already inside inference; its outputs are discarded when the worker observes cancellation before commit.
- There is no lyric alignment, phrase assignment, harmony generation, choir generation, or DAW stem bundle in Phase 2.
- Live RVC audio quality still requires representative listening tests on the deployment machine.

## Deployment requirements

1. Back up PostgreSQL and deploy migration `0010` before or with the application.
2. Keep the existing PostgreSQL, private R2 `AUDIO`, and `GENERATION_QUEUE` bindings.
3. Configure `AI_SERVICE_BASE_URL` and, when enabled, matching `AI_SERVICE_TOKEN` values in the app/worker and AI service.
4. Configure `DOZI_RVC_ROOT`, `DOZI_RVC_PYTHON`, `DOZI_RVC_CLI`, `BS_ROFORMER_BIN`, and `BS_ROFORMER_MODELS_DIR` on the private AI host as described by the existing local-voice setup.
5. Activate each reviewed model with `npm run vocal:activate-version`; the checkpoint and index must remain beneath the configured RVC root.
6. Verify `/api/voice-engine/capabilities` reports `health.available=true` before enabling conversions for users.

## Rollback plan

Deploy the Phase 1 application first. Leave the additive `voice_conversion_runs`, enum, and artifact-reference column in place so private source/output lineage is not destroyed. Queued Phase 2 messages can then be drained or acknowledged without running the old worker. Only after a verified backup and confirmation that no Phase 2 lineage must be retained should a separately reviewed cleanup migration remove the new table, enum, or column. Never delete R2 voice-conversion prefixes as part of an application rollback.

## Next phase

Phase 3 adds audio import analysis, lyric transcription, forced word alignment, synchronized waveform navigation, and manual lyric correction. It will consume the preserved source and converted vocal assets from this phase.
