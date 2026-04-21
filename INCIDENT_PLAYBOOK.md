# KaffePOS Incident Playbook

Dokumen ini dipakai saat ada gangguan produksi.

## Prioritas respon

1. **Auth gagal total**
2. **Checkout / transaksi gagal**
3. **Sinkronisasi data kacau**
4. **Print struk gagal massal**
5. **Email OTP / reset / welcome gagal**

## Respon pertama 10 menit

1. Buka `kaffepos.my.id`
2. Coba login dengan akun uji
3. Cek log backend API di Coolify:
   - `auth-email`
   - `verify-email-code`
   - `send-notification`
4. Cek dashboard Resend
5. Cek Firebase Crashlytics untuk error APK

## Jika login / OTP gagal

1. Cek env `RESEND_API_KEY`
2. Cek env `EDGE_ALERT_EMAIL`
3. Cek tabel `edge_function_events`
4. Cek tabel `edge_rate_limits`
5. Cek deliverability inbox dan spam

## Jika transaksi gagal

1. Tes akun kasir baru
2. Tes buat transaksi kecil
3. Cek tabel PostgreSQL production:
   - `transactions`
   - `inventory`
   - `cash_register`
   - `expenses`
4. Cek apakah error hanya di satu device atau semua device

## Jika printer gagal

1. Pastikan printer menyala
2. Pastikan printer `ESC/POS`
3. Pair ulang Bluetooth atau colok ulang OTG
4. Jalankan `Test Print`
5. Jika USB gagal, coba printer yang sama via Bluetooth

## Keputusan cepat

- **Minor**: hanya 1 user / 1 device terdampak -> bantu manual, kumpulkan bukti
- **Major**: banyak user terdampak -> hentikan rollout, umumkan gangguan, fokus stabilisasi
- **Critical**: login/checkout down total -> treat sebagai blocker produksi

## Bukti yang harus dikumpulkan

- waktu kejadian
- email user
- device Android
- screenshot error
- jenis printer bila terkait
- langkah terakhir sebelum error
