# Data Retention Policy KaffePOS

Dokumen ini merangkum kebijakan retensi data operasional KaffePOS untuk kebutuhan auth, keamanan, support, dan audit ringan.

## Retensi standar

- `email_verification_codes`: 30 hari
- `edge_rate_limits`: 7 hari
- `edge_function_events`: 30 hari
- `notifications`: 90 hari
- `ops_event_logs`: 90 hari
- `sync_log`: 7 hari operasional
- `transactions`, `expenses`, `cash_flow`, `inventory audit`: disimpan selama akun masih aktif atau sampai owner meminta ekspor + penutupan akun

## Alasan retensi

- OTP dan rate-limit hanya dipertahankan secukupnya untuk investigasi singkat serta pencegahan abuse.
- Event edge function disimpan untuk observability, analisis error, dan bahan incident review.
- Notifications disimpan lebih lama karena bisa dipakai untuk support pelanggan dan histori aktivitas akun.
- Data transaksi keuangan tidak dibersihkan otomatis karena dibutuhkan untuk operasional, rekonsiliasi, dan histori bisnis owner.

## Cleanup operasional

Repository ini menyediakan function SQL berikut:

```sql
select *
from public.cleanup_operational_retention();
```

Default cleanup yang dijalankan:

- OTP lebih lama dari 30 hari dihapus
- log rate-limit lebih lama dari 7 hari dihapus
- event edge function lebih lama dari 30 hari dihapus
- notifikasi lebih lama dari 90 hari dihapus
- event ops login/checkout lebih lama dari 90 hari dihapus

Contoh override:

```sql
select *
from public.cleanup_operational_retention(45, 14, 45, 120, 120);
```

## Rutinitas yang disarankan

Minimal 1 kali per bulan:

1. Jalankan `cleanup_operational_retention()`
2. Simpan ringkasan hasil hapus data ke catatan ops
3. Pastikan tidak ada incident aktif sebelum cleanup massal

## Catatan akses

- Table OTP, rate-limit, dan event edge hanya boleh diakses oleh `service_role`
- Function cleanup juga hanya dieksekusi lewat backend/service role
