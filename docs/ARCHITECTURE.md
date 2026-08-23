# Architecture

The MVP is a Vinext/React application compiled for Cloudflare Workers. `StudioApp` owns the interactive vertical slice: creator controls, deterministic Song Blueprint, generation state machine, version cards, library, and one global player.

The boundary is normalized around songs, immutable versions, generation jobs, composition plans, and provider capabilities. The mock currently runs client-side to keep deployment credential-free. A production increment should move jobs to a durable queue, metadata to D1/PostgreSQL, and audio to R2/S3 while preserving this contract.

`QUEUED → PREPARING → GENERATING → POST_PROCESSING → UPLOADING → COMPLETE`

Terminal records never return to active states. Regenerate, remix, extend, and repaint create children rather than overwriting versions.
