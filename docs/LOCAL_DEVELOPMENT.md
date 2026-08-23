# Local development

```bash
npm ci
npm run db:generate
WRANGLER_LOG_PATH=.wrangler/migrate.log npx wrangler d1 migrations apply site-creator-d1 --local
npm run dev
```

Open `http://localhost:3000`, create a Dozi account, and generate a song. Local D1 and R2 state lives under `.wrangler` and is ignored by source control.
