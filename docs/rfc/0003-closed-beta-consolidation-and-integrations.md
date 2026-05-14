# RFC 0003: Closed Beta Consolidation, Safe Update, and Integrations

Status: Accepted
Tanggal: 13 Mei 2026
Owner: Product/Engineering KaffePOS

## Ringkasan

KaffePOS v2 masuk fase `Closed Beta Candidate` untuk 10-20 owner cafe. Fokus release ini adalah membuat app aman diuji di lapangan: data user lama terlindungi saat update, feedback bisa dikirim dari dalam app, trial dan payment lebih jelas, analytics aktif, email transactional terpusat, dan static asset siap lewat Cloudflare.

RFC ini melengkapi RFC 0001 dan RFC 0002. Jika ada konflik scope, PRD v2.0-beta dan RFC ini menjadi rujukan terbaru untuk Closed Beta.

## Masalah

Sebelum Closed Beta, beberapa area masih belum punya kontrak release yang jelas:

- update web/APK harus aman untuk data lama dan session aktif
- feedback beta harus masuk database dan terlihat admin
- analytics harus terpusat agar behavior beta bisa dianalisis
- email transactional harus reusable dan tidak tersebar
- payment harus tetap backend-only
- marketing landing page dan docs release harus sinkron dengan fitur terbaru

## Goals

- Menyiapkan Closed Beta tanpa mengubah tema clean white + warm orange.
- Menjaga Midtrans secret hanya di backend.
- Menambahkan database versioning, migration checksum, backup critical, dan app version endpoint.
- Menambahkan Closed Beta badge, feedback form, trial countdown, dan prompt upgrade yang halus.
- Menyatukan analytics GA4/Clarity dan email Resend service.
- Memastikan docs, checklist, dan deployment guide mencerminkan state terbaru.

## Non-Goals

- Launch commercial umum.
- Menambah provider payment selain Midtrans.
- Membuka multi-store penuh atau delivery ordering.
- Mendesain ulang UI/UX.
- Menjamin offline checkout lintas device tanpa conflict resolution lanjutan.

## Proposal

### Safe Update

- Tambah migration SQL versioned dengan tabel `schema_migrations`, `app_versions`, dan `app_update_events`.
- Jalankan `npm run backup:critical` sebelum migration besar.
- Jalankan `npm run migrate` untuk semua schema change.
- Frontend menjalankan local storage migration, cek `/api/app/version`, dan mencatat update event.
- Offline case ditandai untuk sync ulang saat online.

### Closed Beta UX

- Dashboard menampilkan badge `Closed Beta`.
- Halaman utama/settings menampilkan ucapan terima kasih beta.
- Floating feedback button membuka form rating, kategori, deskripsi, dan screenshot opsional.
- Feedback disimpan ke backend dan memicu notifikasi admin.
- Trial 14 hari menampilkan countdown dan prompt hari ke-10, hari ke-13, serta expired.

### Integrations

- Resend dipakai melalui `EmailService`.
- GA4 dan Microsoft Clarity dipakai melalui `AnalyticsService`.
- Cloudflare CDN/R2/Image helper dipakai untuk asset delivery.
- Static cache headers disimpan di `public/_headers`.
- Midtrans payment tetap dibuat dari backend endpoint dan webhook divalidasi backend.

### Release Docs

- PRD, changelog, deployment guide, go-live checklist, API migration doc, app update doc, ops metrics, and validation checklist harus update sebelum commit release.

## Dampak Produk

- Closed Beta bisa dimulai dengan feedback loop yang jelas.
- Owner melihat trial, upgrade, dan update app dengan pesan yang lebih ramah.
- Tim bisa membaca event penting: register, login, first transaction, payment, PDF export, feature usage, feedback, sync, dan client error.

## Dampak Teknis

- Migration file yang sudah jalan tidak boleh diedit karena checksum akan berubah.
- Secret payment tetap server-side.
- Frontend harus tahan offline/update edge case tanpa memaksa logout.
- Env production harus memisahkan `VITE_*` client config dari secret backend.

## Risiko

- Migration gagal jika data production punya schema drift.
- Analytics bisa terlalu banyak mengirim payload bila event tidak disaring.
- Feedback screenshot bisa butuh storage policy tambahan saat volume beta naik.

Mitigasi:

- Backup critical sebelum migration.
- Payload analytics tidak boleh memuat data sensitif transaksi.
- Screenshot attachment tetap opsional dan dibatasi di backend/UI.

## Rollout dan Validasi

1. Jalankan `npm run check`.
2. Jalankan `npm --prefix backend run backup:critical`.
3. Jalankan `npm --prefix backend run migrate`.
4. Deploy backend.
5. Deploy frontend.
6. Smoke test auth, app version, feedback, trial prompt, POS, payment, PDF export, analytics, and email.
7. Invite 10-20 owner cafe setelah semua P0 Closed Beta checklist hijau.

## Open Questions

- Apakah feedback screenshot perlu dipindah ke Cloudflare R2 sebelum beta diperluas?
- Apakah Closed Beta perlu feature flag per store?
- Apakah trial prompt perlu dikirim juga via WhatsApp sebelum commercial launch?
