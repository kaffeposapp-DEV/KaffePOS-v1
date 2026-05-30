# KaffePOS Coolify Copy/Paste Checklist

Purpose: short dashboard checklist for Coolify staging setup. Do not paste real values into this document.

## Minimal Staging Only

### Frontend Coolify

- [ ] `VITE_APP_ENV=staging`
- [ ] `VITE_STAGING_PROFILE=minimal`
- [ ] `VITE_API_BASE_URL=https://staging-api.YOUR_DOMAIN`
- [ ] `VITE_ANALYTICS_ENABLED=false`
- [ ] `VITE_MIDTRANS_IS_PRODUCTION=false`

Optional existing frontend provider keys may remain but are skipped in minimal staging:

- [ ] `VITE_CLARITY_PROJECT_ID`
- [ ] `VITE_MIDTRANS_CLIENT_KEY`
- [ ] `VITE_GA_MEASUREMENT_ID` or `VITE_GA4_MEASUREMENT_ID`

### Backend Coolify

- [ ] `NODE_ENV=staging`
- [ ] `STAGING_PROFILE=minimal`
- [ ] `WEB_BASE_URL=https://staging.YOUR_DOMAIN`
- [ ] `API_BASE_URL=https://staging-api.YOUR_DOMAIN`
- [ ] `DATABASE_URL=postgresql://...`
- [ ] `JWT_SECRET`
- [ ] `SESSION_SECRET`
- [ ] `ENCRYPTION_KEY`
- [ ] `PAYMENT_INTEGRATION_ENABLED=false`
- [ ] `EMAIL_INTEGRATION_ENABLED=false`
- [ ] `R2_STORAGE_ENABLED=false`
- [ ] `ANALYTICS_SERVER_ENABLED=false`

### Local Mac Smoke Env

- [ ] `KAFFEPOS_STAGING_API_URL=https://staging-api.YOUR_DOMAIN`
- [ ] `KAFFEPOS_STAGING_FRONTEND_URL=https://staging.YOUR_DOMAIN`
- [ ] `KAFFEPOS_OWNER_EMAIL`
- [ ] `KAFFEPOS_OWNER_PASSWORD`
- [ ] `KAFFEPOS_TEST_CASHIER_EMAIL`
- [ ] `KAFFEPOS_TEST_CASHIER_PASSWORD`
- [ ] `KAFFEPOS_TEST_EMAIL_TO`
- [ ] `KAFFEPOS_STOCK_SMOKE_CONFIRM=1`

## Backend Env Checklist

- [ ] `NODE_ENV`
- [ ] `STAGING_PROFILE`
- [ ] `WEB_BASE_URL`
- [ ] `API_BASE_URL`
- [ ] `DATABASE_URL`
- [ ] `JWT_SECRET`
- [ ] `SESSION_SECRET`
- [ ] `ENCRYPTION_KEY`
- [ ] `MIDTRANS_IS_PRODUCTION`
- [ ] `MIDTRANS_SERVER_KEY`
- [ ] `MIDTRANS_CLIENT_KEY`
- [ ] `RESEND_API_KEY`
- [ ] `RESEND_FROM_EMAIL`
- [ ] `EMAIL_REPLY_TO`
- [ ] `CLOUDFLARE_ACCOUNT_ID`
- [ ] `CLOUDFLARE_R2_ACCESS_KEY_ID`
- [ ] `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- [ ] `CLOUDFLARE_R2_BUCKET`
- [ ] `CLOUDFLARE_R2_PUBLIC_URL`
- [ ] `GA4_MEASUREMENT_ID`
- [ ] `GA4_API_SECRET`
- [ ] `AFFILIATE_REFERRAL_ENABLED`
- [ ] `REFERRAL_ENABLED`
- [ ] `AFFILIATE_ENABLED`
- [ ] `ADMIN_COMMISSION_ENABLED`
- [ ] `REFERRAL_COMMISSION_CREATION_ENABLED`
- [ ] `PAYMENT_INTEGRATION_ENABLED`
- [ ] `EMAIL_INTEGRATION_ENABLED`
- [ ] `R2_STORAGE_ENABLED`
- [ ] `ANALYTICS_SERVER_ENABLED`

## Frontend Env Checklist

- [ ] `VITE_APP_ENV`
- [ ] `VITE_STAGING_PROFILE`
- [ ] `VITE_API_BASE_URL`
- [ ] `VITE_ANALYTICS_ENABLED`
- [ ] `VITE_GA4_MEASUREMENT_ID`
- [ ] `VITE_CLARITY_PROJECT_ID`
- [ ] `VITE_PUBLIC_ASSET_BASE_URL`
- [ ] `VITE_MIDTRANS_IS_PRODUCTION`
- [ ] `VITE_MIDTRANS_CLIENT_KEY`
- [ ] `VITE_AFFILIATE_REFERRAL_ENABLED`
- [ ] `VITE_REFERRAL_ENABLED`
- [ ] `VITE_AFFILIATE_ENABLED`
- [ ] `VITE_ADMIN_COMMISSION_ENABLED`

## Smoke Local Env Checklist

- [ ] `KAFFEPOS_STAGING_API_URL`
- [ ] `KAFFEPOS_STAGING_FRONTEND_URL`
- [ ] `KAFFEPOS_OWNER_EMAIL`
- [ ] `KAFFEPOS_OWNER_PASSWORD`
- [ ] `KAFFEPOS_TEST_CASHIER_EMAIL`
- [ ] `KAFFEPOS_TEST_CASHIER_PASSWORD`
- [ ] `KAFFEPOS_TEST_EMAIL_TO`
- [ ] `KAFFEPOS_STOCK_SMOKE_CONFIRM`

## Provider Dashboard Checklist

- [ ] PostgreSQL staging database created.
- [ ] PostgreSQL disposable restore database created.
- [ ] Midtrans sandbox Client Key copied to frontend/backend env.
- [ ] Midtrans sandbox Server Key copied to backend env only.
- [ ] Midtrans webhook URL configured.
- [ ] Resend API key copied to backend env only.
- [ ] Resend sender/domain verified.
- [ ] Cloudflare/R2 staging bucket created.
- [ ] Cloudflare/R2 restricted token copied to backend env only.
- [ ] Cloudflare/R2 public asset URL configured.
- [ ] GA4 staging stream configured or analytics disabled.
- [ ] Clarity staging project configured or analytics disabled.
- [ ] Owner/cashier smoke users created.

## Verification Checklist

- [ ] `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local` passes.
- [ ] `https://staging.YOUR_DOMAIN` loads.
- [ ] `https://staging-api.YOUR_DOMAIN/health` passes.
- [ ] `https://staging-api.YOUR_DOMAIN/health/db` passes.
- [ ] `npm run smoke:staging:cashier` passes.
- [ ] `npm run smoke:staging:offline-sync` passes.
- [ ] `KAFFEPOS_STOCK_SMOKE_CONFIRM=1 npm run smoke:staging:stock` passes.

## Do Not Copy

- [ ] Do not copy `DATABASE_URL` into frontend service.
- [ ] Do not copy `MIDTRANS_SERVER_KEY` into frontend service.
- [ ] Do not copy `RESEND_API_KEY` into frontend service.
- [ ] Do not copy Cloudflare/R2 secret keys into frontend service.
- [ ] Do not copy `GA4_API_SECRET` into frontend service.
- [ ] Do not use deprecated aliases: `APP_BASE_URL`, `EMAIL_FROM`, `CLOUDFLARE_R2_PUBLIC_BASE_URL`.
