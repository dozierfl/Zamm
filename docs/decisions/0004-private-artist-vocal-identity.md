# ADR 0004: Private artist vocal identity and style adapters

## Decision

Dozi will model an artist vocalist as a private, consent-verified profile with immutable trained versions and explicit source provenance. A selectable vocalist must condition a singing-performance generator; speech cloning alone and unverified post-hoc voice conversion do not satisfy the product contract.

Artist source recordings, live verification, model training, model versions, and song-generation lineage are separate normalized records. New songs may reference both the selected profile and the exact trained version. Profiles are private, non-transferable, and revocable by default.

## Rationale

The product experience should remain as simple as selecting a vocalist, while the persistence layer must distinguish identity, singing style, consent, training inputs, model artifacts, and generated-song lineage. Immutable model versions make results explainable and prevent later retraining from changing the provenance of existing songs.

The architecture deliberately separates intended artist expression from accidental pitch weakness. The performance planner follows explicit song instructions and harmonic constraints while using the artist adapter for recognizable phrasing and technique.

## Consequences

Dozi can investigate multiple singing providers without changing ownership or lineage. A provider must advertise custom singing-voice conditioning before it receives a profile version. Enrollment and schema work may proceed before selecting the synthesis model, but the UI must not claim that a profile is active until verification, quality gates, training, and acceptance tests pass.
