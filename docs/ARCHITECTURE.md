# Architecture

The MVP is a Vinext/React application compiled for Cloudflare Workers. `StudioApp` owns the interactive surface while route handlers enforce identity, ownership, validation, and job transitions. D1 stores accounts, sessions, songs, jobs, assets, and immutable versions. R2 stores WAV masters.

The boundary is normalized around songs, immutable versions, generation jobs, composition plans, and provider capabilities. The deterministic provider runs server-side. Active jobs are durable and resumable: authenticated polling advances the orchestrator and an idempotent completion transaction prevents duplicate versions. A dedicated queue consumer can later replace this trigger without changing the API contract.

`QUEUED → PREPARING → GENERATING → POST_PROCESSING → UPLOADING → COMPLETE`

Terminal records never return to active states. Regenerate, remix, extend, and repaint create children rather than overwriting versions.
