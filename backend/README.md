# KaffePOS Backend Deploy

Backend ini ditujukan untuk deploy sederhana dan stabil di Coolify, dengan target domain:

- `https://api.kaffepos.my.id`

Auth tetap memakai Supabase Auth. Backend hanya memverifikasi bearer token lalu mengakses PostgreSQL production secara langsung.

## File penting

- [package.json](/Users/macbook/kaffepos-new/kaffepos-v2/backend/package.json)
- [Dockerfile](/Users/macbook/kaffepos-new/kaffepos-v2/backend/Dockerfile)
- [.env.example](/Users/macbook/kaffepos-new/kaffepos-v2/backend/.env.example)
- [src/index.ts](/Users/macbook/kaffepos-new/kaffepos-v2/backend/src/index.ts)

## Scripts

```bash
cd backend
npm install
npm run dev
npm run typecheck
npm run build
npm run start
```

## Environment

Salin:

```bash
cp .env.example .env
```

Minimal yang wajib di production:

```env
SERVICE_NAME=kaffepos-backend
APP_VERSION=1.0.0
NODE_ENV=production
PORT=8787
LOG_LEVEL=info
ADMIN_EMAILS=kaffeposapp@gmail.com

DB_HOST=localhost
DB_PORT=5432
DB_NAME=kaffepos_production
DB_USER=kaffepos
DB_PASSWORD=YOUR_REAL_PASSWORD
DB_SSL=false

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

CORS_ORIGIN=https://kaffepos.my.id,https://api.kaffepos.my.id
```

Jika nanti lebih nyaman, boleh pakai `DATABASE_URL` dan kosongkan `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`.

## Health Check

Endpoint:

- `GET /health`
- `POST /api/ops/events`
- `POST /api/ai-insight`

Contoh:

```bash
curl https://api.kaffepos.my.id/health
```

Kalau sehat, respons akan `200 OK` dan `ok: true`.
Kalau database gagal diakses, respons akan `503` dan `ok: false`.

Ini cocok langsung dipasang sebagai health check di Coolify.

## Logging

Backend ini sengaja memakai log stdout/stderr sederhana dalam format JSON line agar enak dibaca di Coolify:

- startup log
- dependency readiness log
- request completed log
- validation/api/unhandled error log
- shutdown log
- fatal process error log

Contoh event yang akan terlihat di Coolify logs:

- `startup.boot`
- `startup.dependencies_ready`
- `startup.listening`
- `request.completed`
- `request.api_error`
- `request.unhandled_error`
- `process.unhandled_rejection`
- `process.uncaught_exception`
- `shutdown.started`

## Coolify Deploy

1. Buat service baru dari repo ini.
2. Set **Base Directory / Root Directory** ke `backend`.
3. Pilih deploy via `Dockerfile`.
4. Pastikan domain diarahkan ke:
   - `api.kaffepos.my.id`
5. Tambahkan environment variables dari `.env.example`.
6. Set health check path ke:
   - `/health`
7. Deploy.

## Rekomendasi setting Coolify

- Port container: `8787`
- Health check path: `/health`
- Restart policy: default Coolify / always
- Build context: folder `backend`

## Verifikasi setelah deploy

1. Buka health check:

```bash
curl https://api.kaffepos.my.id/health
```

2. Cek log startup di Coolify. Minimal harus ada:

```text
startup.boot
startup.dependencies_ready
startup.listening
```

3. Coba request aplikasi yang membutuhkan auth dan pastikan `request.completed` muncul di logs.

4. Cek AI endpoint jika dipakai:

```bash
curl -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"tes singkat"}' \
  https://api.kaffepos.my.id/api/ai-insight
```

## Catatan operasional

- Saat container menerima `SIGTERM` atau `SIGINT`, backend akan menutup HTTP server dan pool PostgreSQL secara graceful.
- Jika terjadi `uncaughtException` atau `unhandledRejection`, backend akan log error lalu exit supaya Coolify bisa restart container dengan bersih.
- Supabase yang masih dipertahankan saat ini hanya untuk Auth dan flow email terkait auth, bukan lagi untuk query data inti POS.
