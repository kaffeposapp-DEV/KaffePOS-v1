# Deploy Kitchen / Order Checker Realtime

Runbook ini khusus untuk merilis fitur Kitchen Display System / Kitchen Queue KaffePOS ke VPS + Coolify + PostgreSQL production.

## 1. Local Gate

Jalankan dari root repo:

```bash
npm run typecheck
npm run build:web
npm test

cd backend
npm run check
```

Semua harus hijau sebelum deploy.

## One-command deploy

Command paling rapi dari root repo:

```bash
DATABASE_URL='postgres://kaffepos:password@host:5432/kaffepos_production' \
DEPLOY_GIT=1 \
GIT_BRANCH=main \
COOLIFY_BACKEND_WEBHOOK='https://coolify.example/webhooks/xxx' \
COOLIFY_FRONTEND_WEBHOOK='https://coolify.example/webhooks/yyy' \
npm run deploy:kds
```

Jika belum punya webhook Coolify, command ini tetap bisa dipakai untuk checks, migration, commit, dan push:

```bash
DATABASE_URL='postgres://kaffepos:password@host:5432/kaffepos_production' \
DEPLOY_GIT=1 \
GIT_BRANCH=main \
npm run deploy:kds
```

Jika ingin test lokal tanpa push dan tanpa migration:

```bash
DEPLOY_MIGRATION=0 RUN_VERIFY=0 npm run deploy:kds
```

## 2. Backup Database

Di VPS/Coolify PostgreSQL:

```bash
pg_dump "$DATABASE_URL" > kaffepos-backup-before-kds.sql
```

Jika memakai host/user manual:

```bash
pg_dump -h localhost -U kaffepos -d kaffepos_production > kaffepos-backup-before-kds.sql
```

## 3. Run Kitchen Migration

Pilihan aman untuk fitur ini:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/kitchen-order-checker-migration.sql
```

Atau jika ingin menjalankan bootstrap penuh:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/production-bootstrap.sql
```

Cek tabel:

```sql
select
  to_regclass('public.kitchen_orders'),
  to_regclass('public.kitchen_order_items'),
  to_regclass('public.kitchen_order_events');
```

Ketiganya harus bukan `null`.

## 4. Deploy Backend Coolify

Service backend:

- Base Directory: `backend`
- Dockerfile Location: `Dockerfile`
- Port: `8787`
- Domain: `https://api.kaffepos.my.id`
- Healthcheck: `GET /health`

Env penting:

```env
NODE_ENV=production
PORT=8787
SERVICE_NAME=kaffepos-backend
APP_VERSION=2.0.0
LOG_LEVEL=info

WEB_BASE_URL=https://kaffepos.my.id
API_BASE_URL=https://api.kaffepos.my.id
CORS_ORIGIN=https://kaffepos.my.id,https://www.kaffepos.my.id,https://api.kaffepos.my.id,capacitor://localhost,http://localhost

DB_HOST=kaffepos-postgres
DB_PORT=5432
DB_NAME=kaffepos_production
DB_USER=kaffepos
DB_PASSWORD=replace-me
DB_SSL=false

RESEND_API_KEY=
RESEND_FROM_EMAIL=KaffePOS <no-reply@kaffepos.my.id>

MIDTRANS_ENVIRONMENT=production
MIDTRANS_SERVER_KEY=
MIDTRANS_MERCHANT_ID=
MIDTRANS_SNAP_ENABLED=true
MIDTRANS_WEBHOOK_BASE_URL=https://api.kaffepos.my.id

ADMIN_EMAILS=kaffeposapp@gmail.com
```

Deploy backend, lalu cek:

```bash
curl https://api.kaffepos.my.id/health
curl https://api.kaffepos.my.id/health/db
curl https://api.kaffepos.my.id/system-status
```

## 5. Deploy Frontend Coolify

Service frontend:

- Base Directory: root repo
- Dockerfile Location: `frontend.Dockerfile`
- Port: `4173`
- Domain: `https://kaffepos.my.id`

Env frontend:

```env
VITE_API_BASE_URL=https://api.kaffepos.my.id
VITE_GA_MEASUREMENT_ID=G-VNQJ3XPCGG
VITE_CLARITY_PROJECT_ID=wf7x39iiqr
VITE_MIDTRANS_CLIENT_KEY=
VITE_MIDTRANS_ENVIRONMENT=production
```

Redeploy frontend setelah backend sehat.

## 6. Verify Deploy

Tanpa DB credential:

```bash
API_BASE=https://api.kaffepos.my.id \
WEB_BASE=https://kaffepos.my.id \
bash scripts/verify-kds-deploy.sh
```

Dengan DB credential:

```bash
DATABASE_URL='postgres://kaffepos:password@host:5432/kaffepos_production' \
bash scripts/verify-kds-deploy.sh
```

Dengan token login dan store id untuk cek endpoint kitchen:

```bash
ACCESS_TOKEN='paste-access-token' \
STORE_ID='paste-store-id' \
bash scripts/verify-kds-deploy.sh
```

## 7. Operational Smoke Test

Gunakan dua browser/device.

Device A sebagai kasir:

1. Login.
2. Buka POS.
3. Tambah item.
4. Isi catatan item, contoh `less ice / no sugar`.
5. Checkout.

Device B sebagai dapur:

1. Login akun toko yang sama.
2. Buka tab `Dapur`.
3. Order harus muncul tanpa refresh.
4. Klik `Mulai Proses`.
5. Klik `Tandai Siap`.
6. Klik `Selesai`.

Balik ke Device A:

1. Status dapur harus ikut berubah.
2. Refresh halaman, antrean tetap sesuai database.
3. Void transaksi yang belum selesai, order kitchen harus ikut `cancelled`.

## 8. Success Criteria

- Checkout menulis ke `transactions`.
- Checkout membuat `kitchen_orders` dan `kitchen_order_items`.
- Catatan item tersimpan di `kitchen_order_items.note`.
- Perubahan status menulis ke `kitchen_order_events`.
- SSE `GET /api/kitchen/events` mengirim `snapshot_required` saat connect.
- Tidak ada duplicate order setelah refresh/reconnect.
- POS dan Kitchen menampilkan status yang sama.

## 9. Rollback

Jika backend bermasalah:

1. Rollback service backend ke commit/image sebelumnya di Coolify.
2. Biarkan tabel kitchen tetap ada. Tabel ini tidak mengganggu transaksi lama.
3. Jika perlu rollback DB penuh:

```bash
psql "$DATABASE_URL" < kaffepos-backup-before-kds.sql
```

Urutan deploy paling aman:

```text
backup DB -> run migration -> deploy backend -> health check -> deploy frontend -> smoke test multi-device -> build APK
```
