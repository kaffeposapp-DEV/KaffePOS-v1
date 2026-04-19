# KaffePOS APK Go-Live Checklist (Commercial)

Gunakan dokumen ini sebagai gerbang rilis sebelum APK dipublikasikan ke pengguna komersial.

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
- [~] **P0** Audit RLS per tabel kritikal (`stores`, `transactions`, `inventory`, `profiles`, `notifications`).
- [ ] **P0** Uji akses lintas akun: akun A tidak bisa baca/ubah data akun B.
- [ ] **P1** Rate limit abuse test untuk endpoint auth email / verify otp / notifications.
- [ ] **P1** Review data retention policy (log notifikasi, OTP, audit trail).

## 3) Authentication & Email Reliability

- [x] **P0** Register menulis user + profile ke Supabase.
- [x] **P0** OTP verifikasi email bekerja dan mengaktifkan akun.
- [x] **P0** Welcome email dan security email menggunakan Resend.
- [ ] **P0** Uji deliverability inbox utama (Gmail, Outlook, Yahoo) + cek spam rate.
- [ ] **P1** Fallback handling saat Resend timeout (retry policy terukur).

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

- [ ] **P0** Crash reporting aktif (Sentry/Firebase Crashlytics).
- [ ] **P0** Alerting untuk error rate edge function (auth-email, verify-email-code, send-notification).
- [ ] **P1** Dashboard metrik bisnis minimal: login success rate, checkout success rate, OTP success rate.
- [ ] **P1** Incident playbook (siapa on-call, respon pertama, rollback plan).

## 7) Build, Release, and Store Readiness

- [x] **P0** Build target web vs mobile sudah dipisah (`build:web`, `build:mobile`).
- [x] **P0** Script APK (`build-apk*`) memakai target mobile.
- [ ] **P0** Signing release key, backup key, dan recovery procedure terdokumentasi aman.
- [ ] **P0** Internal testing track Google Play + closed testing minimal 20 tester.
- [ ] **P1** Listing Play Store siap (screenshot, deskripsi, kebijakan privasi, kontak support).
- [ ] **P1** Versioning & changelog strategy untuk update rutin.

## 8) Legal, Billing, and Support

- [ ] **P0** Terms of Service & Privacy Policy final dan link valid di app.
- [ ] **P0** SOP support pelanggan (jam respon, kanal WA/Email, eskalasi bug).
- [ ] **P1** Kebijakan refund / dispute untuk langganan berbayar.
- [ ] **P1** Template komunikasi gangguan layanan.

---

## Go / No-Go Gate

### Syarat minimal "GO"
- Semua item `P0` status `[x]`.
- Tidak ada bug blocker di auth, checkout, dan sinkronisasi data.
- Crash-free session pada pilot test internal >= 99%.

### Skor kesiapan komersial (praktis)
- **9-10**: semua `P0` + mayoritas `P1` selesai, observability matang.
- **7-8**: `P0` utama teknis selesai, tapi operasional/QA komersial belum penuh.
- **5-6**: core app jalan, tapi risiko produksi masih tinggi.
- **<5**: belum siap rilis ke pelanggan.

---

## Catatan Status Saat Ini (estimasi cepat)

- **Nilai saat ini: 7.5 / 10**
- Kekuatan: arsitektur auth + database + pemisahan mobile/web build sudah bagus.
- Gap utama: QA lapangan, monitoring produksi, dan release operation/compliance.
