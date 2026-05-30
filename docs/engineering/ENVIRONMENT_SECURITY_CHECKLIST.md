# KaffePOS Environment Security Checklist

Date: 2026-05-24

## Frontend Public Environment

Only values safe for browsers may use `VITE_*`.

Allowed examples:
- `VITE_API_BASE_URL`
- `VITE_APP_NAME`
- `VITE_APP_VERSION`
- `VITE_CLOUDFLARE_CDN_BASE_URL`
- `VITE_CLOUDFLARE_IMAGE_DELIVERY_URL`
- `VITE_GA_MEASUREMENT_ID`
- `VITE_CLARITY_PROJECT_ID`
- frontend feature flags

Never expose:
- Midtrans server key
- Resend API key
- Cloudflare API token/R2 secret
- database URL/password
- JWT/session signing secret
- GA4 API secret
- Sentry auth token

## Backend Secret Environment

Required backend-only secrets must be injected at runtime:
- `DATABASE_URL` or DB host/user/password fields
- `MIDTRANS_SERVER_KEY`
- `MIDTRANS_CLIENT_KEY` only if backend creates Snap transactions
- `RESEND_API_KEY`
- `SESSION_SECRET` or equivalent session/token secret if configured
- Cloudflare/R2 access credentials if uploads are enabled

## Production Controls

- [ ] `.env` and `.env.*` remain gitignored.
- [ ] `.env.example` contains placeholders or public non-secret IDs only.
- [ ] CORS origin is allowlisted; no wildcard in production.
- [ ] HTTPS is required for public frontend, backend, and webhook URLs.
- [ ] Secrets are rotated after accidental exposure.
- [ ] Logs never include password, token, raw payout account number, full webhook payload, or DB credentials.

## 2026-05-25 Staging Smoke Secret Handling

Smoke-test credentials must come from a secure local secret store or CI environment secrets and must not be committed:

- `KAFFEPOS_STAGING_API_URL` / `KAFFEPOS_API_BASE_URL`
- `KAFFEPOS_OWNER_EMAIL`
- `KAFFEPOS_OWNER_PASSWORD`
- optional cashier smoke overrides
- `KAFFEPOS_STOCK_SMOKE_CONFIRM=1` only for staging stock smoke

Use `npm run verify:staging-env` to check presence and staging-safe values. The verifier masks sensitive values and fails if required staging keys are missing, placeholder/example values remain, staging flags are unsafe, or forbidden secret-like `VITE_*` keys are present.

Use `npm run staging:env:init` to create ignored local staging env files from templates. Fill those local files manually from an approved secret source; do not paste values into chat, docs, tickets, or screenshots. Follow `docs/engineering/STAGING_SECRET_SETUP_GUIDE.md` and `docs/engineering/STAGING_VALUE_COLLECTION_CHECKLIST.md` before running live staging smoke tests.

Latest staging env status: missing keys `0`, placeholder keys `26`, forbidden frontend secret-like `VITE_*` keys `0`, invalid staging values `0`. Continue blocking live smoke tests until placeholder keys are replaced locally from secure staging secret source.

Provision staging infrastructure first with `docs/engineering/STAGING_INFRASTRUCTURE_PROVISIONING_GUIDE.md`; then use `docs/engineering/STAGING_SECRET_FILL_CHECKLIST.md` to map each remaining key to the correct local env file without exposing backend secrets through `VITE_*`.

For Coolify/VPS staging, use `docs/engineering/ENV_CONTRACT.md` and `docs/engineering/COOLIFY_ENV_MAPPING.md` to place public frontend env, backend-only secrets, and local smoke credentials in the correct service/file. Canonical backend names are `WEB_BASE_URL`, `RESEND_FROM_EMAIL`, and `CLOUDFLARE_R2_PUBLIC_URL`.

Frontend `VITE_*` values must remain public-only. Never add `DATABASE_URL`, Midtrans server key, Resend key, Cloudflare/R2 secrets, GA4 API secret, JWT/session secret, or encryption key to frontend env.

## Duitku Payment Migration

- Payment gateway can run as `duitku`, `midtrans`, or `disabled` via `PAYMENT_GATEWAY_PROVIDER`.
- Duitku callback URL: `https://api.kaffepos.my.id/api/webhooks/duitku`.
- Duitku return URL: `https://kaffepos.my.id/settings?billing=duitku-return`.
- Frontend return URL never marks payment paid; payment success requires verified server callback or verified status check.
- Duitku merchant key stays backend-only and must not be added to `VITE_*` env.
