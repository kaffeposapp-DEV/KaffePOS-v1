# Backend API Migration Status

Dokumen ini merangkum finalisasi migrasi dari query langsung di client ke backend API KaffePOS.

## Sudah dipindahkan

- profile
- stores
- menu items
- inventory
- expenses
- subscriptions
- notifications
- transactions
- checkout
- payment webhook Midtrans
- subscription payment quote/create
- cash register
- cash flow
- local storage import
- AI insight
- ops metrics
- app version check dan update events
- beta feedback
- loyalty
- gamification/challenges
- Cloudflare asset helpers

## Auth final

Auth sekarang dikelola backend sendiri:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/verification/resend`
- `POST /api/auth/verification/confirm`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/reset`
- `GET /api/auth/session`
- `POST /api/auth/logout`

## Email final

Semua flow email auth, notifikasi langganan, invoice/receipt, trial reminder, dan feedback thank you memakai Resend dari backend.

## Payment final

Midtrans berjalan backend-only:

- `POST /api/subscriptions/payments/quote`
- `POST /api/subscriptions/payments/create`
- `POST /api/payments/midtrans/webhook`

Frontend tidak boleh menyimpan `VITE_MIDTRANS_*`. Secret, server key, client key, environment, dan webhook signature verification hanya di backend.

## Safe update final

Endpoint:

- `GET /api/app/version`
- `POST /api/app/update-events`

Tabel terkait:

- `schema_migrations`
- `app_versions`
- `app_update_events`

Command operasional:

```bash
cd backend
npm run backup:critical
npm run migrate
```

## Closed Beta final

Endpoint:

- `POST /api/beta-feedback`

Feedback disimpan ke database, masuk notifikasi admin, dan dapat memicu email `feedback thank you`.

## Bootstrap SQL

Jalankan [database/production-bootstrap.sql](/Users/macbook/kaffepos-new/kaffepos-v2/database/production-bootstrap.sql) agar:

- `profiles` tidak lagi tergantung ke `auth.users`
- `ai_insight_logs` mengarah ke `profiles`
- tabel `app_auth_credentials`
- tabel `app_auth_sessions`
- tabel `app_password_reset_tokens`

Migrasi tambahan setelah bootstrap awal ada di folder [backend/migrations](/Users/macbook/kaffepos-new/kaffepos-v2/backend/migrations) dan dijalankan melalui `npm run migrate`.

## Status deploy

- API publik: [api.kaffepos.my.id](https://api.kaffepos.my.id)
- Health check: [api.kaffepos.my.id/health](https://api.kaffepos.my.id/health)
- System status: [kaffepos.my.id/system-status](https://kaffepos.my.id/system-status)
