# Production Deployment Guide

## 1. Database

Untuk environment baru, jalankan [database/production-bootstrap.sql](/Users/macbook/kaffepos-new/kaffepos-v2/database/production-bootstrap.sql) ke PostgreSQL production.

Tujuannya:

- melepas relasi lama ke `auth.users`
- membuat tabel auth internal
- menyiapkan session dan password reset token
- backfill kredensial dasar dari `profiles`

Untuk environment yang sudah hidup, jangan ulang bootstrap tanpa review. Jalankan backup dan migrasi terkontrol:

```bash
cd backend
npm run backup:critical
npm run migrate
```

Migration runner menyimpan checksum di tabel `migrations`. Versioning aplikasi disimpan di `app_versions` dan event update user/store dicatat di `app_update_events`.

## 2. Coolify backend

- Repository root: project ini
- Base Directory: `backend`
- Build Pack: `Dockerfile`
- Dockerfile Location: `Dockerfile`
- Port Exposes: `8787`
- Healthcheck:
  - method: `GET`
  - host: `localhost`
  - port: `8787`
  - path: `/health`
- Domain: `https://api.kaffepos.my.id`

### Backend env

```env
NODE_ENV=production
PORT=8787
SERVICE_NAME=kaffepos-backend
APP_VERSION=2.0.0-beta
MIN_SUPPORTED_WEB_VERSION=2.0.0
MIN_SUPPORTED_APK_VERSION=2.0.0
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
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0
CORS_ORIGIN=https://kaffepos.my.id,https://www.kaffepos.my.id,https://api.kaffepos.my.id,https://localhost,capacitor://localhost,http://localhost
```

APK build baru memakai origin final `https://localhost`. `http://localhost` tetap ada di allowlist hanya untuk APK lama/transisi; jangan tambahkan origin dev seperti `http://localhost:4173` ke env production.

## 3. Cloudflare

DNS minimum:

```text
A   @    84.247.150.77
A   api  84.247.150.77
```

Rekomendasi:

- Proxy Cloudflare: aktif setelah origin stabil
- SSL mode: `Full (strict)`
- Always Use HTTPS: aktif
- Automatic HTTPS Rewrites: aktif
- Static assets memakai header dari [public/_headers](/Users/macbook/kaffepos-new/kaffepos-v2/public/_headers)
- Branded fallback page ada di [public/404.html](/Users/macbook/kaffepos-new/kaffepos-v2/public/404.html)
- Asset/logo/image bisa diarahkan ke `VITE_CLOUDFLARE_CDN_BASE_URL` atau `CLOUDFLARE_R2_PUBLIC_URL`
- Jangan cache HTML terlalu lama; cache agresif hanya untuk hashed assets `/assets/*`

## 4. Web deploy

Frontend harus membaca API yang sama:

```env
VITE_API_BASE_URL=https://api.kaffepos.my.id
VITE_APP_VERSION=2.0.0
VITE_CLOUDFLARE_CDN_BASE_URL=https://cdn.kaffepos.my.id
VITE_CLOUDFLARE_IMAGE_DELIVERY_URL=
VITE_GA_MEASUREMENT_ID=G-VNQJ3XPCGG
VITE_CLARITY_PROJECT_ID=wf7x39iiqr
VITE_SENTRY_DSN=
VITE_SENTRY_TRACES_SAMPLE_RATE=0
```

Midtrans secret, server key, client key, dan environment hanya boleh berada di backend env. Jangan set `VITE_MIDTRANS_*` di frontend.

## 5. Resend

Yang perlu disiapkan:

- domain sender terverifikasi di Resend
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Flow email yang dipakai:

- registration OTP
- resend verification OTP
- password reset
- welcome email
- subscription activation / cancellation
- trial reminder hari ke-10 dan ke-13
- invoice / receipt
- feedback thank you

## 6. Google Analytics + Microsoft Clarity

Frontend mendukung:

- `VITE_GA_MEASUREMENT_ID`
- `VITE_CLARITY_PROJECT_ID`
- nilai KaffePOS production saat ini:
  - Google Analytics: `G-VNQJ3XPCGG`
  - Microsoft Clarity: `wf7x39iiqr`

Jika kosong, script analytics tidak dimuat.
Karena frontend dibuild dengan Vite, perubahan env analytics tidak akan terbaca otomatis di runtime. Setelah mengisi atau mengganti nilai env di service `KaffePOS Web`, frontend harus dibuild ulang dan diredeploy.

Checklist aktivasi:

1. isi `VITE_GA_MEASUREMENT_ID`
2. isi `VITE_CLARITY_PROJECT_ID`
3. redeploy frontend `KaffePOS Web`
4. buka `/system-status`
5. pastikan card Analytics menunjukkan `Configured: Ya`
6. verifikasi dashboard GA dan Clarity mulai menerima traffic

Troubleshooting jika dashboard masih menulis tag belum terdeteksi:

1. cek bundle live di `https://kaffepos.my.id` benar-benar berubah setelah deploy
2. cari file `assets/analytics-*.js` terbaru di HTML production
3. pastikan file itu berisi `G-VNQJ3XPCGG` dan `wf7x39iiqr`
4. jika bundle masih memuat env kosong, berarti env tidak terbaca saat build
5. jika domain live masih served dari panel hosting lain seperti Hostinger/LiteSpeed, pastikan deploy terbaru benar-benar masuk ke host yang sedang melayani `kaffepos.my.id`

## 7. Midtrans

Konfigurasi yang dipakai:

- `POST /api/subscriptions/payments/create` untuk membuat link pembayaran subscription
- `POST /api/subscriptions/payments/quote` untuk estimasi harga sebelum create payment
- `POST /api/payments/midtrans/webhook` untuk settlement webhook

Rekomendasi rollout:

- pakai Midtrans untuk `subscription` dulu
- tetap biarkan checkout POS berjalan lewat flow internal sampai QRIS kasir benar-benar siap
- selama akun Midtrans production belum approved, biarkan `SUBSCRIPTION_PAYMENT_MODE=auto`; backend production + Midtrans sandbox otomatis mematikan checkout online dan frontend akan mengarahkan user ke aktivasi manual admin
- setelah Midtrans production approved dan webhook real lulus smoke test, set `MIDTRANS_ENVIRONMENT=production` dan tetap gunakan `SUBSCRIPTION_PAYMENT_MODE=auto` atau eksplisit `SUBSCRIPTION_PAYMENT_MODE=midtrans_production`
- panduan cutover sandbox ke production ada di [MIDTRANS_SANDBOX_TO_PRODUCTION_SWITCH.md](/Users/macbook/kaffepos-new/kaffepos-v2/MIDTRANS_SANDBOX_TO_PRODUCTION_SWITCH.md)

## 8. Monitoring

Endpoint utama:

- [health](/Users/macbook/kaffepos-new/kaffepos-v2/backend/src/index.ts#L815)
- [health/db](/Users/macbook/kaffepos-new/kaffepos-v2/backend/src/index.ts#L845)
- [system-status](/Users/macbook/kaffepos-new/kaffepos-v2/backend/src/index.ts#L862)
- `GET /api/app/version`
- `POST /api/app/update-events`

Log penting di Coolify:

- `startup.boot`
- `startup.dependencies_ready`
- `startup.listening`
- `request.completed`
- `request.api_error`
- `request.unhandled_error`
- `shutdown.started`

## 9. Smoke test wajib

1. daftar akun baru
2. verifikasi OTP email
3. login
4. buka dashboard dan store
5. load menu & inventory
6. checkout transaksi
7. buat pembayaran subscription via Midtrans
8. cek webhook settlement masuk
9. cek subscription aktif dan sinkron ke web/APK
10. cek `/api/app/version` dan soft update banner
11. kirim feedback beta dari app
12. cek event GA4/Clarity untuk login, register, first transaction, payment success, pdf export, feedback submitted
13. cek history
14. kirim forgot password
15. reset password dari email
16. login ulang di web dan APK

## 10. Kitchen / Order Checker realtime

Fitur Kitchen Display System memakai tabel `kitchen_orders`, `kitchen_order_items`, dan `kitchen_order_events`.

Deploy cepat:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/kitchen-order-checker-migration.sql
```

Setelah backend dan frontend redeploy, jalankan:

```bash
bash scripts/verify-kds-deploy.sh
```

Runbook lengkap ada di [DEPLOY_KITCHEN_CHECKER.md](/Users/macbook/kaffepos-new/kaffepos-v2/DEPLOY_KITCHEN_CHECKER.md).
