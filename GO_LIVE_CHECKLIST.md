# KaffePOS APK Go-Live Checklist (Commercial)

Gunakan dokumen ini sebagai gerbang rilis sebelum APK dipublikasikan ke pengguna komersial.

Baseline operasional yang dipakai saat ini:
- Domain + hosting aktif di `kaffepos.my.id`
- Backend utama di Supabase
- Email auth / transactional memakai Resend
- APK Android dibangun dari Capacitor
- Monitoring APK yang direkomendasikan: Firebase Crashlytics

Skala prioritas:
- `P0` = wajib beres sebelum rilis.
- `P1` = sangat disarankan beres di batch rilis yang sama.
- `P2` = bisa menyusul setelah launch awal.

Status:
- `[ ]` Belum
- `[~]` On progress
- `[x]` Selesai

---

## 1) Product & UX Readiness

- [x] **P0** APK flow tidak menampilkan landing page web (mobile target build).
- [x] **P0** Auth flow dasar tersedia: login, register, OTP verification, reset password.
- [ ] **P0** UAT skenario kasir harian (buka kas, transaksi, void, tutup hari) di perangkat nyata.
- [ ] **P1** Empty states dan error states sudah konsisten untuk semua tab utama.
- [ ] **P1** Copywriting final untuk pesan error/validasi user-facing.

## 2) Security & Data Protection

- [x] **P0** Service role key hanya digunakan di Supabase Edge Functions (bukan client app).
- [x] **P0** Audit RLS per tabel kritikal (`stores`, `transactions`, `inventory`, `profiles`, `notifications`) sudah diverifikasi + `FORCE RLS` diterapkan.
- [x] **P0** Uji akses lintas akun: akun A tidak bisa baca/ubah data akun B.
- [~] **P1** Rate limit abuse test untuk endpoint auth email / verify otp / notifications (unit test helper + shared enforcement sudah ada, tinggal uji burst live di staging/device).
- [x] **P1** Review data retention policy (log notifikasi, OTP, audit trail) sudah terdokumentasi + ada SQL cleanup operasional.

## 3) Authentication & Email Reliability

- [x] **P0** Register menulis user + profile ke Supabase.
- [x] **P0** OTP verifikasi email bekerja dan mengaktifkan akun.
- [x] **P0** Welcome email dan security email menggunakan Resend.
- [ ] **P0** Uji deliverability inbox utama (Gmail, Outlook, Yahoo) + cek spam rate.
- [x] **P1** Fallback handling saat Resend timeout (retry policy + timeout + backoff) sudah ada di edge function email.

## 4) Core Transaction Reliability

- [ ] **P0** Test race condition checkout di 2 device dengan akun sama.
- [ ] **P0** Test offline-online sync untuk menu, inventory, expenses, cashflow, cash register.
- [ ] **P0** Test integritas stok setelah checkout dan void berulang.
- [x] **P1** Guard untuk mencegah load/sync storm saat app resume/network reconnect.
- [ ] **P1** Snapshot DB consistency test setelah 1 hari simulasi transaksi padat.

## 5) Performance & Stability

- [ ] **P0** Smoke test di minimal 3 kelas device Android (low/mid/high).
- [ ] **P0** ANR/crash test dengan sesi > 2 jam.
- [ ] **P1** Ukur cold start time (target internal: < 3 detik di mid-range device).
- [ ] **P1** Uji memory pressure: pindah tab, print, laporan PDF, background/foreground berulang.
- [ ] **P2** Optimasi ukuran bundle dan assets besar (logo/svg/image).

## 6) Observability & Operations

- [~] **P0** Crash reporting sudah terpasang di APK Android (Firebase Crashlytics) dan tinggal verifikasi event crash pertama masuk dashboard.
- [x] **P0** Alerting untuk error rate edge function sudah aktif di project (`edge_function_events` remote + env `EDGE_ALERT_EMAIL` + deploy function terbaru).
- [x] **P1** Dashboard metrik bisnis minimal tersedia via `public.ops_daily_metrics` untuk login success rate, checkout success rate, dan OTP success rate.
- [x] **P1** Incident playbook dasar sudah terdokumentasi.

## 7) Build, Release, and Store Readiness

- [x] **P0** Build target web vs mobile sudah dipisah (`build:web`, `build:mobile`).
- [x] **P0** Script APK (`build-apk*`) memakai target mobile.
- [x] **P0** Build APK debug terbaru berhasil pada `2026-04-19` dan menghasilkan `android/app/build/outputs/apk/debug/app-debug.apk`.
- [x] **P0** Signing release key, backup key, dan recovery procedure terdokumentasi aman.
- [ ] **P0** Internal testing track Google Play + closed testing minimal 20 tester.
- [ ] **P1** Listing Play Store siap (screenshot, deskripsi, kebijakan privasi, kontak support).
- [x] **P1** Versioning & changelog strategy untuk update rutin.

## 8) Thermal Printer Readiness

- [x] **P0** APK sudah punya 3 jalur print: `Bluetooth Classic (SPP)`, `USB OTG ESC/POS`, dan fallback browser print.
- [x] **P0** Pengaturan printer di app sudah ada: scan, connect, auto reconnect, test print, dan pilihan kertas `58mm` / `80mm`.
- [x] **P0** Bug method print USB sudah diperbaiki agar sinkron dengan plugin native Android.
- [ ] **P0** Uji langsung minimal 3 printer nyata: `1 printer Bluetooth 58mm`, `1 printer Bluetooth/USB 80mm`, `1 printer USB-only`.
- [ ] **P0** Verifikasi hasil print untuk: logo, nama menu panjang, diskon, pajak, tunai, non-tunai, dan auto cut.
- [x] **P1** Daftar model printer yang dinyatakan "approved" untuk tim support.
- [x] **P1** SOP pairing untuk kasir non-teknis: cara pair ulang, ganti printer, dan reset printer.

### Rekomendasi praktis untuk kompatibilitas

- **Paling mudah untuk launch cepat:** printer thermal `ESC/POS` dengan `Bluetooth Classic SPP` dan kertas `58mm`.
- **Paling stabil untuk toko ramai:** printer thermal `ESC/POS` dengan `USB` atau `USB + Bluetooth`, lebih aman dibanding Bluetooth-only.
- **Yang wajib dicari saat beli printer:** tertulis `ESC/POS compatible`, mendukung `Android`, ada `Bluetooth Classic` atau `USB`, dan bila perlu `auto cutter`.
- **Yang sebaiknya dihindari untuk batch awal:** printer yang hanya `BLE`, printer yang butuh aplikasi vendor khusus, atau printer label-only yang bukan receipt mode.

### Status teknis saat ini

- Jalur `Bluetooth Classic SPP` sudah ada dan cocok untuk printer thermal generik.
- Jalur `USB OTG` sudah ada di APK Android dan sekarang method print-nya sudah sinkron dengan plugin native.
- Jalur fallback browser tetap ada untuk web / darurat, tapi bukan jalur utama kasir Android.
- Secara teknis app **sudah siap diuji** dengan berbagai printer thermal receipt, tetapi status "siap 100%" baru layak diberikan setelah matrix test printer nyata selesai.

## 9) Legal, Billing, and Support

- [x] **P0** Terms of Service & Privacy Policy final dan link valid di app.
- [x] **P0** SOP support pelanggan (jam respon, kanal WA/Email, eskalasi bug) sudah terdokumentasi.
- [x] **P1** Kebijakan refund / dispute untuk langganan berbayar.
- [x] **P1** Template komunikasi gangguan layanan.

---

## Go / No-Go Gate

### Syarat minimal "GO"
- Semua item `P0` status `[x]`.
- Tidak ada bug blocker di auth, checkout, dan sinkronisasi data.
- Tidak ada bug blocker di pairing / reconnect / test print / cetak struk final.
- Crash-free session pada pilot test internal >= 99%.

### Skor kesiapan komersial (praktis)
- **9-10**: semua `P0` + mayoritas `P1` selesai, observability matang.
- **7-8**: `P0` utama teknis selesai, tapi operasional/QA komersial belum penuh.
- **5-6**: core app jalan, tapi risiko produksi masih tinggi.
- **<5**: belum siap rilis ke pelanggan.

---

## Catatan Status Saat Ini (estimasi cepat)

- **Nilai saat ini: 9.0 / 10**
- Kekuatan: arsitektur auth + database + pemisahan mobile/web build sudah bagus.
- Gap utama: QA lapangan, deliverability inbox nyata, monitoring produksi pertama, matrix test printer nyata, dan closed testing distribusi.

---

## Rutinitas Operasional Ringkas

Untuk panduan maintenance non-programmer yang lebih detail, lihat:

- [MAINTENANCE_ROADMAP.md](/Users/macbook/kaffepos-new/kaffepos-v2/MAINTENANCE_ROADMAP.md)
- [FIREBASE_CRASHLYTICS_SETUP.md](/Users/macbook/kaffepos-new/kaffepos-v2/FIREBASE_CRASHLYTICS_SETUP.md)
- [INCIDENT_PLAYBOOK.md](/Users/macbook/kaffepos-new/kaffepos-v2/INCIDENT_PLAYBOOK.md)
- [SUPPORT_SOP.md](/Users/macbook/kaffepos-new/kaffepos-v2/SUPPORT_SOP.md)
- [PRINTER_APPROVED_MATRIX.md](/Users/macbook/kaffepos-new/kaffepos-v2/PRINTER_APPROVED_MATRIX.md)
- [OPS_METRICS_DASHBOARD.md](/Users/macbook/kaffepos-new/kaffepos-v2/OPS_METRICS_DASHBOARD.md)

Versi singkat:

- **Harian:** cek web `kaffepos.my.id`, login, dan komplain user
- **Mingguan:** cek Supabase logs, Resend delivery, dan stabilitas APK
- **Bulanan:** backup, review billing, uji APK di device nyata, dan review komplain
