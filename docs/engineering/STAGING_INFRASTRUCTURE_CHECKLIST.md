# KaffePOS Staging Infrastructure Checklist

Use this checklist before running real staging smoke tests. Do not write secrets in this file.

For Coolify/VPS manual setup, follow `docs/engineering/COOLIFY_STAGING_MANUAL_EXECUTION.md` and then use this checklist as the release gate.

## A. Domains

- [ ] Frontend staging domain created.
- [ ] API staging domain created.
- [ ] Asset/CDN staging domain created.
- [ ] HTTPS enabled for frontend domain.
- [ ] HTTPS enabled for API domain.
- [ ] HTTPS enabled for asset domain.
- [ ] No mixed-content browser warnings from frontend to API/assets.

## B. Database

- [ ] Dedicated staging PostgreSQL database created.
- [ ] Dedicated staging DB user created.
- [ ] DB user restricted to staging database/schema only.
- [ ] Production DB not used by staging.
- [ ] Migrations run against staging database.
- [ ] Disposable restore database created.
- [ ] Restore DB is isolated from active staging database.

## C. Backend

- [ ] Backend staging env configured through secure secret source.
- [ ] Backend deploy completed.
- [ ] `GET /health` works.
- [ ] `GET /health/db` works.
- [ ] CORS allowlist includes staging frontend URL.
- [ ] CORS does not use wildcard in production-like staging unless explicitly approved.
- [ ] API uses HTTPS public URL.
- [ ] Backend secrets are not present in frontend env.

## D. Frontend

- [ ] Frontend staging env configured with public-safe `VITE_*` values only.
- [ ] Frontend build deployed.
- [ ] Frontend URL loads over HTTPS.
- [ ] Frontend can reach staging API.
- [ ] Static assets load from expected staging asset/CDN URL.
- [ ] No fatal browser console error during initial load.

## E. Midtrans

- [ ] Sandbox Client Key added to frontend public env.
- [ ] Sandbox Client Key added to backend env if required.
- [ ] Sandbox Server Key added to backend env only.
- [ ] Production Midtrans keys not used in staging.
- [ ] Webhook URL configured as HTTPS staging API path.
- [ ] Sandbox payment can start.
- [ ] Webhook signature verification tested.
- [ ] Duplicate webhook does not double process payment.

## F. Resend

- [ ] Staging Resend API key added to backend env only.
- [ ] Sender/domain verified or staging sender allowed.
- [ ] `RESEND_FROM_EMAIL` configured.
- [ ] `EMAIL_REPLY_TO` configured.
- [ ] Test email sent only to approved test recipient.
- [ ] Email failure does not break payment success flow.

## G. Cloudflare/R2

- [ ] Staging R2 bucket created.
- [ ] Restricted staging R2 credentials added to backend env only.
- [ ] Public asset URL works.
- [ ] Private files are not publicly listable.
- [ ] Private files are not publicly fetchable unless intentionally signed.
- [ ] Public hashed static assets have safe cache headers.
- [ ] HTML entry documents are not cached incorrectly.

## H. Analytics

- [ ] GA4 staging stream configured or analytics intentionally disabled.
- [ ] GA4 API secret configured backend-only if backend analytics enabled.
- [ ] Clarity staging project configured or Clarity intentionally disabled.
- [ ] No email, phone, bank, payout, token, password, or raw customer PII sent.
- [ ] Key staging events verified only after no-PII review.

## I. Smoke Users

- [ ] Owner staging user ready.
- [ ] Cashier staging user ready.
- [ ] Cashier assigned to staging outlet.
- [ ] Sample outlet ready.
- [ ] Sample product/menu item ready.
- [ ] Sample stock record ready if stock smoke requires it.
- [ ] Owner login manually verified.
- [ ] Cashier login manually verified.
- [ ] Smoke credentials stored only in ignored local env or secure CI secrets.

## J. Backup/Restore

- [ ] Backup command tested against staging database.
- [ ] Backup artifact stored in approved secure location.
- [ ] Restore drill executed on disposable restore database.
- [ ] Restored DB readable.
- [ ] App read/health check verified against restored target if safe.
- [ ] Disposable restore database destroyed or locked down after drill.

## Final Gate

- [ ] `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local` passes.
- [ ] `npm run smoke:staging:cashier` passes.
- [ ] `npm run smoke:staging:offline-sync` passes.
- [ ] `KAFFEPOS_STOCK_SMOKE_CONFIRM=1 npm run smoke:staging:stock` passes.
- [ ] Midtrans sandbox verified.
- [ ] Resend verified.
- [ ] Cloudflare/R2 verified.
- [ ] GA4/Clarity verified or intentionally disabled.
- [ ] Docker build verified.
- [ ] GitHub Actions runner verified.
- [ ] Backup/restore drill verified.
