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
- cash register
- cash flow
- local storage import
- AI insight
- ops metrics

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

Semua flow email auth dan notifikasi langganan memakai Resend dari backend.

## Bootstrap SQL

Jalankan [database/production-bootstrap.sql](/Users/macbook/kaffepos-new/kaffepos-v2/database/production-bootstrap.sql) agar:

- `profiles` tidak lagi tergantung ke `auth.users`
- `ai_insight_logs` mengarah ke `profiles`
- tabel `app_auth_credentials`
- tabel `app_auth_sessions`
- tabel `app_password_reset_tokens`

## Status deploy

- API publik: [api.kaffepos.my.id](https://api.kaffepos.my.id)
- Health check: [api.kaffepos.my.id/health](https://api.kaffepos.my.id/health)
- System status: [kaffepos.my.id/system-status](https://kaffepos.my.id/system-status)
