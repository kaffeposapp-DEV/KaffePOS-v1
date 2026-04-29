# Staging Smoke Test: Owner/Admin ke Kasir

Dokumen ini menutup gap live DB integration test untuk flow Owner/Admin dan Kasir. Jalankan hanya di staging atau environment production-like yang aman, karena script akan membuat outlet smoke, membuat akun kasir smoke, memindahkan outlet kasir, lalu menonaktifkan akun kasir tersebut.

## Tujuan

- Owner/Admin bisa login.
- Owner/Admin bisa membuat akun kasir.
- Kasir bisa login dengan role dan outlet assignment yang benar.
- Kasir hanya mendapat outlet yang di-assign.
- Kasir ditolak dari Billing/Lisensi dan User Management API.
- Owner/Admin bisa memindahkan outlet kasir.
- Session kasir membaca outlet baru dari backend/database.
- Kasir nonaktif tidak bisa login dan session lama ditolak.

## Prasyarat

- Frontend dan backend staging sudah deploy.
- PostgreSQL staging memakai schema terbaru, termasuk `profiles.account_status` dan `cashier_outlet_assignments`.
- `/system-status` backend melaporkan database sehat.
- Akun Owner/Admin staging sudah ada dan punya minimal satu outlet, atau script akan membuat outlet utama smoke.
- Jangan gunakan credential production pelanggan.

## Command

```bash
KAFFEPOS_API_BASE_URL=https://api-staging.kaffepos.my.id \
KAFFEPOS_OWNER_EMAIL=owner-staging@example.com \
KAFFEPOS_OWNER_PASSWORD='isi-di-terminal' \
npm run smoke:staging:cashier
```

Opsional:

```bash
KAFFEPOS_CASHIER_EMAIL=owner-staging+cashier-smoke@example.com
KAFFEPOS_CASHIER_PASSWORD='password-awal-minimal-10'
KAFFEPOS_SECOND_OUTLET_NAME='Smoke Outlet Kasir'
```

## Expected Result

Output harus berisi status `PASS` untuk:

- API health dan database.
- Owner/Admin login.
- Outlet setup.
- Owner membuat kasir.
- List kasir sinkron.
- Kasir login bootstrap role dan outlet.
- Kasir hanya melihat outlet assignment.
- Kasir ditolak dari billing dan user management.
- Owner pindah outlet kasir.
- Existing session dan login ulang kasir membaca outlet baru.
- Owner menonaktifkan kasir.
- Kasir nonaktif gagal login dan session lama ditolak.

## Jika Gagal

- Status 401 saat owner login: cek credential staging dan role owner.
- Status 403 saat create/update kasir: cek role owner dan permission `can_manage_users`.
- Database health gagal: cek env `DATABASE_URL` dan koneksi PostgreSQL Coolify.
- Kasir masih melihat outlet lama: cek query `/api/stores`, `/api/auth/session`, dan row `cashier_outlet_assignments`.
- Kasir nonaktif masih bisa login: cek `profiles.account_status`, `cashier_outlet_assignments.status`, dan revocation `app_auth_sessions.revoked_at`.

## Catatan Safety

- Script tidak mencetak password atau token.
- Script meninggalkan akun kasir smoke dalam status inactive untuk audit.
- Script membuat outlet smoke baru untuk menguji reassignment. Bersihkan manual di staging bila perlu.
- Jangan jalankan script ini ke production utama tanpa window maintenance dan data smoke yang disetujui.
