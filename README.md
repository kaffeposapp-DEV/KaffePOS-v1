# ☕ KaffePOS v2.0
**Modern POS System** — Vite + React 18 + TypeScript + Tailwind + Capacitor v6 + Supabase Auth + PostgreSQL API

---

## Production Baseline

Repositori ini sekarang diasumsikan berjalan dengan baseline produksi berikut:

- **Domain + web hosting aktif:** `https://kaffepos.my.id`
- **Backend data inti:** Express API + PostgreSQL
- **Auth:** Supabase Auth (sementara dipertahankan)
- **Email transaksi & auth:** Resend
- **APK Android:** Capacitor
- **Monitoring APK yang direkomendasikan:** Firebase Crashlytics

Catatan penting:

- Project **tidak bergantung pada Netlify** untuk produksi saat ini.
- File seperti `netlify.toml` boleh ada sebagai artefak lama / opsi cadangan, tetapi **bukan jalur operasional utama**.
- Fokus maintenance saat ini adalah menjaga **Supabase + Resend + hosting aktif + kestabilan APK**.

Dokumen operasional non-programmer tersedia di:

- [GO_LIVE_CHECKLIST.md](/Users/macbook/kaffepos-new/kaffepos-v2/GO_LIVE_CHECKLIST.md)
- [MAINTENANCE_ROADMAP.md](/Users/macbook/kaffepos-new/kaffepos-v2/MAINTENANCE_ROADMAP.md)
- [FIREBASE_CRASHLYTICS_SETUP.md](/Users/macbook/kaffepos-new/kaffepos-v2/FIREBASE_CRASHLYTICS_SETUP.md)
- [INCIDENT_PLAYBOOK.md](/Users/macbook/kaffepos-new/kaffepos-v2/INCIDENT_PLAYBOOK.md)
- [SUPPORT_SOP.md](/Users/macbook/kaffepos-new/kaffepos-v2/SUPPORT_SOP.md)
- [PRINTER_APPROVED_MATRIX.md](/Users/macbook/kaffepos-new/kaffepos-v2/PRINTER_APPROVED_MATRIX.md)
- [ANDROID_RELEASE_SIGNING.md](/Users/macbook/kaffepos-new/kaffepos-v2/ANDROID_RELEASE_SIGNING.md)
- [CHANGELOG.md](/Users/macbook/kaffepos-new/kaffepos-v2/CHANGELOG.md)
- [DATA_RETENTION_POLICY.md](/Users/macbook/kaffepos-new/kaffepos-v2/DATA_RETENTION_POLICY.md)
- [REFUND_POLICY.md](/Users/macbook/kaffepos-new/kaffepos-v2/REFUND_POLICY.md)
- [SERVICE_COMMUNICATION_TEMPLATES.md](/Users/macbook/kaffepos-new/kaffepos-v2/SERVICE_COMMUNICATION_TEMPLATES.md)
- [RLS_AUDIT_REPORT.md](/Users/macbook/kaffepos-new/kaffepos-v2/RLS_AUDIT_REPORT.md)
- [OPS_METRICS_DASHBOARD.md](/Users/macbook/kaffepos-new/kaffepos-v2/OPS_METRICS_DASHBOARD.md)

---

## 🚀 Quick Start (5 menit)

### 1. Clone & Install
```bash
git clone https://github.com/yourname/kaffepos.git
cd kaffepos
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
```
Edit `.env`:
```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_API_BASE_URL=
```

Resolusi API frontend:

- web dev `localhost:5173` memakai proxy Vite ke `localhost:8787`
- web production `kaffepos.my.id` otomatis ke `https://api.kaffepos.my.id`
- Capacitor/mobile otomatis ke `https://api.kaffepos.my.id`
- isi `VITE_API_BASE_URL` hanya kalau memang perlu override

### 3. Setup Backend API
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### 4. Setup Supabase Database
1. Buka [supabase.com](https://supabase.com) → New Project
2. Buka **SQL Editor** → **New Query**
3. Copy isi `supabase/migrations/001_initial_schema.sql` → Run
4. Copy `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari **Settings → API**

### 5. Deploy Edge Functions
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy auth-email
npx supabase functions deploy send-notification
npx supabase functions deploy verify-email-code
```

Catatan:

- `activate-subscription` dan `track-ops-event` sudah dipindah ke backend API.
- Supabase edge functions yang masih dipertahankan sekarang fokus ke auth/email.

### 6. Run Development
```bash
npm run dev
# Buka http://localhost:5173
```

---

## 📱 Build Android APK

### Build Target Policy
- **Web target** (`build:web`) menyertakan landing page (`/welcome`) untuk marketing/public site.
- **Mobile target** (`build:mobile`) mengecualikan flow landing page agar APK fokus ke auth + POS app.
- Semua script APK sudah otomatis memakai target `mobile`.

### Prerequisites
- **Java 17+**: `java -version`
- **Android Studio** + SDK 34
- **Android SDK** di PATH: `export ANDROID_HOME=~/Library/Android/sdk`

### Setup Capacitor (sekali saja)
```bash
# Install Android platform
npx cap add android

# Sync setelah setiap npm run build
npx cap sync android
```

### 🔨 Build Debug APK (untuk testing)
```bash
npm run build-apk-debug
```
APK tersimpan di: `android/app/build/outputs/apk/debug/app-debug.apk`

### 📦 Build Release APK (untuk distribusi / Play Store)
```bash
# 1. Ikuti panduan aman di ANDROID_RELEASE_SIGNING.md

# 2. Set environment sesuai Gradle
export KPOS_RELEASE_STORE_FILE="/ABSOLUTE/PATH/kaffepos-release.keystore"
export KPOS_RELEASE_STORE_PASSWORD="YOUR_STORE_PASSWORD"
export KPOS_RELEASE_KEY_ALIAS="kaffepos"
export KPOS_RELEASE_KEY_PASSWORD="YOUR_KEY_PASSWORD"

# 3. Build release
npm run build-apk-release
```
APK di: `android/app/build/outputs/apk/release/app-release.apk`

Setiap rilis publik wajib:

1. Naikkan `versionCode`
2. Cek `versionName`
3. Tambahkan catatan perubahan ke `CHANGELOG.md`

### 🚀 One Command (buka Android Studio)
```bash
npm run build-apk
# Otomatis: build → sync → buka Android Studio → Build APK dari sana
```

---

## 🔧 Available Commands

| Command | Deskripsi |
|---------|-----------|
| `npm run dev` | Start dev server (localhost:5173) |
| `npm run build` | Alias ke `npm run build:web` |
| `npm run build:web` | Build target web (dengan landing page) |
| `npm run build:mobile` | Build target mobile (tanpa landing page) |
| `npm run typecheck` | TypeScript type checking |
| `npm run build-apk` | Build + sync + buka Android Studio |
| `npm run build-apk-debug` | Build debug APK langsung |
| `npm run build-apk-release` | Build signed release APK |
| `npm run cap:sync` | Sync web assets ke Android |
| `npm run cap:run` | Run di Android device/emulator |

---

## Arsitektur Yang Dipakai

Untuk kebutuhan sekarang, arsitektur yang dipakai sengaja dibuat sederhana agar tetap mudah dirawat:

1. **User membuka web atau APK**
2. **Auth** tetap berjalan di **Supabase**
3. **Data inti POS** lewat **backend API Express** ke **PostgreSQL**
4. **Email OTP / reset / welcome** dikirim melalui **Resend**
5. **APK Android** dibangun dari codebase yang sama lewat **Capacitor**
6. **Error APK** direkomendasikan dipantau lewat **Firebase Crashlytics**

Yang **tidak perlu ditambahkan dulu** jika belum benar-benar dibutuhkan:

- Netlify
- Vercel
- Turso
- Drizzle
- Trigger.dev
- Upstash
- PostHog
- OneSignal
- RevenueCat

Tujuannya supaya maintenance tetap realistis untuk owner non-programmer.

---

## 📂 Project Structure

```
kaffepos/
├── src/
│   ├── components/
│   │   ├── auth/          ← Login, Register, ForgotPassword
│   │   ├── ui/            ← Toast, Modal, Spinner, Button
│   │   ├── pos/           ← POS screen (cart, checkout, receipt)
│   │   ├── warehouse/     ← Inventory management
│   │   ├── menu/          ← Menu management
│   │   ├── history/       ← Transaction history + void
│   │   ├── report/        ← PDF reports (sales, inventory)
│   │   └── settings/      ← Store settings, accounts, backup
│   ├── contexts/
│   │   └── AuthContext.tsx  ← Supabase auth + tier management
│   ├── hooks/
│   │   ├── useStore.ts      ← Zustand store (app state)
│   │   └── useSync.ts       ← Supabase realtime sync
│   ├── lib/
│   │   └── supabase.ts      ← Supabase client
│   ├── types/
│   │   └── index.ts         ← All TypeScript types
│   └── utils/
│       ├── downloadFile.ts  ← 🔑 Android Downloads folder
│       └── migrateLocalStorage.ts ← v14 → v2 migration
│
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql  ← Full DB schema + RLS
│   └── functions/
│       ├── auth-email/ ← OTP / auth email flow
│       ├── verify-email-code/ ← Email verification
│       └── send-notification/ ← Email notifications
│
├── android/                 ← Capacitor Android project
│   └── app/src/main/
│       ├── AndroidManifest.xml
│       └── res/xml/file_paths.xml
│
├── capacitor.config.ts      ← Capacitor config
├── vite.config.ts           ← Vite config
├── package.json             ← All dependencies
└── .env                     ← Supabase keys (gitignored)
```

---

## ⬇️ Test Download di Android Asli

### Setup ADB
```bash
# Aktifkan USB Debugging di HP:
# Settings → About Phone → tap Build Number 7x → Developer Options → USB Debugging ON

# Cek device terdeteksi
adb devices

# Install APK debug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Test PDF Download
1. Buka KaffePOS di HP
2. Login → tab **Laporan**
3. Tap **Download PDF**
4. Cek folder **Downloads** di HP
5. File format: `KaffePOS_Laporan_Penjualan_NamaToko_2025-03-02.pdf`

### Test Backup
1. Tab **Pengaturan** → **Backup Database**
2. Cek folder **Downloads**
3. File: `KaffePOS_Backup_NamaToko_2025-03-02.json`

### Debug via ADB Logcat
```bash
# Lihat log dari app KaffePOS
adb logcat -s Capacitor:V ReactNativeWebView:V KaffePOS:V chromium:W

# Filter download-related logs
adb logcat | grep -E "downloadFile|Filesystem|Share"
```

### Chrome Remote DevTools
```bash
# 1. Pastikan webContentsDebuggingEnabled: true di capacitor.config.ts (dev only)
# 2. Buka di Chrome desktop:
chrome://inspect/#devices
# 3. Pilih device → Inspect
```

---

## 🔑 Android Download — How It Works

```
User tap "Download PDF"
     │
     ▼
downloadPDFReport(jdoc, 'Laporan_Penjualan', storeName)
     │
     ▼
downloadFile({ data: base64, fileName, mimeType })
     │
     ├─ Capacitor.isNativePlatform() === true (APK)
     │       │
     │       ▼
     │   Filesystem.writeFile({
     │     path: "KaffePOS_Laporan_..._2025-03-02.pdf",
     │     directory: Directory.Documents,  ← = Downloads on Android
     │     data: base64
     │   })
     │       │
     │       ▼
     │   Share.share({ url: fileUri })  ← "Buka PDF" share sheet
     │       │
     │       ▼
     │   ✅ Toast: "File tersimpan: KaffePOS_Laporan..."
     │          + Button: [Buka File]
     │
     └─ isNativePlatform() === false (Browser/PWA)
             │
             ▼
         Blob URL download OR File System Access API
```

**Android versions:**
- **Android 10–15** (API 29+): `Directory.Documents` = scoped storage Downloads — **no permission needed**
- **Android 9** (API 28): `WRITE_EXTERNAL_STORAGE` auto-requested by Capacitor
- **iOS**: Save to Documents → Share sheet → "Save to Files"

---

## 🛡️ Supabase RLS — Security Model

Every table has Row Level Security enabled. Users can only access their own store's data:

```sql
-- Example: transactions
CREATE POLICY "Store owner can CRUD transactions"
  ON public.transactions FOR ALL
  USING (store_id IN (
    SELECT id FROM public.stores WHERE owner_id = auth.uid()
  ));
```

---

## 📊 Tier System

| Feature | Basic | Pro |
|---------|-------|-----|
| POS (unlimited) | ✅ | ✅ |
| Inventory | ✅ | ✅ |
| Transaction history | ✅ | ✅ |
| PDF Reports | ❌ | ✅ |
| Charts & Analytics | ❌ | ✅ |
| AI suggestions | ❌ | ✅ |
| Multi-cashier | ✅ | ✅ |
| Backup/Restore | ✅ | ✅ |

**Flow Langganan Manual:**
1. User pilih paket lalu chat admin di Instagram
2. Admin verifikasi transfer secara manual
3. Backend API admin mengaktifkan langganan di PostgreSQL production
4. Profile dan subscription sync otomatis di database production
5. Email konfirmasi dikirim otomatis

---

## 🔄 Migration from v14

```bash
# Setelah login pertama kali, migration dialog akan muncul otomatis
# Atau jalankan manual dari Settings → Import Data dari v14
```

Data yang dimigrasikan:
- ✅ Menu items (dengan recipe & variants)
- ✅ Inventory
- ✅ Transactions (full history)
- ✅ Expenses
- ✅ Cash flow
- ✅ Store settings
- ✅ Kasir accounts

---

## 📝 Environment Variables

```env
# .env (never commit this!)
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🐛 Troubleshooting

**"ANDROID_HOME not set"**
```bash
export ANDROID_HOME=~/Library/Android/sdk  # macOS
export ANDROID_HOME=~/Android/Sdk          # Linux
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools
```

**"Gradle build failed"**
```bash
cd android && ./gradlew clean
npm run build:mobile && npx cap sync android
```

**"File not saved to Downloads"**
- Android 10+: Check `android/app/src/main/res/xml/file_paths.xml` exists
- Android 9: Check `WRITE_EXTERNAL_STORAGE` in `AndroidManifest.xml`
- Enable logcat: `adb logcat | grep Filesystem`

**"Supabase RLS error"**
```sql
-- Run in Supabase SQL Editor to check policies
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

---

Built with ☕ by KaffePOS Team
