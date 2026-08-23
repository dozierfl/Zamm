# ACE-Step 1.5 capability report

Verified against the official `ace-step/ACE-Step-1.5` repository at commit `14c0211d5a0653b0f63e27686f4c3f151b4d8629` (2026-08-16), package version 1.5.0. The documented REST workflow is `POST /release_task`, `POST /query_result`, then `GET /v1/audio?path=...`. The server must use one worker because its queue/job store is in memory.

| Feature | Installed support | Model/API requirement | Dozi status and future relevance |
|---|---|---|---|
| Text-to-music | Yes | `text2music`; turbo or base | Integrated as primary master |
| Lyrics | Yes | `lyrics`, optional language | Integrated without rewriting |
| Instrumental | Yes | lyrics marker `[instrumental]` | Integrated explicitly |
| BPM | Yes, 30–300 | `bpm` | Integrated |
| Key/scale | Major/minor keys | `key_scale` | Integrated |
| Time signature | 2/4, 3/4, 4/4, 6/8 | API sends numerator 2/3/4/6 | Integrated |
| Seed | Yes | `use_random_seed=false`, `seed` | Integrated; actual seed retained in provider metadata |
| Batch alternatives | 1–8 | `batch_size` | Parsed as one MASTER plus ALTERNATIVE assets |
| Reference audio | Yes | multipart `reference_audio` | Supported, not integrated |
| Cover | Yes | `cover`, source audio; turbo/base | Discovery only |
| Continue | No distinct task | `complete` is arrangement completion, not simple continuation | Not claimed |
| Repaint | Yes | source audio and time range; turbo/base | Discovery only |
| Extract | Yes | base model; source audio; target track | Discovery only; isolated result should be `DERIVED_STEM` because it is extracted from a mix |
| Lego | Yes | base model; source audio; one target from fixed track names | Discovery only; instruction says generate target in audio context, making it the best first native-track experiment |
| Complete | Yes | base model; source audio; target track classes | Discovery only; may add missing contextual parts |
| Stem/separation | Extract only | Base model; fixed targets | Not arbitrary source separation; do not call native tracks stems |
| Audio understanding | Internal API from audio semantic codes | 5Hz LM; `understand_music()` | Not exposed by the basic REST generation adapter; future blueprint analysis |
| LRC/timestamps | Yes in generation/UI pipeline | Intermediate condition tensors; unavailable in save-memory mode | Not integrated into REST gateway |

The fixed advanced track vocabulary is: woodwinds, brass, fx, synth, strings, percussion, keyboard, guitar, bass, drums, backing vocals, vocals. Lego's instruction is “generate the target track based on the audio context”; Extract's is “extract the target track from the audio”; Complete accepts multiple target classes. The source documents do not guarantee arbitrary instruments or repeated-layer phase behavior, so synchronization and leakage must be measured experimentally before Prompt #4 product claims.

The current Dozi integration intentionally selects `acestep-v15-turbo`, eight inference steps, `thinking=false`, batch size one, and WAV output. On the 16 GB M1 machine this avoids loading a second 5Hz LM and leaves the base-only advanced modes for later evaluation.

## Verified local result

The official MLX backend was exercised on an Apple M1 MacBook Pro with 16 GB unified memory. The installed official checkout, Python environment, and downloaded model bundle occupy approximately 11 GB together. A direct eight-step generation produced a valid 10-second, 48 kHz, 16-bit stereo WAV with requested and actual seed `7415`. The first invocation included lazy model loading; ACE-Step reported 351.84 seconds of generation time.

The complete Dozi acceptance path used the officially supported one-step turbo setting to keep the test bounded. It completed HTTP submission, PostgreSQL job persistence, durable queue delivery, provider translation, official ACE-Step inference, gateway transfer, R2 storage, immutable version persistence, and authenticated playback. ACE-Step reported 85.15 seconds for the 10-second result with requested and actual seed `7416`. The stored 1,920,078-byte WAV streamed with HTTP 206 range semantics, and its downloaded SHA-256 matched the database checksum: `366dd480e0288bde3b876af9ef1cac706f446cb725a3f07c1df4cf5a9b9ef2db`.
