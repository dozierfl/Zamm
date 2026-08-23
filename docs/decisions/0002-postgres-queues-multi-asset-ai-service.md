# ADR 0002: PostgreSQL, queues, multi-asset results, and AI service

Status: accepted.

Application metadata moves from D1/SQLite to PostgreSQL through Drizzle. R2 remains the audio object store. HTTP POST reserves an immutable version number and enqueues a job; status GET is observational only. Cloudflare Queues invoke `GenerationOrchestrator`, with a microtask-based queue restricted to local/test environments.

Providers return a validated `GenerationResult` containing one or more `GeneratedAsset` values. `version_assets` normalizes role, provenance, instrument grouping, ordering, alignment, gain, and pan while `song_versions.audio_asset_id` remains the compatibility pointer to the primary master.

R2 and PostgreSQL cannot share a transaction. Asset IDs and role-aware keys are deterministic, uploads are overwrite-idempotent, and database inserts are protected by unique keys. PostgreSQL is authoritative. A future reconciliation task may delete deterministic objects that have no committed `audio_assets` row.

The FastAPI service is an authenticated-capable provider boundary. Inline base64 audio exists only for small development fixtures; production providers should use signed object transfer or streaming.
