# ACE-Step Lego experiment

## Decision

**C — creative regeneration tool only (confirmed by initial human listening; broader panel pending).** Lego produced independently rendered, target-conditioned audio with exact file-length alignment and some useful spectral differentiation. It did not demonstrate transient-locked, sample-accurate performance: envelope correlation was low, best-lag offsets were large, and target/tempo adherence varied substantially by seed. Initial guitar listening also found weak instrument identity and audible artifacts. Successful outputs are still classified `NATIVE_TRACK` / `GENERATED_NATIVE` / `LEGO_CONTEXTUAL`, not `DERIVED_STEM`, because the installed task generates rather than extracts.

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

## Mac Studio Prompt #5 follow-up

A higher-memory Apple Silicon follow-up used the same ACE-Step commit, base model, no-LM conditioning, source WAV, targets, and seeds. The runtime detected 77.8 GB unified memory, selected its unlimited tier, enabled native MLX DiT/VAE, and required no CPU offload.

The original three targets reproduced their Prompt #4 technical metrics while completing much faster:

| Target | MacBook wall time | Mac Studio wall time | Speedup |
|---|---:|---:|---:|
| Bass 8401, first/cold request | 160.35 s | 10.19 s | 15.7x |
| Drums 8402, warm | 135.92 s | 2.09 s | 65.1x |
| Keyboard 8403, warm | 141.89 s | 2.08 s | 68.2x |

The MacBook and Mac Studio bass 8401 renders had identical WAV parameters and effectively identical signal content but not bit-identical PCM. Sample correlation was 0.99999948, the difference signal measured -67.58 dBFS RMS, and signal-to-error ratio was 59.82 dB. Treat seeded MLX output as musically repeatable across Apple Silicon machines, not byte-deterministic across hardware.

Guitar seed 8406 was then used for a controlled listening and parameter sweep:

- Eight steps had the weakest guitar identity and most audible artifacts. Sixteen steps was modestly better, and 32 steps improved again. Sixty-four steps produced little further improvement, establishing 32 as the practical ceiling for this source.
- Guidance 9 strengthened guitar identity but increased harshness. Guidance 7 was smoother but less recognizable. Guidance 8 was retained as the midpoint for the shift comparison.
- A guitar-specific caption improved heuristic tempo, pitch-class, envelope offset, and correlation but sounded effectively the same as the ensemble caption. Prompt wording did not overcome the perceived identity/artifact limitation.
- Shift 1 was judged much better than shift 3 for seed 8406. At 32 steps and guidance 8 it reduced high-frequency energy and trailing silence, improved envelope correlation from 0.214 to 0.246, and preserved exact file length with no clipping.

A generalization check then applied `steps=32`, `guidance=8`, and `shift=1` to the earlier weak guitar seed 8405. Its tempo heuristic improved from 50.21 to 86.33 BPM, but low-frequency energy increased from 1.6% to 27.4%, envelope correlation declined from 0.377 to 0.221, and listening rejected the result. The seed-8406 improvement therefore does **not** establish a transferable configuration.

There is no supported universal guitar default from this sweep. `steps=32`, `guidance=8`, `shift=1`, and `thinking=false` is retained only as the best observed setting for seed 8406, not as a provider recommendation. Quality and leakage remain strongly seed-dependent, so a product experiment would need multiple candidates plus human selection rather than promising one dependable track per request.

A four-candidate guitar batch then tested that selection workflow with seeds 8407-8410 at the more conservative `steps=32`, `guidance=8`, and `shift=3`. A transparent heuristic penalized low-frequency leakage, tempo error, and silence while rewarding envelope correlation. It rejected the two largest timing outliers and advanced seeds 8407 and 8409; both estimated 74.53 BPM against the 74.07 BPM source. The finalists were presented as a blind A/B comparison. The listener preferred A (seed 8409) as less harsh and better overall, while still noting artifacts. The heuristic had ranked seed 8407 first, so it successfully narrowed the pool but did not predict the preferred order.

This supports a staged product experiment: generate multiple seeds, automatically reject obvious tempo/leakage/silence failures, and require human selection among finalists. Automated metrics are useful for pruning, not final musical ranking. Even the preferred candidate retained audible artifacts and was not judged production-ready.

The hardware-feasibility bottleneck is removed on this Mac Studio, but the musical/product conclusion is not overturned. Lego remains suitable for creative contextual alternatives, not dependable multitrack reconstruction or guaranteed production-ready instrument tracks.

## Next recommendation

Complete the remaining Prompt #5 validation with longer sources, multiple seeds per target, section-level drift analysis, and a blinded multi-listener panel. Refine automated candidate rejection using labeled listening data, but keep final musical selection human-controlled. Do not adopt a single provider default from this sweep. Treat Lego as a creative “regenerate track” experiment, not a multitrack reconstruction foundation, unless that broader benchmark overturns this result. Do not build the mixer foundation yet.
