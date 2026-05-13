# RFC 0002: Commercial Readiness Hardening Plan

Status: Accepted
Tanggal: 5 Mei 2026
Owner: Product/Engineering KaffePOS

Catatan 13 Mei 2026: Closed Beta Candidate ditangani oleh [RFC 0003](0003-closed-beta-consolidation-and-integrations.md). RFC ini tetap berlaku untuk gate commercial general release.

## Ringkasan

KaffePOS v2 tidak boleh masuk paid/commercial launch umum sebelum production readiness gate hijau. Sprint berikutnya harus fokus pada hardening release, bukan fitur baru.

Target utama RFC ini adalah menaikkan status dari `Pilot` ke `Commercial` dengan menyelesaikan blocker yang terdeteksi oleh smoke test production.

## Masalah

Validasi production terbaru menunjukkan:

- Web dan API production hidup.
- Database production OK.
- Email Resend OK.
- `npm run smoke:production:readiness` gagal.
- Payment production belum commercial-ready.
- Backend error tracking belum aktif.
- CORS origin APK final belum lengkap.
- Frontend audit masih memiliki high vulnerability dari dependency build tool.

Jika fitur baru dikerjakan sebelum blocker ini selesai, risiko produk melebar dan status release tetap ambigu.

## Goals

- Membuat `npm run smoke:production:readiness` hijau.
- Memastikan production env sinkron dengan release checklist.
- Menutup blocker payment, monitoring, CORS APK, dan dependency audit.
- Menyelesaikan UAT lapangan P0 sebelum commercial launch.
- Menjaga status produk tetap `Pilot` sampai semua gate commercial hijau.

## Non-Goals

- Menambah fitur POS baru.
- Mengubah pricing/plan/entitlement.
- Menambah provider payment selain Midtrans.
- Membuka offline checkout penuh lintas device.
- Mendesain ulang UI.

## Proposal

### Workstream 1: Production Env Gate

Update env backend production di Coolify:

```env
NODE_ENV=production
WEB_BASE_URL=https://kaffepos.my.id
API_BASE_URL=https://api.kaffepos.my.id
CORS_ORIGIN=https://kaffepos.my.id,https://www.kaffepos.my.id,https://api.kaffepos.my.id,https://localhost,capacitor://localhost,http://localhost
SENTRY_DSN=<backend-sentry-dsn>
SENTRY_ENVIRONMENT=production
```

Acceptance:

- CORS preflight untuk `https://localhost` diterima.
- `/system-status` melaporkan backend error tracking aktif.

### Workstream 2: Payment Production Gate

Pilih salah satu mode sebelum commercial:

1. `Commercial online payment`: Midtrans production aktif penuh.
2. `Pilot/manual activation`: payment online tidak diklaim commercial-ready dan merchant pilot diarahkan ke aktivasi manual.

Untuk commercial online payment:

```env
MIDTRANS_ENVIRONMENT=production
MIDTRANS_SERVER_KEY=<production-server-key>
MIDTRANS_MERCHANT_ID=<production-merchant-id>
MIDTRANS_SNAP_ENABLED=true
MIDTRANS_WEBHOOK_BASE_URL=https://api.kaffepos.my.id
SUBSCRIPTION_PAYMENT_MODE=auto
```

Acceptance:

- `/system-status` melaporkan `payment.commerciallyReady=true`.
- `syncMatrix.subscription_payments=true`.
- Webhook settlement membuka subscription.
- Replay webhook tidak membuat subscription/payment dobel.

### Workstream 3: Dependency Audit Gate

Frontend audit saat ini gagal karena `@capacitor/cli@6.2.1` membawa `tar@6.2.1`.

Acceptance:

- `npm audit --audit-level=moderate` hijau.
- `npm run build:mobile` hijau.
- Android debug/release build tetap hijau.
- Smoke device login/session/printer tetap hijau.

### Workstream 4: Field UAT Gate

UAT minimal:

- 3 kelas device Android: low, mid, high.
- Login, register, OTP, reset password, session restore.
- Checkout tunai/non-tunai.
- Checkout race di 2 device dengan akun/toko sama.
- Void transaksi dan restore stok.
- Offline lalu reconnect untuk menu, inventory, expense, cashflow, cash register.
- 3 printer nyata: Bluetooth 58mm, Bluetooth/USB 80mm, USB-only.
- Sesi app lebih dari 2 jam tanpa crash/ANR blocker.

Acceptance:

- Semua P0 di `GO_LIVE_CHECKLIST.md` hijau atau punya explicit waiver tertulis.
- Crash-free session pilot internal minimal 99%.

## Alternatif

### Tetap Launch dengan Midtrans Sandbox

Ditolak untuk commercial launch. Sandbox boleh untuk internal/pilot QA, bukan paid launch umum.

### Lanjut Fitur Baru Dulu

Ditolak. Fitur baru tidak menyelesaikan blocker release dan menambah permukaan risiko.

## Risiko

- Upgrade Capacitor bisa berdampak ke Android build dan plugin printer.
- Perubahan payment env production berisiko membuka flow pembayaran nyata sebelum webhook tervalidasi.
- CORS terlalu longgar bisa memperbesar permukaan akses.

Mitigasi:

- Upgrade dependency di branch terpisah.
- Payment production divalidasi dengan transaksi kecil dan webhook replay test.
- CORS tetap whitelist origin yang diperlukan saja.

## Rollout dan Validasi

Urutan rollout:

1. Commit PRD/RFC agar scope terkunci.
2. Update env production CORS dan Sentry.
3. Rerun `npm run smoke:production:readiness`.
4. Selesaikan payment production atau set pilot/manual policy secara eksplisit.
5. Fix dependency audit.
6. Jalankan UAT lapangan.
7. Baru ubah status dari `Pilot` ke `Commercial`.

## Open Questions

- Apakah activation manual tetap tersedia setelah Midtrans production aktif?
- Apakah Google OAuth masuk P0 commercial atau tetap optional?
- Apakah Crashlytics wajib sebelum closed testing Play Store atau cukup Sentry + manual logs untuk pilot?
