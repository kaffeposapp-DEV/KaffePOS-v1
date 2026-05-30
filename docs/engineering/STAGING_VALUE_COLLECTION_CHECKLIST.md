# KaffePOS Staging Value Collection Checklist

Use this checklist to collect real staging values from approved secure sources. Do not write secret values in this document; mark only source, owner, and verification status outside git if needed.

## URL

- [ ] Staging frontend URL collected from deployment platform.
- [ ] Staging API URL collected from backend deployment platform.
- [ ] Staging asset/CDN URL collected from Cloudflare or asset host.

## Database

- [ ] Staging PostgreSQL `DATABASE_URL` collected from database provider.
- [ ] Disposable restore DB URL collected for backup/restore drill.
- [ ] Confirmed staging database is separate from production.

## Auth/Security

- [ ] `JWT_SECRET` collected from approved secret source.
- [ ] `SESSION_SECRET` collected from approved secret source.
- [ ] `ENCRYPTION_KEY` collected from approved secret source.
- [ ] Confirmed secrets are staging-only and not reused from production.

## Smoke Users

- [ ] Owner staging email collected.
- [ ] Owner staging password collected.
- [ ] Cashier staging email collected.
- [ ] Cashier staging password collected.
- [ ] Test recipient email collected.
- [ ] Confirmed test users are not production/customer accounts.

## Midtrans Sandbox

- [ ] Sandbox server key collected.
- [ ] Sandbox client key collected.
- [ ] HTTPS webhook URL configured in Midtrans dashboard.
- [ ] Sandbox payment method test status confirmed.
- [ ] Confirmed production Midtrans keys are not used.

## Resend

- [ ] Staging Resend API key collected.
- [ ] Verified sender/domain confirmed.
- [ ] `RESEND_FROM_EMAIL` value confirmed.
- [ ] `EMAIL_REPLY_TO` value confirmed.
- [ ] Test recipient allowlist confirmed if applicable.

## Cloudflare/R2

- [ ] Cloudflare account ID collected.
- [ ] R2 access key collected.
- [ ] R2 secret key collected.
- [ ] Staging bucket name confirmed.
- [ ] Public base URL confirmed.
- [ ] Private file exposure rules confirmed.

## Analytics

- [ ] GA4 measurement ID collected or analytics disabled for staging.
- [ ] GA4 API secret collected if server-side event verification is enabled.
- [ ] Clarity project ID collected or Clarity disabled for staging.
- [ ] No-PII analytics rule confirmed.

## Feature Flags

- [ ] `AFFILIATE_REFERRAL_ENABLED` staging value confirmed.
- [ ] `REFERRAL_ENABLED` staging value confirmed.
- [ ] `AFFILIATE_ENABLED` staging value confirmed.
- [ ] `ADMIN_COMMISSION_ENABLED` staging value confirmed.
- [ ] `REFERRAL_COMMISSION_CREATION_ENABLED` staging value confirmed.
- [ ] Frontend `VITE_*` feature flags match intended staging exposure.

## Verification Gate

- [ ] `.env.staging.local` filled locally from secure source.
- [ ] `backend/.env.staging.local` filled locally from secure source.
- [ ] `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local` passes.
- [ ] Missing keys count is `0`.
- [ ] Placeholder keys count is `0`.
- [ ] Forbidden frontend secret-like key count is `0`.
