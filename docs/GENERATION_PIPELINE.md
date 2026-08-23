# Generation pipeline

1. Validate the creator request.
2. Convert it to the visible Song Blueprint.
3. Create a generation record and seed.
4. Advance through controlled lifecycle states.
5. Ask the selected provider for normalized output.
6. Inspect and store the master outside the relational database.
7. Create an immutable SongVersion and downsampled waveform.

The bundled mock generates a deterministic 16-bit PCM WAV, SHA-256 checksum, and 96-point waveform. The master is written to R2 before asset/version metadata is committed. Duplicate processing is safe because job-to-asset and job-to-version relationships are unique.
# Queue-driven generation

POST creates the song/job and reserves version 1 transactionally, then enqueues its ID. The consumer claims only QUEUED/eligible FAILED jobs, advances the explicit state machine, invokes the provider, uploads deterministic role-aware keys, and commits assets, mappings, version, and COMPLETE together. Duplicate messages observe a terminal job and exit.

GET status performs SELECTs only. Cancellation records a request; queued work becomes CANCELLED immediately and active orchestration checks before completion.
