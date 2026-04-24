# Midtrans Sandbox to Production Switch

Dokumen ini dibuat supaya cutover Midtrans di KaffePOS cukup lewat update env + redeploy, tanpa bongkar code lagi.

## Arsitektur akhir

- Frontend hanya memakai:
  - `VITE_MIDTRANS_CLIENT_KEY`
  - `VITE_MIDTRANS_ENVIRONMENT`
- Backend hanya memakai secret/config server-side:
  - `MIDTRANS_ENVIRONMENT`
  - `MIDTRANS_SERVER_KEY`
  - `MIDTRANS_MERCHANT_ID`
  - `MIDTRANS_SNAP_ENABLED`
  - `MIDTRANS_WEBHOOK_BASE_URL`
  - `MIDTRANS_FINISH_URL`
  - `MIDTRANS_UNFINISH_URL`
  - `MIDTRANS_ERROR_URL`
- Endpoint Midtrans, Snap JS URL, webhook URL, dan mode logging otomatis mengikuti `MIDTRANS_ENVIRONMENT`.
- Restriction metode pembayaran tetap dijaga di backend: QRIS dan Virtual Account.

## Nilai env frontend

### Sandbox

```env
VITE_API_BASE_URL=https://api.kaffepos.my.id
VITE_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxx
VITE_MIDTRANS_ENVIRONMENT=sandbox
```

### Production

```env
VITE_API_BASE_URL=https://api.kaffepos.my.id
VITE_MIDTRANS_CLIENT_KEY=Mid-client-xxxxxxxx
VITE_MIDTRANS_ENVIRONMENT=production
```

## Nilai env backend

### Sandbox

```env
MIDTRANS_ENVIRONMENT=sandbox
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
MIDTRANS_MERCHANT_ID=G123456789
MIDTRANS_SNAP_ENABLED=true
MIDTRANS_WEBHOOK_BASE_URL=https://api.kaffepos.my.id
MIDTRANS_FINISH_URL=https://kaffepos.my.id/settings?billing=success
MIDTRANS_UNFINISH_URL=https://kaffepos.my.id/settings?billing=pending
MIDTRANS_ERROR_URL=https://kaffepos.my.id/settings?billing=failed
```

### Production

```env
MIDTRANS_ENVIRONMENT=production
MIDTRANS_SERVER_KEY=Mid-server-xxxxxxxx
MIDTRANS_MERCHANT_ID=G123456789
MIDTRANS_SNAP_ENABLED=true
MIDTRANS_WEBHOOK_BASE_URL=https://api.kaffepos.my.id
MIDTRANS_FINISH_URL=https://kaffepos.my.id/settings?billing=success
MIDTRANS_UNFINISH_URL=https://kaffepos.my.id/settings?billing=pending
MIDTRANS_ERROR_URL=https://kaffepos.my.id/settings?billing=failed
```

## Langkah dashboard Midtrans yang harus dicek

1. Pastikan akun production sudah approved.
2. Pastikan payment method yang aktif hanya yang memang mau dipakai untuk subscription.
3. Pastikan Notification URL di dashboard menunjuk ke:
   - `https://api.kaffepos.my.id/api/payments/midtrans/webhook`
4. Pastikan `Client Key`, `Server Key`, dan `Merchant ID` yang dipakai benar-benar milik environment production.
5. Pastikan QRIS dan Virtual Account aktif di akun production Midtrans.

## Langkah go-live

1. Update env backend:
   - `MIDTRANS_ENVIRONMENT=production`
   - `MIDTRANS_SERVER_KEY=<production server key>`
   - `MIDTRANS_MERCHANT_ID=<production merchant id>`
2. Update env frontend:
   - `VITE_MIDTRANS_ENVIRONMENT=production`
   - `VITE_MIDTRANS_CLIENT_KEY=<production client key>`
3. Redeploy `KaffePOS API`.
4. Redeploy `KaffePOS Web`.
5. Verifikasi `/system-status` menunjukkan:
   - `payment.environment = production`
   - `payment.apiBaseUrl = https://app.midtrans.com`
   - `payment.snapJsUrl = https://app.midtrans.com/snap/snap.js`
   - `payment.webhookUrl = https://api.kaffepos.my.id/api/payments/midtrans/webhook`

## Smoke test setelah live

1. Login ke akun uji.
2. Buat 1 pembayaran subscription nominal kecil.
3. Pastikan user diarahkan ke hosted payment page Midtrans production.
4. Pastikan metode yang muncul tetap QRIS atau Virtual Account.
5. Selesaikan transaksi.
6. Cek log backend untuk event:
   - `payments.midtrans.create.succeeded`
   - `payments.midtrans.webhook.received`
   - `payments.midtrans.webhook.processed`
7. Pastikan subscription berubah aktif.
8. Pastikan `payment_history` terisi satu kali.
9. Cek halaman subscription Web dan APK ikut sinkron.

## Rollback

1. Pause sementara promosi atau akses pembelian jika ada incident payment.
2. Kembalikan env backend ke sandbox.
3. Kembalikan env frontend ke sandbox.
4. Redeploy backend.
5. Redeploy frontend.
6. Pastikan `/system-status` kembali menunjukkan environment sandbox.
7. Audit transaksi production yang sempat masuk sebelum mengaktifkan ulang.

## Checklist go-live operasional

- Production account Midtrans sudah approved.
- `MIDTRANS_ENVIRONMENT` sudah `production`.
- Production `MIDTRANS_SERVER_KEY` sudah terpasang.
- Production `VITE_MIDTRANS_CLIENT_KEY` sudah terpasang.
- Production `MIDTRANS_MERCHANT_ID` sudah terpasang.
- Notification/webhook URL sudah benar di dashboard Midtrans.
- Backend sudah diredeploy.
- Frontend sudah diredeploy.
- 1 transaksi kecil berhasil dibuat.
- Webhook masuk ke backend.
- Subscription aktif setelah settlement/capture valid.
- Pending/cancel handling tetap aman.
- UI checkout normal.
- Tidak ada asset atau endpoint sandbox yang masih termuat.
