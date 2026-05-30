# KaffePOS Coolify Env Mapping

Use this mapping when configuring Coolify staging services. Do not paste real values into this file. Keep backend secrets out of frontend service env.

## Frontend Coolify Env

| Key | Example placeholder | Public/private | Source | Notes |
|---|---|---|---|---|
| `VITE_APP_ENV` | `staging` | Public | Release config | Must be `staging`. |
| `VITE_STAGING_PROFILE` | `minimal` | Public | Release config | `minimal` skips external providers; `full` required for production candidate. |
| `VITE_API_BASE_URL` | `https://staging-api.kaffepos.com` | Public | Backend staging domain | Browser-visible API base URL. |
| `VITE_ANALYTICS_ENABLED` | `false` | Public | Release decision | Use `false` until no-PII review passes. |
| `VITE_GA4_MEASUREMENT_ID` | `G-XXXXXXXXXX` | Public | GA4 staging stream | Public ID, staging stream only. |
| `VITE_CLARITY_PROJECT_ID` | `change-me` | Public | Clarity staging project | Public ID, staging project only. |
| `VITE_PUBLIC_ASSET_BASE_URL` | `https://assets-staging.kaffepos.com` | Public | Cloudflare/CDN | Public asset URL only. |
| `VITE_MIDTRANS_IS_PRODUCTION` | `false` | Public | Midtrans sandbox config | Must be `false` in staging. |
| `VITE_MIDTRANS_CLIENT_KEY` | `SB-Mid-client-change-me` | Public sandbox key | Midtrans sandbox dashboard | Client key only; never Server Key. |
| `VITE_AFFILIATE_REFERRAL_ENABLED` | `false` | Public | Feature flag decision | Keep false unless staging scope includes affiliate/referral. |
| `VITE_REFERRAL_ENABLED` | `false` | Public | Feature flag decision | Keep false unless staging scope includes referral. |
| `VITE_AFFILIATE_ENABLED` | `false` | Public | Feature flag decision | Keep false unless staging scope includes affiliate. |
| `VITE_ADMIN_COMMISSION_ENABLED` | `false` | Public | Feature flag decision | Keep false unless staging scope includes commissions. |

Frontend forbidden values:

- `DATABASE_URL`
- `JWT_SECRET`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `MIDTRANS_SERVER_KEY`
- `RESEND_API_KEY`
- Cloudflare/R2 access or secret keys
- `GA4_API_SECRET`
- Passwords, tokens, private keys, or provider credentials

## Backend Coolify Env

| Key | Example placeholder | Public/private | Source | Notes |
|---|---|---|---|---|
| `NODE_ENV` | `staging` | Backend config | Release config | Backend schema supports staging. |
| `STAGING_PROFILE` | `minimal` | Backend config | Release config | `minimal` allows core smoke without external providers. |
| `PORT` | `8787` | Backend config | Coolify/service config | Match exposed port. |
| `WEB_BASE_URL` | `https://staging.kaffepos.com` | Backend config | Frontend staging domain | Runtime backend uses this for links/callbacks. |
| `API_BASE_URL` | `https://staging-api.kaffepos.com` | Backend config | Backend staging domain | Public API URL. |
| `CORS_ORIGIN` | `https://staging.kaffepos.com` | Backend config | Frontend staging domain | Do not use wildcard. |
| `DATABASE_URL` | `postgresql://user:password@host:5432/kaffepos_staging` | Backend secret | Staging PostgreSQL | Store only in backend service. |
| `JWT_SECRET` | `generated-staging-secret` | Backend secret | Secret manager | Strong staging-only value. |
| `SESSION_SECRET` | `generated-staging-secret` | Backend secret | Secret manager | Strong staging-only value. |
| `ENCRYPTION_KEY` | `generated-32-byte-key` | Backend secret | Secret manager | Strong staging-only value. |
| `MIDTRANS_IS_PRODUCTION` | `false` | Backend config | Midtrans sandbox config | Must be `false`. |
| `MIDTRANS_ENVIRONMENT` | `sandbox` | Backend config | Midtrans sandbox config | Must be sandbox. |
| `MIDTRANS_SNAP_ENABLED` | `true` | Backend config | Payment config | Enable only after sandbox keys are set. |
| `MIDTRANS_SERVER_KEY` | `SB-Mid-server-change-me` | Backend secret | Midtrans sandbox dashboard | Backend-only. |
| `MIDTRANS_CLIENT_KEY` | `SB-Mid-client-change-me` | Backend config, public-equivalent | Midtrans sandbox dashboard | Match frontend client key. |
| `RESEND_API_KEY` | `re_change_me` | Backend secret | Resend dashboard | Backend-only. |
| `RESEND_FROM_EMAIL` | `KaffePOS Staging <noreply@example.com>` | Backend config | Resend verified sender | Runtime email sender. |
| `EMAIL_REPLY_TO` | `support@example.com` | Backend config | Support mailbox | Test/staging mailbox. |
| `CLOUDFLARE_ACCOUNT_ID` | `change-me` | Backend config | Cloudflare dashboard | Backend service only. |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | `change-me` | Backend secret | Cloudflare R2 token | Restricted staging bucket token. |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | `change-me` | Backend secret | Cloudflare R2 token | Backend-only. |
| `CLOUDFLARE_R2_BUCKET` | `kaffepos-staging-assets` | Backend config | Cloudflare R2 | Staging bucket only. |
| `CLOUDFLARE_R2_PUBLIC_URL` | `https://assets-staging.kaffepos.com` | Backend config | Cloudflare/CDN | Runtime backend uses this name. |
| `GA4_MEASUREMENT_ID` | `G-XXXXXXXXXX` | Backend config, public-equivalent | GA4 staging stream | Only staging stream. |
| `GA4_API_SECRET` | `change-me` | Backend secret | GA4 Measurement Protocol | Backend-only if enabled. |
| `AFFILIATE_REFERRAL_ENABLED` | `false` | Backend config | Feature flag decision | Keep false unless staging scope requires it. |
| `REFERRAL_ENABLED` | `false` | Backend config | Feature flag decision | Keep false unless staging scope requires it. |
| `AFFILIATE_ENABLED` | `false` | Backend config | Feature flag decision | Keep false unless staging scope requires it. |
| `ADMIN_COMMISSION_ENABLED` | `false` | Backend config | Feature flag decision | Keep false unless staging scope requires it. |
| `REFERRAL_COMMISSION_CREATION_ENABLED` | `false` | Backend config | Feature flag decision | Keep false unless staging scope requires it. |
| `PAYMENT_INTEGRATION_ENABLED` | `false` | Backend config | Minimal staging toggle | Must be false in minimal mode. |
| `EMAIL_INTEGRATION_ENABLED` | `false` | Backend config | Minimal staging toggle | Must be false in minimal mode. |
| `R2_STORAGE_ENABLED` | `false` | Backend config | Minimal staging toggle | Must be false in minimal mode. |
| `ANALYTICS_SERVER_ENABLED` | `false` | Backend config | Minimal staging toggle | Must be false in minimal mode. |

## Smoke Local Env

| Key | File | Source | Notes |
|---|---|---|---|
| `KAFFEPOS_STAGING_API_URL` | `.env.staging.local` | Backend staging domain | Used by staging smoke scripts. |
| `KAFFEPOS_STAGING_FRONTEND_URL` | `.env.staging.local` | Frontend staging domain | Used by manual/smoke checks. |
| `KAFFEPOS_OWNER_EMAIL` | `.env.staging.local` | Staging user admin/secret manager | Dedicated staging owner only. |
| `KAFFEPOS_OWNER_PASSWORD` | `.env.staging.local` | Secret manager | Dedicated staging owner password only. |
| `KAFFEPOS_TEST_CASHIER_EMAIL` | `.env.staging.local` | Staging user admin/secret manager | Dedicated staging cashier only. |
| `KAFFEPOS_TEST_CASHIER_PASSWORD` | `.env.staging.local` | Secret manager | Dedicated staging cashier password only. |
| `KAFFEPOS_TEST_EMAIL_TO` | `.env.staging.local` | QA mailbox | Test recipient only; no customer addresses. |
| `KAFFEPOS_STOCK_SMOKE_CONFIRM` | `.env.staging.local` | Release engineer | Must be `1` only for staging stock smoke. |

## Guardrails

- `WEB_BASE_URL`, `RESEND_FROM_EMAIL`, and `CLOUDFLARE_R2_PUBLIC_URL` are canonical backend names for staging/Coolify.
- `APP_BASE_URL`, `EMAIL_FROM`, and `CLOUDFLARE_R2_PUBLIC_BASE_URL` are deprecated aliases and should not be used in new Coolify services.
- Backend secrets must never be in frontend service env.
- `VITE_*` must only contain public-safe values.
- Staging must use Midtrans sandbox.
- Staging must not use production DB.
- Staging must not email real customers.
- Staging smoke credentials must belong to test users only.
- Minimal staging can deploy core app without Midtrans, Resend, R2, GA4, or Clarity. Full staging remains required for production-candidate approval.

## Duitku Sandbox Payment Gateway

Backend:

```env
PAYMENT_GATEWAY_PROVIDER=duitku
PAYMENT_INTEGRATION_ENABLED=true
DUITKU_ENVIRONMENT=sandbox
DUITKU_MERCHANT_CODE=ISI_DARI_DUITKU
DUITKU_MERCHANT_KEY=ISI_DARI_DUITKU
DUITKU_SANDBOX_BASE_URL=https://sandbox.duitku.com
DUITKU_PRODUCTION_BASE_URL=https://passport.duitku.com
DUITKU_CALLBACK_URL=https://api.kaffepos.my.id/api/webhooks/duitku
DUITKU_RETURN_URL=https://kaffepos.my.id/settings?billing=duitku-return
DUITKU_SUCCESS_URL=https://kaffepos.my.id/settings?billing=success&provider=duitku
DUITKU_PENDING_URL=https://kaffepos.my.id/settings?billing=pending&provider=duitku
DUITKU_FAILED_URL=https://kaffepos.my.id/settings?billing=failed&provider=duitku
DUITKU_EXPIRY_PERIOD_MINUTES=60
DUITKU_DEFAULT_PAYMENT_METHOD=VC
SUBSCRIPTION_PAYMENT_MODE=duitku_sandbox
MIDTRANS_SNAP_ENABLED=false
```

Frontend:

```env
VITE_PAYMENT_GATEWAY_PROVIDER=duitku
```

Midtrans env stays optional rollback only when `PAYMENT_GATEWAY_PROVIDER=midtrans`.

## Staging Profile Split

- `STAGING_PROFILE=minimal`: core smoke only, `PAYMENT_GATEWAY_PROVIDER=disabled`, `PAYMENT_INTEGRATION_ENABLED=false`.
- `STAGING_PROFILE=payment`: Duitku sandbox smoke, `PAYMENT_GATEWAY_PROVIDER=duitku`, `PAYMENT_INTEGRATION_ENABLED=true`.

For payment staging, sync Duitku values to backend only. Frontend receives only `VITE_PAYMENT_GATEWAY_PROVIDER=duitku` plus normal frontend public env.
