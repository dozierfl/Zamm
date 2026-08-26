# Artist Vocal Identity

Status: architecture and persistence foundation approved; synthesis provider selection and model training remain R&D.

## Product requirement

Dozi lets an authorized artist create a private singing-vocal profile, select it as the vocalist for a new song, and generate a complete performance whose vocal identity and learned singing characteristics come from that profile. The selected vocalist conditions performance generation from the beginning; ordinary speech cloning or a post-hoc timbre effect does not satisfy this requirement.

The system separates two related concepts while presenting one simple vocalist choice:

- **Vocal identity:** timbre, resonance, registers, pronunciation, breath, articulation, and other characteristics that make the singer recognizable.
- **Singing style:** phrasing, rhythmic placement, vibrato, transitions, runs, dynamics, and expressive tendencies.

Explicit instructions for the current song take precedence, followed by pitch/key/range constraints, the artist profile, and finally generic model behavior. Pitch discipline is polished by default. Intentional scoops, vibrato, bends, and timing feel remain; uncontrolled out-of-key behavior is not reproduced unless a future explicit raw-performance control requests it.

## Enrollment

Accepted source methods are guided live singing, live spoken verification, an owned dry vocal bounce, or—at reduced confidence—a vocal separated from an owned mix.

Recommended limits:

| Measurement | Requirement |
| --- | --- |
| Minimum accepted clip | 15 seconds |
| Minimum usable singing before training | 45 seconds |
| Recommended guided singing | 2–3 minutes |
| Guided recording maximum | 5 minutes |
| Live spoken challenge | 10–15 seconds, always required |

Speaking supports identity verification but cannot establish singing range, register transitions, vibrato, or phrasing by itself. Production-quality profiles require singing material. Additional authorized vocal bounces may improve a profile over time; model versions retain the exact source manifest used for reproducibility.

Preferred source audio is a clean, dry, single-singer WAV at 44.1 or 48 kHz. The quality pipeline measures clipping, noise, silence, reverb, accompaniment leakage, duplicate material, phoneme diversity, pitch/range coverage, and evidence of heavy processing. Duration alone never makes a profile trainable. A profile becomes eligible only after live verification passes, rights are attested, at least 45 seconds of usable singing exists, and automated quality/coverage gates pass.

## Consent and abuse prevention

- Profiles are private by default and scoped to their owner.
- A randomized spoken challenge must match both the displayed phrase and the uploaded singer identity.
- Every source records provenance, checksum-backed audio ownership, rights attestation, consent-policy version, and consent time.
- Provider model references are opaque server-side identifiers and are never exposed as browsable public assets.
- Revocation immediately prevents new generation and records who/when/why; retention or provider deletion work remains auditable.
- Profiles cannot be transferred, published, or used by another account without a future explicit, revocable grant model.
- Public-figure or third-party imitation is not supported by the enrollment path.

## Lifecycle

`DRAFT → COLLECTING → READY → TRAINING → ACTIVE` is the successful path. `FAILED` permits diagnosis/retry; `REVOKED` is terminal for generation. Training creates an immutable version from a checksum-addressed source manifest. Activating a new version does not rewrite songs generated with an earlier version.

Generation jobs and song versions retain nullable profile and immutable profile-version lineage. The absence of a profile means the selected music provider may choose its default vocalist. The presence of a profile requires a future provider capability explicitly supporting custom singing-voice conditioning; Dozi must not silently approximate it with speech cloning.

## Target synthesis path

1. A composition/performance planner creates melody, phoneme timing, breaths, dynamics, harmonies, and expression from the song brief and artist singing style.
2. Pitch and range constraints keep the result harmonically valid while allowing bounded artist inflection.
3. A singing acoustic model conditioned on phonemes, pitch, expression, vocal identity, and the artist adapter generates isolated vocal representations.
4. A neural vocoder renders lead, doubles, harmonies, and optional ad-libs as independently stored audio assets.
5. Dozi mixes those assets with an instrumental created from the same composition plan.

MiniMax Music 3 remains useful for composition and guide-song generation, but its current interface does not accept a custom vocalist. A proof of concept may derive melody/timing from a MiniMax guide and render a replacement isolated vocal; the production target is shared-plan instrumental and vocal generation rather than source separation from a completed master.

## Acceptance gate

No profile or provider is production-approved until representative testing measures identity similarity, lyric intelligibility, pronunciation, pitch/key accuracy, register transitions, artist-style recognition, emotion control, long-song identity stability, artifacts, unauthorized-use resistance, deletion/revocation behavior, latency, and artist approval. Human artist approval remains decisive.
