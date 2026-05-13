# RFC 0001: Product Scope and Architecture Guardrails

Status: Accepted
Tanggal: 5 Mei 2026
Owner: Product/Engineering KaffePOS

Catatan 13 Mei 2026: scope Closed Beta terbaru ada di PRD v2.0-beta dan [RFC 0003](0003-closed-beta-consolidation-and-integrations.md). RFC ini tetap menjadi guardrail awal, tetapi daftar out-of-scope lama yang menyebut loyalty/CRM tidak lagi berlaku untuk Kopi Passport loyalty ringan yang sudah masuk baseline beta.

## Ringkasan

KaffePOS v2 diposisikan sebagai POS F&B ringan untuk cafe kecil-menengah di Indonesia. Produk harus fokus pada operasional harian: auth, store setup, POS checkout, inventory berbasis recipe, void, laporan, subscription, admin internal, printer thermal, dan deployment web/APK dari satu codebase.

RFC ini menetapkan pagar scope dan arsitektur agar project tidak melebar ke fitur yang tidak mendukung commercial readiness.

## Masalah

Project sudah memiliki banyak modul dan dokumen operasional. Tanpa pagar keputusan, risiko utama adalah:

- Fitur baru masuk tanpa prioritas bisnis yang jelas.
- Istilah arsitektur lama dan baru bercampur.
- Release dianggap siap berdasarkan build/test saja, padahal payment, monitoring, CORS APK, dan QA lapangan belum hijau.
- Perubahan data/payment/offline/printer dilakukan tanpa catatan tradeoff.

## Goals

- Menjadikan PRD sebagai source of truth produk.
- Menjadikan RFC sebagai source of truth perubahan besar.
- Memastikan web dan APK memakai backend API yang sama untuk data bisnis.
- Menjaga checkout, void, inventory, auth, payment, dan subscription tetap diproses server-side.
- Membedakan status `Internal`, `Pilot`, dan `Commercial`.

## Non-Goals

- Menambahkan fitur baru.
- Mengubah pricing atau entitlement paket.
- Mengganti provider payment, email, AI, hosting, atau monitoring.
- Mendesain ulang UI.
- Membuka multi-store penuh, CRM, loyalty, delivery ordering, atau integrasi akuntansi.

## Proposal

### Product Scope Baseline

In scope untuk v2:

- Email/password auth, verification, reset password, session restore.
- Store bootstrap satu toko aktif per owner.
- POS checkout online-first dengan validasi stok backend.
- Inventory bahan baku dan recipe menu.
- Void transaksi dengan restore stok berbasis audit.
- Expense, cash register, dashboard, report PDF, AI insight.
- Subscription dan admin activation.
- Thermal printer browser, Bluetooth, dan USB.
- Web production dan APK Android dari source yang sama.

Out of scope tanpa RFC baru:

- Multi-store penuh dan multi-branch reporting.
- Loyalty/CRM customer.
- Delivery/order online customer-facing.
- Payment provider selain Midtrans.
- Offline checkout penuh lintas device.
- Custom workflow per merchant.
- Integrasi accounting eksternal.

### Architecture Baseline

Keputusan arsitektur yang diterima:

- Frontend: React + TypeScript + Vite.
- Mobile: Capacitor Android.
- Backend: Express API self-hosted.
- Database: PostgreSQL production sebagai source of truth data bisnis.
- Deployment: Coolify untuk backend/web.
- Email: Resend dari backend.
- Payment: Midtrans, dengan production mode wajib untuk commercial paid launch.
- Error tracking: Sentry frontend/backend untuk production.
- APK crash reporting: Firebase Crashlytics direkomendasikan.

### Data and API Boundaries

- Frontend tidak boleh langsung menulis data bisnis utama ke database.
- Secret tidak boleh berada di client bundle.
- Checkout dan void wajib melewati backend.
- Inventory deduction dan restore harus punya audit trail.
- API harus mendukung web dan APK secara konsisten.
- `/health`, `/system-status`, dan smoke tests menjadi bagian release gate.

### Release State Definitions

`Internal`:

- Dipakai developer/admin.
- Data boleh reset.
- Payment boleh sandbox.

`Pilot`:

- Merchant terbatas.
- Payment online boleh belum dibuka jika aktivasi manual jelas.
- Monitoring manual harian wajib.
- Risiko harus dikomunikasikan ke tim support.

`Commercial`:

- Payment production aktif untuk paid checkout online.
- `npm run check`, `npm run build:mobile`, dan `npm run smoke:production:readiness` hijau.
- `/health` dan `/system-status` production hijau tanpa warning blocker.
- Backend/frontend error tracking aktif.
- CORS web/APK final valid.
- UAT device nyata selesai untuk auth, POS, checkout, void, offline/reconnect, stok, dan printer.
- Backup dan incident playbook siap.

## Alternatif yang Ditolak

### Client Direct-to-Database untuk Kecepatan

Ditolak karena checkout, inventory, subscription, dan auth membutuhkan kontrol server-side, audit, dan isolasi data yang konsisten.

### Offline Checkout Penuh Sekarang

Ditolak untuk v2 commercial baseline karena konflik stok lintas device belum punya conflict resolution yang cukup aman.

### Menambah Banyak Fitur Growth Sebelum Release Gate Hijau

Ditolak karena risiko menunda commercial readiness. Fokus sampai release gate hijau adalah hardening, QA, payment, monitoring, dan support.

## Dampak Produk

- Roadmap harus diprioritaskan pada reliability dan commercial gate sebelum fitur baru.
- Setiap permintaan fitur besar wajib dikategorikan: `Now`, `Next`, `Later`, atau `Out of scope`.
- Marketing copy, pricing, dan entitlement harus sinkron dengan `src/lib/subscriptionPlans.ts` dan PRD.

## Dampak Teknis

- Route backend, migration, dan smoke test harus menjadi bagian kontrak release.
- Perubahan API harus mempertimbangkan web dan APK.
- Perubahan payment/subscription harus menyertakan idempotency dan rollback behavior.
- Perubahan offline sync harus punya test conflict/replay.

## Risiko

- PRD bisa cepat usang jika implementasi bergerak tanpa update dokumen.
- RFC bisa menjadi bottleneck jika dipakai untuk perubahan kecil.
- Status readiness bisa terlihat lebih rendah dari klaim lama karena gate dibuat lebih ketat.

Mitigasi:

- RFC hanya wajib untuk perubahan besar.
- Checklist release tetap menjadi dokumen operasional.
- PRD diperbarui saat keputusan Accepted mengubah scope produk.

## Rollout dan Validasi

Validasi minimal:

- PRD memiliki link ke RFC index.
- RFC index tersedia.
- Commercial release mengacu ke status `Commercial`, bukan hanya build success.
- `npm run smoke:production:readiness` menjadi gate wajib.

## Open Questions

- Apakah Google OAuth tetap masuk commercial baseline atau menjadi optional?
- Apakah activation manual tetap dipertahankan setelah Midtrans production aktif?
- Target minimal device/printer matrix untuk commercial launch perlu difinalkan di RFC atau checklist terpisah.
