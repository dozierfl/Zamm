# ADR 0005: Derived-stem workspace and non-destructive mix rendering

## Status

Accepted for development use. This narrows ADR 0003: Dozi may expose a mixer foundation when every separated asset is explicitly labeled as a derived editing aid rather than a native or pristine studio track.

## Decision

Master-only song versions can request asynchronous six-stem BS-RoFormer separation through the private AI gateway. Results are stored as `DERIVED_STEM` / `SEPARATED` assets with `SEPARATION` lineage back to the source master. The UI must disclose that exposed stems can contain leakage and artifacts.

Mixer gain, pan, mute, and solo state is stored on the version-asset mapping. A rendered mix never replaces its source. It creates a child song version with a new primary master and reuses the source stem assets with the chosen mixer settings. Individual stems and completed masters remain owner-scoped through the authenticated audio route.

## Consequences

The workspace is useful now for in-context editing and experimentation without overstating separation quality. A future native multitrack provider can populate the same normalized model with `NATIVE_TRACK` assets. Production-quality stem claims still require representative clean-reference benchmarks, licensing review, and human listening acceptance.
