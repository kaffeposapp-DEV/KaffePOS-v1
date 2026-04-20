# Product Requirements Document

## KaffePOS v2

Versi dokumen: 1.0  
Tanggal: 20 April 2026  
Basis dokumen: codebase `kaffepos-v2`, konfigurasi aplikasi, migrasi Supabase, dan implementasi UI/flow yang ada saat ini.

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
- Backend cloud menggunakan Supabase
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
- Menjaga biaya operasional backend tetap ramping dengan arsitektur managed service.
- Mendukung distribusi via web dan APK Android dari codebase yang sama.

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

- Auth email/password, reset password, Google sign-in, verifikasi email
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

---

## 8. User Journey Utama

### 8.1 Onboarding

1. User membuka web atau APK.
2. User register dengan email dan password, atau login Google.
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
- Google OAuth
- Forgot password dan reset password
- Verifikasi email dengan OTP
- Welcome email, login alert, password changed email

### Requirement

- Sistem harus mendukung session persistence di web dan native Android.
- Native Android harus aman terhadap kehilangan `localStorage` saat redirect OAuth.
- User hanya boleh mengakses data profil miliknya, kecuali admin internal.
- Setelah signup, sistem harus memastikan record profile tersedia.

### Implementasi saat ini

- Supabase Auth
- PKCE auth flow
- Capacitor Preferences untuk native session cache
- Edge Function `verify-email-code`
- Edge Function `send-notification`

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
- Aksi sensitif harus diproses lewat Edge Function atau DB function terproteksi.
- Secret tidak boleh dibundle ke frontend.
- Rate limit diperlukan untuk email verification dan endpoint sensitif.

## 10.4 Data Integrity

- Checkout inventory harus atomik.
- Void harus mengembalikan stok sesuai audit transaksi.
- Constraint database harus mencegah nilai negatif yang tidak valid.

## 10.5 Maintainability

- Satu codebase untuk web dan Android
- Managed backend untuk menekan beban infra
- Dokumentasi operasional non-engineering tersedia di repo

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
- `@codetrix-studio/capacitor-google-auth`
- `@kduma-autoid/capacitor-bluetooth-printer`

## 11.3 Backend / Cloud

- Supabase Auth
- Supabase Postgres
- Supabase Realtime
- Supabase Edge Functions
- Supabase Storage pattern planned, tetapi upload client direct ke R2 currently disabled

## 11.4 Reporting & Documents

- jsPDF
- jspdf-autotable

## 11.5 AI

- Google Gemini 2.0 Flash Lite via Supabase Edge Function proxy
- Local fallback insight generator di frontend

## 11.6 Email / Notifications

- Resend untuk pengiriman email transaksional

## 11.7 Testing & Quality

- Vitest
- Testing Library
- ESLint
- TypeScript typecheck

## 11.8 Ops / Monitoring

- Edge function event logging
- Ops metrics dashboard view di database
- Firebase Crashlytics direkomendasikan untuk APK

---

## 12. Arsitektur Sistem

## 12.1 High-level architecture

1. User mengakses web app atau APK Android.
2. Frontend React berinteraksi dengan Supabase client.
3. Auth dikelola oleh Supabase Auth.
4. Data inti disimpan di Supabase Postgres.
5. Realtime dipakai untuk sebagian sinkronisasi dan badge update.
6. Edge Functions menangani logic server-side seperti:
   - verifikasi email
   - kirim notifikasi email
   - aktivasi subscription
   - AI insight proxy
   - ops metrics logging
7. APK Android dibangun dari frontend yang sama melalui Capacitor.

## 12.2 Architectural style

- Monolithic frontend app
- Managed BaaS backend
- Offline-assisted client cache
- Security by RLS + server-side privileged actions

---

## 13. Database Overview

Berikut ringkasan entitas utama berdasarkan migrasi aktif di folder `supabase/migrations`.

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

### `edge_rate_limits`

Rate limiting internal Edge Functions.

### `edge_function_events`

Log event Edge Functions.

### `ops_event_logs`

Log login dan checkout success/failure.

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
- Tabel sensitif operasional hanya dapat diakses `service_role`.

### Proteksi penting

- `process_checkout(...)` melakukan validasi owner store dan stok sebelum insert transaksi
- `void_transaction_secure(...)` mengembalikan stok dan update status transaksi
- `activate-subscription` berjalan di Edge Function dengan service role/admin whitelist
- `verify-email-code` memakai rate limit dan service role

---

## 15. Edge Functions

### `activate-subscription`

Fungsi:

- Aktivasi langganan manual
- Insert subscription
- Insert payment history
- Kirim email aktivasi subscription

### `ai-insight`

Fungsi:

- Proxy aman ke Gemini API
- Validasi login
- Cek limit berdasarkan paket
- Balikkan JSON insight

### `send-notification`

Fungsi:

- Kirim email welcome
- Email verifikasi
- Password reset
- Subscription activated
- Reminder expiry
- Login alert
- Password changed

### `verify-email-code`

Fungsi:

- Validasi OTP email
- Confirm user email
- Pastikan profile ada
- Buat notification sukses
- Kirim welcome email

### `track-ops-event`

Fungsi:

- Rekam event login/checkout success-failure

---

## 16. Realtime & Offline Behavior

## 16.1 Realtime

Realtime diaktifkan untuk tabel yang relevan seperti:

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
- `edge_function_events` untuk edge execution
- view `ops_daily_metrics` untuk dashboard operasional
- retention cleanup function `cleanup_operational_retention(...)`

Metric utama yang bisa dipantau:

- login success rate
- checkout success rate
- OTP verification success rate
- edge failure trend

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
- backend managed di Supabase
- kontrol keamanan berbasis RLS
- server-side function untuk flow sensitif
- dukungan Android melalui Capacitor

Fokus pengembangan berikutnya paling masuk akal adalah konsolidasi model subscription, penyempurnaan offline/reliability, alignment marketing-product, dan ekspansi ke fitur operasional owner yang lebih dalam.

