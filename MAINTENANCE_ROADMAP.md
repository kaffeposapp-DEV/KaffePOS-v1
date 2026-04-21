# KaffePOS Maintenance Roadmap (Non-Programmer)

Dokumen ini dibuat untuk owner / operator yang tidak punya background programmer, agar tahu apa yang perlu dicek tanpa harus paham coding.

## Stack yang Dipakai Saat Ini

- **Website + domain aktif:** `kaffepos.my.id`
- **Database + Auth + backend ringan:** PostgreSQL + backend API internal
- **Email OTP / reset / welcome:** Resend
- **APK Android:** Capacitor
- **Monitoring error APK yang direkomendasikan:** Firebase Crashlytics

Prinsip utamanya:

- Jangan tambah terlalu banyak tools dulu.
- Rawat yang inti dan benar-benar dipakai tiap hari.
- Kalau ada masalah, cek dari yang paling sederhana dulu.

## Yang Paling Penting Dijaga

1. **Website aktif**
2. **Login / register / OTP normal**
3. **Transaksi tersimpan**
4. **Email OTP / reset masuk**
5. **APK tidak sering force close**

## Checklist Harian

Waktu ideal: 5-10 menit.

- Buka `https://kaffepos.my.id`
- Pastikan halaman bisa dibuka normal
- Coba login 1 akun uji
- Cek apakah ada laporan user:
  - tidak bisa login
  - OTP tidak masuk
  - transaksi hilang
  - APK keluar sendiri
  - menu / stok tidak sinkron
- Cek email admin / support untuk laporan masuk

Kalau semua normal, tidak perlu tindakan lain.

## Checklist Mingguan

Waktu ideal: 20-40 menit.

### 1. Cek backend dan database

Masuk ke Coolify dan PostgreSQL monitoring lalu cek:

- jumlah user baru terlihat normal
- tabel penting tetap bertambah normal
- log function tidak penuh error

Fokus ke function:

- `auth-email`
- `verify-email-code`
- `send-notification`

Kalau ada error berulang, catat tanggal dan pesannya.

### 2. Cek Resend

Masuk ke dashboard Resend lalu cek:

- email delivered normal
- tidak banyak bounce
- tidak banyak email gagal
- domain pengirim tetap verified

Kalau banyak email gagal:

- cek domain DNS
- cek kuota / billing
- cek apakah ada error dari edge function

### 3. Cek APK Stability

Kalau Crashlytics sudah aktif:

- lihat crash paling sering
- lihat apakah error naik dibanding minggu sebelumnya
- lihat device / versi Android yang paling sering bermasalah

Kalau Crashlytics belum aktif:

- minimal kumpulkan laporan user yang bilang APK force close / blank / logout sendiri

### 4. Test 4 Flow Utama

Lakukan test manual singkat:

1. login
2. register + OTP
3. tambah menu / stok
4. checkout POS

## Checklist Bulanan

Waktu ideal: 1-2 jam.

### 1. Backup & Review Data

- lakukan backup data penting
- pastikan transaksi masih bisa diakses
- pastikan user baru tetap tercatat

### 2. Review Billing / Quota

Cek dashboard layanan:

- Backend API
- Resend
- hosting/domain
- Firebase jika dipakai

Yang dicek:

- tagihan naik wajar atau tidak
- kuota hampir habis atau tidak
- ada limit yang sering kena atau tidak

### 3. Uji APK di Device Nyata

Minimal test di 2 tipe HP:

- 1 HP kelas menengah
- 1 HP yang lebih rendah / lama

Flow yang diuji:

- buka app
- login
- tambah transaksi
- pindah tab
- background lalu buka lagi
- cetak / laporan bila fitur itu dipakai

### 4. Review Komplain User

Kelompokkan komplain:

- login / akun
- email OTP
- transaksi
- sinkronisasi data
- crash APK
- tampilan / kebingungan user

Kalau komplain paling banyak di satu area, itu prioritas perbaikan bulan berikutnya.

## Kalau Ada Masalah, Ceknya Urut Begini

### 1. Website tidak bisa dibuka

Cek:

- domain / hosting
- koneksi internet
- apakah hanya kamu atau semua user

### 2. User tidak bisa login

Cek:

- Auth internal backend
- apakah email sudah verified
- apakah ada error di function auth

### 3. OTP / reset email tidak masuk

Cek:

- Resend delivery
- domain verified
- log `auth-email`
- log `verify-email-code`

### 4. Data transaksi tidak sinkron

Cek:

- PostgreSQL production
- koneksi internet device
- apakah masalah terjadi di 1 akun atau banyak akun

### 5. APK force close / blank

Cek:

- Crashlytics
- device model
- versi Android
- langkah yang dilakukan user sebelum crash

## Kapan Harus Minta Bantuan Teknis

Segera minta bantuan kalau:

- login gagal untuk banyak user
- OTP tidak masuk ke hampir semua user
- transaksi hilang / tidak tersimpan
- website down
- APK crash berulang di banyak device
- billing / kuota utama hampir habis

## Tanda Sistem Masih Aman

- website bisa dibuka
- login normal
- OTP masuk
- transaksi tersimpan
- komplain user sedikit
- tidak ada lonjakan error di logs

## Tanda Sudah Perlu Naik Kelas

Belum perlu sekarang, tapi pertimbangkan nanti kalau:

- user bertambah banyak
- OTP sering diserang / spam
- traffic naik tajam
- butuh push notification
- butuh analytics funnel lebih detail
- butuh background job otomatis yang lebih kompleks

Urutan upgrade yang paling masuk akal nanti:

1. Firebase Crashlytics
2. Cloudflare
3. Upstash rate limit
4. PostHog
5. OneSignal
6. Trigger.dev

## Ringkasan Super Singkat

### Tiap hari
- cek website
- cek login
- cek komplain

### Tiap minggu
- cek Coolify logs
- cek Resend delivery
- cek stabilitas APK
- test 4 flow utama

### Tiap bulan
- backup
- cek billing
- test APK di device nyata
- review komplain user
