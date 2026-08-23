# Testing

`npm test` compiles the Worker and verifies that the server-rendered route contains the Dozi creator surface without starter metadata. `npm run lint` checks React and accessibility rules.

The exercised integration path registers an app account, submits the neo-soul acceptance prompt, waits for durable completion, verifies the stored version, requests bytes 100–299 of the WAV and receives a 206 response with exactly 200 bytes, reloads the library, and confirms an unauthenticated media request receives 401.
# Architecture verification

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:ai`, and `npm run build`. Integration tests require the Docker PostgreSQL service and the migration. Contract tests assert read-only GET semantics, polling-independent queue delivery, single/multi-asset provider behavior, and migration idempotency constraints.

ACE-Step translator, task parsing, offline, failure, malformed response, timeout, and WAV validation tests use fake official API responses. They do not load models. Real model verification is opt-in and must be recorded separately; ordinary test commands remain lightweight.

With the official ACE-Step service on port 8001 and the Dozi AI gateway on port 8000, run the real smoke test explicitly:

```bash
RUN_ACESTEP_INTEGRATION=1 AI_SERVICE_BASE_URL=http://127.0.0.1:8000 npm run test:ai
```

The live test has a 20-minute client timeout because Apple Silicon generation time varies by machine and whether models are already resident. It validates the returned provider identity and the actual PCM WAV header. Without `RUN_ACESTEP_INTEGRATION=1`, it is skipped.

ACE-Step Lego is independently gated because it requires the base model and source audio:

```bash
RUN_ACESTEP_LEGO_INTEGRATION=1 ACESTEP_LEGO_SOURCE=/absolute/context.wav npm run test:ai
```

Default CI exercises Lego translation, target validation, response normalization, classification, and lineage contracts without loading ACE-Step.
