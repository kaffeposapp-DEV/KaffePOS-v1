# KaffePOS Coolify Staging Deployment Guide

## 1. Purpose

This guide prepares KaffePOS for real staging deployment on Coolify or a VPS using the existing Dockerfiles and project scripts. It does not contain real secrets. Use it to deploy staging infrastructure, fill secrets through Coolify secure environment variables, and run smoke verification before production-candidate approval.

For click-by-click/manual execution, use `docs/engineering/COOLIFY_STAGING_MANUAL_EXECUTION.md`. For dashboard key copy/paste, use `docs/engineering/COOLIFY_COPY_PASTE_CHECKLIST.md`.

## 2. Required Services

- Frontend web service for React/Vite build.
- Backend/API service for Express backend.
- PostgreSQL staging database.
- Optional disposable PostgreSQL restore database for backup drill.
- Cloudflare/R2 staging bucket and asset domain.
- Midtrans sandbox dashboard config.
- Resend staging sender/domain.
- GA4 staging web stream and Microsoft Clarity staging project, or explicit disabled analytics.

## 3. Recommended Staging Domains

Use these if the real domain is available; otherwise replace with project-approved staging placeholders:

- Frontend: `https://staging.kaffepos.com`
- Backend/API: `https://staging-api.kaffepos.com`
- Assets: `https://assets-staging.kaffepos.com`

All domains must use HTTPS. Do not run payment webhooks or frontend API calls over plain HTTP.

## 4. PostgreSQL Staging Setup

1. In Coolify, create a PostgreSQL resource or connect an external managed PostgreSQL database.
2. Create a staging database, recommended `kaffepos_staging`.
3. Create a staging-only DB user scoped to the staging database.
4. Store `DATABASE_URL` only in the backend service environment.
5. Create a separate disposable restore DB, recommended `kaffepos_staging_restore_drill`.
6. Run migrations from the backend service shell or deployment job:

```bash
npm run migrate
```

Run this from the `backend` project context after backend dependencies are installed and `DATABASE_URL` points to staging.

## 5. Backend Service Setup

Coolify service options:

- Repository: KaffePOS repo.
- Branch: staging branch or release-candidate branch.
- Build pack: Dockerfile.
- Dockerfile path: `backend/Dockerfile`.
- Build context: `backend` if Coolify supports subdirectory context; otherwise configure Dockerfile path and context carefully.
- Exposed port: `8787`.
- Health endpoint: `GET /health`.

Backend commands from Dockerfile:

```bash
npm ci
npm run build
node dist/index.js
```

Backend runtime notes:

- Use `NODE_ENV=staging` for staging after backend schema supports it.
- Set `PORT=8787` unless Coolify injects a different internal port.
- Set `WEB_BASE_URL` to the frontend staging URL.
- Set `API_BASE_URL` to the backend staging URL.
- Set `CORS_ORIGIN` to the frontend staging URL.
- Keep all provider secrets backend-only.

## 6. Frontend Service Setup

Coolify service options:

- Repository: KaffePOS repo.
- Branch: staging branch or release-candidate branch.
- Build pack: Dockerfile.
- Dockerfile path: `frontend.Dockerfile`.
- Build context: repository root.
- Exposed port: `4173`.
- Health endpoint: `GET /`.

Frontend commands from Dockerfile:

```bash
npm ci
npm run build
serve -s dist -l 4173
```

Frontend runtime/build notes:

- `VITE_*` variables are embedded into the frontend build and browser-visible.
- Only public-safe values belong in frontend env.
- Set `VITE_API_BASE_URL` to staging API HTTPS URL.
- Set `VITE_PUBLIC_ASSET_BASE_URL` to staging public asset URL.
- Set `VITE_MIDTRANS_IS_PRODUCTION=false`.

## 7. Environment Variables

Use `docs/engineering/COOLIFY_ENV_MAPPING.md` as the source of truth for Coolify service env placement.

Rules:

- Backend secrets must never be placed in the frontend service.
- `DATABASE_URL`, Midtrans Server Key, Resend API Key, Cloudflare/R2 secret key, GA4 API secret, JWT/session/encryption secrets, passwords, and tokens are backend/local-smoke only.
- Staging must use Midtrans sandbox and staging PostgreSQL only.
- Do not use production credentials for staging.

## 8. Build Commands

Local quality commands before deploy:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm --prefix backend run check
```

Frontend Docker build command:

```bash
docker build -f frontend.Dockerfile .
```

Backend Docker build command:

```bash
docker build -f backend/Dockerfile backend
```

## 9. Start Commands

Frontend container command from `frontend.Dockerfile`:

```bash
serve -s dist -l 4173
```

Backend container command from `backend/Dockerfile`:

```bash
node dist/index.js
```

## 10. Health Check

Backend health endpoints:

- `GET https://staging-api.kaffepos.com/health`
- `GET https://staging-api.kaffepos.com/health/db`
- `GET https://staging-api.kaffepos.com/system-status`

Frontend health endpoint:

- `GET https://staging.kaffepos.com/`

Expected backend health behavior:

- API responds without stack trace.
- Database check is OK.
- Environment reports staging.
- CORS origin matches staging frontend.

## 11. CORS Setup

Set backend `CORS_ORIGIN` to the frontend staging URL:

```bash
CORS_ORIGIN=https://staging.kaffepos.com
```

If multiple staging origins are required, use the existing comma-separated origin pattern supported by backend CORS utilities. Do not use wildcard CORS for production-like staging.

## 12. Midtrans Webhook URL

Configure Midtrans sandbox webhook URL:

```text
https://staging-api.kaffepos.com/api/webhooks/midtrans
```

Rules:

- Use sandbox keys only.
- Put Client Key in frontend and backend only if needed by both.
- Put Server Key in backend only.
- Verify signature and duplicate webhook idempotency during smoke.

## 13. Resend Setup

1. Create or select staging-safe Resend API key.
2. Verify sender/domain or configure allowed staging sender.
3. Set backend `RESEND_API_KEY`.
4. Set backend `RESEND_FROM_EMAIL` as the canonical staging sender.
5. Set backend `EMAIL_REPLY_TO` if used by operational workflow.
6. Send test emails only to approved staging test recipient.

## 14. Cloudflare/R2 Setup

1. Create staging bucket, recommended `kaffepos-staging-assets`.
2. Create restricted staging R2 token for that bucket only.
3. Set backend R2 credentials only in backend service.
4. Set public asset URL in frontend public env.
5. Set backend `CLOUDFLARE_R2_PUBLIC_URL` as the canonical staging public asset URL.
6. Confirm private files are not public and public assets cache safely.

## 15. GA4/Clarity Setup

1. Create staging GA4 web stream or intentionally disable analytics.
2. Set frontend `VITE_GA4_MEASUREMENT_ID` only to staging stream ID.
3. Set backend `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` only if backend analytics is enabled.
4. Create Clarity staging project or intentionally disable Clarity.
5. Verify no PII is sent before enabling analytics.

## 16. Smoke User Setup

1. Create owner staging account.
2. Create cashier staging account.
3. Assign cashier to staging outlet.
4. Create sample outlet, product/menu item, and stock sample.
5. Verify owner and cashier can log in manually.
6. Store smoke credentials only in ignored local env files or secure CI secrets.

## 17. Backup/Restore Setup

1. Configure staging database backup command.
2. Store backup in approved secure storage.
3. Restore backup into disposable restore DB.
4. Verify restored DB is readable.
5. Never restore over active staging or production DB.

## 18. Verification Commands

Local quality:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm --prefix backend run check
```

Env verify:

```bash
npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local
```

React Doctor:

```bash
npx -y react-doctor@latest --verbose --full
npx -y react-doctor@0.2.3 --verbose --diff
```

Smoke:

```bash
npm run smoke:staging:cashier
npm run smoke:staging:offline-sync
KAFFEPOS_STOCK_SMOKE_CONFIRM=1 npm run smoke:staging:stock
```

## 19. Rollback Notes

- Keep previous frontend image/build available.
- Keep previous backend image/build available.
- Roll back app services before touching database restore.
- Do not run destructive migrations without backup.
- Use feature flags to disable risky staging paths before production promotion.
- Restore only into disposable DB unless explicit incident approval exists.
