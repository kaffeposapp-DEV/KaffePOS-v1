# End-to-End Validation Checklist

Checklist ini dipakai untuk memastikan Web, APK, backend API, Coolify, VPS, dan PostgreSQL production berjalan sinkron dengan sumber data yang sama.

## 1. Validasi Source of Truth

- [ ] Frontend Web memakai `backendApi` untuk data inti POS
- [ ] APK memakai asset build yang sama dari `dist/`
- [ ] Backend API membaca/menulis langsung ke PostgreSQL VPS
- [ ] Auth, email, dan data bisnis semuanya berjalan dari backend API sendiri
- [ ] Tidak ada query langsung dari runtime app ke database tanpa lewat backend API

## 2. Validasi Backend

- [ ] `GET /health` mengembalikan `200` dan `ok: true`
- [ ] Backend bisa start tanpa error config
- [ ] Log startup muncul di stdout:
  - `startup.boot`
  - `startup.dependencies_ready`
  - `startup.listening`
- [ ] Request log muncul sebagai JSON line
- [ ] Error log muncul sebagai JSON line
- [ ] Process fatal handling aktif untuk `unhandledRejection` dan `uncaughtException`

## 3. Validasi PostgreSQL VPS

- [ ] `profiles`, `stores`, `menu_items`, `inventory`, `expenses`, `cash_register`, `subscriptions`, `notifications`, `transactions` ada di DB production
- [ ] Checkout menulis transaksi ke PostgreSQL production
- [ ] Void transaksi mengembalikan stok di PostgreSQL production
- [ ] Payment subscription dan webhook menulis ke PostgreSQL production
- [ ] Closed Beta feedback menulis ke PostgreSQL production
- [ ] `app_versions` dan `app_update_events` tersedia
- [ ] Import local storage menulis ke PostgreSQL production
- [ ] Admin subscription menulis ke PostgreSQL production

## 4. Validasi Web

- [ ] `npm run build` sukses
- [ ] Web production memakai `https://api.kaffepos.my.id` saat `VITE_API_BASE_URL` kosong
- [ ] Login berhasil
- [ ] Profile load berhasil
- [ ] Store bootstrap berhasil
- [ ] Menu, inventory, expenses, notifications, subscriptions, transactions load dari backend API
- [ ] Checkout berhasil
- [ ] Void transaksi berhasil
- [ ] Feedback beta berhasil dikirim
- [ ] Trial countdown tampil benar
- [ ] PDF report berhasil export
- [ ] `/api/app/version` terbaca dan update banner tidak mengganggu flow

## 5. Validasi APK

- [ ] `npm run build:mobile` sukses
- [ ] `npm run cap:sync` sukses
- [ ] `npm run build-apk-debug` sukses
- [ ] APK memakai asset terbaru dari `dist/`
- [ ] Login di device berhasil
- [ ] Data yang tampil sama dengan Web untuk store/user yang sama
- [ ] Checkout di APK langsung terbaca saat load ulang di Web
- [ ] Void transaksi di APK langsung terbaca saat load ulang di Web
- [ ] Session restore bertahan setelah app ditutup dan dibuka ulang
- [ ] Offline queue tersimpan lalu sync saat online
- [ ] Printer config tetap bertahan setelah update APK

## 6. Validasi Coolify

- [ ] Service backend deploy dari folder `backend/`
- [ ] Dockerfile backend terbaca dengan benar
- [ ] Env backend terisi
- [ ] Port container `8787`
- [ ] Health check path `/health`
- [ ] Domain backend `api.kaffepos.my.id`
- [ ] Restart policy aktif
- [ ] Logs backend terbaca jelas di Coolify

## 7. Validasi Monitoring

- [ ] Health endpoint bisa dipantau dari Coolify
- [ ] Request log dan error log cukup untuk troubleshooting
- [ ] Crashlytics Android aktif bila `google-services.json` tersedia
- [ ] GA4 menerima event register/login/first_transaction/payment/pdf_export/feedback
- [ ] Microsoft Clarity menerima session web
- [ ] Error tracking frontend/backend menerima event dummy tanpa data sensitif
- [ ] Ada prosedur cek log startup dan request setelah deploy

## 8. Smoke Test Operasional

Lakukan urutan ini setelah deploy:

1. Login dari Web
2. Pastikan menu dan stok muncul
3. Login dari APK dengan akun yang sama
4. Pastikan menu dan stok yang tampil sama
5. Checkout 1 transaksi dari Web
6. Refresh APK lalu cek transaksi masuk
7. Checkout 1 transaksi dari APK
8. Refresh Web lalu cek transaksi masuk
9. Void salah satu transaksi
10. Cek stok bahan kembali sesuai audit inventory
11. Buat payment subscription sandbox/production sesuai environment
12. Simulasikan pending, settlement, cancel, expire, deny
13. Kirim feedback Closed Beta
14. Export PDF report
15. Matikan koneksi, buat draft/queue yang didukung, nyalakan lagi, cek sync

## 9. Command Verifikasi

```bash
# frontend
npm run typecheck
npm run build
npm run build:mobile
npm run cap:sync
npm run build-apk-debug

# backend
cd backend
npm run backup:critical
npm run migrate
npm run check

# health
curl https://api.kaffepos.my.id/health
curl https://api.kaffepos.my.id/api/app/version
```
