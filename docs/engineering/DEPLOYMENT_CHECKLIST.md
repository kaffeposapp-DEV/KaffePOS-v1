# KaffePOS Deployment Checklist

Date: 2026-05-24
Scope: React/Vite frontend, Express backend, PostgreSQL, Capacitor, Midtrans, Resend, Cloudflare/R2, GA4/Clarity.

## 1. Pre-Deployment Gates

- [ ] `npm ci` succeeds at repo root.
- [ ] `npm ci --prefix backend` succeeds.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] `npm --prefix backend run check` passes.
- [ ] `npx -y react-doctor@latest --verbose --full` returns 100/100.
- [ ] `npx -y react-doctor@0.2.3 --verbose --diff` returns 100/100 until latest diff is stable.
- [ ] `npm run release:verify-config` passes for the target environment.

## 2. Environment Readiness

- [ ] `NODE_ENV=production` on backend.
- [ ] `DATABASE_URL` points to production PostgreSQL with SSL if required by host.
- [ ] `CORS_ORIGIN` contains only trusted production/staging origins.
- [ ] `WEB_BASE_URL` and `API_BASE_URL` use HTTPS public URLs.
- [ ] Midtrans mode matches environment: sandbox for staging, production for production.
- [ ] Resend sender domain is verified before enabling production email.
- [ ] Sentry DSN, GA4, and Clarity are configured only for intended environments.
- [ ] Feature flags are explicitly set; risky launches default off.

## 3. Backend Runtime

- [ ] `/health` responds before routing traffic.
- [ ] `/api/health` or documented health alias is available if required by hosting platform.
- [ ] `/metrics` is reachable only from trusted monitoring networks when possible.
- [ ] Request ID middleware and structured logging are enabled.
- [ ] Graceful shutdown handles `SIGTERM` and `SIGINT`.
- [ ] Body limits are intentionally small except dedicated upload endpoints.
- [ ] Server secrets are injected at runtime, never baked into images.

## 4. Database

- [ ] Migrations are reviewed and non-destructive.
- [ ] Backup exists before running migrations.
- [ ] Migration runner has access to required DB role.
- [ ] Financial/payment tables use soft state transitions, not destructive deletes.
- [ ] Key reporting and FK indexes are present for transactions, payments, subscriptions, referrals, affiliates, commissions, and payouts.

## 5. Payments, Email, Analytics

- [ ] Midtrans webhook URL points to production backend and signature verification is enabled.
- [ ] Webhook idempotency tables/logs are healthy.
- [ ] Frontend payment callback is never treated as source of truth.
- [ ] Resend failures produce safe logs without full payloads.
- [ ] GA4/Clarity events contain no passwords, tokens, payout numbers, raw email, phone, address, or notes.

## 6. Rollback

- [ ] Previous frontend build artifact is available.
- [ ] Previous backend image/build is available.
- [ ] Database restore procedure is documented and tested outside production.
- [ ] Feature flags can disable affiliate/referral/payment changes without data deletion.

## 2026-05-25 Staging Smoke Prerequisites

Before promoting a production candidate, provide smoke credentials through a secure runner environment and run:

```bash
npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local
npm run smoke:staging:cashier
npm run smoke:staging:offline-sync
KAFFEPOS_STOCK_SMOKE_CONFIRM=1 npm run smoke:staging:stock
```

Do not run stock smoke against production. Staging smoke remains blocked when `KAFFEPOS_STAGING_API_URL`, owner credentials, stock confirmation, or any placeholder/example staging values remain.

Latest verifier result: missing keys `0`, placeholder keys `26`, forbidden frontend secret-like `VITE_*` keys `0`, invalid staging values `0`. Live staging smoke and production candidate promotion remain blocked until placeholders are replaced from secure staging secret source.

Before replacing placeholder values, provision staging infrastructure using `docs/engineering/STAGING_INFRASTRUCTURE_PROVISIONING_GUIDE.md` and verify readiness with `docs/engineering/STAGING_INFRASTRUCTURE_CHECKLIST.md`.

For Coolify/VPS staging deployment, use `docs/engineering/COOLIFY_STAGING_DEPLOYMENT_GUIDE.md`, `docs/engineering/COOLIFY_ENV_MAPPING.md`, and `docs/engineering/COOLIFY_STAGING_DEPLOYMENT_CHECKLIST.md`.

Use `docs/engineering/ENV_CONTRACT.md` as the canonical env naming contract. For backend staging, use `WEB_BASE_URL`, `RESEND_FROM_EMAIL`, and `CLOUDFLARE_R2_PUBLIC_URL`; do not use deprecated aliases in new Coolify services.
