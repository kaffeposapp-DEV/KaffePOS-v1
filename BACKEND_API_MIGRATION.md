# Backend API Migration

Migrasi ini sengaja dibuat bertahap:

1. `Supabase Auth` tetap dipakai untuk login, session, reset password, dan OAuth.
2. Data bisnis utama pindah ke backend API `Express + pg`.
3. Frontend mengirim bearer token Supabase lama ke backend.
4. Backend memverifikasi token ke Supabase lalu mengeksekusi query langsung ke PostgreSQL VPS.

## Yang Sudah Dipindah

- `profile/me`
- `stores`
- `menu_items`
- `inventory`
- `expenses`
- `cash_flow`
- `cash_register`
- `subscriptions`
- `notifications`
- `transactions`
- `transactions/checkout`
- `transactions/:id/void`
- `admin/subscriptions/*`
- `import/local-storage`
- `ops/events`
- `ai-insight`

## Yang Sengaja Belum Dipindah

- Supabase Auth
- Edge functions `auth-email`, `verify-email-code`, `send-notification`
- Flow auth/email yang memang lebih aman dipertahankan sementara di Supabase

## Struktur Baru

- Frontend: [/Users/macbook/kaffepos-new/kaffepos-v2/src/lib/backendApi.ts](/Users/macbook/kaffepos-new/kaffepos-v2/src/lib/backendApi.ts)
- Backend: [/Users/macbook/kaffepos-new/kaffepos-v2/backend/src/index.ts](/Users/macbook/kaffepos-new/kaffepos-v2/backend/src/index.ts)
- Env backend: [/Users/macbook/kaffepos-new/kaffepos-v2/backend/.env.example](/Users/macbook/kaffepos-new/kaffepos-v2/backend/.env.example)
- Docker backend: [/Users/macbook/kaffepos-new/kaffepos-v2/backend/Dockerfile](/Users/macbook/kaffepos-new/kaffepos-v2/backend/Dockerfile)

## Local Run

Frontend:

```bash
npm install
npm run dev
```

Catatan frontend:

- saat development web, `VITE_API_BASE_URL` boleh kosong karena Vite akan proxy `/api` dan `/health` ke `http://localhost:8787`
- saat production web dan Capacitor, frontend akan fallback ke `https://api.kaffepos.my.id` bila `VITE_API_BASE_URL` kosong

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

## Production Deploy di Coolify

1. Deploy backend dari folder `backend/`
2. Set environment backend:
   - `DB_HOST=localhost`
   - `DB_PORT=5432`
   - `DB_NAME=kaffepos_production`
   - `DB_USER=kaffepos`
   - `DB_PASSWORD=...`
   - `SUPABASE_URL=...`
   - `SUPABASE_ANON_KEY=...`
   - `GEMINI_API_KEY=...` jika AI insight dipakai
3. Expose backend lewat subdomain atau path yang stabil
4. Frontend production disarankan membiarkan `VITE_API_BASE_URL` kosong agar otomatis memakai `https://api.kaffepos.my.id`

## Catatan Penting

- Realtime Supabase untuk tabel inti tidak lagi jadi sumber utama, karena database operasional sudah pindah.
- Frontend tetap punya optimistic update + offline queue ringan untuk mutasi utama.
- Checkout sekarang diproses di backend transaction SQL agar update stok dan insert transaksi tetap atomik.
- Admin subscription, telemetry operasional, dan AI insight juga sudah diarahkan ke backend PostgreSQL VPS.
