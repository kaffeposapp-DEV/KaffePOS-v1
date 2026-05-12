# KaffePOS Subscription Pricing Implementation

## Final Tier Model

1. Secangkir
   - 14-day full Signature trial.
   - Uses `plan = 'secangkir'`, `billing_cycle = 'free'`, `tier = 'pro'`, and `expires_at = trial end`.
   - Frontend resolves active Secangkir trial to `accessPlan = 'signature'`.

2. Kopi Susu
   - 1 month Rp49.000, 3 months Rp129.000, 6 months Rp249.000, 12 months Rp449.000.
   - Default automatic conversion plan after Secangkir trial ends.

3. Signature
   - 1 month Rp129.000, 3 months Rp349.000, 6 months Rp649.000, 12 months Rp1.199.000.
   - Recommended plan and full premium tier.

## Database Changes

Run migration:

```bash
backend/migrations/20260512_0001_secangkir_trial.sql
```

Adds trial tracking columns to `public.subscriptions`:

- `trial_started_at`
- `trial_ends_at`
- `grace_ends_at`
- `converted_from_subscription_id`

## Registration Flow

`POST /api/auth/register` now creates:

- Owner profile
- Default store
- Active Secangkir subscription with 14-day expiry
- Notification that full Signature trial is active

## Trial Rollover

`syncProfileSubscriptionState` performs rollover when latest active Secangkir trial is expired:

- Marks trial subscription `expired`
- Creates active Kopi Susu monthly subscription
- Sets amount to Rp49.000
- Adds pending auto-billing history
- Updates profile subscription state

This sync runs on login/session/profile/subscription reads.

## Frontend Surfaces

- `src/components/subscription/PricingPage.tsx`: 3 pricing cards, duration toggle, yearly savings, comparison table, required Indonesian copy.
- `src/components/settings/SubscriptionSection.tsx`: active package, checkout, trial countdown, expiring trial alert.
- `src/components/dashboard/Dashboard.tsx`: dashboard trial countdown.
- `src/pages/LandingPage.tsx`: website pricing uses same `PricingPage`.

## Upgrade Prompts

Trial prompts fire on trial days 10, 12, and 13 via `AppShell`:

- Trigger keys: `trial_day_10`, `trial_day_12`, `trial_day_13`
- Recommended plan: Signature
- Cashier copy asks user to contact Owner/Admin.
