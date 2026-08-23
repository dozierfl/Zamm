# Dozi Music Studio

An original generative-music creator workspace. The vertical MVP includes beginner and advanced creation modes, a deterministic composition planner, simulated asynchronous generation, version metadata, waveform seeking, global playback, and a searchable library.

## Run and verify

```bash
npm ci
npm run dev
npm run lint
npm test
```

The mock engine needs no model download or credentials. It produces a quiet deterministic Web Audio preview so the complete interaction can be exercised safely.

The UI deals only in normalized song and generation data. A server provider layer can replace the mock without changing the creator workflow. ACE-Step must be integrated against an installed release's documented API and capability discovery; no endpoint is assumed.
