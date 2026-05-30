# KaffePOS Environment Variable Contract

## 1. Purpose

This contract defines the canonical environment variable names for KaffePOS staging and Coolify/VPS deployment. Backend runtime names are the source of truth for backend services. Frontend `VITE_*` values are public and browser-visible. Local smoke values are only for release verification.

Staging supports two profiles:

- `minimal`: core app validation only. Midtrans, Resend, Cloudflare/R2, GA4, and Clarity are disabled/skipped.
- `full`: production-candidate validation. All provider credentials and external checks are required.

## 2. Frontend Public Env

These keys go only in the frontend service or `.env.staging.local` frontend section:

| Key | Purpose | Public/private | Notes |
|---|---|---|---|
| `VITE_APP_ENV` | Frontend environment label | Public | Use `staging` for staging. |
| `VITE_STAGING_PROFILE` | Staging verification profile | Public | Use `minimal` for core smoke, `full` for production-candidate staging. |
| `VITE_API_BASE_URL` | Browser API base URL | Public | HTTPS staging API URL. |
| `VITE_ANALYTICS_ENABLED` | Analytics toggle | Public | Use `false` until no-PII review passes. |
| `VITE_GA4_MEASUREMENT_ID` | GA4 browser measurement ID | Public | Staging stream only. |
| `VITE_CLARITY_PROJECT_ID` | Microsoft Clarity project ID | Public | Staging project only. |
| `VITE_PUBLIC_ASSET_BASE_URL` | Browser public asset base URL | Public | Public CDN/asset URL only. |
| `VITE_MIDTRANS_IS_PRODUCTION` | Midtrans frontend mode | Public | Must be `false` for staging. |
| `VITE_MIDTRANS_CLIENT_KEY` | Midtrans Snap client key | Public sandbox key | Client key only; never server key. |
| `VITE_AFFILIATE_REFERRAL_ENABLED` | Frontend feature flag | Public | Staging-safe boolean. |
| `VITE_REFERRAL_ENABLED` | Frontend feature flag | Public | Staging-safe boolean. |
| `VITE_AFFILIATE_ENABLED` | Frontend feature flag | Public | Staging-safe boolean. |
| `VITE_ADMIN_COMMISSION_ENABLED` | Frontend feature flag | Public | Staging-safe boolean. |

## 3. Backend Secret Env

These keys go only in backend service env or `backend/.env.staging.local`:

| Key | Purpose | Public/private | Notes |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Backend secret | Staging DB only. |
| `JWT_SECRET` | JWT/session signing secret if used | Backend secret | Strong staging-only value. |
| `SESSION_SECRET` | Session secret if used | Backend secret | Strong staging-only value. |
| `ENCRYPTION_KEY` | App encryption secret if used | Backend secret | Strong staging-only value. |
| `MIDTRANS_SERVER_KEY` | Midtrans server credential | Backend secret | Sandbox key only for staging. |
| `RESEND_API_KEY` | Resend API credential | Backend secret | Backend-only. |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 access key ID | Backend secret | Restricted staging token. |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 secret access key | Backend secret | Restricted staging token. |
| `GA4_API_SECRET` | GA4 Measurement Protocol secret | Backend secret | Backend-only if enabled. |

## 4. Backend Public Config Env

These keys go in backend service env but are non-secret config:

| Key | Purpose | Public/private | Notes |
|---|---|---|---|
| `NODE_ENV` | Backend runtime environment | Backend config | `staging` accepted for staging. |
| `STAGING_PROFILE` | Backend staging verification profile | Backend config | `minimal` disables external provider requirements; `full` requires them. |
| `PORT` | Backend listen port | Backend config | Default `8787`. |
| `WEB_BASE_URL` | Canonical frontend URL used by backend | Backend config | Preferred name; replaces old `APP_BASE_URL` docs. |
| `API_BASE_URL` | Canonical API URL | Backend config | HTTPS staging API URL. |
| `CORS_ORIGIN` | Allowed frontend origin(s) | Backend config | Staging frontend URL; no wildcard. |
| `MIDTRANS_IS_PRODUCTION` | Midtrans mode flag | Backend config | Must be `false` in staging. |
| `MIDTRANS_ENVIRONMENT` | Midtrans environment | Backend config | Must be `sandbox` in staging. |
| `MIDTRANS_SNAP_ENABLED` | Snap enable flag | Backend config | `true` only after sandbox config ready. |
| `MIDTRANS_CLIENT_KEY` | Midtrans client key | Public-equivalent backend config | Match frontend client key. |
| `RESEND_FROM_EMAIL` | Resend sender | Backend config | Preferred name; runtime email sender. |
| `EMAIL_REPLY_TO` | Reply-to mailbox | Backend config | Staging support/test mailbox. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier | Backend config | Backend service only. |
| `CLOUDFLARE_R2_BUCKET` | R2 bucket name | Backend config | Staging bucket only. |
| `CLOUDFLARE_R2_PUBLIC_URL` | R2/CDN public asset URL | Backend config | Preferred name; runtime asset URL. |
| `GA4_MEASUREMENT_ID` | Backend analytics measurement ID | Public-equivalent backend config | Staging stream only. |
| `AFFILIATE_REFERRAL_ENABLED` | Backend feature flag | Backend config | Staging-safe boolean. |
| `REFERRAL_ENABLED` | Backend feature flag | Backend config | Staging-safe boolean. |
| `AFFILIATE_ENABLED` | Backend feature flag | Backend config | Staging-safe boolean. |
| `ADMIN_COMMISSION_ENABLED` | Backend feature flag | Backend config | Staging-safe boolean. |
| `REFERRAL_COMMISSION_CREATION_ENABLED` | Backend feature flag | Backend config | Staging-safe boolean. |
| `PAYMENT_INTEGRATION_ENABLED` | Minimal staging payment toggle | Backend config | Must be `false` in minimal staging. |
| `EMAIL_INTEGRATION_ENABLED` | Minimal staging email toggle | Backend config | Must be `false` in minimal staging. |
| `R2_STORAGE_ENABLED` | Minimal staging R2 toggle | Backend config | Must be `false` in minimal staging. |
| `ANALYTICS_SERVER_ENABLED` | Minimal staging analytics toggle | Backend config | Must be `false` in minimal staging. |

## 4.1 Minimal Staging Required Env

Minimal staging requires only core app env: `VITE_APP_ENV`, `VITE_STAGING_PROFILE`, `VITE_API_BASE_URL`, `VITE_ANALYTICS_ENABLED`, `VITE_MIDTRANS_IS_PRODUCTION`, `NODE_ENV`, `STAGING_PROFILE`, `WEB_BASE_URL`, `API_BASE_URL`, `DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `PAYMENT_INTEGRATION_ENABLED`, `EMAIL_INTEGRATION_ENABLED`, `R2_STORAGE_ENABLED`, `ANALYTICS_SERVER_ENABLED`, and smoke user keys.

Minimal staging skips provider keys for Midtrans, Resend, Cloudflare/R2, GA4, and Clarity. Minimal staging is not a production candidate.

## 5. Staging Smoke Env

These keys are local release-runner values. Put them in ignored `.env.staging.local` or secure CI secrets only:

| Key | Purpose | Notes |
|---|---|---|
| `KAFFEPOS_STAGING_API_URL` | Smoke API target | HTTPS staging API URL. |
| `KAFFEPOS_STAGING_FRONTEND_URL` | Smoke frontend target | HTTPS staging frontend URL. |
| `KAFFEPOS_OWNER_EMAIL` | Smoke owner login | Dedicated staging owner only. |
| `KAFFEPOS_OWNER_PASSWORD` | Smoke owner password | Secret manager/local ignored env only. |
| `KAFFEPOS_TEST_CASHIER_EMAIL` | Smoke cashier login | Dedicated staging cashier only. |
| `KAFFEPOS_TEST_CASHIER_PASSWORD` | Smoke cashier password | Secret manager/local ignored env only. |
| `KAFFEPOS_TEST_EMAIL_TO` | Smoke test recipient | QA/staging mailbox only. |
| `KAFFEPOS_STOCK_SMOKE_CONFIRM` | Stock smoke destructive-action guard | Must be `1` for staging stock smoke. |

## 6. Deprecated / Alias Env Names

These names are deprecated for staging/Coolify and should not be used in new deployment config:

| Deprecated name | Preferred name | Reason |
|---|---|---|
| `APP_BASE_URL` | `WEB_BASE_URL` | Backend runtime reads `WEB_BASE_URL`. |
| `EMAIL_FROM` | `RESEND_FROM_EMAIL` | Backend runtime email service reads `RESEND_FROM_EMAIL`. |
| `CLOUDFLARE_R2_PUBLIC_BASE_URL` | `CLOUDFLARE_R2_PUBLIC_URL` | Backend runtime asset service reads `CLOUDFLARE_R2_PUBLIC_URL`. |

Do not rely on deprecated aliases for Coolify staging. If old local env files contain aliases, replace them with preferred names.

## 7. Coolify Mapping

- Frontend service: only `VITE_*` public-safe keys.
- Backend service: backend secret env and backend public config env.
- Smoke runner/local machine: `KAFFEPOS_*` smoke values in ignored `.env.staging.local` or secure CI secrets.
- Use `docs/engineering/COOLIFY_ENV_MAPPING.md` for complete Coolify tables.

## 8. Security Rules

- `VITE_*` = frontend public only.
- Backend secrets never use `VITE_*`.
- No `DATABASE_URL` in frontend.
- No `MIDTRANS_SERVER_KEY` in frontend.
- No `RESEND_API_KEY` in frontend.
- No Cloudflare secret in frontend.
- No `GA4_API_SECRET` in frontend.
- No passwords, tokens, private keys, or provider credentials in frontend.
- Staging must use sandbox/test credentials only.
- Production credentials must not be used for staging.
- Do not print secrets in terminal output, logs, docs, screenshots, tickets, or chat.

## Duitku Payment Gateway

Backend sandbox:

```env
PAYMENT_GATEWAY_PROVIDER=duitku
PAYMENT_INTEGRATION_ENABLED=true
DUITKU_ENVIRONMENT=sandbox
DUITKU_MERCHANT_CODE=change-me
DUITKU_MERCHANT_KEY=change-me
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

Do not define Duitku merchant key/API key/secret in frontend env.
Minimal staging remains `PAYMENT_GATEWAY_PROVIDER=disabled` and `PAYMENT_INTEGRATION_ENABLED=false`.

## Staging Profiles

### Minimal Core Staging

Use `STAGING_PROFILE=minimal` for core app smoke only:

```env
STAGING_PROFILE=minimal
VITE_STAGING_PROFILE=minimal
PAYMENT_GATEWAY_PROVIDER=disabled
PAYMENT_INTEGRATION_ENABLED=false
```

### Payment Gateway Staging

Use `STAGING_PROFILE=payment` for Duitku sandbox validation:

```env
STAGING_PROFILE=payment
VITE_STAGING_PROFILE=payment
PAYMENT_GATEWAY_PROVIDER=duitku
PAYMENT_INTEGRATION_ENABLED=true
DUITKU_ENVIRONMENT=sandbox
DUITKU_MERCHANT_CODE=ISI_DARI_DUITKU
DUITKU_MERCHANT_KEY=ISI_DARI_DUITKU
DUITKU_CALLBACK_URL=https://api.kaffepos.my.id/api/webhooks/duitku
DUITKU_RETURN_URL=https://kaffepos.my.id/settings?billing=duitku-return
SUBSCRIPTION_PAYMENT_MODE=duitku_sandbox
MIDTRANS_SNAP_ENABLED=false
VITE_PAYMENT_GATEWAY_PROVIDER=duitku
```

Payment profile does not require Resend, R2, or GA4 unless their enable flags are set to `true`.
