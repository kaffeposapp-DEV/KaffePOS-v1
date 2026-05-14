# KaffePOS App Update Safety

Dokumen ini menjelaskan bagaimana KaffePOS menjaga data user lama saat aplikasi di-update ke release baru.

## Tujuan

- Update APK/web release tidak membuat aplikasi terasa reset.
- Session valid tetap dipertahankan.
- Theme, settings toko, receipt settings, printer config, dan cache lisensi tetap terbaca.
- First launch setelah update otomatis menjalankan migrasi lokal lalu sync ringan ke backend.
- Backend dan frontend memakai version check agar web/APK tahu kapan perlu soft update, hard update, atau data sync.

## Source Of Truth

- Backend authoritative:
  - akun, profile, store/outlet aktif, menu, inventory, transaksi, lisensi/subscription final
- Local authoritative:
  - theme preset/custom theme
  - printer config perangkat
  - tab/settings preference lokal
  - checkout draft lokal
  - pending offline writes sampai berhasil dikirim
- Hybrid:
  - store settings dan receipt settings disimpan lokal untuk fast bootstrap, lalu divalidasi lagi dari backend
  - subscription cache dipakai untuk fallback cepat, lalu direfresh dari backend

## Database Versioning

Backend memakai migrasi SQL aman dari folder [backend/migrations](/Users/macbook/kaffepos-new/kaffepos-v2/backend/migrations).

Komponen utama:

- tabel `schema_migrations` menyimpan nama migration, checksum, waktu jalan, dan status
- tabel `app_versions` menyimpan versi rilis aktif, minimum web/APK yang didukung, rollout note, dan force update flag
- tabel `app_update_events` mencatat update/sync event per user/store
- script [backend/scripts/run-migrations.mjs](/Users/macbook/kaffepos-new/kaffepos-v2/backend/scripts/run-migrations.mjs) menolak checksum mismatch agar file migration yang sudah pernah jalan tidak diam-diam berubah
- script [backend/scripts/backup-critical-data.mjs](/Users/macbook/kaffepos-new/kaffepos-v2/backend/scripts/backup-critical-data.mjs) membuat backup data kritikal sebelum migration besar

Command release:

```bash
cd backend
npm run backup:critical
npm run migrate
```

Data kritikal yang dicakup backup:

- users/profile/store
- products/menu/inventory/recipes
- transactions/order/payment
- subscriptions/trial
- loyalty/gamification bila tabel tersedia

## Apa Yang Persist Saat Upgrade APK Biasa

Pada upgrade APK normal Android:

- `Capacitor Preferences` tetap ada
- `localStorage` WebView normalnya tetap ada
- backup storage kritikal sekarang juga disalin ke `Capacitor Preferences`
- Android manifest saat ini memakai `android:allowBackup="false"`, jadi app tidak mengandalkan auto-backup cloud Android untuk restore data

Storage kritikal yang dibackup:

- theme aktif dan custom theme
- active tab preference
- active store id
- store settings cache
- printer config dan paper size
- print method
- offline queue penting
- pending writes
- checkout draft
- subscription cache
- marker migration/update

## Apa Yang Hilang Saat Uninstall Penuh

Jika user melakukan uninstall penuh, data perangkat berikut akan hilang:

- localStorage WebView
- Preferences lokal perangkat
- printer pairing config yang hanya disimpan oleh app
- draft lokal/offline queue lokal
- backup storage kritikal lokal yang disimpan oleh app juga ikut hilang karena uninstall menghapus sandbox aplikasi

Yang tetap aman setelah reinstall:

- akun/login bisa dipulihkan dengan login ulang
- profile/store/menu/inventory/transaksi/subscription dari backend tetap ada

Catatan:

- upgrade biasa != uninstall.
- sistem ini dirancang untuk aman saat update release, bukan untuk mempertahankan data lokal setelah app dihapus total.

## Storage Versioning

Migration runner ada di [src/lib/appUpgrade.ts](/Users/macbook/kaffepos-new/kaffepos-v2/src/lib/appUpgrade.ts).

Yang dilakukan saat startup:

1. restore backup kritikal native jika local WebView kosong
2. baca `kaffepos_storage_meta`
3. deteksi `previousAppVersion` dan `schemaVersion`
4. jalankan migrasi berurutan sampai `STORAGE_SCHEMA_VERSION`
5. simpan report ke `kaffepos_update_report`
6. tandai `kaffepos_post_update_sync_pending`

Migration sekarang mencakup:

- normalisasi auth session cache
- migrasi printer lama `kpos_bt_mac` ke `kaffepos_bt_printer`
- normalisasi theme key dan custom theme payload
- normalisasi subscription cache dan monthly transaction cache

## Backend Version Check

Endpoint:

- `GET /api/app/version`
- `POST /api/app/update-events`

Frontend helper:

- [src/lib/appVersion.ts](/Users/macbook/kaffepos-new/kaffepos-v2/src/lib/appVersion.ts)
- [src/components/sync/AppVersionSync.tsx](/Users/macbook/kaffepos-new/kaffepos-v2/src/components/sync/AppVersionSync.tsx)

Behavior:

- app mengirim `clientVersion` dan platform
- backend membalas versi terbaru, minimum supported version, release note, dan mode update
- soft update menampilkan notifikasi ringan
- hard update menampilkan pesan jelas agar user update aplikasi
- update event dicatat untuk debugging rollout

## Recovery Strategy

Jika payload lokal rusak:

- key yang rusak diarsipkan ke `kaffepos_recovery_*`
- key penting diregenerasi dengan fallback aman
- app tidak melakukan wipe total storage
- bootstrap tetap lanjut agar user tidak terjebak blank screen

## Rehydration Setelah Update

Urutan startup:

1. bootstrap restore backup storage kritikal
2. jalankan migration runner
3. apply persisted theme
4. restore cached auth session
5. validasi session ke backend
6. restore cached store context
7. load data lokal dulu untuk fast paint
8. sync profile, license, dan store data ke backend
9. hapus marker `post_update_sync_pending` jika sukses
10. cek `/api/app/version` dan catat event update/sync ke backend

Catatan Android:

- `MainActivity` sudah mengaktifkan DOM storage WebView, jadi `localStorage` tetap tersedia untuk jalur rehydration.
- Jika WebView local storage kosong setelah update edge-case tertentu, backup kritikal dari `Capacitor Preferences` akan dipakai untuk memulihkan state penting.

## UX Setelah Update

- user tidak langsung dilempar ke login jika session masih valid
- ada banner pemulihan ringan di first launch setelah update
- banner hilang sendiri setelah sync selesai atau bisa ditutup user
- jika sync backend gagal sementara, app tetap pakai state lokal yang masih valid
- jika offline, app tetap bisa dipakai dengan cache/queue dan sync update dicoba lagi saat online

## Checklist Release

Sebelum publish release baru:

1. `npm run typecheck`
2. `npm run test`
3. `npm run build:web`
4. `cd backend && npm run backup:critical`
5. `cd backend && npm run migrate`
6. smoke test `GET /api/app/version`
7. smoke test login user lama
8. smoke test upgrade APK lama -> APK baru di device Android
9. verifikasi theme, settings, printer, dan license state tetap ada
10. verifikasi first launch setelah update tidak blank/freeze
11. verifikasi event update masuk ke `app_update_events`
