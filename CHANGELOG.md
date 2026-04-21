# Changelog

Semua perubahan penting KaffePOS dicatat di dokumen ini.

## Strategi versi

- `versionName` mengikuti format `MAJOR.MINOR.PATCH`
- `versionCode` Android wajib naik di setiap rilis publik
- Catatan perubahan ditulis sebelum APK/AAB dikirim ke tester atau pelanggan

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
