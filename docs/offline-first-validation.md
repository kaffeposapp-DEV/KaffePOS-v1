# KaffePOS Offline-First Validation

Dokumen ini dipakai untuk staging/Coolify sebelum fitur offline-first dipromosikan ke produksi luas. Jalankan di staging atau environment production-like, bukan di database produksi aktif.

## Scope

- Web app shell tetap terbuka saat jaringan putus.
- POS tunai/transfer bisa disimpan lokal saat offline.
- QRIS/Midtrans tetap online-only.
- Outbox IndexedDB bertahan setelah refresh/relaunch.
- Reconnect memproses queue tanpa duplicate transaction.
- Failed/conflicted sync muncul di Pusat Sinkronisasi.

## Web Smoke Test

1. Login sebagai Owner/Admin atau Kasir staging.
2. Buka POS dan pastikan menu/cache terakhir sudah termuat.
3. Matikan jaringan dari DevTools Network `Offline`.
4. Buat transaksi metode `Tunai`.
5. Pastikan banner `Mode Offline Aktif` muncul dan transaksi bertanda pending.
6. Refresh halaman saat masih offline.
7. Pastikan app shell tidak blank dan transaksi pending masih ada di IndexedDB.
8. Nyalakan jaringan kembali.
9. Pastikan banner berubah ke `Sinkronisasi`, lalu `Semua data tersinkron`.
10. Cek Riwayat dan PostgreSQL staging: transaksi hanya muncul satu kali.

## Conflict Center Smoke Test

1. Buat satu item outbox yang sengaja gagal, misalnya staging API dibuat menolak payload test atau gunakan koneksi terputus saat retry.
2. Pastikan banner menampilkan data gagal sinkron.
3. Buka `Detail` / Pusat Sinkronisasi.
4. Pastikan status item terbaca sebagai `Gagal sinkron` atau `Perlu dicek`.
5. Klik `Ulangi` setelah backend normal.
6. Pastikan item hilang dari daftar bermasalah setelah sukses.
7. Untuk konflik yang memang valid, klik `Tandai Dicek` hanya setelah data final diverifikasi di backend.

## Android Airplane Mode Smoke Test

1. Install APK debug/release dari build staging.
2. Login sekali saat online agar session dan cache awal tersedia.
3. Aktifkan airplane mode.
4. Buka ulang app.
5. Buat transaksi metode `Tunai`.
6. Pastikan tidak ada stuck loading, crash, atau blank screen.
7. Pastikan QRIS/payment online tidak bisa diproses dan pesan menjelaskan perlu internet.
8. Matikan airplane mode.
9. Tunggu auto sync atau buka Pusat Sinkronisasi lalu klik `Sinkronkan Sekarang`.
10. Cek backend/staging DB: transaksi tersimpan satu kali.

## API/PostgreSQL Replay Smoke

Gunakan script ini untuk membuktikan replay transaksi idempotent terhadap API dan PostgreSQL staging.

```bash
KAFFEPOS_SMOKE_CONFIRM=YES \
KAFFEPOS_STAGING_API_URL=https://api-staging.example.com \
KAFFEPOS_SMOKE_EMAIL=owner-staging@example.com \
KAFFEPOS_SMOKE_PASSWORD='***' \
npm run smoke:staging:offline-sync
```

Opsional:

```bash
KAFFEPOS_SMOKE_STORE_ID=<uuid-outlet-staging>
```

Expected result:

- checkout pertama HTTP `201`
- replay checkout HTTP `200`
- transaction id sama
- query riwayat staging menemukan tepat satu transaksi dengan id smoke

## Go/No-Go

Go untuk deploy komersial luas jika:

- web smoke hijau di desktop dan mobile viewport
- Android airplane-mode smoke hijau di minimal satu perangkat nyata
- API/PostgreSQL replay smoke hijau
- tidak ada queue pending/failed tersisa setelah reconnect normal
- tidak ada duplicate transaction/order pada staging DB

No-Go jika:

- app blank saat offline
- transaksi offline hilang setelah relaunch
- QRIS terlihat sukses saat offline
- replay sync membuat transaksi dobel
- Pusat Sinkronisasi tidak bisa menampilkan failed/conflicted item
