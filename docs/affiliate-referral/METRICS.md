# KaffePOS Affiliate & Referral Metrics

| Metric Name | Formula | Data Source | Owner | Review Frequency |
| --- | --- | --- | --- | --- |
| `referral_clicks` | Count referral clicks | `referral_clicks` | Product/Admin Ops | Daily |
| `referral_registrations` | Count referral registrations | `referral_registrations` | Product/Admin Ops | Daily |
| `referral_trial_started` | Count referral registrations where `trial_started_at` is not null or status `trial_started` | `referral_registrations` | Product/Admin Ops | Weekly |
| `referral_paid_conversions` | Count referral registrations where `first_payment_at` is not null or status in `paid`, `eligible`, `rewarded` | `referral_registrations` | Product/Admin Ops | Daily |
| `referral_conversion_rate` | `referral_paid_conversions / referral_clicks * 100` | `referral_clicks`, `referral_registrations` | Product/Admin Ops | Weekly |
| `affiliate_applications` | Count affiliate profiles created | `affiliate_profiles` | Support Admin | Daily |
| `active_affiliates` | Count affiliate profiles where status `active` | `affiliate_profiles` | Product/Admin Ops | Weekly |
| `affiliate_paid_conversions` | Count affiliate referral registrations with first payment | `referral_registrations` where `referral_type='affiliate'` | Product/Admin Ops | Weekly |
| `pending_commission_amount` | Sum commission amount where status `pending` | `commission_transactions` | Finance Admin | Daily |
| `eligible_commission_amount` | Sum commission amount where status `eligible` | `commission_transactions` | Finance Admin | Daily |
| `approved_commission_amount` | Sum commission amount where status `approved` | `commission_transactions` | Finance Admin | Daily |
| `paid_commission_amount` | Sum commission amount where status `paid` | `commission_transactions` | Finance Admin | Weekly |
| `rejected_commission_amount` | Sum commission amount where status `rejected` | `commission_transactions` | Finance Admin | Weekly |
| `cancelled_commission_amount` | Sum commission amount where status `cancelled` | `commission_transactions` | Finance Admin | Weekly |
| `commission_payout_ratio` | `paid_commission_amount / approved_commission_amount * 100` for selected period | `commission_transactions` | Finance Admin | Weekly |
| `fraud_rate` | `(rejected_commissions + suspended_affiliate_cases) / total_commissions_or_affiliates * 100` | `commission_transactions`, `affiliate_profiles`, admin notes | Product/Admin Ops | Weekly |
| `refund_rate` | Refunded/cancelled paid referrals divided by paid referral conversions | payment sessions/orders, `commission_transactions`, `referral_registrations` | Finance Admin | Weekly |
| `referred_user_churn` | Referred users cancelled/expired within selected period divided by referred paid users | subscriptions, `referral_registrations` | Product/Admin Ops | Monthly |
| `referred_user_ltv` | Average revenue from referred users over lifetime | payment history/subscriptions joined to `referral_registrations` | Product/Admin Ops | Monthly |
| `affiliate_cac` | `paid_commission_amount / affiliate_paid_conversions` | `commission_transactions`, `referral_registrations` | Product/Admin Ops | Monthly |
| `invalid_referral_code_attempts` | Count public referral route invalid responses | application logs `referral_invalid` / route telemetry if enabled | Product/Admin Ops | Daily during rollout |
| `duplicate_commission_attempts` | Count commission sync returning existing commission | logs `payment_webhook_duplicate_ignored`, `commission_transactions` unique constraint monitoring | Finance Admin | Daily during rollout |
| `webhook_signature_failures` | Count invalid Midtrans webhook signatures | `payment_webhook_logs`, app logs `payment_webhook_signature_failed` | Product/Admin Ops | Daily |
| `commission_creation_failures` | Count webhook commission sync errors/failures | app logs, error tracking | Product/Admin Ops | Daily during rollout |
| `high_volume_affiliates` | Affiliates above P95 click/registration/paid conversion volume | `referral_clicks`, `referral_registrations`, `affiliate_profiles` | Product/Admin Ops | Weekly |

## Data Privacy Rules

- Metrics must use IDs, counts, statuses, and amounts only.
- Do not export raw payout account numbers.
- Do not export raw IP addresses; use `ip_hash` only.
- Do not send customer email/phone/name to analytics dashboards unless explicitly privacy-reviewed.
- Admin notes may contain sensitive operational context; restrict access to admin-only systems.

## Suggested Dashboard Sections

1. Referral funnel: clicks → registrations → trials → paid conversions.
2. Affiliate health: applications, active/suspended affiliates, high-volume affiliates.
3. Commission pipeline: pending, eligible, approved, paid, rejected, cancelled amounts.
4. Payment sync: webhook received, signature failed, success processed, duplicate ignored, commission created/skipped.
5. Fraud review: suspicious IP hash/device/user agent patterns, refund rate, rejected rate.
6. Finance payout: approved payout queue, paid amount, payout ratio, aging.
