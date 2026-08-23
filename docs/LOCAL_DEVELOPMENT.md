# Local development

```bash
npm ci
npm run db:generate
WRANGLER_LOG_PATH=.wrangler/migrate.log npx wrangler d1 migrations apply site-creator-d1 --local
npm run dev
```

Open `http://localhost:3000`, create a Dozi account, and generate a song. Local D1 and R2 state lives under `.wrangler` and is ignored by source control.
# Local architecture services

1. Copy `.env.example` to `.env.local`.
2. Run `docker compose up -d postgres`.
3. Run `npm run db:migrate`.
4. Start FastAPI using the command in `PROVIDER_INTEGRATION.md` when testing `MUSIC_PROVIDER=ai-service`.
5. Run `npm run dev`.

Local/test queue execution is independent of status polling. Cloudflare environments use the bound `GENERATION_QUEUE`.

## ACE-Step terminals

1. PostgreSQL: `docker compose up -d postgres && npm run db:migrate`.
2. Official ACE-Step clone: set `ACESTEP_LM_BACKEND=mlx`, `ACESTEP_INIT_LLM=false`, then run `uv run acestep-api --host 127.0.0.1 --port 8001`. Use a single server worker. First startup downloads official checkpoints.
3. Gateway: `cd ai-service && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000`.
4. Dozi: set `MUSIC_PROVIDER=acestep` and run `npm run dev`.

Mock remains the default and requires no ACE-Step installation.
