# Production Deployment Guide

## 1. Database

Jalankan [database/production-bootstrap.sql](/Users/macbook/kaffepos-new/kaffepos-v2/database/production-bootstrap.sql) ke PostgreSQL production.

Tujuannya:

- melepas relasi lama ke `auth.users`
- membuat tabel auth internal
- menyiapkan session dan password reset token
- backfill kredensial dasar dari `profiles`

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
APP_VERSION=1.0.0
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

RESEND_API_KEY=
RESEND_FROM_EMAIL=KaffePOS <no-reply@kaffepos.my.id>
MIDTRANS_ENVIRONMENT=sandbox
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
CORS_ORIGIN=https://kaffepos.my.id,https://www.kaffepos.my.id,https://api.kaffepos.my.id,capacitor://localhost,http://localhost,http://localhost:4173,http://127.0.0.1:4173
```

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

## 4. Web deploy

Frontend harus membaca API yang sama:

```env
VITE_API_BASE_URL=https://api.kaffepos.my.id
VITE_GA_MEASUREMENT_ID=G-VNQJ3XPCGG
VITE_CLARITY_PROJECT_ID=wf7x39iiqr
VITE_MIDTRANS_CLIENT_KEY=
VITE_MIDTRANS_ENVIRONMENT=sandbox
```

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
10. cek history
11. kirim forgot password
12. reset password dari email
13. login ulang di web dan APK
