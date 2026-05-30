# KaffePOS Coolify Staging Manual Execution Guide

## 1. Preconditions

- Git repository is reachable from Coolify.
- Staging or release-candidate branch is selected and up to date.
- Coolify dashboard is accessible.
- Domain/DNS provider access is available.
- Staging provider accounts are ready: PostgreSQL, Midtrans sandbox, Resend, Cloudflare/R2, GA4, and Microsoft Clarity.
- No production secrets, production database URLs, production Midtrans keys, production Resend keys, or production R2 tokens are used.
- `.env.staging.local` and `backend/.env.staging.local` remain local, ignored, and uncommitted.

## 2. Recommended Service Names

- `kaffepos-staging-frontend`
- `kaffepos-staging-backend`
- `kaffepos-staging-postgres`
- `kaffepos-staging-restore-db`

## 3. Recommended Domains

Use placeholders until real DNS is known:

- Frontend: `https://staging.YOUR_DOMAIN`
- API: `https://staging-api.YOUR_DOMAIN`
- Assets: `https://assets-staging.YOUR_DOMAIN`

## 4. Step 1 — Create PostgreSQL Staging

1. In Coolify, create a PostgreSQL resource named `kaffepos-staging-postgres`.
2. Create database name `kaffepos_staging`.
3. Create a dedicated staging app user.
4. Restrict user access to staging database only.
5. Copy `DATABASE_URL` into backend service env only.
6. Create disposable restore database named `kaffepos_staging_restore_drill` or equivalent.
7. Store restore DB URL only in secure secret storage, not docs.
8. Confirm staging does not point to production DB.

## 5. Step 2 — Create Backend Service

1. In Coolify, create service `kaffepos-staging-backend`.
2. Connect Git repository.
3. Select staging or release-candidate branch.
4. Choose Dockerfile build.
5. Set Dockerfile path to `backend/Dockerfile`.
6. Set build context to `backend` if Coolify supports subdirectory context.
7. Expose port `8787`.
8. Configure health check path `/health`.
9. After database is ready, also verify `/health/db`.
10. Build/start behavior comes from `backend/Dockerfile`: `npm ci`, `npm run build`, `node dist/index.js`.
11. Fill backend env values from `docs/engineering/ENV_CONTRACT.md` and `docs/engineering/COOLIFY_ENV_MAPPING.md`.

## 6. Step 3 — Backend Env Values

| Key | Source | Example Format | Required | Secret? |
|---|---|---|---|---|
| `NODE_ENV` | Release config | `staging` | Yes | No |
| `WEB_BASE_URL` | Frontend staging domain | `https://staging.YOUR_DOMAIN` | Yes | No |
| `API_BASE_URL` | API staging domain | `https://staging-api.YOUR_DOMAIN` | Yes | No |
| `DATABASE_URL` | Coolify PostgreSQL / DB provider | `postgresql://...` | Yes | Yes |
| `JWT_SECRET` | Secret manager | strong random value | Yes | Yes |
| `SESSION_SECRET` | Secret manager | strong random value | Yes | Yes |
| `ENCRYPTION_KEY` | Secret manager | strong random value | Yes | Yes |
| `MIDTRANS_IS_PRODUCTION` | Midtrans sandbox setting | `false` | Yes | No |
| `MIDTRANS_SERVER_KEY` | Midtrans sandbox dashboard | `SB-Mid-server-...` | Yes | Yes |
| `MIDTRANS_CLIENT_KEY` | Midtrans sandbox dashboard | `SB-Mid-client-...` | Yes | No |
| `RESEND_API_KEY` | Resend dashboard | `re_...` | Yes | Yes |
| `RESEND_FROM_EMAIL` | Resend verified sender | `KaffePOS Staging <noreply@YOUR_DOMAIN>` | Yes | No |
| `EMAIL_REPLY_TO` | Support/test mailbox | `support@YOUR_DOMAIN` | Yes | No |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard | account identifier | Yes | No |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Cloudflare R2 token | access key id | Yes | Yes |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Cloudflare R2 token | secret access key | Yes | Yes |
| `CLOUDFLARE_R2_BUCKET` | Cloudflare R2 bucket | `kaffepos-staging-assets` | Yes | No |
| `CLOUDFLARE_R2_PUBLIC_URL` | Cloudflare/CDN | `https://assets-staging.YOUR_DOMAIN` | Yes | No |
| `GA4_MEASUREMENT_ID` | GA4 staging stream | `G-XXXXXXXXXX` | Yes | No |
| `GA4_API_SECRET` | GA4 Measurement Protocol | secret value | Yes | Yes |
| `AFFILIATE_REFERRAL_ENABLED` | Feature flag decision | `false` | Yes | No |
| `REFERRAL_ENABLED` | Feature flag decision | `false` | Yes | No |
| `AFFILIATE_ENABLED` | Feature flag decision | `false` | Yes | No |
| `ADMIN_COMMISSION_ENABLED` | Feature flag decision | `false` | Yes | No |
| `REFERRAL_COMMISSION_CREATION_ENABLED` | Feature flag decision | `false` | Yes | No |

Do not add deprecated aliases: `APP_BASE_URL`, `EMAIL_FROM`, or `CLOUDFLARE_R2_PUBLIC_BASE_URL`.

## 7. Step 4 — Run Backend Migration

1. Open backend service shell or one-off command runner in Coolify.
2. Confirm `DATABASE_URL` points to staging DB.
3. From backend context, run:

```bash
npm run migrate
```

4. Confirm migration success in logs.
5. Do not run migrations against production DB.
6. If migration fails, stop deployment and inspect DB permissions, migration logs, and staging `DATABASE_URL` placement.

## 8. Step 5 — Create Frontend Service

1. In Coolify, create service `kaffepos-staging-frontend`.
2. Connect Git repository.
3. Select same staging or release-candidate branch.
4. Choose Dockerfile build.
5. Set Dockerfile path to `frontend.Dockerfile`.
6. Set build context to repository root.
7. Expose port `4173`.
8. Build/start behavior comes from `frontend.Dockerfile`: `npm ci`, `npm run build`, `serve -s dist -l 4173`.
9. Set frontend env values before build because `VITE_*` values are embedded into build output.

## 9. Step 6 — Frontend Env Values

| Key | Source | Example Format | Required | Public? |
|---|---|---|---|---|
| `VITE_APP_ENV` | Release config | `staging` | Yes | Yes |
| `VITE_API_BASE_URL` | API staging domain | `https://staging-api.YOUR_DOMAIN` | Yes | Yes |
| `VITE_ANALYTICS_ENABLED` | Release decision | `false` | Yes | Yes |
| `VITE_GA4_MEASUREMENT_ID` | GA4 staging stream | `G-XXXXXXXXXX` | Yes | Yes |
| `VITE_CLARITY_PROJECT_ID` | Clarity staging project | project identifier | Yes | Yes |
| `VITE_PUBLIC_ASSET_BASE_URL` | Cloudflare/CDN | `https://assets-staging.YOUR_DOMAIN` | Yes | Yes |
| `VITE_MIDTRANS_IS_PRODUCTION` | Midtrans sandbox setting | `false` | Yes | Yes |
| `VITE_MIDTRANS_CLIENT_KEY` | Midtrans sandbox dashboard | `SB-Mid-client-...` | Yes | Yes |
| `VITE_AFFILIATE_REFERRAL_ENABLED` | Feature flag decision | `false` | Yes | Yes |
| `VITE_REFERRAL_ENABLED` | Feature flag decision | `false` | Yes | Yes |
| `VITE_AFFILIATE_ENABLED` | Feature flag decision | `false` | Yes | Yes |
| `VITE_ADMIN_COMMISSION_ENABLED` | Feature flag decision | `false` | Yes | Yes |

Never put backend secrets in frontend env.

## 10. Step 7 — Attach Domains + HTTPS

1. Attach frontend domain `https://staging.YOUR_DOMAIN` to frontend service.
2. Attach API domain `https://staging-api.YOUR_DOMAIN` to backend service.
3. Attach asset domain `https://assets-staging.YOUR_DOMAIN` to Cloudflare/R2/CDN.
4. Verify HTTPS certificates are active.
5. Verify frontend loads over HTTPS.
6. Verify frontend calls API over HTTPS.
7. Confirm no browser mixed-content warnings.

## 11. Step 8 — Configure CORS

1. Set backend `CORS_ORIGIN` to `https://staging.YOUR_DOMAIN` if required by deployment config.
2. If multiple origins are needed, use documented comma-separated values.
3. Do not use wildcard CORS in staging/production unless intentionally documented and security-reviewed.
4. Verify browser requests from frontend staging domain reach API without CORS failure.

## 12. Step 9 — Configure Midtrans Sandbox

1. Use sandbox keys only.
2. Set backend `MIDTRANS_SERVER_KEY` backend-only.
3. Set `MIDTRANS_CLIENT_KEY` and `VITE_MIDTRANS_CLIENT_KEY` to sandbox Client Key.
4. Set `MIDTRANS_IS_PRODUCTION=false` and `VITE_MIDTRANS_IS_PRODUCTION=false`.
5. Configure webhook URL:

```text
https://staging-api.YOUR_DOMAIN/api/webhooks/midtrans
```

6. Verify webhook signature verification works.
7. Verify duplicate webhook idempotency does not double-process payment.
8. Do not use production payment credentials.

## 13. Step 10 — Configure Resend

1. Use staging-safe Resend key only.
2. Verify sender/domain in Resend.
3. Set backend `RESEND_FROM_EMAIL`.
4. Set backend `EMAIL_REPLY_TO`.
5. Use test recipient only.
6. Do not email real customers during smoke.

## 14. Step 11 — Configure Cloudflare/R2

1. Create staging bucket, recommended `kaffepos-staging-assets`.
2. Create restricted token scoped to staging bucket.
3. Set R2 credentials backend-only.
4. Configure public asset URL `https://assets-staging.YOUR_DOMAIN`.
5. Set backend `CLOUDFLARE_R2_PUBLIC_URL`.
6. Set frontend `VITE_PUBLIC_ASSET_BASE_URL`.
7. Confirm private files are not public.
8. Confirm public assets cache safely.

## 15. Step 12 — Configure GA4/Clarity

1. Create staging GA4 property/web stream or disable analytics.
2. Create GA4 API secret only if backend analytics is enabled.
3. Create Microsoft Clarity staging project or disable Clarity.
4. Set `VITE_ANALYTICS_ENABLED=false` until no-PII tracking review passes.
5. Verify no email, phone, name, token, password, bank, payout, or account number is tracked.

## 16. Step 13 — Create Smoke Users/Data

1. Create owner staging user.
2. Create cashier staging user.
3. Create test email recipient mailbox.
4. Create sample outlet.
5. Create sample products/menu items.
6. Create sample stock record for stock smoke.
7. Assign cashier to outlet with correct permissions.
8. Manually verify owner login.
9. Manually verify cashier login.

## 17. Step 14 — Fill Local `.env.staging.local`

Fill local smoke keys only from secure source:

- `KAFFEPOS_STAGING_API_URL`
- `KAFFEPOS_STAGING_FRONTEND_URL`
- `KAFFEPOS_OWNER_EMAIL`
- `KAFFEPOS_OWNER_PASSWORD`
- `KAFFEPOS_TEST_CASHIER_EMAIL`
- `KAFFEPOS_TEST_CASHIER_PASSWORD`
- `KAFFEPOS_TEST_EMAIL_TO`
- `KAFFEPOS_STOCK_SMOKE_CONFIRM=1`

Do not commit `.env.staging.local`. Do not print values.

## 18. Step 15 — Verify Env Locally

Run:

```bash
npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local
```

Expected:

- missing `0`
- placeholders `0`
- forbidden `VITE_*` secrets `0`
- invalid `0`

If any count is non-zero, do not run smoke tests.

## 19. Step 16 — Verify Health

Verify:

- Frontend URL loads: `https://staging.YOUR_DOMAIN`
- Backend health works: `https://staging-api.YOUR_DOMAIN/health`
- Database health works: `https://staging-api.YOUR_DOMAIN/health/db`
- No CORS issue from frontend to API.
- No mixed content issue.
- Static assets load from staging asset domain.

## 20. Step 17 — Run Smoke

Run only after env verifier is clean and health checks pass:

```bash
npm run smoke:staging:cashier
npm run smoke:staging:offline-sync
KAFFEPOS_STOCK_SMOKE_CONFIRM=1 npm run smoke:staging:stock
```

## 21. Step 18 — Production Candidate Criteria

Minimal staging can validate frontend load, backend health, database health, auth/login, POS basic flow, stock smoke, and offline sync smoke. It skips Midtrans, Resend, Cloudflare/R2, GA4, and Clarity. Minimal staging status is `READY_FOR_MINIMAL_STAGING`, not production-candidate ready.

Go only when all pass:

- Env verifier clean.
- Local quality gate clean.
- Frontend staging loads.
- Backend `/health` passes.
- Backend `/health/db` passes.
- Cashier smoke passes.
- Offline sync smoke passes.
- Stock smoke passes.
- Midtrans sandbox payment/webhook/idempotency verified.
- Resend test email verified.
- Cloudflare/R2 public/private behavior verified.
- GA4/Clarity no-PII verified or intentionally disabled.
- Docker build verified on Docker-capable runner.
- GitHub Actions runner passes.
- Backup/restore drill passes on disposable DB.

## 22. Troubleshooting

### Backend fails env validation

- Confirm canonical names from `docs/engineering/ENV_CONTRACT.md`.
- Use `WEB_BASE_URL`, `RESEND_FROM_EMAIL`, and `CLOUDFLARE_R2_PUBLIC_URL`.
- Do not use deprecated aliases.
- Confirm `NODE_ENV=staging`.

### Frontend cannot call API

- Confirm `VITE_API_BASE_URL` uses HTTPS API domain.
- Confirm frontend was rebuilt after changing `VITE_*` env.
- Confirm backend CORS allows frontend staging URL.

### DB connection fails

- Confirm `DATABASE_URL` exists only in backend service.
- Confirm DB user has staging DB permissions.
- Confirm network/firewall allows backend to reach DB.
- Confirm DB is not production.

### Migration fails

- Confirm command ran from backend context.
- Confirm `DATABASE_URL` points to staging DB.
- Confirm migration user can create/alter required tables.
- Stop if migration target is production.

### Midtrans webhook not received

- Confirm webhook URL uses HTTPS.
- Confirm URL is `https://staging-api.YOUR_DOMAIN/api/webhooks/midtrans`.
- Confirm Midtrans dashboard uses sandbox mode.
- Confirm backend logs show webhook receipt without exposing secrets.

### Resend fails

- Confirm `RESEND_API_KEY` exists backend-only.
- Confirm `RESEND_FROM_EMAIL` is verified or allowed.
- Confirm test recipient is approved.
- Confirm failure does not break payment success path.

### R2 asset fails

- Confirm bucket exists.
- Confirm restricted R2 token has required bucket permissions.
- Confirm `CLOUDFLARE_R2_PUBLIC_URL` and `VITE_PUBLIC_ASSET_BASE_URL` use HTTPS asset domain.
- Confirm private files are not public.

### CORS error

- Confirm `CORS_ORIGIN` contains exact staging frontend origin.
- Confirm no trailing path is included in origin.
- Confirm browser request origin matches configured value.

### Mixed content

- Confirm frontend, API, and assets all use HTTPS.
- Rebuild frontend if old HTTP URL was embedded.

### Smoke login fails

- Confirm owner/cashier users exist in staging.
- Confirm passwords came from secure source and were not copied with whitespace.
- Confirm cashier is assigned to outlet.
- Confirm account status and role permissions are active.
