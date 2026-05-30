# KaffePOS Coolify Staging Automation Report

Generated: 2026-05-30T17:22:57.971Z

## Status
BLOCKED_BY_STAGING_SMOKE

## Command Flags Used
--all, --debug-api

## Coolify Connection
checked /version: HTTP 200

## Env Verifier Result
- profile: minimal
- missing: 0
- placeholders: 0
- forbidden frontend secrets: 0
- invalid: 0

## Remaining Placeholder Keys
- none

## Provider Keys Skipped
- `VITE_GA4_MEASUREMENT_ID`
- `VITE_CLARITY_PROJECT_ID`
- `VITE_PUBLIC_ASSET_BASE_URL`
- `VITE_MIDTRANS_CLIENT_KEY`
- `MIDTRANS_SERVER_KEY`
- `MIDTRANS_CLIENT_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `EMAIL_REPLY_TO`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_PUBLIC_URL`
- `GA4_MEASUREMENT_ID`
- `GA4_API_SECRET`

## Quality Gate Result
- `git env safety check`: PASS
- `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local`: PASS
- `Coolify API GET /version`: PASS
- `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local`: PASS
- `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run test`: PASS
- `npm run build`: PASS
- `npm --prefix backend run check`: PASS
- `npm run release:verify-config`: PASS
- `npx -y react-doctor@latest --verbose --full`: PASS
- `npx -y react-doctor@0.2.3 --verbose --diff`: PASS
- `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local`: PASS
- `npm run smoke:staging:cashier`: PASS
- `npm run smoke:staging:offline-sync`: FAIL

## Env Sync Result
- smoke-only skipped: KAFFEPOS_STAGING_API_URL
- smoke-only skipped: KAFFEPOS_STAGING_FRONTEND_URL
- smoke-only skipped: KAFFEPOS_OWNER_EMAIL
- smoke-only skipped: KAFFEPOS_OWNER_PASSWORD
- smoke-only skipped: KAFFEPOS_TEST_CASHIER_EMAIL
- smoke-only skipped: KAFFEPOS_TEST_CASHIER_PASSWORD
- smoke-only skipped: KAFFEPOS_TEST_EMAIL_TO
- smoke-only skipped: KAFFEPOS_STOCK_SMOKE_CONFIRM
- minimal provider skipped: VITE_GA4_MEASUREMENT_ID
- minimal provider skipped: VITE_CLARITY_PROJECT_ID
- minimal provider skipped: VITE_PUBLIC_ASSET_BASE_URL
- minimal provider skipped: VITE_MIDTRANS_CLIENT_KEY
- minimal provider skipped: MIDTRANS_SERVER_KEY
- minimal provider skipped: MIDTRANS_CLIENT_KEY
- minimal provider skipped: RESEND_API_KEY
- minimal provider skipped: RESEND_FROM_EMAIL
- minimal provider skipped: EMAIL_REPLY_TO
- minimal provider skipped: CLOUDFLARE_ACCOUNT_ID
- minimal provider skipped: CLOUDFLARE_R2_ACCESS_KEY_ID
- minimal provider skipped: CLOUDFLARE_R2_SECRET_ACCESS_KEY
- minimal provider skipped: CLOUDFLARE_R2_PUBLIC_URL
- minimal provider skipped: GA4_MEASUREMENT_ID
- minimal provider skipped: GA4_API_SECRET
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
- backend: STAGING_REPAIR_TOKEN updated
- backend: PAYMENT_INTEGRATION_ENABLED updated
- backend: EMAIL_INTEGRATION_ENABLED updated
- backend: R2_STORAGE_ENABLED updated
- backend: ANALYTICS_SERVER_ENABLED updated
- frontend: env list /applications/pblarjh5q9mo0yeoyqv86a62/envs HTTP 200
- frontend: bulk PATCH /applications/pblarjh5q9mo0yeoyqv86a62/envs/bulk HTTP 201
- frontend: VITE_APP_ENV updated
- frontend: VITE_STAGING_PROFILE updated
- frontend: VITE_API_BASE_URL updated
- frontend: VITE_ANALYTICS_ENABLED updated
- frontend: VITE_MIDTRANS_IS_PRODUCTION updated

## Deploy Trigger Result
- backend: GET /deploy?uuid=x10mnkeoqqjq6ewd5mz1b30l&force=true HTTP 200
- frontend: GET /deploy?uuid=pblarjh5q9mo0yeoyqv86a62&force=true HTTP 200

## Health Result
- frontend: PASS
- api /health: PASS
- api /health/db: PASS

## Smoke Result
- npm run smoke:staging:cashier: PASS
- npm run smoke:staging:offline-sync: FAIL

## Manual Checks
- none

## Blockers
- npm run smoke:staging:offline-sync failed

## Next Action
Fix staging smoke failure before production candidate.
