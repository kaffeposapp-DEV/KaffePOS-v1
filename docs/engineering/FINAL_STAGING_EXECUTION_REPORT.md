# KaffePOS Final Staging Execution Report

Generated: 2026-05-25T00:11:24.995Z

## Status
BLOCKED_BY_STAGING_SMOKE

## Env File Safety
- `.env.staging.local`: ignored, untracked
- `backend/.env.staging.local`: ignored, untracked

## Verifier Result
- profile: minimal
- missing: 0
- placeholders: 0
- forbidden frontend secrets: 0
- invalid: 0

## Commands Run
- `git env safety check`: PASS
- `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run test`: PASS
- `npm run build`: PASS
- `npm --prefix backend run check`: PASS
- `npm run release:verify-config`: PASS
- `npx -y react-doctor@latest --verbose --full`: PASS
- `npx -y react-doctor@0.2.3 --verbose --diff`: PASS
- `health frontend`: PASS
- `health api_health`: PASS
- `health api_db_health`: PASS
- `npm run smoke:staging:cashier`: FAIL

## Remaining Placeholder Keys
- none

## Manual Checks Required
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

## Current Blocker
npm run smoke:staging:cashier

## Final Recommendation
Fix staging smoke failure before production candidate.

## 2026-05-25 Parallel Smoke Fix Attempt
- Env verifier: PASS, profile minimal, missing 0, placeholders 0, forbidden frontend secrets 0, invalid 0.
- Health: frontend PASS, API health PASS, API DB health PASS.
- Cashier smoke initial root cause: smoke script did not load ignored local staging env when run directly.
- Cashier smoke after env-load fix: owner login reached staging API but failed with `email_not_confirmed`.
- Repair attempt: local direct DB repair blocked because database host is internal to Coolify network from Mac.
- Repair endpoint added: staging-only, minimal-only, token-protected `/api/staging/smoke-data/repair`.
- Deployment limitation: endpoint is not live on remote staging until code is committed/pushed and Coolify deploys that revision.
- Current status: NOT_READY, `BLOCKED_BY_STAGING_SMOKE`.
