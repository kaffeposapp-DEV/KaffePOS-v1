# Android Release Signing KaffePOS

Panduan ini dipakai untuk menyiapkan APK/AAB release KaffePOS secara aman tanpa menyimpan kredensial signing ke repository.

## 1. Prinsip dasar

- Jangan commit file keystore atau password ke git.
- Simpan file keystore di lokasi aman yang hanya diakses owner/ops yang berwenang.
- Backup keystore minimal ke 2 lokasi aman yang berbeda.
- Aktifkan Google Play App Signing saat publish agar recovery lebih aman untuk distribusi Play Store.

## 2. Buat release keystore

Jalankan sekali saja pada mesin yang aman:

```bash
keytool -genkeypair -v \
  -keystore kaffepos-release.keystore \
  -alias kaffepos \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=KaffePOS, OU=App, O=KaffePOS, L=Jakarta, S=DKI Jakarta, C=ID"
```

Saat diminta, catat dengan aman:

- `store password`
- `key password`
- `alias`: `kaffepos`

## 3. Opsi konfigurasi yang didukung Gradle

Build Android KaffePOS saat ini membaca signing config dari salah satu opsi berikut:

### Opsi A: `android/keystore.properties`

Buat file [android/keystore.properties](/Users/macbook/kaffepos-new/kaffepos-v2/android/keystore.properties) di folder `android/`:

```properties
storeFile=/ABSOLUTE/PATH/kaffepos-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=kaffepos
keyPassword=YOUR_KEY_PASSWORD
```

### Opsi B: Environment variable

```bash
export KPOS_RELEASE_STORE_FILE="/ABSOLUTE/PATH/kaffepos-release.keystore"
export KPOS_RELEASE_STORE_PASSWORD="YOUR_STORE_PASSWORD"
export KPOS_RELEASE_KEY_ALIAS="kaffepos"
export KPOS_RELEASE_KEY_PASSWORD="YOUR_KEY_PASSWORD"
```

## 4. Build release

```bash
npm run build-apk-release
```

Output default:

- `android/app/build/outputs/apk/release/app-release.apk`

## 5. Backup dan recovery

Minimal simpan keystore di:

1. Password manager / vault tim owner
2. Backup terenkripsi offline atau cloud terpisah

Yang wajib dibackup:

- file `kaffepos-release.keystore`
- alias key
- store password
- key password
- tanggal pembuatan key
- akun Google Play yang memegang rilis

Jika mesin utama hilang atau rusak:

1. Ambil backup keystore dari vault
2. Restore file ke mesin build baru
3. Pasang kembali via `android/keystore.properties` atau environment variable
4. Lakukan test build release sebelum upload ke Play Console

## 6. Rekomendasi Google Play

- Aktifkan **Google Play App Signing**
- Simpan upload key dan recovery note secara terpisah
- Batasi akses Play Console hanya untuk owner/ops yang perlu

## 7. Checklist sebelum publish

- `versionCode` dinaikkan
- `versionName` sesuai rilis
- entri rilis sudah ditambahkan ke [CHANGELOG.md](/Users/macbook/kaffepos-new/kaffepos-v2/CHANGELOG.md)
- build release berhasil
- APK/AAB diuji install di device nyata
- backup keystore tervalidasi
