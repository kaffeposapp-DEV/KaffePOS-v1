# KaffePOS Staging Smoke QA Checklist

Date: 2026-05-25
Scope: staging-only validation for KaffePOS web, API, PostgreSQL, Midtrans sandbox, Resend staging sender, Cloudflare/R2, GA4, and Clarity.

## Required Local/Staging Environment

Set these locally or in the staging runner before smoke execution. Do not commit real values.
Use `.env.staging.example` and `backend/.env.staging.example` as templates, then keep real values in local/CI secret storage only.

Validate the staging env before smoke execution:

```bash
npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local
```

The verifier fails on missing keys, forbidden secret-like `VITE_*` keys, invalid staging flags, and placeholder/example values. Replace all placeholders in local files with real staging secrets from a secure store before running smoke scripts.

### Smoke Runner
- [ ] `KAFFEPOS_STAGING_API_URL` or `KAFFEPOS_API_BASE_URL`
- [ ] `KAFFEPOS_OWNER_EMAIL`
- [ ] `KAFFEPOS_OWNER_PASSWORD`
- [ ] `KAFFEPOS_STOCK_SMOKE_CONFIRM=1` for stock smoke that writes staging data
- [ ] optional `KAFFEPOS_CASHIER_EMAIL`
- [ ] optional `KAFFEPOS_CASHIER_PASSWORD`
- [ ] optional `KAFFEPOS_SECOND_OUTLET_NAME`

### Backend Staging
- [ ] `DATABASE_URL`
- [ ] `SESSION_SECRET` or active session secret equivalent used by backend
- [ ] `MIDTRANS_SERVER_KEY`
- [ ] `MIDTRANS_CLIENT_KEY`
- [ ] `MIDTRANS_IS_PRODUCTION=false` or equivalent `MIDTRANS_ENVIRONMENT=sandbox`
- [ ] `RESEND_API_KEY`
- [ ] `RESEND_FROM_EMAIL`
- [ ] `EMAIL_REPLY_TO` if enabled
- [ ] Cloudflare/R2 account, bucket, access key, secret key, and public base URL if uploads/CDN are enabled
- [ ] `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` only if backend Measurement Protocol events are enabled

### Frontend Staging
- [ ] `VITE_APP_ENV=staging`
- [ ] `VITE_API_BASE_URL`
- [ ] analytics enable flag if used
- [ ] public GA4 measurement ID if analytics enabled
- [ ] public Clarity project ID if analytics enabled
- [ ] public asset/CDN base URL if used
- [ ] public Midtrans client key only if needed by Snap
- [ ] no backend secret exposed through `VITE_*`

## Smoke Commands

Run in order:

```bash
npm run smoke:staging:cashier
npm run smoke:staging:offline-sync
KAFFEPOS_STOCK_SMOKE_CONFIRM=1 npm run smoke:staging:stock
```

## Manual Health Checks

- [ ] Frontend loads over HTTPS.
- [ ] Backend `/health` or `/system-status` returns OK.
- [ ] Database check in system status is OK.
- [ ] Auth login endpoint reachable.
- [ ] No CORS errors from frontend to API.
- [ ] No mixed-content errors.
- [ ] Static assets load from expected host/CDN.

## Midtrans Sandbox Checks

- [ ] Snap token is created by backend only.
- [ ] Server key is never present in frontend bundle or browser env.
- [ ] Webhook URL uses HTTPS and points to staging backend.
- [ ] Signature verification rejects bad signature.
- [ ] Duplicate webhook is idempotent.
- [ ] Successful sandbox payment updates payment/subscription state.
- [ ] Failed/cancelled payment is represented safely.
- [ ] Frontend callback is not used as source of truth.

## Resend Checks

- [ ] API key backend-only.
- [ ] Staging sender/from configured.
- [ ] Test recipient only; do not email real users during smoke.
- [ ] Password reset email works.
- [ ] Welcome/trial reminder/receipt emails work where enabled.
- [ ] Email failure does not roll back successful payment state.

## Cloudflare/R2 Checks

- [ ] Public assets load from expected domain.
- [ ] HTML is not cached incorrectly.
- [ ] Hashed static assets use long cache.
- [ ] Private files are not publicly listable.
- [ ] Upload/download works if enabled.
- [ ] CDN-missing fallback does not break critical UI.

## Analytics Checks

- [ ] Analytics can be disabled by env.
- [ ] GA4 and Clarity load async only when enabled.
- [ ] No email, phone, bank/payout data, raw notes, or secrets sent.
- [ ] Staging events observed for signup/login/first transaction/payment success/feature usage if analytics enabled.

## Backup / Restore Checks

- [ ] Backup command reviewed in `BACKUP_RECOVERY_GUIDE.md`.
- [ ] Backup location and retention known.
- [ ] Restore drill target is non-production.
- [ ] R2/upload backup plan reviewed.
- [ ] Rollback plan reviewed in `DISASTER_RECOVERY_CHECKLIST.md`.
