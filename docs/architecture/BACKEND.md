# KaffePOS Backend API

Backend ini dipakai sebagai pusat data dan auth untuk Web serta APK KaffePOS.

## Runtime

- Node.js 20
- Express
- PostgreSQL
- Resend
- Midtrans
- Cloudflare asset helper
- Coolify-ready Dockerfile

## Scripts

```bash
cd backend
npm install
npm run dev
npm run typecheck
npm run build
npm run backup:critical
npm run migrate
npm run start
```

## Env

Gunakan [backend/.env.example](/Users/macbook/kaffepos-new/kaffepos-v2/backend/.env.example).

Variabel penting:

```env
NODE_ENV=production
APP_VERSION=2.0.0-beta
MIN_SUPPORTED_WEB_VERSION=2.0.0
MIN_SUPPORTED_APK_VERSION=2.0.0
PORT=8787
DB_HOST=kaffepos-postgres
DB_PORT=5432
DB_NAME=kaffepos_production
DB_USER=kaffepos
DB_PASSWORD=replace-me
DB_SSL=false
WEB_BASE_URL=https://kaffepos.my.id
API_BASE_URL=https://api.kaffepos.my.id
RESEND_API_KEY=
RESEND_FROM_EMAIL=KaffePOS <no-reply@kaffepos.my.id>
CLOUDFLARE_R2_PUBLIC_URL=https://cdn.kaffepos.my.id
MIDTRANS_ENVIRONMENT=production
MIDTRANS_IS_PRODUCTION=true
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_MERCHANT_ID=
MIDTRANS_SNAP_ENABLED=true
MIDTRANS_WEBHOOK_BASE_URL=https://api.kaffepos.my.id
ADMIN_EMAILS=kaffeposapp@gmail.com
```

Catatan:

- `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID`, `MIDTRANS_IS_PRODUCTION`, dan `MIDTRANS_ENVIRONMENT` hanya disimpan di backend env.
- Frontend tidak memakai `VITE_MIDTRANS_*` dan tidak menerima Midtrans key; frontend hanya menerima `snap_token` atau `payment_url` dari backend.
- Panduan cutover ada di [MIDTRANS_SANDBOX_TO_PRODUCTION_SWITCH.md](/Users/macbook/kaffepos-new/kaffepos-v2/MIDTRANS_SANDBOX_TO_PRODUCTION_SWITCH.md).

## Health & status

- `GET /health`
- `GET /health/db`
- `GET /system-status`
- `GET /api/app/version`
- `POST /api/app/update-events`

Contoh:

```bash
curl https://api.kaffepos.my.id/health
curl https://api.kaffepos.my.id/health/db
curl https://api.kaffepos.my.id/system-status
curl https://api.kaffepos.my.id/api/app/version
```

## Logging

Log dikirim ke stdout/stderr dalam format JSON lines dan cocok untuk Coolify:

- `startup.boot`
- `startup.dependencies_ready`
- `startup.listening`
- `request.completed`
- `request.api_error`
- `request.unhandled_error`
- `shutdown.started`
- `process.unhandled_rejection`
- `process.uncaught_exception`

## Auth & email

Backend mengelola:

- register
- login
- session validation
- logout
- OTP email verification
- password reset
- subscription email notification
- Midtrans subscription payment session + webhook settlement
- trial reminder email
- invoice / receipt email
- feedback thank you email

Semua email dikirim via Resend dari backend, tanpa edge function eksternal.

## Coolify

Atur service dengan:

- Base Directory: `backend`
- Dockerfile Location: `Dockerfile`
- Port Exposes: `8787`
- Health check: `GET http://localhost:8787/health`
- Domain: `https://api.kaffepos.my.id`

## Database bootstrap & migration

Untuk environment baru, jalankan [database/production-bootstrap.sql](/Users/macbook/kaffepos-new/kaffepos-v2/database/production-bootstrap.sql) ke database production agar relasi lama ke `auth.users` dilepas dan tabel auth baru tersedia.

Untuk environment existing, gunakan migrasi versioned:

```bash
cd backend
npm run backup:critical
npm run migrate
```

Migrasi mencatat checksum di tabel `schema_migrations`. Versioning aplikasi memakai `app_versions`; event update memakai `app_update_events`.
