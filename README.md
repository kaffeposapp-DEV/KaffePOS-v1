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
VITE_CLOUDFLARE_CDN_BASE_URL=https://cdn.kaffepos.my.id
VITE_CLOUDFLARE_IMAGE_DELIVERY_URL=
VITE_GA_MEASUREMENT_ID=G-VNQJ3XPCGG
VITE_CLARITY_PROJECT_ID=wf7x39iiqr
VITE_SENTRY_DSN=
VITE_SENTRY_TRACES_SAMPLE_RATE=0
```

Midtrans key dan environment hanya dikonfigurasi di backend. Jangan tambahkan `VITE_MIDTRANS_*` ke frontend.

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
APP_VERSION=2.0.0-beta
MIN_SUPPORTED_WEB_VERSION=2.0.0
MIN_SUPPORTED_APK_VERSION=2.0.0
NODE_ENV=production
PORT=8787
LOG_LEVEL=info
ADMIN_EMAILS=kaffeposapp@gmail.com
SESSION_TTL_DAYS=30
EMAIL_CODE_TTL_MINUTES=10
PASSWORD_RESET_TTL_MINUTES=60
WEB_BASE_URL=https://kaffepos.my.id
API_BASE_URL=https://api.kaffepos.my.id

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_R2_BUCKET=kaffepos-assets
CLOUDFLARE_R2_PUBLIC_URL=https://cdn.kaffepos.my.id
CLOUDFLARE_IMAGES_ACCOUNT_HASH=
CLOUDFLARE_IMAGES_DELIVERY_URL=

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
MIDTRANS_IS_PRODUCTION=true
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
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
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0
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
npm run backup:critical
npm run migrate
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
- `GET /api/app/version`
- `POST /api/app/update-events`
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
- `POST /api/subscriptions/payments/quote`
- `POST /api/subscriptions/payments/create`
- `POST /api/payments/midtrans/webhook`
- `POST /api/beta-feedback`
- `GET /api/notifications`
- `POST /api/notifications/mark-read`
- `GET /api/transactions`
- `POST /api/transactions/checkout`
- `POST /api/ai-insight`

## Deploy singkat

1. Jalankan SQL bootstrap di [database/production-bootstrap.sql](/Users/macbook/kaffepos-new/kaffepos-v2/database/production-bootstrap.sql) untuk environment baru
2. Jalankan `npm run backup:critical` dari folder `backend` sebelum migration besar
3. Jalankan `npm run migrate` dari folder `backend`
4. Deploy backend dari folder `backend` ke Coolify via Dockerfile
5. Set domain API ke `api.kaffepos.my.id`
6. Set health check ke `/health`
7. Deploy web ke domain `kaffepos.my.id`
8. Tambahkan analytics/env Cloudflare bila sudah siap, lalu rebuild dan redeploy frontend
9. Jalankan smoke test login, verifikasi email, reset password, app version, feedback, load store, checkout, payment, history

Lanjutan detail DNS, SSL, Cloudflare, Coolify, Resend, GA, dan Clarity ada di [PRODUCTION_DEPLOYMENT_GUIDE.md](/Users/macbook/kaffepos-new/kaffepos-v2/PRODUCTION_DEPLOYMENT_GUIDE.md).

Panduan cutover Midtrans sandbox ke production ada di [MIDTRANS_SANDBOX_TO_PRODUCTION_SWITCH.md](/Users/macbook/kaffepos-new/kaffepos-v2/MIDTRANS_SANDBOX_TO_PRODUCTION_SWITCH.md).

Selama akun Midtrans production masih proses verifikasi, biarkan `SUBSCRIPTION_PAYMENT_MODE=auto`. Pada backend production yang masih memakai Midtrans sandbox, checkout online subscription otomatis ditutup dan user diarahkan ke aktivasi manual admin.
