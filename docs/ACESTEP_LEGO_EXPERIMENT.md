# ACE-Step Lego experiment

## Decision

**C — creative regeneration tool only (pending human listening).** Lego produced independently rendered, target-conditioned audio with exact file-length alignment and some useful spectral differentiation. It did not demonstrate transient-locked, sample-accurate performance: envelope correlation was low, best-lag offsets were large, and target/tempo adherence varied substantially by seed. Successful outputs are still classified `NATIVE_TRACK` / `GENERATED_NATIVE` / `LEGO_CONTEXTUAL`, not `DERIVED_STEM`, because the installed task generates rather than extracts.

## Baseline and installed behavior

- Dozi starting HEAD: `12299f293d03bd74d599bdb212ecd305027636a8`; Prompt #3 changes were already uncommitted.
- Official ACE-Step 1.5 commit: `14c0211d5a0653b0f63e27686f4c3f151b4d8629`.
- Hardware: Apple M1 MacBook Pro, 16 GB unified memory; runtime reported 10.67 GB available to MPS, tier 4.
- Installed source confirms `lego` requires source audio and a base model, locks output duration to the source, preserves source latents as conditioning, and uses `Generate the TARGET track based on the audio context:`.
- Verified targets: `woodwinds`, `brass`, `fx`, `synth`, `strings`, `percussion`, `keyboard`, `guitar`, `bass`, `drums`, `backing_vocals`, `vocals`. Kick, snare, hi-hat, and cymbals are not supported targets.
- Direct conditioning was used: no 5 Hz LM, `thinking=false`. Base controls were eight inference steps, guidance 7, shift 3, batch one, WAV.

## Hardware feasibility gate

`acestep-v15-base` downloaded and eager-loaded successfully with the native MLX DiT and VAE. The first load took approximately 94 seconds. With offload disabled, the first 10-second bass request failed before diffusion: MPS had allocated 11.74 GiB, reported another 6.55 GiB of allocations, and rejected an additional 10.99 MiB at its safety watermark. The watermark was not disabled because PyTorch warned this could cause system failure.

One safer retry used an eight-second source and official `offload_to_cpu=true` plus `offload_dit_to_cpu=true`. It succeeded. Logs confirm VAE, text encoder, and DiT were moved to MPS only for their phase and returned to CPU. Status: **LOCAL BASE MODEL FEASIBLE ONLY WITH AGGRESSIVE OFFLOAD AND SHORT CONTEXT ON THIS MACHINE.**

## Source and experiments

The source is the first eight seconds of Prompt #3's real 74 BPM, F# minor neo-soul context. It is 48 kHz, stereo, 16-bit PCM, 384,000 samples. All generated files and `results.json` are local under ignored `artifacts/acestep-lego/`.

| Target | Seed | Wall time | Duration/sample delta | Peak / RMS dBFS | Silence lead/tail | Tempo estimate | Heuristic bands below 120 Hz / above 5 kHz |
|---|---:|---:|---:|---:|---:|---:|---:|
| Source | — | — | — | -1.71 / -18.19 | 24.8 / 0 ms | 74.07 | 64.9% / 1.12% |
| Bass | 8401 | 160.35 s | 0 ms / 0 | -1.79 / -7.83 | 51.7 / 0.9 ms | 100.00 | 84.0% / 0.00015% |
| Drums | 8402 | 135.92 s | 0 ms / 0 | -2.53 / -15.33 | 0 / 0 ms | 75.95 | 85.3% / 0.53% |
| Keyboard | 8403 | 141.89 s | 0 ms / 0 | -1.18 / -21.36 | 233.7 / 0 ms | 87.59 | 13.6% / 5.36% |

A same-seed bass repeat took 137.81 seconds and was byte-for-byte identical to the first render. Both SHA-256 checksums are `4f687e6c50721aeb379b687df83bcf233099053fe71fe7f3c457fb67ce2dc2b2`, confirming deterministic output for this request and runtime.

A different bass seed, 8404, took 136.98 seconds and produced a distinct checksum (`6c2e1663923d9464b877dff42a6a44f7fda5122a4b38100516feb542e70977ae`). It remained exactly eight seconds but estimated 59.41 BPM, correlated best at +2455 ms, and placed only 27.9% of energy below 120 Hz. In contrast, seed 8401 placed 84.0% below 120 Hz. This establishes creative variation but weakens any claim that every seed yields a dependable bass track.

All outputs were stereo, 48 kHz, 384,000 samples, and had zero clipping samples. Pitch-class estimates were A for source, E for bass, B for drums, and E for keyboard. This simple spectral detector is uncertain and is not evidence of definitive key changes.

## Timing and isolation assessment

Analysis uses 5 ms RMS envelopes, positive energy flux for onsets/tempo, normalized envelope cross-correlation, FFT energy bands, and a -60 dBFS silence threshold. It is deterministic but intentionally heuristic.

- Best envelope offsets were -1485 ms bass, -1590 ms drums, and +810 ms keyboard; normalized maxima were only 0.214, 0.247, and 0.327. Different instruments naturally correlate weakly, but these large lags do not support a sample-accurate synchronization claim.
- Drums followed the requested tempo closely (+1.88 BPM). Bass (+25.93 BPM) and keyboard (+13.52 BPM) did not under the same estimator. Eight seconds is a weak tempo-estimation window, so these are warning signals rather than proof of drift.
- Bass is strongly target-like spectrally: 84.0% of energy below 120 Hz and virtually none above 5 kHz. Keyboard shifts energy into the mid/high bands. The drums output is unexpectedly bass-heavy and has little high-frequency energy; it may represent a low-frequency reinterpretation or leakage rather than a complete drum group.
- No source/output sample-count drift exists. Midpoint/end drift cannot be reliably separated from reinterpretation in such a short clip; the correlation result is not a constant-offset correction recommendation.
- Automated inspection cannot replace a human listening panel. No fabricated listening judgment is recorded. The local files should be auditioned before any future promotion beyond classification C.

## Diagnostic sum

Bass, drums, and keyboard were summed offline at -12.04 dB per track (linear gain 0.25), with no normalization, EQ, compression, limiting, or mastering. The eight-second sum peaks at -7.09 dBFS, RMS -18.92 dBFS, and has zero clipped samples. Its envelope correlation to the source is low (0.206 at -1585 ms), which is expected for a newly assembled interpretation but does not demonstrate tight session coherence. It is not intended to null or recreate the source.

## Architecture and product implications

Dozi now has `TrackGenerationMethod`, a validated `ContextualTrackGenerationRequest`, a provider-level `generateContextualTrack` operation, exact target validation, an ACE multipart source-audio translator, and relational `VersionAsset.sourceAssetId` lineage. The migration adds `generation_method` and an audio-asset foreign key. Normal text-to-song generation is unchanged.

Lego reduces dependence on traditional separation **for newly generated contextual alternatives**, but not for reconstructing arbitrary masters or isolating existing performances. A future hybrid remains justified: native song generation + Lego contextual tracks + Extract/separation where faithful recovery is required. A future drums hierarchy may decompose the supported `drums` group into kick/snare/hi-hat/cymbals with a separate technology; Prompt #4 does not claim or implement that.

On this M1, offload overhead dominates and memory margin is narrow. Production experimentation should use a dedicated GPU worker, cloud GPU, or larger-memory Apple Silicon system; no vendor or cost conclusion is implied.

## Prompt #5 recommendation

**Prompt #5 — GPU validation and listening benchmark for contextual-track regeneration.** Run a longer controlled set on higher-memory hardware, include blinded human listening, multiple seeds, section-level drift analysis, and bass/drums/keyboard/guitar comparisons. Treat Lego as a creative “regenerate track” experiment, not a multitrack reconstruction foundation, unless that benchmark overturns this result. Do not build the mixer foundation yet.
