# Architecture

The MVP is a Vinext/React application compiled for Cloudflare Workers. `StudioApp` owns the interactive surface while route handlers enforce identity, ownership, validation, and job transitions. PostgreSQL stores accounts, sessions, songs, jobs, assets, and immutable versions. R2 stores WAV masters.

The boundary is normalized around songs, immutable versions, generation jobs, composition plans, and provider capabilities. The deterministic provider runs server-side. Active jobs are durable and resumable: authenticated polling advances the orchestrator and an idempotent completion transaction prevents duplicate versions. A dedicated queue consumer can later replace this trigger without changing the API contract.

`QUEUED → PREPARING → GENERATING → POST_PROCESSING → UPLOADING → COMPLETE`

Terminal records never return to active states. Regenerate, remix, extend, and repaint create children rather than overwriting versions.
# Architecture foundation migration

The production path is Browser → Worker API → PostgreSQL job → Cloudflare Queue → queue consumer → `GenerationOrchestrator` → configured provider/FastAPI → R2 assets → PostgreSQL immutable version. Queue delivery is at-least-once and orchestration completion is idempotent.

The existing React interface continues to consume a primary master. Additional assets are represented without requiring a mixer UI.

ACE-Step runs as an independently managed official service. The Dozi FastAPI gateway is the only component that knows its task API; browser and TypeScript orchestration continue to use provider-neutral requests and multi-asset results.

Contextual-track generation extends the provider boundary with a typed optional operation while retaining `GenerationResult`. Lineage is explicit on the version-to-asset mapping through `sourceAssetId` and `generationMethod`; source asset, output asset, version, and generation job remain independently queryable.

The primary product remains master-based. Contextual generation is classified as creative regeneration, while extraction and separation are classified as derived-stem workflows. The development mixer may use explicitly labeled derived stems as editing aids and creates non-destructive child versions; it does not make production-quality isolation claims. See ADR 0003 and ADR 0005.

Phase 1 introduces a migration seam around the working pipeline. A generalized durable job record and append-only event stream now mirror legacy generation jobs. Personal projects and project memberships provide a role-based authorization boundary. Stable song-level tracks are separated from version-specific audio mappings, so lead, background, harmony, instrument, bus, and master identities can persist across immutable song versions. Database triggers keep legacy writes compatible until each producer is moved to the new contracts. The Voice Studio shell consumes authenticated project and owner-private voice-library APIs while future processing controls remain disabled. See ADR 0007.
