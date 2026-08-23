# Architecture

The MVP is a Vinext/React application compiled for Cloudflare Workers. `StudioApp` owns the interactive surface while route handlers enforce identity, ownership, validation, and job transitions. D1 stores accounts, sessions, songs, jobs, assets, and immutable versions. R2 stores WAV masters.

The boundary is normalized around songs, immutable versions, generation jobs, composition plans, and provider capabilities. The deterministic provider runs server-side. Active jobs are durable and resumable: authenticated polling advances the orchestrator and an idempotent completion transaction prevents duplicate versions. A dedicated queue consumer can later replace this trigger without changing the API contract.

`QUEUED → PREPARING → GENERATING → POST_PROCESSING → UPLOADING → COMPLETE`

Terminal records never return to active states. Regenerate, remix, extend, and repaint create children rather than overwriting versions.
# Architecture foundation migration

The production path is Browser → Worker API → PostgreSQL job → Cloudflare Queue → queue consumer → `GenerationOrchestrator` → configured provider/FastAPI → R2 assets → PostgreSQL immutable version. Queue delivery is at-least-once and orchestration completion is idempotent.

The existing React interface continues to consume a primary master. Additional assets are represented without requiring a mixer UI.

ACE-Step runs as an independently managed official service. The Dozi FastAPI gateway is the only component that knows its task API; browser and TypeScript orchestration continue to use provider-neutral requests and multi-asset results.

Contextual-track generation extends the provider boundary with a typed optional operation while retaining `GenerationResult`. Lineage is explicit on the version-to-asset mapping through `sourceAssetId` and `generationMethod`; source asset, output asset, version, and generation job remain independently queryable.
