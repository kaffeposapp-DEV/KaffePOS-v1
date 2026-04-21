# RLS Audit Report KaffePOS

Tanggal audit: `19 April 2026`

## Tabel kritikal yang diaudit

- `profiles`
- `stores`
- `inventory`
- `transactions`
- `notifications`

## Hasil audit

- RLS aktif di semua tabel kritikal
- Policy akses pemilik/user sudah ada
- Cross-account check dieksekusi di remote database dengan simulasi role `authenticated` + claim `request.jwt.claim.sub`
- Hasil uji menunjukkan user A hanya melihat data miliknya sendiri, dan user B juga hanya melihat data miliknya sendiri

## Ringkasan verifikasi live

User A:

- store sendiri terlihat: `1`
- store user lain terlihat: `0`
- transaksi store sendiri terlihat: `3`
- transaksi store user lain terlihat: `0`
- inventory store sendiri terlihat: `3`
- inventory store user lain terlihat: `0`
- profile sendiri terlihat: `1`
- profile user lain terlihat: `0`
- notifikasi sendiri terlihat: `12`
- notifikasi user lain terlihat: `0`

User B:

- store sendiri terlihat: `1`
- store user lain terlihat: `0`
- transaksi store sendiri terlihat: `4`
- transaksi store user lain terlihat: `0`
- inventory store sendiri terlihat: `5`
- inventory store user lain terlihat: `0`
- profile sendiri terlihat: `1`
- profile user lain terlihat: `0`

## Catatan

- Tabel internal `email_verification_codes`, `edge_rate_limits`, dan `edge_function_events` dipertahankan sebagai tabel backend-only
- Policy service-role-only ditambahkan agar advisor security lebih eksplisit membaca intent akses
- Untuk uji regresi berikutnya, gunakan query SQL langsung ke PostgreSQL production dengan role aplikasi yang sesuai dan set user id uji secara eksplisit.
