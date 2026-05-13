# KaffePOS Final Release Checklist

Checklist ini dipakai sebelum go-live production atau sebelum APK debug/release di-install ke device kasir. Jangan tempel secret ke dokumen ini.

## 1. Coolify

- Backend service: `KaffePOS API`
- Frontend service: `KaffePOS Web`
- Backend healthcheck: `GET /health`
- Backend start command: `npm run start:coolify` atau `node dist/index.js`
- Backend build command: `npm install && npm run build`
- Frontend build command: `npm install && npm run build:web`
- Frontend publish directory: `dist`
- Backend env production:
  - `NODE_ENV=production`
  - `APP_VERSION=2.0.0-beta`
  - `MIN_SUPPORTED_WEB_VERSION=2.0.0`
  - `MIN_SUPPORTED_APK_VERSION=2.0.0`
  - `WEB_BASE_URL=https://kaffepos.my.id`
  - `API_BASE_URL=https://api.kaffepos.my.id`
  - `CORS_ORIGIN=https://kaffepos.my.id,https://www.kaffepos.my.id,https://api.kaffepos.my.id,https://localhost,capacitor://localhost,http://localhost`
  - `DATABASE_URL` atau `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL=KaffePOS <no-reply@kaffepos.my.id>`
  - `CLOUDFLARE_R2_PUBLIC_URL=https://cdn.kaffepos.my.id`
  - `MIDTRANS_ENVIRONMENT=production`
  - `MIDTRANS_SERVER_KEY`
  - `MIDTRANS_CLIENT_KEY`
  - `MIDTRANS_MERCHANT_ID`
  - `MIDTRANS_SNAP_ENABLED=true`
  - `MIDTRANS_WEBHOOK_BASE_URL=https://api.kaffepos.my.id`
  - `SUBSCRIPTION_PAYMENT_MODE=auto`
- Frontend env production:
  - `VITE_API_BASE_URL=https://api.kaffepos.my.id` atau kosong untuk fallback production
  - `VITE_APP_VERSION=2.0.0`
  - `VITE_CLOUDFLARE_CDN_BASE_URL=https://cdn.kaffepos.my.id`
  - `VITE_CLARITY_PROJECT_ID=wf7x39iiqr`
  - `VITE_GA_MEASUREMENT_ID=G-VNQJ3XPCGG`
  - Tidak ada `VITE_MIDTRANS_*`; Snap token/payment URL dibuat backend.
- Tidak ada env `SUPABASE_*` atau `VITE_SUPABASE_*`.
- Jalankan validasi config:

```bash
RELEASE_CHANNEL=production \
NODE_ENV=production \
WEB_BASE_URL=https://kaffepos.my.id \
API_BASE_URL=https://api.kaffepos.my.id \
CORS_ORIGIN=https://kaffepos.my.id,https://www.kaffepos.my.id,https://api.kaffepos.my.id,https://localhost,capacitor://localhost,http://localhost \
MIDTRANS_ENVIRONMENT=production \
MIDTRANS_IS_PRODUCTION=true \
MIDTRANS_SERVER_KEY=*** \
MIDTRANS_CLIENT_KEY=*** \
MIDTRANS_MERCHANT_ID=*** \
VITE_CLARITY_PROJECT_ID=wf7x39iiqr \
SENTRY_DSN=https://public@sentry.example/1 \
VITE_SENTRY_DSN=https://public@sentry.example/1 \
RESEND_API_KEY=*** \
RESEND_FROM_EMAIL='KaffePOS <no-reply@kaffepos.my.id>' \
npm run release:verify-config
```

## 2. Cloudflare

- `kaffepos.my.id` menuju frontend Coolify.
- `www.kaffepos.my.id` redirect atau CNAME ke web utama.
- `api.kaffepos.my.id` menuju backend Coolify.
- SSL/TLS mode: `Full (strict)` jika origin certificate valid.
- Always Use HTTPS: aktif.
- API caching: bypass untuk `api.kaffepos.my.id/*`.
- Web caching: boleh cache static assets, jangan cache HTML app shell terlalu agresif saat release.
- Static cache mengikuti [public/_headers](/Users/macbook/kaffepos-new/kaffepos-v2/public/_headers); cache panjang hanya untuk hashed assets.
- Pastikan tidak ada mixed content HTTP dari web/APK.

## 3. Midtrans

- Dashboard Midtrans memakai environment production.
- Notification URL:
  - `https://api.kaffepos.my.id/api/payments/midtrans/webhook`
- Frontend tidak memakai Midtrans key.
- Backend memakai production server key, client key, dan merchant id.
- Metode aktif sesuai produk:
  - QRIS
  - BCA VA
  - Mandiri Bill / `echannel`
  - BNI VA
  - BRI VA
- Smoke:
  - pending tetap pending
  - settlement membuka lisensi
  - cancel/expire/deny tidak membuka lisensi
  - webhook replay tidak membuat subscription dobel

## 4. Clarity

- `VITE_CLARITY_PROJECT_ID=wf7x39iiqr` ada di frontend production.
- `SENTRY_DSN` ada di backend production.
- `VITE_SENTRY_DSN` ada di frontend production.
- Jalankan `npm --prefix backend run backup:critical` sebelum deploy/migration besar.
- Jalankan `npm --prefix backend run migrate` di staging lalu production setelah backup hijau.
- Tracking script hanya muncul satu kali dengan id `kaffepos-clarity`.
- Verifikasi setelah deploy:
  - buka `https://kaffepos.my.id`
  - login dan pindah tab
  - cek Clarity dashboard menerima session baru
  - cek `/system-status` untuk warning analytics frontend

## 5. PostgreSQL / Backend

- Jalankan backup sebelum migration/bootstrap.
- Untuk environment baru, jalankan `database/production-bootstrap.sql`.
- Untuk environment existing, jangan ulang bootstrap tanpa review.
- Jalankan migration versioned terbaru:

```bash
npm --prefix backend run backup:critical
npm --prefix backend run migrate
```

- Pastikan tabel `migrations`, `app_versions`, dan `app_update_events` tersedia setelah migrasi.
- Validasi:

```bash
curl -fsS https://api.kaffepos.my.id/health
curl -fsS https://api.kaffepos.my.id/health/db
curl -fsS https://api.kaffepos.my.id/system-status
curl -fsS https://api.kaffepos.my.id/api/app/version
```

- Pastikan `warnings` kosong atau hanya warning non-blocking yang disetujui.
- Jalankan smoke blocker production:

```bash
npm run smoke:production:readiness
```

- Untuk staging production-like, jalankan smoke stok transaksional:

```bash
KAFFEPOS_API_BASE_URL=https://api-staging.kaffepos.my.id \
KAFFEPOS_OWNER_EMAIL=owner-staging@example.com \
KAFFEPOS_OWNER_PASSWORD='isi-di-terminal' \
KAFFEPOS_STOCK_SMOKE_CONFIRM=1 \
npm run smoke:staging:stock
```

Smoke ini wajib membuktikan import stok, checkout pemotongan stok, replay idempotent, void restore, alias `/api/v1/transactions`, pagination metadata, dan opname stok tersimpan lalu terbaca ulang.

## 6. Android USB Debugging

- Aktifkan Developer Options dan USB Debugging di device.
- Build dan sync asset terbaru:

```bash
npm run android:usb-debug
```

- Install langsung:

```bash
INSTALL=1 npm run android:usb-debug
```

- Smoke di device:
  - login
  - session restore setelah app ditutup
  - POS tunai
  - QRIS/payment online saat koneksi aktif
  - mode offline lalu reconnect
  - safe update banner tidak mengganggu flow
  - printer config tetap ada
  - nav Stok dan subtabnya terbuka
  - POS produk dengan resep mengurangi stok bahan
  - Opname stok di `Stok > Bahan Baku` mengubah stok dan tetap muncul setelah refresh

## 7. Go / No-Go

Go-live jika:

- `npm run check` hijau.
- `npm run build:mobile` hijau.
- `npm run android:usb-debug` hijau minimal sampai APK debug terbentuk.
- `npm run smoke:production:readiness` hijau.
- `npm run smoke:staging:stock` hijau di staging production-like.
- `/api/v1/auth/login`, `/api/v1/transactions`, pagination, checkout stock deduction, void restore, dan `POST /api/inventory/adjustments` hijau lewat `npm run smoke:staging:stock`.
- `/health`, `/health/db`, `/system-status` hijau.
- Payment production settlement berhasil membuka lisensi.
- `/api/app/version` sehat dan event update tercatat.
- Closed Beta feedback berhasil terkirim.
- Clarity menerima session.
- Tidak ada env Supabase.

No-go jika:

- production masih memakai Midtrans sandbox.
- API web/APK mengarah ke staging/local.
- webhook tidak reachable.
- CORS menolak APK atau web production.
- APK ter-install dari asset lama.
- Ada duplicate payment/subscription/transaction pada replay.
