# Master generation provider evaluation

Status: Eleven Music v2 validated as Dozi's primary master-generation candidate. Broader genre, vocal, and commercial-terms validation remains.

## Eleven Music v2 proof-of-concept result — 2026-08-24

The production adapter completed two 12-second and one 30-second instrumental generations through the full Dozi pipeline: ElevenLabs API, normalized provider result, object storage, PostgreSQL persistence, authenticated library retrieval, range-capable playback, and browser playback.

Human listening findings:

- Materially cleaner and more convincing than the ACE-Step Turbo reference set.
- No audible distortion and minimal artifacts, if any.
- Strong instrument identity: Rhodes, kick, closed hi-hat, rimshot, and bass were distinct and musically compatible.
- The 30-second track maintained coherent harmony, arrangement, transitions, and a usable ending.
- Perceived encoding quality was closer to 128 kbps despite requesting 48 kHz/192 kbps MP3; verify encoded files independently and evaluate higher-fidelity tiers before final production approval.

The first 30-second vocal acceptance test also completed through the full pipeline using original supplied lyrics and contrasting alternative-pop/rock production. Human listening found the vocal realistic and intelligible with accurate pronunciation. Bass and drums remained strong. Mild vocal sibilance was audible, exposed keys revealed some artifacts, and the chorus included an acceptable but instrumentally ambiguous percussive 16th-note part, likely the requested guitar arpeggio blended with a keyboard/pluck texture.

Vocal-test classification: **A- / passed initial acceptance**. Track sibilance, exposed-key artifacts, and ambiguous instrument identity as known limitations; validate them across additional voices, keys, genres, and longer arrangements before production approval.

Product classification: **A- / primary candidate**. Use Eleven Music v2 as Dozi's preferred hosted master provider for continued evaluation. Keep ACE-Step as an experimental local/fallback engine. Do not mark Eleven Music production-approved until contrasting genres, vocals, failure behavior, latency, costs, and applicable commercial terms pass the acceptance gate.

## Decision context

ACE-Step Turbo completed Dozi's real master pipeline but remained below production quality after seed selection, longer-duration prompting, cymbal-focused prompting, and light post-processing. Dozi should preserve ACE-Step as an experimental local provider while evaluating a commercially documented hosted provider through the existing normalized boundary.

## Shortlist

### 1. Eleven Music v2 — first full-song proof of concept

Eleven Music is the closest fit to Dozi's current product: complete instrumental or vocal songs, detailed composition plans, section durations, seeds, audio references, inpainting storage, and tracks from 3 seconds to 10 minutes. Its API is available to paid subscribers. Music v2 returns 48 kHz/192 kbps MP3 by default; higher-fidelity exports and commercial rights depend on subscription tier and Music Terms.

Use it first for a bounded master-quality comparison because it maps most directly to Dozi's lyrics, structure, instrumentation, duration, and future edit workflows. Do not claim commercial clearance until the selected subscription and intended Dozi use are checked against the current Music Terms.

Official references:

- https://elevenlabs.io/docs/api-reference/music/compose
- https://elevenlabs.io/docs/eleven-creative/products/music
- https://elevenlabs.io/eleven-music-api

### 2. Google Lyria — independent quality benchmark

Lyria 2 on Vertex AI is generally available for deterministic-seed, instrumental-only 30-second generation. It returns 48 kHz WAV, supports negative prompts or multiple samples, and is listed at USD $0.06 per generated 30 seconds. It is a strong instrumental benchmark but not a complete replacement for Dozi's vocal-song path.

Lyria 3 Clip and Pro in the Gemini API add vocals, timed lyrics, song structure, 44.1 kHz stereo output, and full-length generation, but the documented model IDs are previews and outputs are not deterministic. Treat Lyria 3 as a quality investigation rather than a production commitment until its preview status, terms, availability, and pricing are accepted.

Official references:

- https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/lyria-music-generation
- https://cloud.google.com/vertex-ai/generative-ai/pricing
- https://ai.google.dev/gemini-api/docs/music-generation

### 3. Stable Audio 3 — secondary instrumental/audio-edit option

Stable Audio supports asynchronous audio-to-audio generation up to six minutes at 44.1 kHz stereo and charges 26 credits per successful Stable Audio 3.0 generation. Stability's self-hosted Core Model license allows commercial use below USD $1 million annual organizational revenue and requires an enterprise license above that threshold. API terms and output rights must still be reviewed separately for the hosted service.

This is less aligned with Dozi's complete vocal-song goal than Eleven Music, but may merit later instrumental, continuation, or audio-to-audio testing.

Official references:

- https://platform.stability.ai/docs/api-reference
- https://stability.ai/license

## Excluded for now

No official, first-party Suno developer API documentation was found during this review. Third-party wrappers must not be used for production because they introduce account, reliability, contractual, and provenance risk.

## Acceptance gate

For each candidate, generate the same three Dozi briefs with at least four variants per brief and blind the provider identity during listening. Evaluate harmonic coherence, vocal intelligibility where applicable, transient distortion, high-frequency harshness, prompt and structure adherence, usable ending, latency, cost, output format, repeatability, and commercial-use terms. Preserve unchanged provider bytes and metadata through the existing R2/PostgreSQL pipeline.

The Eleven Music adapter is implemented behind `MusicGenerationProvider` and remains guarded by `masterGeneration: EXPERIMENTAL`. Instrumental and vocal proofs of concept have passed. Remaining acceptance work is broader genre and voice coverage, longer-form behavior, failure/latency/cost measurement, encoded-file verification, and commercial-terms confirmation.
