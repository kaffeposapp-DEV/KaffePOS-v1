# KaffePOS Printer Approved Matrix

Dokumen ini dipakai tim support agar tidak semua printer dijanjikan kompatibel.

## Status model

### Approved / direkomendasikan

- **Rongta RPP200**
  - Tipe: 58mm portable
  - Jalur: Bluetooth Classic + USB
  - Cocok untuk: kasir mobile / booth
  - Status: direkomendasikan

- **Rongta RP336**
  - Tipe: 80mm counter printer
  - Jalur: USB / Bluetooth varian tertentu
  - Cocok untuk: toko tetap
  - Status: direkomendasikan

- **Xprinter XP-P323B**
  - Tipe: portable receipt printer
  - Jalur: USB + Bluetooth
  - Cocok untuk: opsi ekonomis
  - Status: direkomendasikan dengan test awal

## Boleh dicoba

- printer thermal generik 58mm / 80mm yang jelas tertulis:
  - `ESC/POS compatible`
  - mendukung `Android`
  - ada `Bluetooth Classic SPP` atau `USB`

## Belum disarankan

- printer `BLE-only`
- printer yang butuh aplikasi vendor khusus
- printer label-only, bukan receipt printer
- printer LAN-only untuk batch awal

## Checklist sebelum membeli

1. Ada mode `ESC/POS`
2. Ada `Bluetooth Classic` atau `USB`
3. Jika pakai Android tablet / HP, siapkan adaptor OTG
4. Kalau toko ramai, pilih auto cutter
5. Lakukan test print sebelum dipakai di kasir

## SOP pairing singkat untuk kasir

1. Nyalakan printer
2. Pair printer dari pengaturan Bluetooth Android
3. Buka KaffePOS
4. Masuk ke menu Printer
5. Tap `Scan`
6. Pilih printer
7. Tap `Test`
8. Simpan printer yang berhasil
