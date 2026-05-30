# KaffePOS Staging Secret Setup Guide

## 1. Purpose

This guide explains how to provision real staging values locally without exposing secrets in git, terminal logs, documentation, or AI chat. Use this before running staging health checks, smoke tests, Midtrans sandbox checks, Resend checks, Cloudflare/R2 checks, analytics checks, Docker verification, or backup/restore drills.

## 2. Security Rules

- Never commit `.env.staging.local` or `backend/.env.staging.local`.
- Never paste secrets into ChatGPT, tickets, pull requests, docs, or screenshots.
- Never print secrets in terminal logs; use presence, missing, placeholder, or masked status only.
- Never put backend secrets in `VITE_*` variables because `VITE_*` values are browser-visible.
- Use secure secret source only, such as the approved password manager, cloud secret manager, or deployment platform secret store.
- Use staging/sandbox credentials only for staging verification.
- Production keys must not be used for staging.
- Rotate any value immediately if it is pasted into chat, committed, logged, or exposed to the browser.

## 3. Required Secret Sources

- Staging deployment platform for frontend URL, backend URL, CORS origin, and runtime host settings.
- Staging PostgreSQL provider for `DATABASE_URL` and disposable restore DB URL.
- Approved secret manager for `JWT_SECRET`, `SESSION_SECRET`, and `ENCRYPTION_KEY`.
- Midtrans sandbox dashboard for staging server key, client key, and HTTPS webhook URL.
- Resend dashboard for staging API key, sender, reply-to, and domain verification status.
- Cloudflare dashboard for account ID, R2 access key, R2 secret key, bucket, and public asset URL.
- GA4 and Microsoft Clarity dashboards for staging-safe measurement/project identifiers.
- Staging admin process for owner, cashier, and test recipient credentials.

## 4. Frontend Staging Env

Put only browser-safe public values in `.env.staging.local`:

```bash
VITE_APP_ENV=staging
VITE_API_BASE_URL=https://staging-api.example.com
VITE_ANALYTICS_ENABLED=false
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_CLARITY_PROJECT_ID=change-me
VITE_PUBLIC_ASSET_BASE_URL=https://assets.example.com
VITE_MIDTRANS_IS_PRODUCTION=false
VITE_MIDTRANS_CLIENT_KEY=SB-Mid-client-change-me
VITE_AFFILIATE_REFERRAL_ENABLED=false
VITE_REFERRAL_ENABLED=false
VITE_AFFILIATE_ENABLED=false
VITE_ADMIN_COMMISSION_ENABLED=false
```

Do not add `DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `MIDTRANS_SERVER_KEY`, `RESEND_API_KEY`, Cloudflare R2 secrets, `GA4_API_SECRET`, passwords, tokens, or private keys to any `VITE_*` variable.

## 5. Backend Staging Env

Put backend-only values in `backend/.env.staging.local`:

```bash
NODE_ENV=staging
WEB_BASE_URL=https://staging.example.com
API_BASE_URL=https://staging-api.example.com
DATABASE_URL=postgresql://user:password@host:5432/kaffepos_staging
JWT_SECRET=change-me
SESSION_SECRET=change-me
ENCRYPTION_KEY=change-me-32-byte-key
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=SB-Mid-server-change-me
MIDTRANS_CLIENT_KEY=SB-Mid-client-change-me
RESEND_API_KEY=re_change_me
RESEND_FROM_EMAIL=KaffePOS Staging <noreply@example.com>
EMAIL_REPLY_TO=support@example.com
CLOUDFLARE_ACCOUNT_ID=change-me
CLOUDFLARE_R2_ACCESS_KEY_ID=change-me
CLOUDFLARE_R2_SECRET_ACCESS_KEY=change-me
CLOUDFLARE_R2_BUCKET=kaffepos-staging-assets
CLOUDFLARE_R2_PUBLIC_URL=https://assets-staging.example.com
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=change-me
```

Replace every placeholder with real staging/sandbox values from secure storage before live checks.

## 6. Smoke Test Env

Put smoke runner values in `.env.staging.local` unless your shell or CI injects them securely:

```bash
KAFFEPOS_STAGING_API_URL=https://staging-api.example.com
KAFFEPOS_STAGING_FRONTEND_URL=https://staging.example.com
KAFFEPOS_OWNER_EMAIL=owner-staging@example.com
KAFFEPOS_OWNER_PASSWORD=change-me
KAFFEPOS_TEST_CASHIER_EMAIL=cashier-staging@example.com
KAFFEPOS_TEST_CASHIER_PASSWORD=change-me
KAFFEPOS_TEST_EMAIL_TO=test-recipient@example.com
KAFFEPOS_STOCK_SMOKE_CONFIRM=1
```

Use dedicated staging users only. Do not use personal, production, customer, or employee accounts.

## 7. How to Fill `.env.staging.local`

1. Run `npm run staging:env:init` if the local files do not exist.
2. Open `.env.staging.local` in a local editor only.
3. Copy values from approved secure storage.
4. Keep analytics disabled unless the staging analytics destination is confirmed.
5. Keep `VITE_MIDTRANS_IS_PRODUCTION=false`.
6. Save locally and do not commit.

## 8. How to Fill `backend/.env.staging.local`

1. Open `backend/.env.staging.local` in a local editor only.
2. Copy backend secrets from approved secure storage.
3. Keep `NODE_ENV=staging` and `MIDTRANS_IS_PRODUCTION=false`.
4. Confirm `DATABASE_URL` points to staging PostgreSQL, not production.
5. Confirm `MIDTRANS_SERVER_KEY` is sandbox, not production.
6. Confirm `RESEND_API_KEY`, Cloudflare/R2 keys, and `GA4_API_SECRET` are backend-only.
7. Save locally and do not commit.

## 9. How to Verify

Run:

```bash
npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local
```

Required result before live smoke tests:

- Missing keys: `0`
- Placeholder keys: `0`
- Forbidden secret-like `VITE_*` keys: `0`
- Invalid staging values: `0`

If verification fails, fix only the listed key names locally. Do not paste values into chat or docs.

## 10. Common Mistakes

- Leaving `example.com`, `change-me`, `G-XXXXXXXXXX`, `re_change_me`, or `SB-Mid-*-change-me` placeholders.
- Using `localhost` for staging URLs.
- Putting `MIDTRANS_SERVER_KEY`, `DATABASE_URL`, `RESEND_API_KEY`, or R2 secrets in `VITE_*` variables.
- Using production Midtrans, Resend, database, or Cloudflare credentials for staging.
- Running smoke tests before verifier reports zero placeholders.
- Committing local secret files or attaching them to support tickets.
- Printing shell environment with commands such as `env`, `printenv`, or verbose CI debug logs.

## 11. Production Candidate Gate

KaffePOS is not a production candidate until all conditions pass:

- Staging env verification reports zero missing keys, zero placeholder keys, and zero forbidden frontend secret-like keys.
- Staging health endpoint verifies backend and database readiness.
- Cashier, offline sync, and stock staging smoke tests pass.
- Midtrans sandbox payment/webhook/idempotency is verified.
- Resend staging test email is verified with a test recipient only.
- Cloudflare/R2 public/private asset behavior is verified.
- GA4/Clarity staging behavior is verified or intentionally disabled.
- Docker build and GitHub Actions runner are verified.
- Backup and restore drill is completed against a disposable restore target.
