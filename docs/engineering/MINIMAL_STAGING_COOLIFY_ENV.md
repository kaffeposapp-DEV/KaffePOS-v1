# KaffePOS Minimal Staging Coolify Env

Purpose: minimal staging validates core app health, database, auth/login, owner/cashier flows, POS basic flow, stock smoke, and offline sync without external providers. Minimal staging is not production-candidate approval.

## Observed Frontend Coolify Keys

Current visible frontend resource keys from Coolify:

- `VITE_API_BASE_URL`
- `NIXPACKS_NODE_VERSION`
- `VITE_CLARITY_PROJECT_ID`
- `VITE_MIDTRANS_CLIENT_KEY`
- `VITE_GA_MEASUREMENT_ID`

This appears to be frontend Production Environment Variables only. Do not put backend secrets in this frontend resource.

## A. Frontend Coolify Resource

Required for minimal staging:

| Key | Value format | Required | Notes |
|---|---|---|---|
| `VITE_APP_ENV` | `staging` | Yes | Add if missing. |
| `VITE_STAGING_PROFILE` | `minimal` | Yes | Add if missing. |
| `VITE_API_BASE_URL` | `https://staging-api.YOUR_DOMAIN` | Yes | Existing key must point to staging API, not production. |
| `VITE_ANALYTICS_ENABLED` | `false` | Yes | Add if missing; analytics disabled in minimal staging. |
| `VITE_MIDTRANS_IS_PRODUCTION` | `false` | Yes | Add if missing; Midtrans disabled/skipped in minimal staging. |

Optional existing provider keys may remain but are skipped in minimal staging:

- `VITE_CLARITY_PROJECT_ID`
- `VITE_MIDTRANS_CLIENT_KEY`
- `VITE_GA_MEASUREMENT_ID` or `VITE_GA4_MEASUREMENT_ID`

Recommendation: use canonical `VITE_GA4_MEASUREMENT_ID` for full staging. `VITE_GA_MEASUREMENT_ID` is treated as legacy/non-blocking for minimal staging because analytics is disabled.

## B. Backend Coolify Resource

Required for minimal staging:

| Key | Value format | Required | Secret? |
|---|---|---|---|
| `NODE_ENV` | `staging` | Yes | No |
| `STAGING_PROFILE` | `minimal` | Yes | No |
| `WEB_BASE_URL` | `https://staging.YOUR_DOMAIN` | Yes | No |
| `API_BASE_URL` | `https://staging-api.YOUR_DOMAIN` | Yes | No |
| `DATABASE_URL` | `postgresql://...` | Yes | Yes |
| `JWT_SECRET` | strong secret | Yes | Yes |
| `SESSION_SECRET` | strong secret | Yes | Yes |
| `ENCRYPTION_KEY` | strong secret | Yes | Yes |
| `PAYMENT_INTEGRATION_ENABLED` | `false` | Yes | No |
| `EMAIL_INTEGRATION_ENABLED` | `false` | Yes | No |
| `R2_STORAGE_ENABLED` | `false` | Yes | No |
| `ANALYTICS_SERVER_ENABLED` | `false` | Yes | No |

Do not use production DB. Do not put `DATABASE_URL`, JWT/session/encryption secrets, Midtrans Server Key, Resend API Key, Cloudflare/R2 secrets, GA4 API secret, passwords, or tokens in frontend Coolify env.

## C. Local Mac Smoke Env

Required in ignored `.env.staging.local` for local smoke scripts:

| Key | Value format | Required |
|---|---|---|
| `KAFFEPOS_STAGING_API_URL` | `https://staging-api.YOUR_DOMAIN` | Yes |
| `KAFFEPOS_STAGING_FRONTEND_URL` | `https://staging.YOUR_DOMAIN` | Yes |
| `KAFFEPOS_OWNER_EMAIL` | staging owner email | Yes |
| `KAFFEPOS_OWNER_PASSWORD` | staging owner password | Yes |
| `KAFFEPOS_TEST_CASHIER_EMAIL` | staging cashier email | Yes |
| `KAFFEPOS_TEST_CASHIER_PASSWORD` | staging cashier password | Yes |
| `KAFFEPOS_TEST_EMAIL_TO` | test recipient email | Yes |
| `KAFFEPOS_STOCK_SMOKE_CONFIRM` | `1` | Yes |

Coolify env alone is not enough for local smoke scripts. Local `.env.staging.local` must also be filled with staging API/frontend URLs and smoke user credentials.

## Minimal Verification Command

Run after Coolify frontend/backend env and local smoke env are filled:

```bash
npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local
```

Expected for minimal staging:

- profile: `minimal`
- missing: `0`
- placeholders: `0`
- forbidden frontend secrets: `0`
- invalid: `0`

Then run:

```bash
npm run coolify:staging:deploy -- --check
```

If clean, deploy/smoke:

```bash
npm run coolify:staging:deploy -- --all
```
