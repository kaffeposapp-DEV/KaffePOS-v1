# Product Requirements Document

## KaffePOS v2

Versi dokumen: 1.1
Tanggal: 5 Mei 2026
Basis dokumen: codebase `kaffepos-v2`, backend API self-hosted, PostgreSQL production, konfigurasi aplikasi, migrasi database, dan implementasi UI/flow yang ada saat ini.

---

## 0. Status Dokumen dan Aturan Scope

PRD ini adalah rujukan produk utama untuk KaffePOS v2. Semua fitur besar, perubahan alur bisnis, perubahan arsitektur data, perubahan pricing/entitlement, dan perubahan release gate harus merujuk ke PRD ini atau ke RFC yang sudah diterima.

Dokumen pendamping:

- RFC index: [docs/rfc/README.md](/Users/macbook/kaffepos-new/kaffepos-v2/docs/rfc/README.md)
- RFC scope dan arsitektur awal: [docs/rfc/0001-product-scope-and-architecture.md](/Users/macbook/kaffepos-new/kaffepos-v2/docs/rfc/0001-product-scope-and-architecture.md)
- Go-live checklist: [GO_LIVE_CHECKLIST.md](/Users/macbook/kaffepos-new/kaffepos-v2/GO_LIVE_CHECKLIST.md)
- Final release checklist: [docs/final-release-checklist.md](/Users/macbook/kaffepos-new/kaffepos-v2/docs/final-release-checklist.md)

Aturan perubahan:

1. Perubahan kecil yang hanya memperbaiki bug atau copy boleh langsung masuk selama tidak mengubah kontrak produk.
2. Perubahan fitur yang memengaruhi user journey, data model, subscription, payment, offline sync, printer, auth, atau release gate wajib punya RFC.
3. Jika PRD dan implementasi berbeda, implementasi boleh dianggap sementara, tetapi PRD/RFC harus diperbarui sebelum perubahan dinyatakan selesai.
4. Fitur yang tidak tertulis di bagian "In scope" atau RFC accepted dianggap out of scope sampai disetujui.
5. Commercial release hanya boleh dianggap `GO` jika release gate di PRD dan checklist terkait sudah hijau.

---

## 1. Ringkasan Produk

KaffePOS adalah aplikasi Point of Sale modern untuk kedai kopi, cafe kecil-menengah, bakery, dan bisnis F&B serupa. Produk ini dibangun sebagai web app yang juga dapat dikemas menjadi APK Android melalui Capacitor. Fokus utama produk adalah membantu owner mengelola transaksi kasir, stok bahan baku, resep menu, laporan operasional, dan langganan aplikasi dalam satu sistem yang ringan dipakai harian.

Karakter utama produk saat ini:

- POS harian dengan checkout cepat
- Manajemen menu dan bahan baku berbasis recipe
- Pengurangan stok otomatis saat penjualan
- Laporan penjualan, laba, pengeluaran, dan ringkasan kas
- Insight bisnis berbasis AI
- Dukungan printer thermal browser, Bluetooth, dan USB
- Mode web dan Android dari satu codebase
- Backend API self-hosted
- Pendekatan offline-first terbatas untuk cache dan sinkronisasi ulang

---

## 2. Latar Belakang dan Problem Statement

Target user KaffePOS umumnya masih menjalankan operasional secara semi-manual: transaksi dicatat sederhana, stok bahan tidak sinkron dengan penjualan, laporan dibuat manual, dan owner sulit memantau performa menu serta laba bersih. Banyak solusi POS terlalu kompleks, terlalu mahal, atau tidak cocok untuk alur cafe kecil di Indonesia.

Masalah utama yang ingin diselesaikan:

1. Owner sulit memantau penjualan harian dan profit secara cepat.
2. Stok bahan baku sering tidak akurat karena tidak terhubung ke transaksi menu.
3. Kasir butuh alur checkout sederhana dan cepat di perangkat mobile.
4. Laporan operasional belum rapi untuk evaluasi bisnis.
5. Usaha kecil membutuhkan aplikasi yang bisa tetap nyaman dipakai di Android.
6. Aktivasi pelanggan berbayar harus tetap sederhana walau tanpa payment gateway otomatis.

---

## 3. Visi Produk

Menjadi sistem POS cafe yang sederhana, cepat, dan cukup cerdas untuk membantu owner mengambil keputusan operasional harian tanpa harus belajar software enterprise yang rumit.

---

## 4. Tujuan Produk

### Tujuan bisnis

- Meningkatkan retensi pengguna dengan pengalaman kasir yang ringan dan stabil.
- Mengonversi pengguna gratis ke paket berbayar lewat fitur laporan, printer, dan AI Insight.
- Menjaga biaya operasional backend tetap ramping dengan backend API self-hosted yang sederhana.
- Mendukung distribusi via web dan APK Android dari codebase yang sama.
- Menjaga arah produk tetap sempit: POS F&B ringan untuk operasional harian, bukan ERP umum.

### Tujuan pengguna

- Menyelesaikan transaksi dalam beberapa tap.
- Mengetahui stok bahan kritis sebelum habis.
- Mendapat laporan penjualan dan laba tanpa proses manual.
- Mengatur tampilan struk dan printer sesuai kebutuhan outlet.
- Memahami performa menu dan tren bisnis dengan insight yang mudah dipahami.

---

## 5. Non-Goals Saat Ini

Fitur berikut bukan fokus inti implementasi saat ini atau belum benar-benar terealisasi penuh di codebase:

- Multi-store penuh untuk satu akun owner
- Multi-branch reporting
- Payment gateway otomatis end-to-end
- CRM pelanggan lengkap
- Program loyalty / membership customer
- Integrasi akuntansi eksternal
- Backoffice desktop native terpisah
- Marketplace plugin pihak ketiga
- Fitur marketplace, delivery aggregator, dan ordering customer-facing
- Sistem HR/payroll
- Inventory multi-gudang kompleks
- Custom workflow per pelanggan tanpa RFC

Catatan: struktur data `stores` sudah membuka kemungkinan ekspansi ke multi-store, tetapi implementasi saat ini masih mengasumsikan satu owner memiliki satu store aktif.

---

## 6. Persona Pengguna

### 6.1 Owner Cafe / Founder

Kebutuhan:

- Melihat omzet, profit, stok, dan pengeluaran
- Mengelola menu, harga, dan bahan baku
- Memantau subscription
- Mengatur branding struk dan identitas toko

### 6.2 Kasir

Kebutuhan:

- Menjalankan transaksi cepat
- Memilih metode pembayaran
- Mencetak ulang struk
- Membuka saldo kas harian

### 6.3 Admin Internal KaffePOS

Kebutuhan:

- Mengaktifkan, memperpanjang, dan membatalkan subscription
- Memantau histori pembayaran
- Menjalankan kontrol administratif internal

---

## 7. Scope Produk Saat Ini

### In scope

- Auth email/password, reset password, verifikasi email
- Google sign-in sebagai flow opsional/non-blocker commercial baseline
- Pembuatan profil dan store awal otomatis
- POS checkout
- Menu management
- Inventory management
- Auto inventory deduction via recipe
- Transaction history dan void
- Expense tracking
- Cash register opening
- Dashboard bisnis
- Report export PDF
- AI Insight
- Notification center
- Subscription status dan histori pembayaran
- Admin panel internal
- Android packaging via Capacitor
- Thermal printer support

### Partially implemented / evolving

- Offline queue untuk beberapa operasi data
- Feature entitlement per paket
- Audit log inventori checkout
- Telegram admin workflow
- Operational metrics dashboard
- Midtrans production payment flow
- Production observability dan alerting eksternal

### Explicitly out of scope tanpa RFC baru

- Multi-store penuh dan multi-branch report
- Loyalty, CRM customer, dan delivery/order online
- Integrasi akuntansi eksternal
- Payment provider selain Midtrans
- Mode offline checkout penuh yang tetap memotong stok lintas device
- Custom feature per merchant yang membuat flow POS berbeda dari baseline produk

---

## 8. User Journey Utama

### 8.1 Onboarding

1. User membuka web atau APK.
2. User register dengan email dan password; Google sign-in boleh tersedia sebagai flow opsional.
3. Sistem membuat `profile` dan free subscription default.
4. User verifikasi email melalui OTP / email flow.
5. Saat login pertama, sistem menyiapkan `store` default otomatis jika belum ada.

### 8.2 Operasional harian outlet

1. User login.
2. Sistem load cache lokal dan sinkronkan data store.
3. Kasir melakukan buka kas harian.
4. Kasir memilih item menu, sistem hitung subtotal, diskon, pajak, total.
5. Saat checkout, backend memvalidasi stok dan memotong inventory secara atomik.
6. Transaksi tersimpan dan struk dapat dicetak.
7. Owner melihat dashboard dan laporan.

### 8.3 Pengelolaan subscription

1. User membuka halaman paket/langganan.
2. User memilih plan lalu diarahkan ke alur konfirmasi manual via Instagram/admin.
3. Admin internal mengaktifkan paket dari panel admin.
4. Sistem membuat record subscription, payment history, dan sinkronisasi state profile.

---

## 9. Kebutuhan Fungsional

## 9.1 Authentication & Account

### Fitur

- Login email/password
- Registrasi akun
- Google OAuth opsional/non-blocker commercial baseline
- Forgot password dan reset password
- Verifikasi email dengan OTP
- Welcome email, login alert, password changed email

### Requirement

- Sistem harus mendukung session persistence di web dan native Android.
- Native Android harus aman terhadap kehilangan `localStorage` saat redirect OAuth.
- User hanya boleh mengakses data profil miliknya, kecuali admin internal.
- Setelah signup, sistem harus memastikan record profile tersedia.

### Implementasi saat ini

- Auth backend internal
- Email verification dan reset password diproses backend API
- Capacitor Preferences untuk native session cache
- Resend untuk email transaksional

### Batasan produk

- OAuth Google bukan blocker commercial release jika email/password, OTP verification, session restore, dan reset password stabil.
- Auth/email tidak boleh kembali ke dependency client-side lama atau provider lama tanpa RFC.

---

## 9.2 Store Bootstrapping

### Fitur

- Auto-create store default untuk user baru
- Cache `storeId` lokal
- Load data store utama saat app shell dibuka

### Requirement

- Jika store belum ada, sistem harus membuat store baru otomatis.
- Jika `storeId` tersimpan lokal, sistem boleh menampilkan app lebih cepat sambil verifikasi di background.

---

## 9.3 POS / Checkout

### Fitur

- Katalog menu per kategori
- Pencarian menu
- Cart management
- Diskon nominal / persentase
- Pajak berdasarkan store settings
- Metode pembayaran: Tunai, Transfer, QRIS
- Nama pelanggan opsional
- Struk setelah transaksi

### Requirement

- User harus bisa menambah item ke cart dari daftar menu aktif.
- Sistem harus menghitung subtotal, diskon, pajak, total, uang bayar, dan kembalian.
- Checkout harus menolak transaksi bila stok recipe tidak cukup.
- Checkout offline saat ini dibatasi untuk menjaga akurasi stok lintas perangkat.
- ID transaksi harus unik.

### Aturan bisnis

- Jika metode pembayaran `Tunai`, nominal bayar tidak boleh kurang dari total.
- Jika menu memiliki recipe, stok semua bahan harus cukup.
- COGS dihitung dari recipe dan `cost_per_unit`.

---

## 9.4 Inventory / Gudang

### Fitur

- Tambah bahan baku
- Edit bahan baku
- Restock bahan
- Min stock
- HPP per unit
- Nilai stok
- Relasi bahan ke menu

### Requirement

- Owner harus bisa melihat stok aktual, stok minimum, HPP, dan menu yang memakai bahan.
- Sistem harus membedakan aksi `new`, `edit`, `restock`.
- Restock harus tercatat sebagai expense inventori, bukan pengurang saldo buka kasir.

---

## 9.5 Menu Management

### Fitur

- Tambah/edit/hapus menu
- Toggle availability
- Upload gambar menu
- Kategori
- Deskripsi
- Recipe bahan baku
- Variant data structure

### Requirement

- Menu hanya tampil di POS jika `is_available = true`.
- Menu bisa punya recipe 0..n bahan.
- Sistem harus menampilkan status recipe low stock.
- Upload gambar dibatasi tipe aman dan ukuran file kecil.

### Catatan implementasi

- Struktur variant sudah ada di model data, tetapi UX variant belum sepenuhnya matang di POS.
- Upload R2 langsung dari client sengaja dinonaktifkan; saat ini UI banyak memakai base64/local image path.

---

## 9.6 Transaction History & Void

### Fitur

- List transaksi
- Filter periode
- Search transaksi
- Detail transaksi
- Cetak ulang struk
- Void transaksi dengan alasan

### Requirement

- Void harus mengembalikan stok bahan baku yang sebelumnya terpotong.
- Sistem harus menyimpan `void_reason`, `void_at`, dan `void_by`.
- Transaksi yang sudah void tidak boleh dihitung sebagai revenue aktif pada dashboard dan laporan.

### Implementasi backend penting

- Fungsi database `void_transaction_secure(...)`
- Tabel audit `transaction_inventory_audit`

---

## 9.7 Dashboard

### Fitur

- Ringkasan penjualan hari ini, minggu ini, bulan ini
- Revenue, transaksi, average transaction
- Top products
- Payment mix
- Tren penjualan
- Low stock alert
- Cashier aktif hari ini

### Requirement

- Dashboard harus dapat dibaca cepat oleh owner tanpa masuk ke detail laporan.
- Data harus mengabaikan transaksi void.
- User harus bisa refresh data manual.

---

## 9.8 Reports

### Fitur

- Filter periode: harian, mingguan, bulanan, semua
- KPI revenue, COGS, expense, gross profit, net profit
- Visualisasi trend, top menu, payment mix, stock health
- Export PDF
- Kas harian
- Expense modal
- Cash register modal
- AI Insight

### Requirement

- Laporan harus menampilkan metrik keuangan utama dengan format IDR.
- Export PDF harus menghasilkan file yang bisa dibagikan.
- AI Insight hanya boleh diakses sesuai entitlement paket.
- Jika AI gagal atau kuota habis, sistem harus fallback ke analisis lokal.

### Entitlement yang ada

- `report_export_pdf`
- `report_share_whatsapp`
- `receipt_share_whatsapp`
- `ai_insight`

---

## 9.9 Settings

### Fitur

- Identitas toko
- Alamat, WhatsApp, email, website
- Logo toko
- Header/footer struk
- Konfigurasi pajak
- Layout struk
- Pilihan paper width 58mm / 80mm
- Preview struk
- Ubah display name kasir
- Notification center
- Subscription section
- Logout

### Requirement

- Perubahan store settings harus auto-save dengan debounce.
- Settings aman disimpan ke local cache bila backend sedang gagal.
- User dapat mengatur printer dan preview hasil struk sebelum mencetak.

---

## 9.10 Printer Management

### Fitur

- Browser print
- Classic Bluetooth printer
- Web Bluetooth fallback
- USB printer
- Auto reconnect printer
- Simpan metode print favorit

### Requirement

- Sistem harus mendukung beberapa jalur cetak sesuai platform.
- Native Android harus mendukung printer thermal Bluetooth klasik.
- Jika printer tidak tersedia, user tetap bisa memakai browser print.

---

## 9.11 Notifications

### Fitur

- In-app notifications
- Unread badge realtime
- Email notification untuk event penting

### Requirement

- User hanya boleh membaca notifikasi miliknya sendiri.
- Notification badge harus update realtime.
- Tipe notifikasi minimal: info, success, warning, error, welcome.

---

## 9.12 Subscription & Billing

### Model bisnis saat ini

- `secangkir` (gratis)
- `kopi_susu`
- `signature`
- `founder`

### Billing cycle

- `free`
- `monthly`
- `quarterly`
- `yearly`

### Fitur

- Menampilkan paket aktif user
- Histori pembayaran
- Flow upgrade/perpanjang manual
- Admin activation

### Requirement

- User gratis harus otomatis punya subscription aktif paket `secangkir`.
- Aktivasi manual harus membuat data subscription dan payment history.
- Perubahan subscription harus menyinkronkan state `profiles`.
- Admin internal harus bisa renew dan cancel subscription.

### Catatan produk

- Current source of truth plan dan harga ada di `src/lib/subscriptionPlans.ts`.
- Landing page publik masih memuat copy marketing yang tidak sepenuhnya sinkron dengan definisi paket internal, sehingga perlu alignment produk/marketing di iterasi berikutnya.
- Sampai Midtrans production dinyatakan hijau, commercial flow yang boleh dipakai adalah aktivasi manual admin atau pilot terbatas.
- Paid launch umum wajib menunggu production payment settlement, webhook idempotency, subscription activation, dan smoke readiness production hijau.

---

## 9.13 Admin Internal

### Fitur

- Whitelist admin email
- Admin panel web
- Aktivasi langganan
- Daftar subscription aktif
- Histori pembayaran
- Renew / cancel
- Telegram admin pending actions
- Admin action logs

### Requirement

- Hanya email admin yang boleh mengakses panel admin.
- Aktivasi subscription harus diproses server-side.
- Semua aksi admin sensitif sebaiknya memiliki audit log.

---

## 10. Kebutuhan Non-Fungsional

## 10.1 Reliability

- Aplikasi harus tetap usable walau koneksi putus untuk kebutuhan baca cache dan sebagian penulisan antrian.
- Sinkronisasi ulang harus berjalan saat koneksi kembali online.
- Auth flow native harus tahan terhadap gangguan lifecycle Android.

## 10.2 Performance

- App shell harus cepat tampil dengan cache `storeId`.
- Query utama harus dibatasi per store dan memakai index yang memadai.
- Dashboard dan tab lain memakai lazy loading.

## 10.3 Security

- Semua data store harus terisolasi lewat RLS.
- Aksi sensitif harus diproses lewat backend API atau DB function terproteksi.
- Secret tidak boleh dibundle ke frontend.
- Rate limit diperlukan untuk email verification dan endpoint sensitif.

## 10.4 Data Integrity

- Checkout inventory harus atomik.
- Void harus mengembalikan stok sesuai audit transaksi.
- Constraint database harus mencegah nilai negatif yang tidak valid.

## 10.5 Maintainability

- Satu codebase untuk web dan Android
- Backend API self-hosted yang kecil, eksplisit, dan mudah dioperasikan
- Dokumentasi operasional non-engineering tersedia di repo
- Perubahan kontrak API, database, auth, payment, sync, dan printer harus tercatat di RFC atau migration doc

## 10.6 Release Readiness

Commercial release dinyatakan `GO` hanya jika:

- `npm run check` hijau.
- `npm run build:mobile` hijau.
- `npm run smoke:production:readiness` hijau.
- `/health` dan `/system-status` production hijau tanpa warning blocker.
- Midtrans production aktif jika paid checkout online dibuka.
- Backend dan frontend error tracking production aktif.
- CORS mengizinkan web production dan origin APK final.
- UAT device nyata mencakup auth, POS, checkout, void, offline/reconnect, stock integrity, dan printer.

Status release yang boleh dipakai:

- `Internal`: hanya developer/admin, data boleh reset.
- `Pilot`: merchant terbatas, payment boleh manual, monitoring manual harian wajib.
- `Commercial`: payment, support, monitoring, backup, dan QA lapangan sudah memenuhi release gate.

---

## 11. Tech Stack

## 11.1 Frontend

- React 18
- TypeScript
- Vite
- React Router DOM
- Zustand
- Tailwind CSS
- Lucide React
- Recharts
- Zod

## 11.2 Mobile / Native Layer

- Capacitor v6
- Android platform via `@capacitor/android`
- Capacitor plugins: App, Browser, Filesystem, Haptics, Keyboard, Network, Preferences, Share, Splash Screen, Status Bar, Toast
- auth email/password internal berbasis backend API
- `@kduma-autoid/capacitor-bluetooth-printer`

## 11.3 Backend / Cloud

- Auth backend internal
- PostgreSQL production
- Express backend API self-hosted
- Coolify deployment
- JSON stdout/stderr logging
- Health check `/health`
- System status `/system-status`
- Upload storage saat ini masih nonaktif

## 11.4 Reporting & Documents

- jsPDF
- jspdf-autotable

## 11.5 AI

- Google Gemini 2.0 Flash Lite via backend API proxy
- Local fallback insight generator di frontend

## 11.6 Email / Notifications

- Resend untuk pengiriman email transaksional

## 11.7 Testing & Quality

- Vitest
- Testing Library
- ESLint
- TypeScript typecheck

## 11.8 Ops / Monitoring

- Backend request/error logging
- Ops metrics dashboard view di database/API
- Firebase Crashlytics direkomendasikan untuk APK
- Sentry untuk frontend/backend error tracking production

---

## 12. Arsitektur Sistem

## 12.1 High-level architecture

1. User mengakses web app atau APK Android.
2. Frontend React berinteraksi dengan backend API internal.
3. Auth dikelola oleh backend API internal.
4. Data inti disimpan di PostgreSQL production.
5. Backend API memproses checkout, void, inventory, auth/email, subscription, AI insight proxy, admin action, dan ops metrics.
6. Client memakai cache lokal dan refresh terkontrol untuk pengalaman offline-assisted.
7. APK Android dibangun dari frontend yang sama melalui Capacitor.

## 12.2 Architectural style

- Monolithic frontend app
- Express API backend
- PostgreSQL sebagai source of truth data bisnis
- Offline-assisted client cache
- Security by server-side authorization, role checks, session token, dan constraint database

## 12.3 Architecture Decision Boundaries

- Frontend tidak boleh langsung menulis data bisnis utama ke database.
- Secret payment, email, AI, dan database hanya boleh berada di backend/server environment.
- Checkout dan void wajib berada di backend agar inventory audit konsisten.
- Offline mode tidak boleh menjanjikan checkout penuh lintas device sebelum ada RFC khusus conflict resolution.
- APK dan web harus memakai backend API yang sama untuk data bisnis.
- Perubahan auth, payment, subscription, inventory, sync, atau printer wajib punya RFC bila mengubah behavior publik.

---

## 13. Database Overview

Berikut ringkasan entitas utama berdasarkan SQL schema aktif di folder `database/`.

## 13.1 Core business tables

### `profiles`

Menyimpan profil user aplikasi.

Kolom penting:

- `id`
- `username`
- `display_name`
- `email`
- `tier`
- `tier_expires_at`
- legacy and subscription sync fields: `is_pro`, `pro_plan`, `pro_order_id`, `pro_activated_at`, `pro_expires_at`

### `stores`

Menyimpan identitas outlet.

Kolom penting:

- `id`
- `owner_id`
- `store_name`
- `address`
- `whatsapp`
- `tax_percent`
- `receipt_header`
- `receipt_footer`
- `logo_url`
- `logo_base64`
- `paper_width`
- receipt display settings
- `timezone`

### `menu_items`

Menyimpan daftar menu jual.

Kolom penting:

- `id`
- `store_id`
- `name`
- `price`
- `category`
- `image_url`
- `description`
- `is_available`
- `sort_order`
- `recipe` (JSONB)
- `variants` (JSONB)

### `inventory`

Menyimpan bahan baku.

Kolom penting:

- `id`
- `store_id`
- `name`
- `stock`
- `unit`
- `min_stock`
- `cost_per_unit`

### `transactions`

Menyimpan transaksi penjualan.

Kolom penting:

- `id`
- `store_id`
- `date`
- `items` (JSONB)
- `subtotal`
- `discount`
- `discount_label`
- `tax`
- `total`
- `cogs`
- `paid`
- `change`
- `method`
- `customer_name`
- `cashier`
- `note`
- `is_void`
- `void_reason`
- `void_at`
- `void_by`

### `transaction_inventory_audit`

Audit perubahan stok akibat sale/void.

Kolom penting:

- `transaction_id`
- `inventory_id`
- `action`
- `qty_delta`
- `stock_before`
- `stock_after`

### `expenses`

Pengeluaran operasional dan inventori.

Kolom penting:

- `id`
- `store_id`
- `date`
- `description`
- `amount`
- `category`
- `cashier`
- `source`

### `cash_flow`

Mutasi modal tunai masuk/keluar.

### `cash_register`

Dipakai di app state untuk saldo buka kas harian.

### `cashier_sessions`

Session operasional kasir per hari.

Kolom penting:

- `store_id`
- `session_date`
- `status`
- `opening_cash`
- `cashier_name`
- `opened_at`
- `expected_cash`
- `counted_cash`
- `variance_amount`
- `closed_at`

---

## 13.2 Subscription & commercial tables

### `subscriptions`

Sumber status langganan user.

Kolom penting:

- `user_id`
- `store_id`
- `tier`
- `period`
- `plan`
- `billing_cycle`
- `status`
- `activated_at`
- `expires_at`
- `payment_amount`
- `payment_method`
- `payment_note`
- `payment_ref`

### `payment_history`

Histori pembayaran langganan.

### `license_keys`

Legacy/manual activation key table.

---

## 13.3 Communication & support tables

### `notifications`

Notifikasi in-app user.

### `email_verification_codes`

OTP verifikasi email.

### `ai_insight_logs`

Rate limit / usage log AI Insight.

---

## 13.4 Security & operations tables

### `app_rate_limits` / in-memory rate limit

Rate limiting untuk endpoint auth, email, payment, dan endpoint sensitif lain.

### `ops_event_logs`

Log event operasional seperti login, checkout, dan failure penting.

### `backend_error_events` / external error tracking

Error tracking backend production melalui provider eksternal seperti Sentry.

### `admin_action_logs`

Audit aktivitas admin internal.

### `telegram_admin_pending_actions`

Queue konfirmasi aksi admin via Telegram.

### `telegram_admin_drafts`

Draft notifikasi admin Telegram.

### `sync_log`

Legacy/offline sync support log.

---

## 14. Database Rules & Security Model

### Prinsip utama

- Semua tabel utama menggunakan Row Level Security.
- Akses store-based dibatasi lewat relasi `store_id -> stores.owner_id`.
- User hanya boleh melihat data sendiri untuk profile, subscription, payment history, notifications.
- Admin internal mendapatkan akses tambahan via fungsi `is_admin_email()`.
- Tabel sensitif operasional hanya dapat diakses oleh backend/admin path yang terotorisasi.

### Proteksi penting

- `process_checkout(...)` melakukan validasi owner store dan stok sebelum insert transaksi
- `void_transaction_secure(...)` mengembalikan stok dan update status transaksi
- Aktivasi subscription berjalan server-side dengan admin whitelist dan audit log
- Verifikasi email memakai rate limit dan token/code yang kedaluwarsa

---

## 15. Backend API Services

### Subscription activation/admin

Fungsi:

- Aktivasi langganan manual
- Insert subscription
- Insert payment history
- Kirim email aktivasi subscription

### AI insight proxy

Fungsi:

- Proxy aman ke Gemini API
- Validasi login
- Cek limit berdasarkan paket
- Balikkan JSON insight

### Auth/email notification

Fungsi:

- Kirim email welcome
- Email verifikasi
- Password reset
- Subscription activated
- Reminder expiry
- Login alert
- Password changed

### Email verification

Fungsi:

- Validasi OTP email
- Confirm user email
- Pastikan profile ada
- Buat notification sukses
- Kirim welcome email

### Ops event tracking

Fungsi:

- Rekam event login/checkout success-failure

---

## 16. Realtime & Offline Behavior

## 16.1 Refresh / realtime

Data utama dibaca melalui backend API dengan refresh terkontrol. Realtime/push boleh digunakan untuk area yang benar-benar membutuhkan update cepat, tetapi bukan syarat untuk semua modul.

Area yang harus tetap konsisten saat refresh/sync:

- `transactions`
- `inventory`
- `menu_items`
- `expenses`
- `cash_flow`
- `profiles`
- `notifications`
- `subscriptions`
- `payment_history`
- `cashier_sessions`

## 16.2 Offline strategy

Strategi offline saat ini bersifat pragmatic offline-assisted, bukan full offline-first.

Yang tersedia:

- Cache localStorage untuk menu, inventory, transactions, expenses, cash flow, cash register, settings
- Pending writes queue untuk sebagian operasi CRUD
- Reload dan flush antrian saat kembali online

Batasan:

- Checkout offline sengaja dibatasi demi konsistensi stok
- Konflik multi-device belum memakai engine sinkronisasi kompleks

---

## 17. Observability & Operational Metrics

Sistem sudah mulai memiliki lapisan observability:

- `ops_event_logs` untuk login dan checkout
- request/error logging backend
- view `ops_daily_metrics` untuk dashboard operasional
- retention cleanup function `cleanup_operational_retention(...)`
- Sentry frontend/backend untuk production error tracking

Metric utama yang bisa dipantau:

- login success rate
- checkout success rate
- OTP verification success rate
- backend/API failure trend

---

## 18. Testing Strategy Saat Ini

Test suite yang ada mengindikasikan area yang dijaga:

- auth flow
- subscription logic
- printer flow
- transaction logic
- AI insight

Tooling:

- Vitest
- Testing Library
- jsdom

Rekomendasi peningkatan:

- Tambah integration tests untuk checkout atomik vs inventory
- Tambah test entitlement fitur per paket
- Tambah test admin panel dan subscription activation flow

---

## 19. Risiko dan Keterbatasan Produk Saat Ini

1. Multi-store belum benar-benar menjadi flow resmi meski model data mengarah ke sana.
2. Subscription copy antara landing page dan internal plan definition belum sepenuhnya konsisten.
3. Upload file media ke R2 belum aktif untuk jalur produksi frontend.
4. Variant menu sudah ada di struktur data, namun belum dimonetisasi sebagai flow POS yang kaya.
5. Offline mode masih terbatas untuk read cache dan write queue tertentu.
6. Ada kombinasi field subscription legacy dan field model baru yang masih perlu dirapikan jangka panjang.

---

## 20. Prioritas Roadmap Produk

## Fase 1: Stabilitas Operasional

- Konsolidasi field subscription legacy vs baru
- Perkuat test checkout, void, dan inventory
- Rapikan upload asset/logo/menu image
- Sinkronkan copy pricing public vs internal

## Fase 2: Penguatan Bisnis

- Multi-kasir lebih formal
- Penutupan kas harian lengkap
- Share report/receipt ke WhatsApp sesuai entitlement
- Dashboard operasional owner yang lebih tajam

## Fase 3: Scale Up

- Multi-store / multi-branch
- Staff roles lebih granular
- Backup/restore yang lebih kuat
- Monitoring mobile production yang terintegrasi penuh

---

## 21. Kesimpulan

KaffePOS v2 saat ini sudah berada pada tahap produk operasional yang cukup lengkap untuk kebutuhan POS cafe modern skala kecil sampai menengah. Diferensiasi utamanya ada pada kombinasi POS mobile-friendly, inventory berbasis recipe, laporan yang rapi, AI insight, dan arsitektur cloud yang tetap sederhana dirawat.

Secara teknis, fondasi produk sudah kuat:

- frontend modern dan ringan
- backend API self-hosted di Coolify
- kontrol keamanan berbasis authorization backend, role checks, session token, dan constraint database
- server-side API untuk flow sensitif
- dukungan Android melalui Capacitor

Fokus pengembangan berikutnya paling masuk akal adalah menyelesaikan release gate commercial, konsolidasi model subscription/payment production, penyempurnaan offline/reliability, alignment marketing-product, dan ekspansi fitur operasional owner hanya setelah gate utama hijau.
