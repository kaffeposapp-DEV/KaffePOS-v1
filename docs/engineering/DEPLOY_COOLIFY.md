# Deploying KaffePOS on Coolify

Two services deploy from this repo:

| Service | Source | Runtime | Public URL |
| --- | --- | --- | --- |
| **backend** | `backend/` (`backend/Dockerfile`) | Node 22 / Express | `https://api.kaffepos.my.id` |
| **frontend** | repo root (`frontend.Dockerfile` / Nixpacks) | static Vite build | `https://kaffepos.my.id` |

## Environment

Templates (committed, no secrets): copy and fill in Coolify's env UI.

- Backend → [`coolify.backend.minimal.env.example`](../../coolify.backend.minimal.env.example)
- Frontend → [`coolify.frontend.minimal.env.example`](../../coolify.frontend.minimal.env.example)

The backend's full env contract (defaults + validation) is the single source of
truth in [`backend/src/core/env.ts`](../../backend/src/core/env.ts). Anything not
listed there is ignored — the schema strips unknown keys.

### The wiring contract (must stay in sync)

| Frontend | must equal | Backend |
| --- | --- | --- |
| `VITE_API_BASE_URL` | == | `API_BASE_URL` == `https://api.kaffepos.my.id` |
| origin `https://kaffepos.my.id` | ∈ | `CORS_ORIGIN` (comma-separated allowlist) |
| — | == | `WEB_BASE_URL` (used in emails / redirects) |

`VITE_API_BASE_URL` is also hard-asserted for production builds against
`PRODUCTION_API_ORIGIN` in [`src/lib/releaseConfig.ts`](../../src/lib/releaseConfig.ts);
a mismatch fails `npm run release:verify-config`.

### Secrets

Only two leaked values are live and need rotation — see
[`SECURITY.md`](../../SECURITY.md). `JWT_SECRET` / `SESSION_SECRET` /
`ENCRYPTION_KEY` are **not read by any code** and should simply be omitted.
`PII_ENCRYPTION_KEY` is optional but read the DB-password coupling note before
rotating DB creds.

## Deploy

- **Backend start command:** `npm run start:coolify`
  (runs `scripts/run-migrations.mjs`, then `node dist/index.js`).
- **Health check:** `GET /health` (the Dockerfile `HEALTHCHECK` already wires this).
- **Frontend:** `npm run build:web` → serve `dist/` (Nixpacks `NIXPACKS_NODE_VERSION=22`).

## Verify after deploy

```bash
curl -fsS https://api.kaffepos.my.id/health         # backend up + DB reachable
npm run release:verify-config                        # FE/BE config wiring
npm run smoke:staging:cashier                        # end-to-end owner→cashier flow
```
