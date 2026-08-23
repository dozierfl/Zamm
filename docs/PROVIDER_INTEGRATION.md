# Provider integration

A music provider exposes health, capabilities, generate, and optional extend/remix/repaint/stems operations. Product code consumes normalized requests and results, never provider payloads.

ACE-Step is deliberately not wired to fabricated endpoints. Add it after selecting a concrete installed release and mapping its official API. Dozi must still boot and offer mock generation while ACE-Step is unavailable.
# Provider contract

`MusicGenerationProvider.generate(GenerationRequest)` returns `GenerationResult { assets: GeneratedAsset[] }`. Assets carry role, native/derived provenance, optional instrument/group, audio transport, alignment metadata, and provider metadata. Selection uses `MUSIC_PROVIDER=mock|ai-service`; ACE-Step intentionally remains unavailable.

The FastAPI mock is started with `cd ai-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn app.main:app --reload`. Configure `AI_SERVICE_BASE_URL` and optionally the same `AI_SERVICE_TOKEN` in both services.
