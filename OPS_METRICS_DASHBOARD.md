# Ops Metrics Dashboard KaffePOS

Dokumen ini menjelaskan sumber metrik operasional minimal untuk go-live.

## Metrik yang tersedia

View SQL: `public.ops_daily_metrics`

Kolom utama:

- `login_success_rate_pct`
- `checkout_success_rate_pct`
- `otp_success_rate_pct`
- `login_success_count`
- `checkout_success_count`
- `otp_success_count`

Event analytics tambahan juga dikirim ke GA4/Clarity melalui frontend service [src/lib/analytics/AnalyticsService.ts](/Users/macbook/kaffepos-new/kaffepos-v2/src/lib/analytics/AnalyticsService.ts). Event operasional backend tetap dicatat ke `public.ops_event_logs` bila flow memakai tracker backend.

## Sumber data

- Login: `public.ops_event_logs` dari tracker app
- Checkout: `public.ops_event_logs` dari flow checkout app
- Client runtime errors: `public.ops_event_logs` dengan `event_name='client_error'` dari `GlobalErrorBoundary` dan tab-level boundary
- OTP verification: `public.edge_function_events` dari edge function `verify-email-code`

## Event yang wajib dipantau saat Closed Beta

- `register`
- `login`
- `transaction_created`
- `first_transaction`
- `payment_started`
- `payment_success`
- `payment_failed`
- `upgrade_clicked`
- `upgrade_started`
- `upgrade_completed`
- `trial_started`
- `trial_day_10_prompt`
- `trial_day_13_prompt`
- `trial_ended`
- `gamification_used`
- `loyalty_used`
- `ai_insights_used`
- `pdf_exported`
- `feedback_submitted`
- `app_update_checked`
- `app_update_completed`
- `sync_error`
- `client_error`

## Query dasar

```sql
select *
from public.ops_daily_metrics
order by metric_date desc
limit 30;
```

## Query event beta

```sql
select event_name, count(*) as total
from public.ops_event_logs
where created_at >= now() - interval '7 days'
group by event_name
order by total desc;
```

## Catatan operasional

- Data login, checkout, feedback, app update, dan client runtime error mulai terisi setelah build/app yang memuat tracker event dipakai
- OTP success rate langsung memanfaatkan event backend yang sudah aktif
- View ini ditujukan untuk dashboard operasional admin/owner, bukan untuk client publik
- GA4/Clarity dipakai untuk insight perilaku produk; data sensitif transaksi tidak boleh dikirim sebagai payload analytics
