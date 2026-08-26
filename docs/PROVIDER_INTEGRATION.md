# Provider integration

A music provider exposes health, capabilities, generate, and optional extend/remix/repaint/stems operations. Product code consumes normalized requests and results, never provider payloads.

ACE-Step 1.5 is wired only through its verified official task and audio endpoints. Dozi still boots and offers mock generation while ACE-Step is unavailable.
# Provider contract

`MusicGenerationProvider.generate(GenerationRequest)` returns `GenerationResult { assets: GeneratedAsset[] }`. Assets carry role, native/derived provenance, optional instrument/group, audio transport, alignment metadata, and provider metadata. Selection uses `MUSIC_PROVIDER=mock|ai-service|acestep|minimax|elevenlabs`.

The FastAPI mock is started with `cd ai-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn app.main:app --reload`. Configure `AI_SERVICE_BASE_URL` and optionally the same `AI_SERVICE_TOKEN` in both services.

For real generation set `MUSIC_PROVIDER=acestep`. `AceStepMusicProvider` calls the gateway's `/v1/ace-step-generation`; the gateway alone translates plans and handles the official asynchronous task API. Stable errors are `GENERATION_PROVIDER_UNAVAILABLE`, `GENERATION_TIMEOUT`, `GENERATION_PROVIDER_FAILED`, and `GENERATION_INVALID_RESULT`. Full songs use one-time binary transfer URLs rather than JSON base64. ACE-Step does not expose task cancellation in the verified REST documentation, so Dozi cancellation discards a late result.

Experimental Lego support is a separate `generateContextualTrack` provider operation, not a route-level special case and not a replacement for normal generation. It validates ACE-Step's fixed instrument groups, uploads source audio through the official multipart API, and normalizes one result as `NATIVE_TRACK` / `GENERATED_NATIVE` / `LEGO_CONTEXTUAL`. `VersionAsset.sourceAssetId` provides relational conditioning lineage. See `ACESTEP_LEGO_EXPERIMENT.md` for measured limitations.

For experimental local MiniMax Music 3 generation, run the dedicated native MLX service on port 8002, set `MINIMAX_BASE_URL=http://127.0.0.1:8002` for the AI gateway, and set `MUSIC_PROVIDER=minimax` for Dozi. The TypeScript provider calls the gateway's `/v1/minimax-generation` route; only the dedicated service imports `mlx_audio` and holds the model in memory. The gateway validates the returned PCM WAV and exposes a one-time authenticated transfer URL to the worker. `MINIMAX_MODEL` defaults to `MiniMax-Music3-mxfp8`, `MINIMAX_STEPS` defaults to 30, and `MINIMAX_TIMEOUT_SECONDS` defaults to 1800.

The MiniMax provider supports `MASTER_ONLY` and is classified `EXPERIMENTAL`. It does not claim native multitrack output. Keep it opt-in until representative quality, longer-duration latency and memory, failure recovery, and current license/attribution requirements pass review.
