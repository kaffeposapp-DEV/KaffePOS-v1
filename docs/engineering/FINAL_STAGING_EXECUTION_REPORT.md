# KaffePOS Final Staging Execution Report

Generated: 2026-05-30T18:48:15.166Z

## Status
READY_FOR_PAYMENT_STAGING

## Command Flags Used
--deploy, --health, --debug-api

## Coolify Connection
not checked

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

## Env Sync Result
- not run

## Deploy Trigger Result
- backend: GET /deploy?uuid=x10mnkeoqqjq6ewd5mz1b30l&force=true HTTP 200
- frontend: GET /deploy?uuid=pblarjh5q9mo0yeoyqv86a62&force=true HTTP 200

## Health Result
- frontend: PASS
- api /health: PASS
- api /health/db: PASS

## Smoke Result
- not run

## Manual Checks
- none

## Blockers
- none

## Next Action
Complete manual external checks if required, then proceed to production candidate review.
