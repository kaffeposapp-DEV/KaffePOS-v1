# Firebase Crashlytics Setup for KaffePOS

Panduan ini dibuat khusus untuk project KaffePOS agar owner non-programmer tetap bisa mengikuti proses setup dengan aman.

## Tujuan

Crashlytics dipakai untuk memantau:

- app crash
- force close
- ANR (app hang / not responding)
- error berulang di device Android tertentu

Ini sangat penting untuk APK produksi karena masalah di HP user sering tidak terlihat dari dashboard web biasa.

## Status Repo Saat Ini

Project ini **sudah disiapkan** agar Firebase Crashlytics bisa dipasang tanpa mengubah jalur build utama yang sekarang.

Yang sudah ada:

- package Android: `com.kaffepos.app`
- file Gradle sudah siap membaca `google-services.json` kalau nanti dimasukkan
- plugin Google Services + Firebase Crashlytics sudah disiapkan secara conditional

Artinya:

- kalau `google-services.json` **belum ada**, build tetap jalan seperti biasa
- kalau `google-services.json` **sudah ada**, Firebase dan Crashlytics akan ikut aktif

## Sebelum Mulai

Siapkan:

1. akun Google
2. akses ke [Firebase Console](https://firebase.google.com/)
3. akses ke Android Studio / folder project ini

## Langkah 1 - Buat Project Firebase

1. Buka Firebase Console
2. Klik **Create project**
3. Nama project bisa dibuat: `KaffePOS`
4. Google Analytics:
   - kalau bingung, **boleh aktifkan**
   - kalau mau simpel, tetap aman untuk diaktifkan
5. Tunggu sampai project selesai dibuat

## Langkah 2 - Tambahkan Android App

Di Firebase project:

1. Klik **Add app**
2. Pilih **Android**
3. Isi:
   - **Android package name:** `com.kaffepos.app`
   - **App nickname:** `KaffePOS Android`
4. SHA-1:
   - boleh dilewati dulu kalau fokusnya hanya Crashlytics
   - nanti dibutuhkan lebih penting untuk beberapa layanan lain

Lalu klik **Register app**

## Langkah 3 - Download `google-services.json`

Setelah app Android dibuat:

1. Download file `google-services.json`
2. Simpan file itu ke lokasi:

```text
android/app/google-services.json
```

Catatan:

- file ini **jangan diubah namanya**
- file ini biasanya **tidak perlu di-commit ke git publik**

## Langkah 4 - Sync Project

Setelah file `google-services.json` diletakkan di `android/app/`:

Jalankan:

```bash
npm run build:mobile
npx cap sync android
```

Lalu buka project Android:

```bash
npx cap open android
```

## Langkah 5 - Build APK Baru

Untuk test:

```bash
npm run build-apk-debug
```

Kalau build sukses, berarti integrasi Firebase dasar sudah terbaca.

## Langkah 6 - Aktifkan Crashlytics di Firebase

Di Firebase Console:

1. Masuk ke menu **Crashlytics**
2. Pilih app Android `com.kaffepos.app`
3. Ikuti wizard sampai status Crashlytics aktif

Biasanya Firebase akan menunggu app mengirim event pertama.

## Langkah 7 - Kirim Test Crash

Setelah APK terpasang di HP test:

1. buka app
2. pakai app beberapa detik
3. lakukan test crash dengan bantuan developer, atau tambahkan tombol crash test sementara

Kalau belum mau menambah tombol khusus, langkah aman adalah:

- install APK test
- pakai dulu internal
- tunggu crash nyata pertama dari device test

Tetapi paling ideal tetap ada **1 test crash terkontrol** agar kamu yakin Crashlytics benar-benar aktif.

## Apa yang Harus Dicek Setelah Aktif

Masuk ke Firebase Crashlytics lalu cek:

- apakah crash pertama muncul
- device model apa yang crash
- versi app berapa
- Android version berapa
- issue paling sering apa

## Rutinitas Setelah Crashlytics Aktif

### Mingguan

- buka Firebase Crashlytics
- lihat apakah ada crash baru
- lihat issue mana yang paling sering
- catat device / versi Android yang paling bermasalah

### Bulanan

- bandingkan crash bulan ini vs bulan lalu
- cek apakah rilis baru bikin crash naik
- prioritaskan 1-3 crash paling sering

## Kalau Setup Gagal

Urutan cek:

1. apakah file `android/app/google-services.json` benar-benar ada
2. apakah package name di Firebase sama dengan:

```text
com.kaffepos.app
```

3. apakah build APK terbaru sudah dibuat ulang setelah file dimasukkan
4. apakah Firebase project yang dipakai benar
5. apakah app test sudah dibuka setelah install

## Hal yang Jangan Dilakukan

- jangan ganti `applicationId` tanpa alasan
- jangan pakai `google-services.json` dari project Firebase lain
- jangan commit file Firebase ke repo publik kalau tidak yakin aman
- jangan langsung aktifkan banyak layanan Firebase lain kalau tujuanmu hanya Crashlytics

## Ringkasan Super Singkat

1. Buat project Firebase
2. Tambah app Android `com.kaffepos.app`
3. Download `google-services.json`
4. Simpan ke `android/app/google-services.json`
5. Build ulang APK
6. Buka Crashlytics dashboard
7. Pastikan crash pertama masuk
