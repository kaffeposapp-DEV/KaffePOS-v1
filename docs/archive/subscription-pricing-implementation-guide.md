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
npm --prefix backend run migrate
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

Backend sync also inserts a one-time notification when trial has 4, 2, or 1 day remaining:

- Title: `Trial Signature hampir selesai`
- Recommended plan: Signature
- Metadata key: `secangkir_trial_ending_<days>_days`

## Step-by-Step Release Guide

1. Deploy database migration with `npm --prefix backend run migrate`.
2. Deploy backend so registration calls `activateSecangkirTrial` and profile reads call `syncProfileSubscriptionState`.
3. Deploy frontend so Dashboard, Langganan, website pricing, feature prompts, and checkout share `src/lib/subscriptionPlans.ts`.
4. Register a new test account and confirm profile state becomes `tier = 'pro'`, `pro_plan = 'secangkir'`, and `pro_expires_at` is 14 days ahead.
5. Confirm Dashboard shows `Trial Signature` countdown and Langganan shows three cards: Secangkir, Kopi Susu, Signature.
6. Use admin or SQL time shift on staging to expire trial, then call `/api/subscriptions` or login again to trigger auto downgrade.
7. Confirm latest subscription becomes `kopi_susu` + `monthly` with `payment_amount = 49000` and previous trial becomes `expired`.
8. Run checkout smoke for Signature monthly and yearly to confirm upgrade remains available before trial ends.
