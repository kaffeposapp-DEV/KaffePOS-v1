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

## Sumber data

- Login: `public.ops_event_logs` dari tracker app
- Checkout: `public.ops_event_logs` dari flow checkout app
- Client runtime errors: `public.ops_event_logs` dengan `event_name='client_error'` dari `GlobalErrorBoundary` dan tab-level boundary
- OTP verification: `public.edge_function_events` dari edge function `verify-email-code`

## Query dasar

```sql
select *
from public.ops_daily_metrics
order by metric_date desc
limit 30;
```

## Catatan operasional

- Data login, checkout, dan client runtime error mulai terisi setelah build/app yang memuat tracker event dipakai
- OTP success rate langsung memanfaatkan event backend yang sudah aktif
- View ini ditujukan untuk dashboard operasional admin/owner, bukan untuk client publik
