# KaffePOS Production Readiness Checklist

Date: 2026-05-24

## Quality Gates

- [x] TypeScript passes.
- [x] ESLint passes.
- [x] Frontend and backend tests pass.
- [x] Frontend build passes.
- [x] Backend typecheck/build passes.
- [x] React Doctor full returns 100/100.
- [x] React Doctor pinned diff returns 100/100.

## Security Gates

- [x] `.env` ignored.
- [x] Backend secrets not exposed through `VITE_*`.
- [x] Auth, admin, and RBAC guidance documented.
- [x] Webhook signature/idempotency guidance documented.
- [x] Environment security checklist created.

## Operations Gates

- [x] Deployment checklist created.
- [x] CI workflow added.
- [x] Container guide created.
- [x] Monitoring/logging guide created.
- [x] Backup/recovery and disaster recovery docs created.

## Release Hold Items

- [ ] Run staging smoke scripts against real staging services.
- [ ] Verify Midtrans production credentials and webhook URL with real dashboard.
- [ ] Verify Resend production sender/domain.
- [ ] Verify database backup restore drill outside production.

## 2026-05-25 Staging Smoke Gate

Current status: blocked until real staging values are provided to the smoke runner.

Latest verifier result: missing keys `0`, placeholder keys `26`, forbidden frontend secret-like `VITE_*` keys `0`, invalid staging values `0`. Live staging smoke remains blocked until placeholder keys are replaced in ignored local env files.

Use `docs/engineering/ENV_CONTRACT.md` and `docs/engineering/STAGING_SECRET_FILL_CHECKLIST.md` for the remaining key-by-key source, destination file, and public/private classification before rerunning the verifier.

Use `docs/engineering/STAGING_INFRASTRUCTURE_PROVISIONING_GUIDE.md` and `docs/engineering/STAGING_INFRASTRUCTURE_CHECKLIST.md` to provision the staging frontend, API, database, DNS, integrations, smoke users, and disposable restore DB before replacing placeholder values.

Use `docs/engineering/COOLIFY_STAGING_DEPLOYMENT_GUIDE.md`, `docs/engineering/COOLIFY_ENV_MAPPING.md`, and `docs/engineering/COOLIFY_STAGING_DEPLOYMENT_CHECKLIST.md` for Coolify/VPS staging deployment.

Use `docs/engineering/COOLIFY_STAGING_MANUAL_EXECUTION.md` for exact manual Coolify setup and `docs/engineering/COOLIFY_COPY_PASTE_CHECKLIST.md` for dashboard key tracking.

Use `docs/engineering/MINIMAL_STAGING_COOLIFY_ENV.md` to align the observed Coolify frontend keys with the required minimal frontend, backend, and local smoke env keys.

Minimal staging mode (`STAGING_PROFILE=minimal`, `VITE_STAGING_PROFILE=minimal`) may validate core app health, auth, POS, stock, and offline sync while skipping Midtrans, Resend, Cloudflare/R2, GA4, and Clarity. Minimal staging is not production-candidate approval; full staging remains required before production.

- [x] `.env.staging.example` exists with frontend/smoke placeholders only.
- [x] `backend/.env.staging.example` exists with backend placeholders only.
- [x] `npm run staging:env:init` creates ignored local env files from staging templates without printing secrets.
- [x] `npm run verify:staging-env` exists, prints key status only, and rejects placeholder/example values.
- [x] Staging secret setup guide and value collection checklist exist.
- [x] Staging infrastructure provisioning guide and checklist exist.
- [x] Coolify/VPS staging deployment guide, env mapping, and deployment checklist exist.
- [x] Coolify manual execution guide and copy/paste checklist exist.
- [x] Local-only `JWT_SECRET`, `SESSION_SECRET`, and `ENCRYPTION_KEY` generated without printing values.
- [x] Backend env schema accepts `NODE_ENV=staging` for staging deployments.
- [ ] Replace placeholder local staging values with real secrets from secure storage.
- [ ] Confirm `.env.staging.local` and `backend/.env.staging.local` pass with zero placeholder keys before any live smoke test.
- [ ] `KAFFEPOS_STAGING_API_URL` or `KAFFEPOS_API_BASE_URL` available to smoke runner.
- [ ] `KAFFEPOS_OWNER_EMAIL` and `KAFFEPOS_OWNER_PASSWORD` available from secure secret store.
- [ ] `npm run smoke:staging:cashier` passes.
- [ ] `npm run smoke:staging:offline-sync` passes.
- [ ] `KAFFEPOS_STOCK_SMOKE_CONFIRM=1 npm run smoke:staging:stock` passes.
- [ ] Midtrans sandbox payment + webhook verified.
- [ ] Resend staging email verified with test recipient only.
- [ ] Cloudflare/R2 public/private asset behavior verified.
- [ ] GA4/Clarity staging behavior verified or intentionally disabled.
- [ ] Docker images build on Docker-capable runner.
- [ ] GitHub Actions workflow passes after push.

<!-- FINAL_STAGING_EXECUTION:START -->
## Final Staging Execution Update

Generated: 2026-05-30T17:26:30.106Z

Status: READY_FOR_MINIMAL_STAGING.

Verifier summary: profile minimal, missing 0, placeholders 0, forbidden frontend secrets 0, invalid 0.

Current blocker: FULL_STAGING_REQUIRED_FOR_PRODUCTION_CANDIDATE.

See `docs/engineering/FINAL_STAGING_EXECUTION_REPORT.md` for latest command results.
<!-- FINAL_STAGING_EXECUTION:END -->

<!-- COOLIFY_STAGING_AUTOMATION:START -->
## Coolify Staging Automation Update

Generated: 2026-05-30T17:22:57.971Z

Status: BLOCKED_BY_STAGING_SMOKE.

Verifier summary: profile minimal, missing 0, placeholders 0, forbidden frontend secrets 0, invalid 0.

Coolify connection: checked /version: HTTP 200.

See `docs/engineering/COOLIFY_STAGING_AUTOMATION_REPORT.md` for full automation details.
<!-- COOLIFY_STAGING_AUTOMATION:END -->

## 2026-05-25 Minimal Staging Smoke Blocker

- [x] Minimal env verifier passes.
- [x] Local quality gate passes after smoke repair changes.
- [x] Frontend/API/DB health endpoints return HTTP 200.
- [x] Direct smoke scripts load ignored local staging env safely.
- [x] Staging-only smoke data repair command added.
- [ ] Commit/push/deploy backend repair endpoint to Coolify staging.
- [ ] Run `npm run staging:repair-smoke-data` after deployed endpoint is live.
- [ ] Run `npm run smoke:staging:cashier` until pass.
- [ ] Run `npm run staging:final` until `READY_FOR_MINIMAL_STAGING`.

## Duitku Payment Migration

- Payment gateway can run as `duitku`, `midtrans`, or `disabled` via `PAYMENT_GATEWAY_PROVIDER`.
- Duitku callback URL: `https://api.kaffepos.my.id/api/webhooks/duitku`.
- Duitku return URL: `https://kaffepos.my.id/settings?billing=duitku-return`.
- Frontend return URL never marks payment paid; payment success requires verified server callback or verified status check.
- Duitku merchant key stays backend-only and must not be added to `VITE_*` env.

## Duitku Payment Staging Gate

- [ ] `STAGING_PROFILE=minimal` remains core-only with payments disabled.
- [ ] `STAGING_PROFILE=payment` passes `npm run verify:payment-staging`.
- [ ] `npm run smoke:staging:duitku` creates sandbox transaction and returns `paymentUrl=present`.
- [ ] Duitku callback URL verified live: `https://api.kaffepos.my.id/api/webhooks/duitku`.
- [ ] Return URL verified live: `https://kaffepos.my.id/settings?billing=duitku-return`.
