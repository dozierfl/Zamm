# ADR 0007: Additive Phase 1 foundation

## Status

Accepted

## Context

Dozi already has a working song-generation pipeline, immutable song versions, private audio storage, derived stems, mix rendering, track replacement, vocal repair, and private vocalist profiles. The Voice Engine roadmap needs durable jobs for more operation types, project roles, stable semantic tracks, and managed voice-model artifacts. Replacing the current path in one release would put working behavior and user data at unnecessary risk.

## Decision

Phase 1 is additive.

- Every user receives one personal project and an OWNER membership. Existing projects receive owner memberships and unassigned songs move into their owner's personal project.
- `jobs` is the provider-neutral durable operation record. `job_events` is its append-only status, progress, retry, error, result, and cancellation history.
- Existing `generation_jobs` remain authoritative for current music generation during migration. A database trigger mirrors inserts and updates into the generalized job contract with the same identifier.
- `tracks` stores stable song-level musical identity. `song_version_tracks` stores a version's audio asset, lineage, timing, gain, pan, mute, and solo state.
- Existing `version_assets` remain supported. A database trigger creates compatibility semantic tracks and version mappings until application writers use the new model directly.
- `voice_model_artifacts` catalogs immutable checkpoint, index, manifest, and configuration files by storage key and checksum. Provider host paths are not the long-term source of truth.
- Project access uses explicit OWNER, ADMIN, EDITOR, VOCALIST, and VIEWER roles. Server routes still apply owner scoping while features transition to membership authorization.

## Consequences

Existing APIs and workers continue to function while new job and track consumers can use normalized contracts. The temporary dual-write triggers add operational complexity and must be removed only after all writers and readers have migrated. Compatibility tracks initially mirror version assets one-to-one; later feature work may deliberately reuse a stable track across multiple versions. Voice artifact rows do not by themselves migrate existing provider model files; import and encryption workflows remain separate follow-up work.
