# Dozi Voice Engine — Phase 0 Repository Assessment

Date: 2026-10-14  
Repository: `dozierfl/Zamm`  
Audited revision: `7bdef15` (`main`)  
Assessment scope: architecture, data model, API surface, storage, async work, security, tests, AI feasibility, and the migration path to the Dozi Voice Engine specification.

## Executive conclusion

The repository is a credible beta foundation, not a prototype that should be replaced. It already has durable users, sessions, songs, immutable song versions, normalized audio assets, version-to-asset lineage, Cloudflare Queue generation, PostgreSQL, R2, a provider-neutral music gateway, private voice enrollment, RVC-based voice conversion, BS-RoFormer separation, non-destructive mixing, aligned-track replacement, phrase repair, cover generation, and owner-scoped audio delivery.

The safest path is an incremental modular monolith with a separately deployed AI worker. Preserve the current song/version/audio lineage and provider interfaces. Add the missing production-domain records—projects as real workspaces, semantic tracks, song sections, lyric segments, word timing, edit operations, general jobs/events, exports, teams, and memberships—before adding more model-specific UI.

The largest architectural risks are not the database or the provider boundary. They are:

1. `app/studio-app.tsx` is 5,847 lines and `app/globals.css` is 3,205 lines. Product workflows are coupled into one client surface.
2. Generation jobs are durable, but separation state and transfer tokens live in FastAPI process memory. They are lost on restart and cannot safely scale to multiple workers.
3. Vocal models are represented by local filesystem references and machine-specific defaults. Model-artifact storage, encryption, retention, and revocation are not yet production-portable.
4. The current schema has version assets, not durable semantic tracks, segments, word timing, edit history, team access, or export history.
5. The current upload/AI path materializes large audio and base64 payloads in memory. This will become a reliability and cost problem for long multitrack sessions.
6. Dependency audit is clean for production dependencies but reports 30 development-tool findings; the available non-major fixes for the Cloudflare/Vite/vinext toolchain should be evaluated before broad development continues.

## What exists today

### Runtime and deployment

- TypeScript 5.9, React 19.2, vinext 1.0 beta, Vite 8, Tailwind 4.
- Cloudflare Worker entry point with R2 audio storage and Cloudflare Queue consumption.
- PostgreSQL 16 with Drizzle migrations is the authoritative relational store.
- FastAPI is the local/private AI boundary; MiniMax has a separate process because of model size and MLX dependencies.
- Hosted providers: Eleven Music and Kie.ai. Local/provider-gateway options: ACE-Step, MiniMax, and a deterministic mock.
- Both `package-lock.json` and `pnpm-lock.yaml` are committed. npm is the documented/tested path; one package manager should become authoritative.
- The old D1 schema remains under `drizzle/` and `examples/d1/`; `docs/LOCAL_DEVELOPMENT.md` still starts with an obsolete D1 migration command before later documenting PostgreSQL.

### Current user-facing workflows

- Account registration, sign-in, sign-out, and session restoration.
- Create original songs from an idea, prompt, lyrics, genre, feel, tempo, key, scale, vocal direction, and private voice selection.
- Generate provider-backed originals and covers.
- Library browsing, filtering, playback, archiving, and owner-scoped export/download of stored assets.
- “My Voice” enrollment with explicit consent, live identity phrase verification, guided singing or owned-source upload, analysis, training scripts, immutable model versions, and activation.
- Invite a remote vocalist through an expiring permission link.
- Generate section-aware lead/duet/background casting instructions.
- Create derived stems, adjust mixer gain/pan/mute/solo, render a child version, replace an aligned full-length track, and make non-destructive phrase repairs.

### Current persistence model

| Specification concept | Current implementation | Assessment |
|---|---|---|
| User | `users`, `sessions` | Strong beta baseline; no user settings or recovery/MFA records. |
| Project | `projects`, nullable `songs.project_id` | Present but not a real product boundary; no project routes/workspace UI and normal generation does not assign a project. |
| Song | `songs` | Good owner-scoped aggregate; lyrics are still one large text field. |
| SongVersion | `song_versions` | Strong immutable lineage with parent version, provider, plan, seed, and master compatibility pointer. |
| Track | `version_assets` + `audio_assets` | Useful mapping, but identity is version-local. A stable semantic `tracks` record is needed for lead, BGV, harmony, instrumental, guide, and master roles. |
| VoiceModel | `artist_vocal_profiles`, `vocal_profile_versions`, training/source/verification tables | Strong consent and provenance foundation; model artifacts are host-path references rather than managed objects. |
| AudioAsset | `audio_assets` | Strong metadata and private object lineage; add lifecycle state, purpose, encryption metadata, and retention/deletion policy. |
| SongSection | Missing | Must be added for verse/chorus/bridge addressing and targeted regeneration. |
| LyricSegment | Missing | Required for line/phrase editing and alignment. |
| WordTiming | Missing | Required for word highlighting and precise editing. |
| EditOperation | Partial behavior only | Child versions preserve results, but the requested operation and before/after target are not modeled consistently. |
| GenerationJob | `generation_jobs` | Strong for song generation; too specialized to represent separation, alignment, training, mix, export, or generic retries. |
| ExportJob | Missing | Current downloads/renders are not represented as durable export jobs or manifests. |
| Team / TeamMember | Missing | No role-based collaboration boundary exists. |
| JobEvent | Missing | Progress is overwritten on job rows; there is no append-only timeline for observability or support. |

### Current API surface

The app exposes 31 route handlers covering authentication, generation, songs, imports, private audio, providers, cover creation, transcription, separation, mixing, track replacement, vocal profiles, consent challenges, remote vocalist permissions, and phrase repair.

What is still missing for the target product:

- Project CRUD, project membership, team CRUD, invitations, and role enforcement.
- Song-section, lyric-segment, word-timing, and alignment APIs.
- Stable track CRUD and role changes independent of a single version-asset row.
- Unified job status, retry, cancellation, event history, and typed result manifests across every long-running operation.
- Pitch correction, time alignment, harmony generation, enhancement, noise cleanup, loudness analysis, and mastering APIs.
- Export presets, manifests, history, signed-download lifecycle, and publish/delivery status.
- Voice-model revocation/deletion/export APIs and artifact-retention workflows.

## Recommended target architecture

```text
Browser / React workspaces
  Dashboard · Projects · Song Workspace · My Voice · Team · Exports
                         |
                         v
Cloudflare application API (modular monolith)
  auth · projects · songs · lyrics · tracks · voices · edits · jobs · exports · teams
          |                    |                      |
          v                    v                      v
     PostgreSQL            R2 private audio      Cloudflare Queue
  metadata + lineage     originals/derived/       typed job envelope
                         previews/exports                 |
                                                        v
                                              AI worker / FastAPI
                                      provider adapters + local models
                                      separation · alignment · VC
                                      cleanup · harmony · mix analysis
```

### Boundary rules

1. The browser never receives provider secrets, model paths, or direct private object keys.
2. PostgreSQL is authoritative for ownership, status, lineage, consent, and manifests; R2 is authoritative only for bytes.
3. Every long-running action is a typed durable job with idempotency, attempts, lease/heartbeat, cancellation, error normalization, and append-only events.
4. AI workers receive signed, time-limited object access rather than large base64 payloads.
5. Every derived asset records source assets, operation, parameters, model/provider version, checksum, and rights/consent context.
6. Provider- and model-specific settings terminate at adapters. UI and domain APIs use normalized capabilities and results.
7. A song version is immutable. Edits produce an `EditOperation`; committing an accepted result creates a child version.
8. A semantic track is stable across versions; a track revision maps that identity to the asset and mix state used by a particular song version.

## Recommended data-model evolution

Keep existing tables and migrate additively.

### Foundation additions

- `user_settings`: UI/audio preferences and default provider policy.
- `project_members`: project-scoped roles (`owner`, `admin`, `editor`, `vocalist`, `viewer`).
- `teams`, `team_members`, `team_invitations`; projects may optionally belong to a team.
- `tracks`: stable song-level identity, role, display name, ordering, channel format, and default color.
- `song_version_tracks`: version-specific audio asset, source lineage, timeline bounds, gain, pan, mute, solo, processing state, and status. Backfill from `version_assets`.
- `song_sections`: version, section type/name, ordinal, bar range, time range, and arrangement metadata.
- `lyric_segments`: section, text, ordinal, language, start/end, alignment confidence, and source.
- `word_timings`: segment, normalized word, displayed token, start/end, confidence, and optional phoneme data.
- `edit_operations`: type, target entity/region, parameters, status, source version, result version, requested-by user, and job.
- `jobs`: generalized durable job envelope; keep `generation_jobs` during migration, then either subtype it or reference it one-to-one.
- `job_events`: append-only state/progress/error/metric records.
- `export_jobs` and `export_items`: preset, format, bit depth, sample rate, loudness target, manifest, assets, and expiry.
- `asset_derivations`: many-to-many source/result lineage for edits that consume or produce multiple assets.
- `voice_model_artifacts`: encrypted object references for checkpoints, indexes, manifests, checksums, and key version. Remove machine paths from product records.
- `consent_events`: append-only grants, challenges, policy version, revocations, and artifact disposition.

### Migration order

1. Add generalized jobs/events and managed model artifacts without changing current routes.
2. Add semantic tracks and backfill each `version_assets` row into `tracks` + `song_version_tracks`; keep compatibility reads during rollout.
3. Parse existing section markers from `songs.lyrics` and `song_versions.lyrics` into sections/segments, retaining original text.
4. Add optional word timing after alignment; never fabricate timing for old versions.
5. Add project membership and require new songs to belong to a project; backfill one personal project per current user.
6. Add teams and invitations after project authorization tests pass.

## Storage and audio strategy

### Storage layout

Use explicit immutable prefixes and never overwrite a released object:

```text
users/{userId}/uploads/{assetId}/original
projects/{projectId}/songs/{songId}/versions/{versionId}/tracks/{trackId}/{assetId}.wav
projects/{projectId}/jobs/{jobId}/intermediate/{assetId}.wav
projects/{projectId}/exports/{exportJobId}/{filename}
users/{userId}/voice-models/{profileId}/{modelVersionId}/{artifactId}
```

- Use multipart/direct-to-R2 upload with server-issued upload grants for large files.
- Store lossless canonical working audio (48 kHz WAV/FLAC as appropriate), plus generated preview derivatives.
- Compute checksum, duration, sample rate, channel count, codec, peak, true peak, integrated loudness, and waveform asynchronously.
- Encrypt private voice recordings and model artifacts with envelope encryption and a rotatable key reference.
- Define retention for failed intermediates, expired exports, revoked consent, archived projects, and account deletion.
- Add a reconciliation job for orphaned R2 objects and missing objects referenced by PostgreSQL.

### Audio-processing abstraction

Introduce an `AudioProcessingProvider` family parallel to `MusicGenerationProvider`:

```text
TranscriptionProvider
AlignmentProvider
PitchProvider
VoiceConversionProvider
SeparationProvider
HarmonyProvider
EnhancementProvider
MixAnalysisProvider
ExportRenderer
```

Each adapter must publish typed capabilities, accepted formats, maximum duration, device requirements, model/license identifiers, health, progress support, and cancellation support.

## AI feasibility matrix

Status is an engineering recommendation, not legal advice. Code licenses and checkpoint/dataset licenses must be reviewed separately for every pinned artifact.

| Capability | Candidate | Current evidence | License/maintenance risk | Recommendation |
|---|---|---|---|---|
| Music generation | ACE-Step 1.5 | Already integrated; official code supports lyrics/reference workflows and has current 2026 activity. | Official 1.5 code is MIT, but every downloaded checkpoint and training source still needs a recorded artifact review. | Keep experimental; validate long-form quality, latency, memory, and provenance before defaulting. |
| Hosted music/cover | Kie.ai adapter | Implemented and contract-tested for async original and reference-audio cover generation. | Commercial/API terms, model identity, retention, and rights handling are external dependencies. | Keep behind normalized provider policy and capability flags; add webhook/poll durability and cost telemetry. |
| Hosted music | Eleven Music | Implemented and contract-tested. | Current music terms and intended commercial use require explicit review. | Keep experimental and opt-in. |
| Local music | MiniMax Music 3 MLX | Integrated as a dedicated process; test coverage exists. | Model/checkpoint terms and large resident-memory footprint remain gates. | R&D only until license and representative acceptance suite pass. |
| Voice conversion | RVC | Current production-shaped path; code is MIT and repo remains available. | Checkpoint/training-data rights are separate; output quality depends on source separation and guide performance. | Keep as the first private trained adapter, but label beta and benchmark per singer/genre. |
| Zero-shot voice conversion | Seed-VC | Local experiment found recognizable identity and intelligibility but sustained-note instability. | Official repository was archived in 2025 and is GPL-3.0; checkpoint terms and proprietary-product integration require counsel. | Do not adopt as the production default. Retain only as isolated R&D/reference benchmarking. |
| Source separation | BS-RoFormer inference | Current six-stem path works and is honestly labeled as derived/editing aid. | Library implementation may be MIT, but the selected checkpoint mirror currently has unresolved trainer/model-weight provenance. | Keep development-only until weights are cleared and a clean-reference benchmark passes. |
| Source separation fallback | Demucs | Mature and MIT-licensed code. | Official Meta repository was archived in 2025; model weights/datasets still require review. | Benchmark as a fallback, not a long-term strategic dependency. |
| Lyrics transcription | MLX Whisper | Implemented for editable drafts. | Whisper-family code/models are widely usable, but transcription is not alignment and singing WER varies. | Keep for draft lyrics; record model ID and confidence. |
| Word alignment | WhisperX-style forced alignment | Established word-timestamp approach; active upstream project uses BSD-2-Clause code. | Alignment models and languages have their own licenses; singing, melisma, repeats, and ad-libs need product-specific validation. | Best Phase 2 prototype, behind an `AlignmentProvider`; preserve manual corrections. |
| Pitch tracking | RMVPE plus deterministic DSP | RVC ecosystem familiarity and good singing-F0 behavior make it a practical candidate. | Pin code and checkpoint licenses; validate octave errors and breath/unvoiced handling. | Prototype after alignment records exist; never auto-correct without audition and undo. |
| Time/pitch DSP | Rubber Band | Mature, documented, high-quality offline musical stretching. | GPL v2+ for open-source use or a paid commercial license for proprietary distribution. | Technically preferred, but a commercial license decision is a Phase 2 blocker. |
| Harmony generation | Rule-based interval/scale engine + VC/render adapters | Technically feasible from aligned pitch and key/scale. | Musical quality, formants, parallel-motion artifacts, and voice-model rights are the main risks. | Start with constrained previewable presets; keep every harmony as a separate derived track. |
| Voice cleanup | Deterministic DSP first; optional learned denoiser adapter | Gates, filters, de-essing, compression, loudness, and limiting are feasible without model lock-in. | Learned weights often have ambiguous commercial terms and may damage consonants. | Ship deterministic reversible processing first; benchmark ML cleanup later. |

Source records for the matrix:

- RVC code license: https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/main/LICENSE
- Seed-VC archive and GPL-3.0 license: https://github.com/Plachtaa/seed-vc/blob/main/LICENSE
- WhisperX upstream: https://github.com/m-bain/whisperX
- ACE-Step 1.5 license: https://github.com/ace-step/ACE-Step-1.5/blob/main/LICENSE
- Demucs upstream status/license: https://github.com/facebookresearch/demucs
- Rubber Band licensing: https://breakfastquay.com/rubberband/license.html
- BS-RoFormer implementation: https://github.com/lucidrains/BS-RoFormer

## Security and privacy findings

### Strong existing controls

- Owner IDs are used consistently in private song, profile, repair, and audio queries.
- Private audio is served through authenticated, range-capable application routes rather than public object URLs.
- Session tokens and vocalist-permission tokens are stored as hashes.
- Passwords use PBKDF2-SHA256 with per-user random salts and 210,000 iterations.
- Voice enrollment separates consent, identity verification, singing sources, training jobs, and immutable model versions.
- Model paths are constrained to the configured private RVC root before use.
- Uploads generally enforce file type, size, duration, rights attestations, and checksums.

### Required hardening

1. Add rate limiting and abuse controls for login, registration, permission links, uploads, provider calls, and AI jobs.
2. Add CSRF/origin validation for state-changing browser routes and a Content Security Policy; retain secure, HTTP-only, SameSite cookies.
3. Introduce team/project authorization as a shared policy module before adding collaboration endpoints. Avoid route-local ad hoc SQL checks.
4. Encrypt raw voice recordings, voice checkpoints, indexes, and consent evidence at rest with auditable key rotation.
5. Make revocation actionable: stop future use, revoke active model versions, cancel queued jobs, define derivative retention, and securely delete artifacts when policy requires it.
6. Replace in-memory separation jobs and transfer tokens with durable job records and signed object access.
7. Stream or directly upload large audio; avoid loading 120 MB inputs and expanded base64 copies into Worker/FastAPI memory.
8. Add provider egress allowlists, response-size/time limits, and redaction for provider payload logging.
9. Add account recovery, session/device management, optional MFA, and audit events before team or paid production use.
10. Add automated dependency, secret, migration, and authorization scanning in CI.

## Testing and operational assessment

Commands run against the audited clean clone:

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: pass; production build succeeded, 74 tests passed, 1 PostgreSQL integration test skipped.
- AI suite in a disposable environment: 34 passed, 2 live-model tests skipped, 1 third-party deprecation warning.
- `npm audit --omit=dev`: 0 production vulnerabilities.
- Full `npm audit`: 30 development-tool findings (1 low, 6 moderate, 23 high). Reported fix paths include current non-major updates for vinext, Vite, the Cloudflare Vite plugin, and related tooling; compatibility must be verified against vinext's version-specific guides before updating.

Testing gaps:

- No checked-in CI workflow.
- No browser-level end-to-end suite for the real studio workflows.
- Database authorization/recovery integration suite is skipped unless PostgreSQL is configured.
- Live model/provider tests are opt-in and do not produce a durable benchmark record.
- No load, queue-restart, R2 reconciliation, multi-worker, cancellation-race, or disaster-recovery tests.
- No golden audio corpus with objective metrics plus blinded listening scores for alignment, separation, conversion, harmony, or enhancement.

## Prioritized roadmap

### Phase 1 — foundation

1. Split the monolithic studio UI into route-level workspaces and domain components without changing behavior.
2. Add generalized jobs and job events; migrate separation, training, mixing, transcription, and export to durable typed jobs.
3. Add semantic tracks and version-track mappings while keeping compatibility with `version_assets`.
4. Make Projects first-class and backfill a personal project for every user.
5. Move model artifacts from host paths to private managed object storage.
6. Add authorization policy helpers, rate limits, origin/CSRF checks, security headers, audit events, and CI.
7. Resolve package-manager ownership, obsolete D1 docs, and current development-tool advisories.

Exit criteria: existing workflows still pass; queued work survives process restarts; all new objects are owner/project scoped; current songs are backfilled with no audio rewrite.

### Phase 2 — single-song vocal workspace

1. Add song sections, lyric segments, word timings, and manual alignment correction.
2. Build the DAW-like timeline shell with synchronized playback, zoom, selection, waveform lanes, and non-destructive edit history.
3. Add pitch analysis/correction and time alignment behind provider interfaces.
4. Add explicit lead/BGV/harmony/guide/instrument/master track roles.
5. Add safe export presets and a durable export manifest.

Exit criteria: one song can be imported or generated, aligned at word level, edited by region, auditioned, undone, versioned, and exported without destructive overwrite.

### Phase 3 — harmonies and background vocals

Add harmony arrangement plans, multiple candidate generations, timing/formant controls, phrase-specific regeneration, grouping, blend controls, and acceptance benchmarks. Every output remains an independent derived track.

### Phase 4 — mix preparation

Add deterministic cleanup, de-essing, EQ, compression, reverb/delay sends, loudness/true-peak analysis, mix presets, and reversible automation. Keep preview rendering fast and final rendering asynchronous.

### Phase 5 — team workflow

Add teams, invitations, project roles, comments/annotations, review states, activity history, version comparison, and scoped vocalist permissions. Authorization tests are a release gate.

### Phase 6 — export and delivery

Add master/stem/acapella/instrumental exports, WAV/MP3 settings, archive bundles, checksummed manifests, expiring links, retention policies, and delivery history.

### Phase 7 — hardening

Run queue chaos/restart tests, load tests, storage reconciliation, recovery drills, provider failover tests, security review, accessibility review, cost telemetry, and the full golden-audio acceptance program.

## Blocking decisions before Phase 1 implementation

Only four decisions materially affect the foundation:

1. **Deployment topology:** keep the recommended Cloudflare app + PostgreSQL/R2/Queue + separately deployed AI worker, or move all services to one private host. The current code strongly favors the recommended hybrid.
2. **Commercial licensing posture:** whether Dozi will remain open source/GPL-compatible or proprietary. This directly affects Seed-VC integration and Rubber Band distribution.
3. **Collaboration ownership:** whether projects are owned by one user and shared to teams, or owned directly by teams. Recommendation: user-owned personal projects plus optional team ownership, represented explicitly.
4. **Voice-artifact residency:** local-only studio models versus encrypted cloud-managed artifacts. Recommendation: support both through one artifact interface, with cloud-managed encrypted storage as the collaboration path.

No other uncertainty blocks additive Phase 1 work. Provider selection, harmony models, mastering models, and final UI polish can remain behind interfaces until representative evaluations are complete.
