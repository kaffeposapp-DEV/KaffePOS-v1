# Staging Smoke Test: Stok, Resep, HPP, dan Deduksi Transaksi

Dokumen ini menutup gap live DB integration test untuk fitur `Stok`. Jalankan hanya di staging atau environment production-like yang aman, karena script akan membuat data smoke, membuat transaksi tunai smoke, menguji replay idempotent, lalu melakukan void untuk mengembalikan stok.

## Tujuan

- Bulk import bahan, produk, konversi, dan resep masuk lewat satu endpoint backend transaksional.
- Data hasil import benar-benar tersimpan di PostgreSQL dan terbaca lagi dari API.
- Checkout POS mengurangi stok bahan sesuai resep.
- Replay checkout dengan id transaksi yang sama tidak mengurangi stok dua kali.
- Void transaksi mengembalikan stok.
- Flow ini memakai role Owner/Admin dan permission backend, bukan hanya UI.

## Prasyarat

- Frontend dan backend staging sudah deploy.
- PostgreSQL staging memakai schema terbaru dari `database/production-bootstrap.sql`.
- `/system-status` backend melaporkan database sehat.
- Akun Owner/Admin staging sudah ada dan punya minimal satu outlet.
- Jangan gunakan credential pelanggan production.

## Command

```bash
KAFFEPOS_API_BASE_URL=https://api-staging.kaffepos.my.id \
KAFFEPOS_OWNER_EMAIL=owner-staging@example.com \
KAFFEPOS_OWNER_PASSWORD='isi-di-terminal' \
KAFFEPOS_STOCK_SMOKE_CONFIRM=1 \
npm run smoke:staging:stock
```

## Expected Result

Output harus berisi status `PASS` untuk:

- API and PostgreSQL health.
- Owner/Admin login.
- Store scope available.
- Transactional stock bulk import.
- Imported ingredient/product/conversion/recipe visible through API.
- Checkout deducts recipe stock once.
- Duplicate checkout replay is idempotent for stock deduction.
- Void restores stock after smoke checkout.
- Final stock/menu state remains readable.

## Jika Gagal

- Status 401 saat owner login: cek credential staging.
- Status 403 saat import: cek role Owner/Admin dan permission `can_manage_inventory` + `can_manage_products`.
- Import 422: cek data duplicate atau schema stok belum ter-migrate.
- Deduksi stok salah: cek recipe `unit_reference`, `inventory_unit_conversions`, dan audit `transaction_inventory_audit`.
- Replay checkout memotong stok lagi: cek idempotency di `/api/transactions/checkout`.
- Void tidak restore: cek endpoint `/api/transactions/:id/void` dan audit inventory.

## Android USB Smoke Tambahan

Setelah APK terbaru di-install:

```bash
INSTALL=1 npm run android:usb-debug
```

Di device:

- Login Owner/Admin staging.
- Buka nav `Stok`.
- Pastikan subtab Ringkasan, Bahan Baku, Konversi Satuan, Resep/Porsi, HPP & Margin, dan Impor Bulk bisa dibuka.
- Upload/paste sample import kecil di staging dan commit saat online.
- Buat transaksi POS untuk produk yang punya resep.
- Cek stok bahan berkurang sesuai resep.
- Matikan internet lalu pastikan import bulk tidak memberi success palsu, sedangkan POS tunai offline tetap memakai outbox.
- Nyalakan internet dan pastikan queue offline sinkron.

## Catatan Safety

- Script tidak mencetak password atau token.
- Script membutuhkan `KAFFEPOS_STOCK_SMOKE_CONFIRM=1` agar tidak menulis data tanpa sengaja.
- Script meninggalkan data bahan/produk smoke yang unik per run supaya audit staging mudah.
- Jangan jalankan ke production utama tanpa window maintenance dan persetujuan data smoke.
