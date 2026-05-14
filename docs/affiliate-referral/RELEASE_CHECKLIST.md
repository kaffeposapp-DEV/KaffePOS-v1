# Affiliate & Referral Release Checklist

Date: 2026-05-14
Status: Release candidate with external production checks pending
Scope: Affiliate & Referral Program for React frontend, Express backend, PostgreSQL, Midtrans, Resend, GA4/Clarity, Cloudflare, Capacitor.

## Functional Checklist

### Referral

- [x] User referral dashboard exists and uses `GET /api/referrals/me`.
- [x] User can generate referral code through `POST /api/referrals/generate`.
- [x] User can copy referral code/link and use Web Share fallback.
- [x] Public referral route validates code and stores hashed IP only.
- [x] Referral registration has unique referred user constraint.
- [x] Payment success sync calls backend commission service after verified Midtrans webhook.
- [x] Reward/commission starts pending and has `eligible_at` payment success + 30 days in backend rules.
- [x] Admin can approve/reject commission and mark approved commission paid.
- [ ] Manual QA: register fresh user from referral link in production-like environment.
- [ ] Manual QA: verify trial status sync against real production database row.

### Affiliate

- [x] User affiliate dashboard exists and uses `GET /api/affiliate/me`.
- [x] User can apply through `POST /api/affiliate/apply`.
- [x] Affiliate code/link display and copy/share actions exist.
- [x] Payout update uses `PATCH /api/affiliate/me/payout`.
- [x] Payout account number is masked in frontend and encrypted/protected before DB storage.
- [x] Affiliate stats and commission history display from backend response.
- [x] Admin can activate, suspend, or reject affiliate profile.
- [ ] Manual QA: confirm production admin review flow with real admin account.

### Admin

- [x] Admin affiliate list page exists at `/admin/affiliates`.
- [x] Admin referral list page exists at `/admin/referrals`.
- [x] Admin commission list page exists at `/admin/commissions`.
- [x] Filters/search exist for all three admin pages.
- [x] Detail modals exist for all three admin pages.
- [x] Action confirmation modals exist for affiliate/commission actions.
- [x] Reject actions require note.
- [x] Admin pages use frontend admin email guard.
- [x] Backend admin middleware remains required for admin APIs.

## Security Checklist

- [x] No backend secret found in built frontend bundle scan for `DATABASE_URL`, `MIDTRANS_SERVER_KEY`, `RESEND_API_KEY`, `CLOUDFLARE_R2_SECRET`, `GA4_API_SECRET`, `GEMINI_API_KEY`, `AIzaSy`, or `sk_live`.
- [x] Removed local `VITE_GEMINI_API_KEY` value from `.env`; frontend must not receive Gemini keys.
- [x] Public referral endpoint stores `ip_hash`, not raw IP.
- [x] Terms acceptance stores `ip_hash`, not raw IP.
- [x] Payout account is stored in `payout_account_number_encrypted` and rendered masked.
- [x] User routes require auth.
- [x] Admin routes require backend admin authorization.
- [x] SQL uses parameterized queries in services/routes inspected for this feature.
- [x] Admin notes are not persisted in localStorage and not sent to analytics.
- [ ] Production secret rotation: rotate any key that was ever placed in frontend `.env` before release.

## Payment Checklist

- [x] Midtrans webhook signature verification exists before state changes.
- [x] Required production webhook alias exists: `POST /api/webhooks/midtrans`.
- [x] Legacy webhook aliases remain: `/api/payments/midtrans/webhook`, `/api/payment/webhook`, `/api/payment/midtrans-webhook`.
- [x] Payment success commission sync is backend-only.
- [x] Commission creation is idempotent through DB unique indexes and service checks.
- [x] Failed/cancelled payment path cancels unpaid commission through service flow.
- [x] Frontend payment callback does not create commission.
- [ ] Production Midtrans dashboard: configure HTTPS webhook URL `https://api.kaffepos.my.id/api/webhooks/midtrans`.
- [ ] Production Midtrans dashboard: verify production server/client keys are active and sandbox keys are absent.
- [ ] Manual QA: repeat same webhook twice and confirm one commission only.
- [ ] Manual QA: refund/cancel/failure from Midtrans dashboard and confirm unpaid commission cancellation.

## Email Checklist

- [x] Email service uses backend Resend key only.
- [x] Password reset email path exists.
- [x] Payment success email is sent after verified webhook success path.
- [ ] Resend production domain verified.
- [ ] SPF/DKIM configured and passing.
- [ ] `EMAIL_FROM` or `RESEND_FROM_EMAIL` production sender validated.
- [ ] Welcome email verified in production-like SMTP/Resend logs.
- [ ] Trial reminder verified if scheduler/flow is enabled.
- [ ] Invoice/receipt email verified once per payment success.
- [ ] Feedback thank-you email verified if enabled.

## Analytics Checklist

- [x] Frontend analytics service loads GA4/Clarity async through existing service.
- [x] Referral dashboard events exclude PII.
- [x] Affiliate dashboard events exclude PII and payout data.
- [x] Admin events exclude PII, payout data, and notes.
- [x] Built bundle scan found no backend analytics secret names/values.
- [ ] Production GA4 measurement ID configured.
- [ ] Production GA4 API secret configured backend-only if Measurement Protocol is enabled.
- [ ] Production Clarity project ID configured.
- [ ] Consent policy verified for production region/business policy.

Events to verify in production analytics/debug tools:

- [ ] `sign_up`
- [ ] `login`
- [ ] `trial_started`
- [ ] `upgrade_started`
- [ ] `upgrade_completed`
- [ ] `payment_success`
- [ ] `referral_link_clicked`
- [ ] `referral_code_copied`
- [ ] `referral_paid`
- [ ] `affiliate_application_submitted`
- [ ] `commission_created`
- [ ] `commission_approved`
- [ ] `commission_rejected`
- [ ] `commission_paid`

## Database Checklist

Tables required:

- [x] `referral_codes`
- [x] `referral_clicks`
- [x] `referral_registrations`
- [x] `affiliate_profiles`
- [x] `commission_transactions`
- [x] `commission_payouts`
- [x] `affiliate_terms_acceptances`

Constraints/indexes required:

- [x] Unique referral code.
- [x] Unique user/type referral code.
- [x] Unique affiliate code.
- [x] One affiliate profile per user.
- [x] One referred user referral source.
- [x] Idempotent commission indexes for payment and null-payment cases.
- [x] FK restrict/no action for financial records.
- [x] IP hash format checks.
- [x] Status/type enum-like check constraints.
- [ ] Production database: run `npm --prefix backend run migrate` after backup and confirm `schema_migrations` row for `20260514_0001_affiliate_referral`.
- [ ] Production database: inspect indexes/FKs using DBA console or migration logs.

## Cloudflare Checklist

- [ ] Static assets load from CDN if `VITE_PUBLIC_ASSET_BASE_URL` or CDN base is configured.
- [ ] HTML uses no unsafe long cache.
- [ ] Hashed assets use long immutable cache.
- [ ] WAF allows `/api/ref/:code`, `/api/referrals/*`, `/api/affiliate/*`, `/api/admin/*`, and `/api/webhooks/midtrans`.
- [ ] R2 public bucket exposes only intended public assets.
- [ ] Invoices/private files use signed/backend-protected access unless explicitly public.
- [ ] Error pages do not leak stack traces or secrets.

## Performance Checklist

- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] `npm run test` passes.
- [x] `npm run build` passes.
- [x] `npm --prefix backend run check` passes.
- [x] `npm run build:mobile` passes.
- [x] Referral, affiliate, and admin pages are lazy-loaded chunks.
- [x] Admin APIs request limited result sets (`limit=50`).
- [ ] Production DB query plans should be reviewed after real data volume.
- [ ] Production remote smoke test must pass from network with access to domains.

## Required Production Environment Variables

Backend:

- `DATABASE_URL`
- `MIDTRANS_SERVER_KEY`
- `MIDTRANS_CLIENT_KEY`
- `MIDTRANS_IS_PRODUCTION=true`
- `MIDTRANS_ENVIRONMENT=production`
- `RESEND_API_KEY`
- `EMAIL_FROM` or current code equivalent `RESEND_FROM_EMAIL`
- `EMAIL_REPLY_TO` if email templates/use case require replies
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_R2_PUBLIC_BASE_URL` or current code equivalent `CLOUDFLARE_R2_PUBLIC_URL`
- `GA4_MEASUREMENT_ID` if backend analytics uses Measurement Protocol
- `GA4_API_SECRET` backend-only if Measurement Protocol is enabled
- `ADMIN_EMAILS`
- `CORS_ORIGIN`
- `SENTRY_DSN`

Frontend public env:

- `VITE_APP_ENV` or current release channel equivalent
- `VITE_ANALYTICS_ENABLED` if analytics gating is enabled
- `VITE_GA4_MEASUREMENT_ID` or current code equivalent `VITE_GA_MEASUREMENT_ID`
- `VITE_CLARITY_PROJECT_ID`
- `VITE_PUBLIC_ASSET_BASE_URL` or current code equivalent `VITE_CLOUDFLARE_CDN_BASE_URL`
- `VITE_MIDTRANS_IS_PRODUCTION` only if code uses a public boolean; never expose server key

Forbidden frontend env:

- `DATABASE_URL`
- `MIDTRANS_SERVER_KEY`
- `RESEND_API_KEY`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `GA4_API_SECRET`
- `GEMINI_API_KEY`
- Any raw payout, bank, or customer secret


## Feature Flag Rollout Checklist

### Flags

- [x] Backend flags default to disabled: `AFFILIATE_REFERRAL_ENABLED=false`, `REFERRAL_ENABLED=false`, `AFFILIATE_ENABLED=false`, `ADMIN_COMMISSION_ENABLED=false`, `REFERRAL_COMMISSION_CREATION_ENABLED=false`.
- [x] Frontend flags default to disabled: `VITE_AFFILIATE_REFERRAL_ENABLED=false`, `VITE_REFERRAL_ENABLED=false`, `VITE_AFFILIATE_ENABLED=false`, `VITE_ADMIN_COMMISSION_ENABLED=false`.
- [x] Disabled referral routes fail safe.
- [x] Disabled affiliate routes fail safe.
- [x] Disabled admin commission routes fail safe.
- [x] Disabled commission creation flag does not fail payment webhook.
- [x] Disabled frontend flags hide Referral/Affiliate app tabs.
- [x] Disabled admin flag hides admin affiliate/referral/commission links and redirects direct route access.
- [ ] Manual QA: Phase 0 all flags off, existing POS/subscription flows still work.
- [ ] Manual QA: Phase 1 referral-only internal flow.
- [ ] Manual QA: Phase 2 affiliate-only beta partner flow.
- [ ] Manual QA: Phase 3 admin commission pages for admin team.
- [ ] Manual QA: Phase 4 payment webhook creates commission once after replay test.
- [ ] Manual QA: Phase 5 all flags enabled in production.

### Rollout Phases

1. Phase 0: all flags off.
2. Phase 1: enable `AFFILIATE_REFERRAL_ENABLED=true` and `REFERRAL_ENABLED=true`.
3. Phase 2: enable `AFFILIATE_ENABLED=true` for beta partners.
4. Phase 3: enable `ADMIN_COMMISSION_ENABLED=true` for admin team.
5. Phase 4: enable `REFERRAL_COMMISSION_CREATION_ENABLED=true` after verified Midtrans webhook test.
6. Phase 5: keep all flags enabled after production monitoring is stable.

## Rollback Checklist

If release fails:

1. Disable or hide frontend menu entries for Referral, Affiliate, and Admin affiliate pages in next frontend build.
2. Stop commission creation by disabling webhook commission sync path or gating feature server-side if feature flag exists.
3. Keep existing database records; do not hard-delete financial tables or rows.
4. Revert frontend deployment to previous build.
5. Revert backend deployment to previous build.
6. Keep migration in place unless a DBA-approved rollback confirms no financial data loss.
7. If migration rollback is unavoidable, backup affected tables first and obtain explicit approval.
8. Keep Midtrans webhook active for payment/subscription flow unless payment release itself is rolled back.
9. Record incident and manual payout/commission review list before re-release.

## Known Risks

- Production remote smoke failed in local environment because domains were unreachable from this sandbox; rerun from CI/VPN/production network.
- Backend env schema uses `RESEND_FROM_EMAIL` and `CLOUDFLARE_R2_PUBLIC_URL`, while release request names `EMAIL_FROM` and `CLOUDFLARE_R2_PUBLIC_BASE_URL`; map these in deployment or update env schema before final go-live.
- Frontend env currently documents `VITE_GA_MEASUREMENT_ID`, while release request names `VITE_GA4_MEASUREMENT_ID`; align before release.
- Migration runner has no dry-run mode; use backup plus staging apply before production apply.
- Real Midtrans refund behavior needs manual verification with dashboard/webhook replay.
- Resend domain/SPF/DKIM cannot be verified from local codebase.
- Cloudflare cache/WAF/R2 rules cannot be verified from local codebase.

## Release Decision

Recommendation: not ready for production cutover until external production checks pass:

- Midtrans production webhook configured and replay-tested.
- Resend domain/SPF/DKIM verified.
- Cloudflare CDN/WAF/R2 verified.
- Production database migration applied after backup.
- Remote production smoke test passes from an environment with network access.
