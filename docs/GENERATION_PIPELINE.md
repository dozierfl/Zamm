# Generation pipeline

1. Validate the creator request.
2. Convert it to the visible Song Blueprint.
3. Create a generation record and seed.
4. Advance through controlled lifecycle states.
5. Ask the selected provider for normalized output.
6. Inspect and store the master outside the relational database.
7. Create an immutable SongVersion and downsampled waveform.

The bundled mock generates a deterministic 16-bit PCM WAV, SHA-256 checksum, and 96-point waveform. The master is written to R2 before asset/version metadata is committed. Duplicate processing is safe because job-to-asset and job-to-version relationships are unique.
