# KaffePOS Final Hardening QA Matrix

Tanggal baseline: 2026-05-03.

Dokumen ini adalah checklist QA minimum sebelum menaikkan KaffePOS dari beta berbayar ke komersial lebih luas. Jangan isi secret di dokumen ini.

## Environment Gate

- [ ] Coolify backend `CORS_ORIGIN` memuat `https://kaffepos.my.id`, `https://www.kaffepos.my.id`, `https://api.kaffepos.my.id`, `https://localhost`, `capacitor://localhost`, dan `http://localhost`.
- [ ] APK build baru memakai origin final `https://localhost`; `http://localhost` tetap diterima backend hanya untuk APK lama/transisi.
- [ ] Backend production sudah redeploy setelah perubahan CORS final.
- [ ] `npm run smoke:production:readiness` lulus dari mesin operator.
- [ ] `MIDTRANS_ENVIRONMENT=production`.
- [ ] Tidak ada `VITE_MIDTRANS_*` di frontend production.
- [ ] `SUBSCRIPTION_PAYMENT_MODE=auto` atau `midtrans_production`.
- [ ] `MIDTRANS_SNAP_ENABLED=true`.
- [ ] Midtrans webhook production diarahkan ke `https://api.kaffepos.my.id/api/payments/midtrans/webhook`.
- [ ] `RESEND_API_KEY` dan `RESEND_FROM_EMAIL` aktif.
- [ ] `APP_VERSION`, `MIN_SUPPORTED_WEB_VERSION`, dan `MIN_SUPPORTED_APK_VERSION` sesuai release.
- [ ] `GET /api/app/version` lulus.
- [ ] `SENTRY_DSN` backend dan `VITE_SENTRY_DSN` frontend aktif.
- [ ] `VITE_CLARITY_PROJECT_ID` aktif pada build frontend production.
- [ ] `VITE_GA_MEASUREMENT_ID` aktif pada build frontend production.
- [ ] Cloudflare tidak cache HTML app shell terlalu lama.

## Device Matrix

| Target | Minimum perangkat | Browser/WebView | Wajib lulus |
| --- | --- | --- | --- |
| Android phone | 360-412px, Android 10+ | System WebView terbaru | startup, fresh login, session restore, POS checkout, settings, billing, print sheet |
| Android tablet | 768-1024px, Android 10+ | System WebView terbaru | navigation, POS grid, checkout panel, kitchen, report, settings |
| Mobile web | 320, 375, 390, 412px | Chrome Android + Safari iOS bila tersedia | landing/auth reflow, login, tabs, modal/sheet, no horizontal overflow |
| Desktop web | 1366px+ | Chrome, Edge, Safari/Firefox | dashboard, POS, stock, report, billing, keyboard focus |
| Printer | 1 USB ESC/POS + 1 Bluetooth ESC/POS | APK | permission, connect, receipt preview, print success/failure recovery |

## Functional Flow Checklist

- [ ] Startup APK tidak menampilkan crash, blank screen, CORS error, `Failed to fetch`, atau DOMException.
- [ ] Fresh login owner berhasil dari form kosong setelah force stop dan clear app data dengan origin `https://localhost`.
- [ ] Token/session tersimpan; restart app melakukan session restore dan role bootstrap benar.
- [ ] Kasir aktif bisa login dan hanya melihat fitur sesuai permission.
- [ ] Kasir nonaktif ditolak dengan pesan manusiawi.
- [ ] POS checkout tunai dan non-tunai berhasil.
- [ ] Closed Beta feedback terkirim dan notifikasi admin masuk.
- [ ] Trial countdown/prompt hari ke-10/hari ke-13/expired tampil sesuai tanggal.
- [ ] App update banner muncul hanya saat diperlukan dan tidak memaksa logout.
- [ ] Kitchen menerima order dan status bisa berubah sesuai aturan.
- [ ] Stok berkurang setelah transaksi dan bisa opname.
- [ ] Billing checkout membuat sesi Midtrans production.
- [ ] Webhook pending tidak mengaktifkan lisensi.
- [ ] Webhook settlement/capture accepted mengaktifkan lisensi satu kali.
- [ ] Webhook cancel/expire/deny/failure tidak mengaktifkan lisensi.
- [ ] Duplicate webhook tidak membuat duplicate subscription/payment history.
- [ ] Offline/online basic: buat transaksi offline, reconnect, sync berjalan atau failure terlihat jelas.
- [ ] Error critical muncul di Sentry backend/frontend tanpa data sensitif.

## Evidence Yang Harus Disimpan Operator

- [ ] Screenshot `npm run smoke:production:readiness` lulus.
- [ ] Screenshot Midtrans dashboard transaksi production sukses.
- [ ] Screenshot webhook Midtrans 200 OK.
- [ ] Screenshot Sentry menerima event dummy backend dan frontend.
- [ ] Screenshot Clarity status aktif.
- [ ] Foto/video print USB dan Bluetooth.
