# Changelog

Semua perubahan penting KaffePOS dicatat di dokumen ini.

## Strategi versi

- `versionName` mengikuti format `MAJOR.MINOR.PATCH`
- `versionCode` Android wajib naik di setiap rilis publik
- Catatan perubahan ditulis sebelum APK/AAB dikirim ke tester atau pelanggan

## [2.0.0-beta] - 2026-05-13

### Added

- Closed Beta mode: badge Dashboard, pesan beta, floating feedback form, rating, kategori, deskripsi, dan attachment screenshot opsional
- Safe update system: endpoint `/api/app/version`, event `/api/app/update-events`, tabel `app_versions`, checksum migrasi, backup data kritikal, dan sync update di frontend
- Integrasi Cloudflare CDN helpers, static caching headers, branded error page, Resend EmailService, GA4, dan Microsoft Clarity
- Template email transactional: welcome/register, trial reminder, invoice/receipt, password reset, dan feedback thank you
- Landing page marketing KaffePOS dengan hero, benefits, feature highlights, pricing, testimonial placeholder, FAQ, promo copy, dan template invite Closed Beta
- Trial countdown 14 hari, smart prompt hari ke-10/hari ke-13/expired, dan analytics event beta/trial/payment utama

### Changed

- Payment dan subscription tetap backend-only untuk secret Midtrans; frontend tidak boleh memakai `VITE_MIDTRANS_*`
- Auth, modal, trial, payment, PDF report, analytics, dan feedback flow dirapikan agar konsisten dengan tema white + warm orange
- PDF report dan export analytics memakai event tracking `pdf_exported`
- Offline/update bootstrap lebih aman untuk APK Capacitor tanpa memaksa user logout

### Fixed

- Modal close/backdrop/Escape/focus behavior dibuat konsisten melalui reusable modal system
- Login/register loading, error copy, redirect dashboard, dan session persistence diperkuat
- Order/payment status flow menangani `settlement`, `pending`, `cancel`, `expire`, dan `deny` dengan pesan ramah

### Operations

- Jalankan `backend npm run backup:critical` sebelum migration besar
- Jalankan `backend npm run migrate` sebelum deploy backend final
- Verifikasi `GET /api/app/version`, feedback submission, GA4/Clarity event, Resend delivery, Midtrans webhook, dan APK update smoke test sebelum invite beta owner

## [1.2.0] - 2026-04-19

### Added

- Logging `edge_function_events` untuk observability edge function
- Alert email threshold untuk kegagalan edge function
- Tracker `track-ops-event` + view `public.ops_daily_metrics` untuk login, checkout, dan OTP success rate
- Dokumen operasional baru: incident playbook, support SOP, printer approved matrix, maintenance roadmap, dan panduan Crashlytics
- Halaman `Terms of Service` dan `Privacy Policy` yang bisa diakses dari auth flow

### Changed

- Alur build release Android kini terdokumentasi dengan env `KPOS_RELEASE_*`
- Footer auth mengarah ke link legal yang valid
- README diperbarui agar sesuai baseline operasi API self-hosted, Resend, dan APK Android

### Fixed

- Packaging Android dirapikan untuk mengurangi warning native library packaging
- File sensitif release signing dan `google-services.json` di-ignore secara eksplisit
- Retention cleanup operasional diperluas agar mencakup log metrik ops tanpa mengubah flow user-facing

### Operations

- Set secret `EDGE_ALERT_EMAIL` sebelum deploy edge functions produksi
- Verifikasi event Crashlytics pertama setelah APK internal testing
- Naikkan `versionCode` untuk setiap rilis berikutnya
