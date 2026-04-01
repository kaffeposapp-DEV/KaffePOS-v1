# ☕ KaffePOS v2.0
**Modern POS System** — Vite + React 18 + TypeScript + Tailwind + Capacitor v6 + Supabase

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
```

### 3. Setup Supabase Database
1. Buka [supabase.com](https://supabase.com) → New Project
2. Buka **SQL Editor** → **New Query**
3. Copy isi `supabase/migrations/001_initial_schema.sql` → Run
4. Copy `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari **Settings → API**

### 4. Deploy Edge Functions
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy activate-pro
npx supabase functions deploy send-notification
```

### 5. Run Development
```bash
npm run dev
# Buka http://localhost:5173
```

---

## 📱 Build Android APK

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
# 1. Generate keystore (sekali saja)
keytool -genkeypair -v \
  -keystore release.keystore \
  -alias kaffepos \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass YOUR_PASSWORD \
  -keypass YOUR_PASSWORD \
  -dname "CN=KaffePOS,OU=App,O=KaffePOS,L=Jakarta,S=DKI,C=ID"

# 2. Set environment
export KEYSTORE_PASSWORD=YOUR_PASSWORD
export KEYSTORE_ALIAS_PASSWORD=YOUR_PASSWORD

# 3. Build release
npm run build-apk-release
```
APK di: `android/app/build/outputs/apk/release/app-release.apk`

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
| `npm run build` | Build untuk production (output: `dist/`) |
| `npm run typecheck` | TypeScript type checking |
| `npm run build-apk` | Build + sync + buka Android Studio |
| `npm run build-apk-debug` | Build debug APK langsung |
| `npm run build-apk-release` | Build signed release APK |
| `npm run cap:sync` | Sync web assets ke Android |
| `npm run cap:run` | Run di Android device/emulator |

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
│       ├── activate-pro/    ← PRO tier activation
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

**Activate Pro:**
1. User masukkan license key di Settings
2. Edge Function `activate-pro` validates & upgrades tier
3. Profile `tier = 'pro'` updated in Supabase
4. Email konfirmasi dikirim otomatis

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
npm run build && npx cap sync android
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
