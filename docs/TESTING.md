# Testing

`npm test` compiles the Worker and verifies that the server-rendered route contains the Dozi creator surface without starter metadata. `npm run lint` checks React and accessibility rules.

The exercised integration path registers an app account, submits the neo-soul acceptance prompt, waits for durable completion, verifies the stored version, requests bytes 100–299 of the WAV and receives a 206 response with exactly 200 bytes, reloads the library, and confirms an unauthenticated media request receives 401.
# Architecture verification

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:ai`, and `npm run build`. Integration tests require the Docker PostgreSQL service and the migration. Contract tests assert read-only GET semantics, polling-independent queue delivery, single/multi-asset provider behavior, and migration idempotency constraints.
