-- ═══════════════════════════════════════════════════════════════════
-- KaffePOS v2 — Supabase PostgreSQL Schema + RLS
-- Run this in Supabase SQL Editor (Settings > SQL Editor)
-- ═══════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────
-- 1. PROFILES — extends auth.users
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL CHECK (length(username) >= 3 AND length(username) <= 30),
  display_name  TEXT,
  email         TEXT,
  avatar_url    TEXT,
  tier          TEXT NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic', 'pro')),
  tier_expires_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- 2. STORES — one store per user (expandable to multi-store)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.stores (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id        UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  store_name      TEXT NOT NULL DEFAULT 'KaffePOS',
  address         TEXT,
  whatsapp        TEXT,
  tax_percent     NUMERIC(5,2) NOT NULL DEFAULT 0,
  receipt_header  TEXT,
  receipt_footer  TEXT,
  logo_url        TEXT,
  logo_base64     TEXT,
  logo_position   TEXT DEFAULT 'center' CHECK (logo_position IN ('left','center','right')),
  logo_size       INTEGER DEFAULT 80,
  show_logo_on_receipt BOOLEAN DEFAULT true,
  currency        TEXT DEFAULT 'IDR',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- 3. MENU CATEGORIES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.menu_categories (
  id        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id  UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  name      TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- 4. MENU ITEMS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.menu_items (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id      UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  price         INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  category      TEXT NOT NULL DEFAULT 'Coffee',
  image_url     TEXT,
  description   TEXT,
  is_available  BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER DEFAULT 0,
  -- Recipe (array of ingredients)
  recipe        JSONB NOT NULL DEFAULT '[]',
  -- Variants e.g. [{name: "Small", price: 15000}, {name: "Large", price: 20000}]
  variants      JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Index for fast lookup
CREATE INDEX idx_menu_items_store_id ON public.menu_items(store_id);
CREATE INDEX idx_menu_items_category ON public.menu_items(store_id, category);

-- ─────────────────────────────────────────────────────────────────
-- 5. INVENTORY (Raw Materials / Bahan Baku)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.inventory (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id      UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  stock         NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT 'pcs',
  min_stock     NUMERIC(12,3) NOT NULL DEFAULT 5,
  cost_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_inventory_store_id ON public.inventory(store_id);

-- ─────────────────────────────────────────────────────────────────
-- 6. TRANSACTIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.transactions (
  id              TEXT PRIMARY KEY,  -- TRX-{timestamp}-{counter}
  store_id        UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  date            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Items: [{name, qty, price, subtotal}]
  items           JSONB NOT NULL DEFAULT '[]',
  subtotal        INTEGER NOT NULL DEFAULT 0,
  discount        INTEGER NOT NULL DEFAULT 0,
  discount_label  TEXT,
  tax             INTEGER NOT NULL DEFAULT 0,
  total           INTEGER NOT NULL DEFAULT 0,
  cogs            INTEGER NOT NULL DEFAULT 0,  -- Cost of Goods Sold
  paid            INTEGER NOT NULL DEFAULT 0,
  change          INTEGER NOT NULL DEFAULT 0,
  method          TEXT NOT NULL DEFAULT 'Tunai' CHECK (method IN ('Tunai','Transfer','QRIS','Debit','Kredit')),
  cashier         TEXT,
  note            TEXT,
  is_void         BOOLEAN NOT NULL DEFAULT false,
  void_reason     TEXT,
  void_at         TIMESTAMPTZ,
  void_by         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_store_date ON public.transactions(store_id, date DESC);
CREATE INDEX idx_transactions_store_id ON public.transactions(store_id);

-- ─────────────────────────────────────────────────────────────────
-- 7. EXPENSES (Pengeluaran)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.expenses (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id    UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  category    TEXT DEFAULT 'Operasional',
  cashier     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_store_date ON public.expenses(store_id, date DESC);

-- ─────────────────────────────────────────────────────────────────
-- 8. CASH FLOW (Modal / Penarikan)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.cash_flow (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id    UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type        TEXT NOT NULL CHECK (type IN ('in','out')),
  amount      INTEGER NOT NULL CHECK (amount > 0),
  description TEXT,
  cashier     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cash_flow_store_date ON public.cash_flow(store_id, date DESC);

-- ─────────────────────────────────────────────────────────────────
-- 9. ACCOUNTS / KASIR (Staff)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.store_accounts (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id    UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  username    TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'kasir' CHECK (role IN ('owner','kasir')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, username)
);

-- ─────────────────────────────────────────────────────────────────
-- 10. SUBSCRIPTIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.subscriptions (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  store_id        UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  tier            TEXT NOT NULL CHECK (tier IN ('basic','pro')),
  period          TEXT NOT NULL CHECK (period IN ('monthly','lifetime')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  payment_ref     TEXT,
  amount_paid     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id, status);

-- ─────────────────────────────────────────────────────────────────
-- 11. LICENSE KEYS (Admin-generated activation codes)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.license_keys (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key             TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  tier            TEXT NOT NULL CHECK (tier IN ('basic','pro')),
  period          TEXT NOT NULL CHECK (period IN ('monthly','lifetime')),
  is_used         BOOLEAN NOT NULL DEFAULT false,
  used_by         UUID REFERENCES public.profiles(id),
  used_at         TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ  -- key itself expires (not subscription)
);

-- ─────────────────────────────────────────────────────────────────
-- 12. SYNC LOG (offline-first conflict resolution)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.sync_log (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id    UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  operation   TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  payload     JSONB,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_id   TEXT
);

-- Clean up old sync logs (keep 7 days)
CREATE INDEX idx_sync_log_store ON public.sync_log(store_id, synced_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_keys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log       ENABLE ROW LEVEL SECURITY;

-- ── PROFILES ──
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ── STORES ──
CREATE POLICY "Owners can CRUD their store"
  ON public.stores FOR ALL USING (owner_id = auth.uid());

-- ── MENU CATEGORIES ──
CREATE POLICY "Store owner can CRUD categories"
  ON public.menu_categories FOR ALL
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

-- ── MENU ITEMS ──
CREATE POLICY "Store owner can CRUD menu"
  ON public.menu_items FOR ALL
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

-- ── INVENTORY ──
CREATE POLICY "Store owner can CRUD inventory"
  ON public.inventory FOR ALL
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

-- ── TRANSACTIONS ──
CREATE POLICY "Store owner can CRUD transactions"
  ON public.transactions FOR ALL
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

-- ── EXPENSES ──
CREATE POLICY "Store owner can CRUD expenses"
  ON public.expenses FOR ALL
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

-- ── CASH FLOW ──
CREATE POLICY "Store owner can CRUD cash_flow"
  ON public.cash_flow FOR ALL
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

-- ── STORE ACCOUNTS ──
CREATE POLICY "Store owner can CRUD accounts"
  ON public.store_accounts FOR ALL
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

-- ── SUBSCRIPTIONS ──
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT USING (user_id = auth.uid());

-- ── LICENSE KEYS ──
CREATE POLICY "Anyone can read unused key (for activation)"
  ON public.license_keys FOR SELECT USING (is_used = false);

CREATE POLICY "System can update license key on use"
  ON public.license_keys FOR UPDATE USING (true); -- controlled by Edge Function

-- ── SYNC LOG ──
CREATE POLICY "Store owner can CRUD sync log"
  ON public.sync_log FOR ALL
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════

-- Check if user has active pro subscription
CREATE OR REPLACE FUNCTION public.is_pro(user_uuid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_uuid
      AND tier = 'pro'
      AND (tier_expires_at IS NULL OR tier_expires_at > NOW())
  );
$$;

-- Get user's store_id
CREATE OR REPLACE FUNCTION public.get_store_id(user_uuid UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.stores WHERE owner_id = user_uuid LIMIT 1;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- REALTIME PUBLICATIONS
-- ═══════════════════════════════════════════════════════════════════

-- Enable realtime for tables that need live sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_flow;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ═══════════════════════════════════════════════════════════════════
-- SEED: Default license keys (optional, for testing)
-- ═══════════════════════════════════════════════════════════════════
-- INSERT INTO public.license_keys (key, tier, period, created_by)
-- VALUES
--   ('KAFFE-PRO-TEST-001', 'pro', 'monthly', 'admin'),
--   ('KAFFE-PRO-LIFE-001', 'pro', 'lifetime', 'admin'),
--   ('KAFFE-BSC-TEST-001', 'basic', 'monthly', 'admin');
