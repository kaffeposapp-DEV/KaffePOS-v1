# KaffePOS Staging Infrastructure Provisioning Guide

## 1. Purpose

This guide defines how to create real KaffePOS staging infrastructure before promoting any production candidate. It is for provisioning infrastructure, collecting real staging values from secure sources, and preparing safe verification. Do not write real secrets in this guide, chat, pull requests, screenshots, tickets, or commit history.

## 2. Required Staging Components

- Staging frontend URL.
- Staging backend/API URL.
- Staging PostgreSQL database.
- Staging asset/CDN URL.
- Midtrans sandbox account/config.
- Resend staging sender/domain.
- Cloudflare/R2 staging bucket.
- GA4 property/web stream.
- Microsoft Clarity project.
- Smoke test owner user.
- Smoke test cashier user.
- Test email recipient.
- Disposable restore database for backup drill.

## 3. Recommended Naming

- Frontend: `staging.kaffepos.com` or `staging.yourdomain.com`.
- API: `staging-api.kaffepos.com` or `api-staging.yourdomain.com`.
- Assets: `assets-staging.kaffepos.com` or `assets-staging.yourdomain.com`.
- Database: `kaffepos_staging`.
- R2 bucket: `kaffepos-staging-assets`.
- Restore drill database: `kaffepos_staging_restore_drill`.
- Smoke owner: dedicated staging owner account, not production/customer user.
- Smoke cashier: dedicated staging cashier account, not production/customer user.

## 4. Staging Server Setup

Supported deployment options:

- Coolify: use separate frontend and backend services, separate staging environment variables, and no auto-deploy to production.
- VPS Docker Compose: use separate staging compose project, separate network, runtime-injected env, and persistent PostgreSQL volume only for staging.
- Managed hosting: use separate staging project/environment, separate database, separate secrets, and staging-only domains.

For Coolify/VPS-specific setup, use `docs/engineering/COOLIFY_STAGING_DEPLOYMENT_GUIDE.md`, `docs/engineering/COOLIFY_ENV_MAPPING.md`, and `docs/engineering/COOLIFY_STAGING_DEPLOYMENT_CHECKLIST.md`.

Required runtime:

- Node.js: use project-supported LTS version from deployment image/runtime.
- npm: use lockfile-driven install with `npm ci` in CI/build runners.
- PostgreSQL: use supported PostgreSQL version from production target or managed provider.
- Frontend build command: `npm run build`.
- Backend check/build command: `npm --prefix backend run check`.
- Backend start command: use existing backend production start command for deployed artifact.
- Health check endpoint: use `GET /health`; use `GET /health/db` for database readiness.

Server rules:

- Keep staging separate from production at DNS, database, secrets, and storage levels.
- Inject env values at runtime; do not bake secrets into images.
- Use HTTPS for frontend, API, assets, and webhook endpoints.
- Keep logs safe: no passwords, tokens, API keys, database URLs, raw payment payload secrets, or bank/payout data.

## 5. Staging Database Setup

Provisioning steps:

1. Create a dedicated PostgreSQL database named `kaffepos_staging`.
2. Create a dedicated app DB user for staging only.
3. Restrict app DB user permissions to the staging DB/schema only.
4. Create a disposable restore DB such as `kaffepos_staging_restore_drill`.
5. Store `DATABASE_URL` and restore DB URL in approved secret storage only.
6. Run project migrations against staging DB.
7. Seed smoke users only if the project has an approved seed path.
8. Never point staging at production DB.

Database safety rules:

- Do not restore over active staging DB.
- Do not reuse production app user credentials.
- Do not copy production PII into staging unless approved and anonymized.
- Keep financial/payment records staged with test data only.

## 6. Staging Domain/DNS Setup

Required DNS records:

- Frontend DNS record points to frontend staging deployment.
- API DNS record points to backend/API staging deployment.
- Asset DNS record points to Cloudflare/R2 public asset domain or CDN route.

Required network behavior:

- HTTPS enabled for all public staging URLs.
- CORS allowlist includes only staging frontend URL and approved local development origins if needed.
- Midtrans webhook URL must be HTTPS and public.
- No mixed content: frontend HTTPS must call API/assets over HTTPS only.
- Production CORS origins must not be loosened to cover staging by wildcard.

## 7. Midtrans Sandbox Setup

Steps:

1. Use Midtrans sandbox environment only.
2. Collect sandbox Server Key from Midtrans dashboard into secure storage.
3. Collect sandbox Client Key from Midtrans dashboard into secure storage.
4. Put Client Key in both frontend public env and backend env where required.
5. Put Server Key only in backend env.
6. Configure webhook URL as `https://STAGING_API_URL/api/webhooks/midtrans`.
7. Confirm webhook URL uses HTTPS and reaches staging backend.
8. Verify signature verification remains enabled.
9. Test successful, failed, and duplicate sandbox webhook behavior.

Rules:

- Do not use production Midtrans keys in staging.
- Do not trust frontend payment callback as source of truth.
- Do not log raw Server Key or full sensitive webhook payload.

## 8. Resend Setup

Steps:

1. Create or select staging-safe Resend API key.
2. Verify staging sender/domain if real delivery is needed.
3. Set `RESEND_FROM_EMAIL` to verified staging sender.
4. Set `EMAIL_REPLY_TO` to staging support/test mailbox.
5. Use test recipient only for smoke validation.
6. Verify email failures do not break payment success path.

Rules:

- Do not email real customers during smoke tests.
- Do not put Resend API key in frontend env.
- Do not log full email payloads with PII.

## 9. Cloudflare/R2 Setup

Steps:

1. Create staging R2 bucket, recommended `kaffepos-staging-assets`.
2. Create restricted R2 token for staging bucket only.
3. Store account ID, access key ID, and secret access key in secure storage.
4. Configure public asset domain such as `assets-staging.kaffepos.com`.
5. Confirm private files are not publicly listable or fetchable.
6. Configure static asset caching for public hashed assets.
7. Ensure HTML entry documents are not cached incorrectly.

Rules:

- Do not expose private invoices, payout data, or customer files publicly.
- Do not use production R2 bucket for staging.
- Do not put R2 credentials in frontend env.

## 10. GA4 / Clarity Setup

Steps:

1. Create staging GA4 property or staging web stream.
2. Collect GA4 Measurement ID.
3. Create GA4 API secret only if backend/server-side analytics is enabled.
4. Create Microsoft Clarity staging project.
5. Keep analytics disabled if staging analytics destination is not ready.
6. Verify no PII is sent before enabling staging analytics.

No-PII rules:

- Do not send email, phone, address, notes, password, token, payout, bank, account number, or raw customer identifiers.
- Use environment flags to disable analytics until verified.
- Use staging-only analytics destinations.

## 11. Smoke Test User Setup

Steps:

1. Create owner staging account.
2. Create cashier staging account.
3. Assign cashier to staging outlet with correct permissions.
4. Create sample outlet if missing.
5. Create sample product/menu item for cashier flow.
6. Create stock sample if stock smoke requires it.
7. Confirm owner login manually before smoke script.
8. Confirm cashier login manually before smoke script.
9. Store smoke credentials in local ignored env files or secure CI secret store only.

Rules:

- Use staging-only smoke accounts.
- Do not use production, customer, employee, or personal accounts.
- Rotate credentials after accidental exposure.

## 12. Backup/Restore Drill Setup

Steps:

1. Create disposable restore DB separate from active staging DB.
2. Run staging DB backup using documented backup command.
3. Restore backup into disposable restore DB.
4. Verify restored DB is readable.
5. Point an isolated app/session to restored DB only if safe.
6. Run health/auth/read-only checks against restored target.
7. Destroy or lock down disposable restore DB after drill.

Rules:

- Never restore over active staging DB.
- Never restore over production DB.
- Do not include production PII unless approved and anonymized.

## 13. Env Mapping

| Key | Source | File | Public/Private | Notes |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | Staging backend deploy | `.env.staging.local` | Public | HTTPS API base URL visible to browser. |
| `VITE_PUBLIC_ASSET_BASE_URL` | Cloudflare/CDN public asset domain | `.env.staging.local` | Public | Public asset URL only. |
| `WEB_BASE_URL` | Staging frontend deploy | `backend/.env.staging.local` | Backend config, non-secret | Used by backend links/callbacks. |
| `API_BASE_URL` | Staging backend deploy | `backend/.env.staging.local` | Backend config, non-secret | Public API URL for backend config. |
| `KAFFEPOS_STAGING_API_URL` | Staging backend deploy | `.env.staging.local` | Smoke config, non-secret | Used by smoke scripts. |
| `KAFFEPOS_STAGING_FRONTEND_URL` | Staging frontend deploy | `.env.staging.local` | Smoke config, non-secret | Used by smoke/manual checks. |
| `DATABASE_URL` | Staging PostgreSQL provider | `backend/.env.staging.local` | Backend secret | Staging DB only; never production. |
| `VITE_MIDTRANS_CLIENT_KEY` | Midtrans sandbox dashboard | `.env.staging.local` | Public sandbox key | Browser-visible client key. |
| `MIDTRANS_CLIENT_KEY` | Midtrans sandbox dashboard | `backend/.env.staging.local` | Backend config, public-equivalent | Match sandbox client key. |
| `MIDTRANS_SERVER_KEY` | Midtrans sandbox dashboard | `backend/.env.staging.local` | Backend secret | Server key backend-only. |
| `RESEND_API_KEY` | Resend dashboard/secret manager | `backend/.env.staging.local` | Backend secret | Staging API key only. |
| `RESEND_FROM_EMAIL` | Resend verified sender/domain | `backend/.env.staging.local` | Backend config | Verified staging sender. |
| `EMAIL_REPLY_TO` | Staging support mailbox | `backend/.env.staging.local` | Backend config | Test/support mailbox. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard | `backend/.env.staging.local` | Backend config | Account identifier, not browser env. |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Cloudflare R2 dashboard | `backend/.env.staging.local` | Backend secret | Restricted staging token. |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Cloudflare R2 dashboard | `backend/.env.staging.local` | Backend secret | Restricted staging token secret. |
| `CLOUDFLARE_R2_PUBLIC_URL` | Cloudflare/CDN config | `backend/.env.staging.local` | Backend config, non-secret | Public asset base URL. |
| `VITE_GA4_MEASUREMENT_ID` | GA4 staging stream | `.env.staging.local` | Public | Use staging stream or disable analytics. |
| `VITE_CLARITY_PROJECT_ID` | Microsoft Clarity staging project | `.env.staging.local` | Public | Use staging project or disable analytics. |
| `GA4_MEASUREMENT_ID` | GA4 staging stream | `backend/.env.staging.local` | Backend config, public-equivalent | Match staging stream if backend analytics used. |
| `GA4_API_SECRET` | GA4 Measurement Protocol | `backend/.env.staging.local` | Backend secret | Backend-only if enabled. |
| `KAFFEPOS_OWNER_EMAIL` | Staging user admin/secret manager | `.env.staging.local` | Smoke credential | Dedicated owner account. |
| `KAFFEPOS_OWNER_PASSWORD` | Secret manager | `.env.staging.local` | Smoke secret | Dedicated staging password. |
| `KAFFEPOS_TEST_CASHIER_EMAIL` | Staging user admin/secret manager | `.env.staging.local` | Smoke credential | Dedicated cashier account. |
| `KAFFEPOS_TEST_CASHIER_PASSWORD` | Secret manager | `.env.staging.local` | Smoke secret | Dedicated staging password. |
| `KAFFEPOS_TEST_EMAIL_TO` | QA mailbox | `.env.staging.local` | Smoke config | Test recipient only. |

## 14. Verification Flow

After infrastructure is ready, fill `.env.staging.local` and `backend/.env.staging.local` locally from secure sources, then run:

```bash
npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local
```

Target:

- missing keys: `0`
- placeholder keys: `0`
- forbidden `VITE_*` secrets: `0`
- invalid values: `0`

Then run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm --prefix backend run check
npm run release:verify-config
npx -y react-doctor@latest --verbose --full
npx -y react-doctor@0.2.3 --verbose --diff
npm run smoke:staging:cashier
npm run smoke:staging:offline-sync
KAFFEPOS_STOCK_SMOKE_CONFIRM=1 npm run smoke:staging:stock
```

## 15. Production Candidate Gate

Do not mark READY until:

- Env verifier is clean.
- Health check passes.
- Smoke tests pass.
- Midtrans sandbox Snap token, payment, webhook signature, and idempotency are verified.
- Resend staging sender and test emails are verified.
- Cloudflare/R2 public asset and private-file safety are verified.
- GA4/Clarity are verified no-PII or intentionally disabled.
- Docker build is verified on Docker-capable runner.
- GitHub Actions runner passes after push.
- Backup restore drill executes against disposable restore DB.
