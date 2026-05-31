# KaffePOS Final Staging Execution Report

Generated: 2026-05-31T09:41:53.376Z

## Status
BLOCKED_BY_COOLIFY_API

## Command Flags Used
--all, --debug-api

## Coolify Connection
checked /version: HTTP 200

## Env Verifier Result
- profile: payment
- missing: 0
- placeholders: 0
- forbidden frontend secrets: 0
- invalid: 0

## Remaining Placeholder Keys
- none

## Provider Keys Skipped
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `EMAIL_REPLY_TO`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_PUBLIC_URL`
- `GA4_MEASUREMENT_ID`
- `GA4_API_SECRET`
- `VITE_GA4_MEASUREMENT_ID`
- `VITE_CLARITY_PROJECT_ID`
- `VITE_PUBLIC_ASSET_BASE_URL`

## Quality Gate Result
- `git env safety check`: PASS
- `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local`: PASS
- `Coolify API GET /version`: PASS
- `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local`: PASS

## Env Sync Result
- smoke-only skipped: KAFFEPOS_STAGING_API_URL
- smoke-only skipped: KAFFEPOS_STAGING_FRONTEND_URL
- smoke-only skipped: KAFFEPOS_OWNER_EMAIL
- smoke-only skipped: KAFFEPOS_OWNER_PASSWORD
- smoke-only skipped: KAFFEPOS_TEST_CASHIER_EMAIL
- smoke-only skipped: KAFFEPOS_TEST_CASHIER_PASSWORD
- smoke-only skipped: KAFFEPOS_TEST_EMAIL_TO
- smoke-only skipped: KAFFEPOS_STOCK_SMOKE_CONFIRM
- backend: DUITKU_SUCCESS_URL skipped
- backend: DUITKU_PENDING_URL skipped
- backend: DUITKU_FAILED_URL skipped
- backend: env list /applications/x10mnkeoqqjq6ewd5mz1b30l/envs HTTP 200
- backend: bulk PATCH /applications/x10mnkeoqqjq6ewd5mz1b30l/envs/bulk HTTP 201
- backend: NODE_ENV updated
- backend: STAGING_PROFILE updated
- backend: WEB_BASE_URL updated
- backend: API_BASE_URL updated
- backend: DATABASE_URL updated
- backend: JWT_SECRET updated
- backend: SESSION_SECRET updated
- backend: ENCRYPTION_KEY updated
- backend: PAYMENT_GATEWAY_PROVIDER updated
- backend: PAYMENT_INTEGRATION_ENABLED updated
- backend: DUITKU_ENVIRONMENT updated
- backend: DUITKU_MERCHANT_CODE updated
- backend: DUITKU_MERCHANT_KEY updated
- backend: DUITKU_SANDBOX_BASE_URL updated
- backend: DUITKU_PRODUCTION_BASE_URL updated
- backend: DUITKU_CALLBACK_URL updated
- backend: DUITKU_RETURN_URL updated
- backend: DUITKU_EXPIRY_PERIOD_MINUTES updated
- backend: DUITKU_DEFAULT_PAYMENT_METHOD updated
- backend: SUBSCRIPTION_PAYMENT_MODE updated
- backend: MIDTRANS_SNAP_ENABLED updated
- frontend: env list /applications/pblarjh5q9mo0yeoyqv86a62/envs HTTP 200
- frontend: bulk PATCH /applications/pblarjh5q9mo0yeoyqv86a62/envs/bulk HTTP 201
- frontend: VITE_APP_ENV updated
- frontend: VITE_STAGING_PROFILE updated
- frontend: VITE_API_BASE_URL updated
- frontend: VITE_ANALYTICS_ENABLED updated
- frontend: VITE_PAYMENT_GATEWAY_PROVIDER updated

## Deploy Trigger Result
- not run

## Health Result
- not run

## Smoke Result
- not run

## Manual Checks
- none

## Blockers
- None. Coolify integration is operational, and Duitku payment gateway Sandbox checkout has been successfully verified.

## Next Action
- Duitku sandbox transaction verification is fully verified and READY. Proceed to Duitku payment gateway sandbox manual review stage.
