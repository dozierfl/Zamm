# Seed-VC Vocal Identity Experiment

Status: initial zero-shot singing-voice conversion proof of concept passed; not production-approved.

## Configuration

- Seed-VC source: `Plachtaa/seed-vc`
- Pinned commit: `51383efd921027683c89e5348211d93ff12ac2a8`
- Repository state: archived upstream; GPL-3.0
- Device: Apple Silicon MPS
- Model path: F0-conditioned 44.1 kHz singing voice conversion
- Source: 15-second BS-RoFormer-derived MiniMax guide vocal
- Target: 20-second clean authorized `FletchDeezie` singing reference
- Diffusion steps: 30
- Inference CFG: 0.7
- F0 conditioning: enabled
- Automatic F0 adjustment: disabled
- Semitone shift: 0
- Output: 44.1 kHz, mono, 24-bit WAV

Two local Apple-Silicon compatibility fixes were required: RMVPE F0 arrays must be cast to float32 before transfer to MPS, and SoundFile is used for WAV output because the installed nightly Torchaudio delegates saving to optional TorchCodec.

## Measured output

- Duration: 14.988 seconds
- Peak: 0.913573
- RMS: -20.17 dBFS
- Clipped samples: none detected

## Human listening result

The authorized artist reported that the conversion resembles their voice, keeps the words intelligible, and retains the guide performance's original melody and rhythm. No metallic, distorted, or obvious pitch artifacts were reported. A quiver was audible at some phrase endings on sustained notes. The current hypothesis is low-energy F0 instability or source-separation residue rather than broad watery/phasey synthesis texture; this must be isolated through controlled variants.

Classification: **passed initial proof of concept with a sustained-note stability limitation**.

### In-mix follow-up

A second 40-step/0.5-CFG render retained vocal identity and reduced the isolated phrase-ending quiver only slightly. It was then mixed at matched vocal level against the BS-RoFormer-derived instrumental and compared with the reconstructed original guide mix.

The authorized artist rejected the converted in-mix result. The replacement sounded only partly like the artist and appeared layered with an overpowering original singer. The quiver remained audible on the sustained word “quiet,” the converted voice did not blend naturally with the instruments, and the guide singer's raspy/slightly distorted character remained in the conversion. The original guide mix sounded more like a finished record when that raspy character was treated as intentional.

This result demonstrates two separate limitations:

1. The derived instrumental contains enough original-vocal leakage to invalidate it as a clean replacement bed.
2. Singing voice conversion preserves undesirable source-performance and source-isolation traits along with melody, timing, and expression.

Classification of the in-mix workflow: **failed / unsuitable as the current Dozi production path**. Do not compensate by simply raising the converted vocal or hiding leakage in the mix.

### Clean same-singer control

To isolate the converter from MiniMax generation and source separation, a clean 15-second segment from one authorized `FletchDeezie` singing take was converted using a separate clean 20-second `FletchDeezie` take as the reference. The 40-step/0.5-CFG result and original were level-matched before audition. No generated accompaniment or derived stems were involved.

The artist reported that the converted result remained recognizably their voice, but Seed-VC introduced a quiver absent from the clean source and made sustained notes less stable. The output therefore retained identity while adding unacceptable performance anomalies.

This control attributes the sustained-note defect to the Seed-VC conversion path rather than MiniMax, separation leakage, or the artist's source recording. Seed-VC passes identity resemblance and intelligibility but fails sustained-note stability. It is **not approved as Dozi's production singing-identity engine**.

## Next acceptance test

Evaluate a different singing-specific identity engine using the same clean source/reference control before integrating any training or generation UI. Preserve this exact A/B pair as the regression benchmark. A replacement must retain recognizable identity and intelligibility without introducing sustained-note instability. Production architecture should still prefer a singing acoustic model or artist adapter conditioned from the performance plan, with voice conversion treated only as an experimental fallback.

### Candidate screening

- **YingMusic-SVC** is the preferred research/server candidate because it is explicitly F0-aware and trained for harmony-contaminated, accompanied singing. The official code is MIT-licensed, but the released environment is CUDA 12.6/FP16-oriented and provides no Apple MPS path. Do not force it into the current Mac Studio runtime; revisit it on a CUDA test host or after upstream adds portable inference.
- **FreeSVC** is not advanced: its authors describe the checkpoint as a preliminary release primarily fine-tuned on speech, and the released weights are non-commercial.
- **Amphion Vevo** is not the next singing test: the released zero-shot checkpoints are trained on speech, despite the broader toolkit containing singing recipes.
- **Trained RVC with F0 enabled** remains the next bounded trained-identity experiment. The audited official WebUI source was pinned at commit `81eed5e8f68b6bed1789f682fe78cdd324495afc`. That release routes non-NVIDIA systems to CPU rather than Apple MPS and recommends at least ten minutes of low-noise training audio; the current authorized profile has about 76 seconds. Do not begin the definitive training run until the profile reaches the data target. It must beat the preserved clean A/B pair before any Dozi integration.

This experiment validates technical feasibility only. Upstream archival status, GPL obligations, model-weight licensing, abuse controls, broader voice coverage, source-separation dependence, latency, long-form stability, and artist approval remain product gates.
