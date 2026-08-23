# Generation pipeline

1. Validate the creator request.
2. Convert it to the visible Song Blueprint.
3. Create a generation record and seed.
4. Advance through controlled lifecycle states.
5. Ask the selected provider for normalized output.
6. Inspect and store the master outside the relational database.
7. Create an immutable SongVersion and downsampled waveform.

The bundled mock simulates every stage and deterministic oscillator playback. It never blocks on an external model.
