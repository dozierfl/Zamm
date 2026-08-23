# Provider integration

A music provider exposes health, capabilities, generate, and optional extend/remix/repaint/stems operations. Product code consumes normalized requests and results, never provider payloads.

ACE-Step 1.5 is wired only through its verified official task and audio endpoints. Dozi still boots and offers mock generation while ACE-Step is unavailable.
# Provider contract

`MusicGenerationProvider.generate(GenerationRequest)` returns `GenerationResult { assets: GeneratedAsset[] }`. Assets carry role, native/derived provenance, optional instrument/group, audio transport, alignment metadata, and provider metadata. Selection uses `MUSIC_PROVIDER=mock|ai-service|acestep`.

The FastAPI mock is started with `cd ai-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn app.main:app --reload`. Configure `AI_SERVICE_BASE_URL` and optionally the same `AI_SERVICE_TOKEN` in both services.

For real generation set `MUSIC_PROVIDER=acestep`. `AceStepMusicProvider` calls the gateway's `/v1/ace-step-generation`; the gateway alone translates plans and handles the official asynchronous task API. Stable errors are `GENERATION_PROVIDER_UNAVAILABLE`, `GENERATION_TIMEOUT`, `GENERATION_PROVIDER_FAILED`, and `GENERATION_INVALID_RESULT`. Full songs use one-time binary transfer URLs rather than JSON base64. ACE-Step does not expose task cancellation in the verified REST documentation, so Dozi cancellation discards a late result.

Experimental Lego support is a separate `generateContextualTrack` provider operation, not a route-level special case and not a replacement for normal generation. It validates ACE-Step's fixed instrument groups, uploads source audio through the official multipart API, and normalizes one result as `NATIVE_TRACK` / `GENERATED_NATIVE` / `LEGO_CONTEXTUAL`. `VersionAsset.sourceAssetId` provides relational conditioning lineage. See `ACESTEP_LEGO_EXPERIMENT.md` for measured limitations.
