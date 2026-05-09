# KaffePOS v2

KaffePOS sekarang berjalan tanpa dependensi backend lama, dengan arsitektur:

- Web: `https://kaffepos.my.id`
- API: `https://api.kaffepos.my.id`
- Backend: Express + PostgreSQL
- Infra: Contabo VPS + Coolify + Cloudflare
- Email: Resend
- Payment: Midtrans (subscription)
- Analytics: Google Analytics + Microsoft Clarity

## Struktur penting

- [frontend env](/Users/macbook/kaffepos-new/kaffepos-v2/.env.example)
- [backend env](/Users/macbook/kaffepos-new/kaffepos-v2/backend/.env.example)
- [PRD / product source of truth](/Users/macbook/kaffepos-new/kaffepos-v2/PRD_KAFFEPOS_V2.md)
- [RFC index / decision records](/Users/macbook/kaffepos-new/kaffepos-v2/docs/rfc/README.md)
- [backend API](/Users/macbook/kaffepos-new/kaffepos-v2/backend/src/index.ts)
- [midtrans switch guide](/Users/macbook/kaffepos-new/kaffepos-v2/MIDTRANS_SANDBOX_TO_PRODUCTION_SWITCH.md)
- [frontend API client](/Users/macbook/kaffepos-new/kaffepos-v2/src/lib/backendApi.ts)
- [auth session client](/Users/macbook/kaffepos-new/kaffepos-v2/src/lib/authSession.ts)
- [database bootstrap SQL](/Users/macbook/kaffepos-new/kaffepos-v2/database/production-bootstrap.sql)
- [production guide](/Users/macbook/kaffepos-new/kaffepos-v2/PRODUCTION_DEPLOYMENT_GUIDE.md)

## Frontend env

```env
VITE_API_BASE_URL=
VITE_APP_NAME=KaffePOS
VITE_APP_VERSION=2.0.0
VITE_GA_MEASUREMENT_ID=G-VNQJ3XPCGG
VITE_CLARITY_PROJECT_ID=wf7x39iiqr
VITE_MIDTRANS_CLIENT_KEY=
VITE_MIDTRANS_ENVIRONMENT=production
```

Biarkan `VITE_API_BASE_URL` kosong jika:

- local dev memakai proxy Vite ke `http://localhost:8787`
- production memakai fallback otomatis ke `https://api.kaffepos.my.id`

Untuk analytics:

- `VITE_GA_MEASUREMENT_ID` mengaktifkan Google Analytics
- `VITE_CLARITY_PROJECT_ID` mengaktifkan Microsoft Clarity
- nilai production KaffePOS saat ini:
  - `VITE_GA_MEASUREMENT_ID=G-VNQJ3XPCGG`
  - `VITE_CLARITY_PROJECT_ID=wf7x39iiqr`
- perubahan kedua env ini baru terbaca saat frontend dibuild ulang, jadi setelah mengisi atau mengganti nilainya di service `KaffePOS Web`, frontend wajib diredeploy

## Backend env

Salin [backend/.env.example](/Users/macbook/kaffepos-new/kaffepos-v2/backend/.env.example) ke `backend/.env`.

Nilai minimal production:

```env
SERVICE_NAME=kaffepos-backend
APP_VERSION=1.0.0
NODE_ENV=production
PORT=8787
LOG_LEVEL=info
ADMIN_EMAILS=kaffeposapp@gmail.com
SESSION_TTL_DAYS=30
EMAIL_CODE_TTL_MINUTES=10
PASSWORD_RESET_TTL_MINUTES=60
WEB_BASE_URL=https://kaffepos.my.id
API_BASE_URL=https://api.kaffepos.my.id

DB_HOST=kaffepos-postgres
DB_PORT=5432
DB_NAME=kaffepos_production
DB_USER=kaffepos
DB_PASSWORD=replace-me
DB_SSL=false
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=

RESEND_API_KEY=
RESEND_FROM_EMAIL=KaffePOS <no-reply@kaffepos.my.id>
MIDTRANS_ENVIRONMENT=production
MIDTRANS_SERVER_KEY=
MIDTRANS_MERCHANT_ID=
MIDTRANS_SNAP_ENABLED=true
MIDTRANS_WEBHOOK_BASE_URL=https://api.kaffepos.my.id
MIDTRANS_FINISH_URL=https://kaffepos.my.id/settings?billing=success
MIDTRANS_UNFINISH_URL=https://kaffepos.my.id/settings?billing=pending
MIDTRANS_ERROR_URL=https://kaffepos.my.id/settings?billing=failed
SUBSCRIPTION_PAYMENT_MODE=auto
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_LOGIN_RATE_LIMIT_MAX=10
AUTH_EMAIL_RATE_LIMIT_MAX=5
AUTH_VERIFY_RATE_LIMIT_MAX=20
PAYMENT_CREATE_RATE_LIMIT_MAX=12
GEMINI_API_KEY=
CORS_ORIGIN=https://kaffepos.my.id,https://www.kaffepos.my.id,https://api.kaffepos.my.id,capacitor://localhost,https://localhost,http://localhost,http://localhost:4173,http://127.0.0.1:4173
```

## Command run/build

```bash
# frontend
npm install
npm run dev
npm run build
npm run build:mobile

# backend
cd backend
npm install
npm run dev
npm run check
npm run start
```

## Android / APK

```bash
npm run cap:sync
npm run build-apk-debug
npm run build-apk-release
cd android && ./gradlew assembleRelease
```

## Endpoint utama

- `GET /health`
- `GET /health/db`
- `GET /system-status` publik, sudah direduksi untuk display readiness
- `GET /api/admin/system-status` detail operasional untuk admin
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/verification/resend`
- `POST /api/auth/verification/confirm`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/reset`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/profile/me`
- `GET /api/stores`
- `GET /api/menu-items`
- `GET /api/inventory`
- `GET /api/expenses`
- `GET /api/subscriptions`
- `POST /api/subscriptions/payments/create`
- `POST /api/payments/midtrans/webhook`
- `GET /api/notifications`
- `GET /api/transactions`
- `POST /api/transactions/checkout`

## Deploy singkat

1. Jalankan SQL bootstrap di [database/production-bootstrap.sql](/Users/macbook/kaffepos-new/kaffepos-v2/database/production-bootstrap.sql)
2. Deploy backend dari folder `backend` ke Coolify via Dockerfile
3. Set domain API ke `api.kaffepos.my.id`
4. Set health check ke `/health`
5. Deploy web ke domain `kaffepos.my.id`
6. Tambahkan analytics env bila sudah siap, lalu rebuild dan redeploy frontend
7. Jalankan smoke test login, verifikasi email, reset password, load store, checkout, history

Lanjutan detail DNS, SSL, Cloudflare, Coolify, Resend, GA, dan Clarity ada di [PRODUCTION_DEPLOYMENT_GUIDE.md](/Users/macbook/kaffepos-new/kaffepos-v2/PRODUCTION_DEPLOYMENT_GUIDE.md).

Panduan cutover Midtrans sandbox ke production ada di [MIDTRANS_SANDBOX_TO_PRODUCTION_SWITCH.md](/Users/macbook/kaffepos-new/kaffepos-v2/MIDTRANS_SANDBOX_TO_PRODUCTION_SWITCH.md).

Selama akun Midtrans production masih proses verifikasi, biarkan `SUBSCRIPTION_PAYMENT_MODE=auto`. Pada backend production yang masih memakai Midtrans sandbox, checkout online subscription otomatis ditutup dan user diarahkan ke aktivasi manual admin.
