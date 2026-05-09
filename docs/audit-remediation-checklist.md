# KaffePOS Audit Remediation Checklist

Dokumen ini mencatat perbaikan hijau dari audit menyeluruh 30 April 2026. Item di sini adalah item yang sudah ditutup lewat code/test dalam batch hardening ini, bukan janji roadmap.

## Checklist Hijau

- [x] APK login/network guard: APK saat ini memakai `androidScheme=http` karena production CORS masih menolak `https://localhost`; cleartext Android dibatasi hanya untuk `localhost`/`127.0.0.1` dan API production tetap HTTPS.
- [x] APK build guard: `android:usb-debug` menolak `VITE_API_BASE_URL` lokal/dev seperti `localhost`, `127.0.0.1`, `10.0.2.2`, dan `.local`.
- [x] Login error UX: raw `Failed to fetch` dipetakan ke pesan manusiawi.
- [x] Release verification: production config checker mewajibkan CORS origin APK current bridge `http://localhost` dan target migrasi `https://localhost`.
- [x] Onboarding readiness: dashboard punya checklist setup toko, menu, stok awal, dan transaksi pertama.
- [x] Low stock visibility: dashboard menampilkan alert stok kritis dengan CTA langsung ke nav `Stok`.
- [x] Receipt preview: print sheet menampilkan preview struk sebelum Bluetooth/USB/WhatsApp print.
- [x] Runtime observability: frontend error boundary mengirim `client_error` ke ops metrics tanpa membocorkan secret.
- [x] External error tracking readiness: frontend/backend mendukung Sentry DSN opsional dan production verifier mewajibkan DSN sebelum release final.
- [x] Backend error tracking: global backend error handler mengirim exception 500 ke Sentry saat `SENTRY_DSN` aktif.
- [x] Database migration runner: tersedia `npm --prefix backend run migrate` dengan tabel `public.schema_migrations` dan file migration versioned.
- [x] PostgreSQL backup script: tersedia `npm run backup:postgres` yang fail-closed bila `DATABASE_URL` kosong.
- [x] Regression tests: coverage ditambah untuk APK config, error mapping, onboarding checklist, telemetry, dan receipt preview.
- [x] API versioning safety: backend sekarang menyediakan alias `/api/v1` untuk auth/webhook dan protected route tanpa mengganti kontrak `/api` lama.
- [x] Pagination guard: helper pagination backend dibuat dan diterapkan ke list transaksi/finance agar list besar tidak menjadi risiko production.
- [x] Stock opname: modul `Stok > Bahan Baku` punya aksi opname stok fisik dengan backend endpoint, validasi, audit trail, dan refresh state frontend.
- [x] Inventory adjustment migration: migration versioned `20260430_0002_inventory_adjustments.sql` menyiapkan tabel audit `inventory_adjustments`.
- [x] Stock opname regression tests: kontrak frontend-backend, UI action, backend validator, dan delta helper sudah dilindungi test.
- [x] Android asset freshness: build USB debug terbaru sudah menjalankan build mobile, Capacitor sync, dan assemble debug APK setelah perubahan Stok.
- [x] Staging DB smoke hardening: `npm run smoke:staging:stock` sekarang menguji `/api/v1/auth/login`, protected `/api/v1/transactions`, pagination metadata, checkout stock deduction, void restore, dan opname stok yang dibaca ulang dari API.

## Tetap Wajib Validasi Live

- [ ] Redeploy backend Coolify setelah update `CORS_ORIGIN` final agar memuat `http://localhost` dan `https://localhost`.
- [ ] Uji login APK di device/emulator nyata setelah redeploy.
- [ ] Uji printer fisik Bluetooth/USB sesuai matrix printer.
- [ ] Uji staging/Coolify untuk checkout, void, offline sync, dan stok setelah transaksi padat.
- [ ] Isi `SENTRY_DSN` dan `VITE_SENTRY_DSN` production di Coolify, lalu verifikasi event error dummy masuk ke dashboard Sentry.
- [ ] Jalankan `npm --prefix backend run migrate` terhadap staging PostgreSQL sebelum production.
- [ ] Jalankan `npm run backup:postgres` sebelum migration/deploy production.
- [ ] Jalankan `npm run smoke:staging:stock` setelah redeploy staging untuk membuktikan PostgreSQL asli menerima import, checkout, void, `/api/v1`, dan opname stok.
- [ ] Uji `/api/v1/inventory/adjustments` langsung jika reverse proxy/Coolify punya rule path khusus di luar smoke test stok.

## Skor Setelah Batch Ini

- APK login reliability: 9/10 dengan `androidScheme=http` + cleartext localhost-only; 10/10 setelah backend production menerima `https://localhost`, APK kembali dievaluasi ke scheme HTTPS, dan login device nyata hijau.
- UX onboarding awal: 9/10.
- Error visibility: 10/10 secara code readiness setelah Sentry DSN support; live 10/10 setelah DSN production diverifikasi.
- Stock opname readiness: 10/10 secara code/test/build; live tetap wajib dicek di staging DB sebelum produksi.
- API evolution readiness: 10/10 untuk alias `/api/v1` + pagination guard yang sudah ter-test.
- Commercial readiness praktis: 9.6/10 untuk go-live terbatas; 10/10 membutuhkan checklist live di atas hijau karena device, printer, Coolify, Cloudflare, dan PostgreSQL staging tidak bisa dibuktikan oleh unit test lokal.
