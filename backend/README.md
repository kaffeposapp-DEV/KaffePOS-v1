# KaffePOS Backend API

Backend ini dipakai sebagai pusat data dan auth untuk Web serta APK KaffePOS.

## Runtime

- Node.js 20
- Express
- PostgreSQL
- Resend
- Midtrans
- Coolify-ready Dockerfile

## Scripts

```bash
cd backend
npm install
npm run dev
npm run typecheck
npm run build
npm run start
```

## Env

Gunakan [backend/.env.example](/Users/macbook/kaffepos-new/kaffepos-v2/backend/.env.example).

Variabel penting:

```env
NODE_ENV=production
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
MIDTRANS_ENVIRONMENT=sandbox
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_MERCHANT_ID=
MIDTRANS_SNAP_ENABLED=true
MIDTRANS_WEBHOOK_BASE_URL=https://api.kaffepos.my.id
ADMIN_EMAILS=kaffeposapp@gmail.com
```

## Health & status

- `GET /health`
- `GET /health/db`
- `GET /system-status`

Contoh:

```bash
curl https://api.kaffepos.my.id/health
curl https://api.kaffepos.my.id/health/db
curl https://api.kaffepos.my.id/system-status
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

Semua email dikirim via Resend dari backend, tanpa edge function eksternal.

## Coolify

Atur service dengan:

- Base Directory: `backend`
- Dockerfile Location: `Dockerfile`
- Port Exposes: `8787`
- Health check: `GET http://localhost:8787/health`
- Domain: `https://api.kaffepos.my.id`

## Database bootstrap

Sebelum cutover penuh, jalankan [database/production-bootstrap.sql](/Users/macbook/kaffepos-new/kaffepos-v2/database/production-bootstrap.sql) ke database production agar relasi lama ke `auth.users` dilepas dan tabel auth baru tersedia.
