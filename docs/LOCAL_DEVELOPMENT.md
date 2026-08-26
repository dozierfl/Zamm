# Local development

```bash
npm ci
npm run db:generate
WRANGLER_LOG_PATH=.wrangler/migrate.log npx wrangler d1 migrations apply site-creator-d1 --local
npm run dev
```

Open `http://localhost:3000`, create a Dozi account, and generate a song. Local D1 and R2 state lives under `.wrangler` and is ignored by source control.
# Local architecture services

1. Create an ignored `.dev.vars` file for Worker bindings. At minimum, set `DATABASE_URL=postgres://dozi:dozi_local_only@127.0.0.1:5432/dozi` for the included Docker service. Use `.env.local` only for Node-side migration commands.
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

## MiniMax Music 3 MLX terminals

MiniMax uses a dedicated process so its large model and MLX dependencies do not share the ACE-Step/FastAPI gateway process.

1. In the working MiniMax MLX environment, install the small HTTP-service dependencies once: `/Users/F.D/Projects/MiniMax-Music3-MLX/.venv/bin/pip install -r /Users/F.D/Projects/Zamm/minimax-service/requirements.txt`.
2. Start the native service: `MINIMAX_MODEL_PATH=/Users/F.D/Projects/MiniMax-Music3-MLX/model /Users/F.D/Projects/MiniMax-Music3-MLX/.venv/bin/uvicorn server:app --app-dir /Users/F.D/Projects/Zamm/minimax-service --host 127.0.0.1 --port 8002`.
3. Start the Dozi AI gateway with `MINIMAX_BASE_URL=http://127.0.0.1:8002`.
4. Start Dozi with `MUSIC_PROVIDER=minimax`, `AI_SERVICE_BASE_URL=http://127.0.0.1:8000`, and the same optional `AI_SERVICE_TOKEN` used by the gateway.

Wait for `http://127.0.0.1:8002/health` to report `modelLoaded: true` before generating. The service accepts one generation at a time and returns HTTP 429 while busy. Stop the service with Control-C when local generation is complete.

## One-click Mac startup

On the configured Apple Silicon workstation, open `scripts/start-dozi-studio.command` with Terminal. The launcher starts and waits for Docker Desktop, PostgreSQL, ACE-Step Turbo, the FastAPI gateway, and the Dozi web app in dependency order, then opens `http://localhost:3000`. Logs are written under the project-scoped `.tools/logs` directory. Keep the Terminal open; Control-C stops only the ACE-Step, gateway, and Dozi processes started by that launcher. Docker Desktop and PostgreSQL remain running.
