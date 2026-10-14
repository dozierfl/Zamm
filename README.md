# Dozi Music Studio

## License

Dozi Music Studio is licensed under the [GNU Affero General Public License version 3](LICENSE), identified by the SPDX expression `AGPL-3.0-only`.

If you modify Dozi and let users interact with the modified software over a network, those users must be offered the corresponding source code as required by section 13 of the license. This repository's license does not change the ownership or licensing of user-provided songs, lyrics, recordings, voice data, or generated audio. Third-party models, checkpoints, datasets, services, and bundled components remain subject to their own licenses and terms.

Dozi supports an optional official ACE-Step 1.5 provider through its FastAPI AI gateway. Mock generation remains the default. See [ACE-Step capabilities](docs/ACESTEP_CAPABILITIES.md) and [local development](docs/LOCAL_DEVELOPMENT.md) for the verified service architecture and startup sequence.

The current product path is master-based. Contextual tracks and source separation remain bounded R&D capabilities; they are not advertised as pristine stems or a dependable multitrack foundation. See [ADR 0003](docs/decisions/0003-contextual-tracks-and-separation-product-boundary.md).

An original, server-backed generative-music creator workspace. The vertical MVP includes app-owned accounts, beginner and advanced creation modes, a deterministic composition planner, durable jobs, immutable version records, generated WAV masters, private range-capable playback, and a searchable library.

## Run and verify

```bash
npm ci
npm run dev
npm run lint
npm test
```

The mock engine needs no model download or credentials. It produces a deterministic PCM WAV master so the complete interaction can be exercised safely. PostgreSQL stores relational metadata and R2 stores audio bytes.

The UI deals only in normalized song and generation data. A server provider layer can replace the mock without changing the creator workflow. The ACE-Step adapter intentionally reports unavailable until a documented service URL and model are configured; no endpoint is fabricated.
