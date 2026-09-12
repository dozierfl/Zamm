# ADR 0006: Owned aligned-track replacement creates an editable draft

## Status

Accepted for development use.

## Decision

An artist may replace one vocal or instrumental track with audio they own or control. The browser decodes the selected file and produces a 48 kHz stereo PCM WAV aligned from 0:00 for the full song duration. Both browser and server reject a duration mismatch greater than 200 milliseconds, and the server independently validates the WAV format and ownership scope.

Replacement is non-destructive. Dozi creates a child song version, copies the other editable track mappings, and maps the uploaded asset into the selected track slot with `UPLOAD` / `UPLOADED` provenance and a lineage reference to the replaced asset. The source version and source assets are unchanged.

The child is deliberately stored without a primary master or compatibility master pointer. It is labeled as an editable draft, defaults to live-track audition, and only gains a finished master when the artist uses the existing mix renderer to create another child version.

## Consequences

Dozi cannot accidentally play or export the parent master as though it contained the new performance. Artists get an honest audition-and-approve step before rendering. Initial replacement requires a full-length, already aligned stem; region placement, automatic alignment, take lanes, and partial-track comping remain future work.
