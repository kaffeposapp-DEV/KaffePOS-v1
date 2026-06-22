import 'dotenv/config';

import healthRouter, { setHealthRuntimeState } from './routes/health';
import authRouter from './routes/auth';
import storesRouter from './routes/stores';
import menuRouter from './routes/menu';
import inventoryRouter from './routes/inventory';
import financeRouter from './routes/finance';
import kitchenRouter from './routes/kitchen';
import transactionsRouter from './routes/transactions';
import loyaltyRouter from './routes/loyalty';
import challengesRouter from './routes/challenges';
import subscriptionsRouter from './routes/subscriptions';
import paymentRouter from './routes/payment';
import adminRouter from './routes/admin';
import miscRouter from './routes/misc';
import webhooksRouter from './routes/webhooks';
import metricsRouter from './routes/metrics';
import stagingRouter from './routes/staging';
import { appVersionAuthenticatedRouter, appVersionPublicRouter } from './routes/appVersion';
import referralsRouter from './routes/referrals';
import affiliateRouter from './routes/affiliate';
import adminMfaRouter from './routes/admin-mfa';
import { securityHeaders } from './middleware/securityHeaders';
import { compression } from './middleware/compression';
import { initEmailJobs } from './lib/emailJobs';
import { jobQueue } from './lib/jobQueue';

import { handleAnalyticsJob, handleCommissionJob, handleEmailJob, handleNotificationJob } from './lib/jobQueueHandlers';

import { createHash } from 'node:crypto';
import { type Server } from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { buildAllowedCorsOrigins, isOriginAllowed } from './lib/corsOrigins';
import { env } from './core/env';
import { pool } from './core/db';
import { ApiError, getSafeApiErrorMessage, log, serializeError } from './core/errors';
import { captureBackendException, initBackendErrorTracking } from './core/errorTracking';
import {
  KitchenStatusError,
} from './lib/kitchenStatus';
import {
  getPermissionsForRole,
  normalizeUserRole,
  type Permission,
  type UserRole,
} from './lib/accessControl';
import {
  canCashierLogin,
  normalizeCashierStatus,
} from './lib/cashierManagement';

import {
  errorLoggingMiddleware,
  installDatabaseApm,
  requestContextMiddleware,
  requestLoggingMiddleware,
  startApmMonitoring,
} from './middleware/apm';

type AuthenticatedUser = {
  id: string;
  email: string | null;
  email_verified_at?: string | null;
  created_at?: string | null;
  role: UserRole;
  permissions: Permission[];
  account_status?: string | null;
};

type AuthenticatedSession = {
  id: string;
  tokenHash: string;
  expiresAt: string;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      authSession?: AuthenticatedSession;
      requestId?: string;
      rawBody?: string;
    }
  }
}

const serviceStartedAt = Date.now();
let isShuttingDown = false;
let server: Server | null = null;

const allowedOrigins = buildAllowedCorsOrigins(env.CORS_ORIGIN);

const app = express();
app.use(securityHeaders);
initBackendErrorTracking();
initEmailJobs();
installDatabaseApm(pool);
startApmMonitoring();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({
  limit: '1mb',
  // Preserve the raw payload so header-signature webhooks (DOKU) can verify the
  // exact bytes the provider hashed into its Digest.
  verify: (req, _res, buf) => {
    (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(compression);
app.use(requestContextMiddleware());
app.use(requestLoggingMiddleware());

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
  }),
);

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, Math.min(env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000)).unref();

function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function isMidtransConfigured() {
  return Boolean(env.MIDTRANS_SERVER_KEY && env.MIDTRANS_SNAP_ENABLED === 'true');
}

type SubscriptionPaymentMode = 'manual' | 'disabled' | 'midtrans_sandbox' | 'midtrans_production' | 'duitku_sandbox' | 'duitku_production' | 'doku_sandbox' | 'doku_production';

function resolveSubscriptionPaymentConfig() {
  const midtransConfigured = isMidtransConfigured();
  const requestedMode = env.SUBSCRIPTION_PAYMENT_MODE;
  const productionMidtrans = env.MIDTRANS_ENVIRONMENT === 'production';
  let mode: SubscriptionPaymentMode;

  if (requestedMode === 'auto') {
    if (!midtransConfigured) {
      mode = 'manual';
    } else if (env.NODE_ENV === 'production' && !productionMidtrans) {
      mode = 'manual';
    } else {
      mode = productionMidtrans ? 'midtrans_production' : 'midtrans_sandbox';
    }
  } else if (requestedMode === 'midtrans_production' && !productionMidtrans) {
    mode = 'manual';
  } else if (requestedMode === 'midtrans_sandbox' && productionMidtrans) {
    mode = 'manual';
  } else {
    mode = requestedMode;
  }

  const onlinePaymentAvailable =
    midtransConfigured &&
    ((mode === 'midtrans_production' && productionMidtrans) ||
      (mode === 'midtrans_sandbox' && !productionMidtrans));
  const commerciallyReady = onlinePaymentAvailable && mode === 'midtrans_production' && productionMidtrans;
  const manualActivationAvailable = mode === 'manual' || !onlinePaymentAvailable;

  return {
    mode,
    provider: 'midtrans',
    midtransEnvironment: env.MIDTRANS_ENVIRONMENT,
    onlinePaymentAvailable,
    manualActivationAvailable,
    commerciallyReady,
    message: onlinePaymentAvailable
      ? mode === 'midtrans_production'
        ? 'Pembayaran online Midtrans production aktif.'
        : 'Pembayaran online Midtrans sandbox aktif untuk QA internal.'
      : 'Pembayaran online belum dibuka. Aktivasi langganan dilakukan manual oleh admin sampai Midtrans production aktif.',
    recommendedAction: onlinePaymentAvailable
      ? 'Selesaikan pembayaran via checkout online.'
      : 'Hubungi admin untuk aktivasi manual setelah pembayaran transfer/QR manual.',
  };
}

async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      throw new ApiError(401, 'Missing bearer token.');
    }

    const tokenHash = hashToken(token);
    const result = await pool.query(
      `
        select
          s.id as session_id,
          s.expires_at,
          c.user_id,
          c.email,
          c.email_verified_at,
          p.role,
          p.account_status,
          exists (
            select 1
            from public.cashier_outlet_assignments a
            where a.cashier_id = c.user_id
              and a.status = 'active'
          ) as has_active_assignment
        from public.app_auth_sessions s
        join public.app_auth_credentials c on c.user_id = s.user_id
        left join public.profiles p on p.id = c.user_id
        where s.token_hash = $1
          and s.revoked_at is null
          and s.expires_at > now()
        limit 1
      `,
      [tokenHash],
    );

    const session = result.rows[0];
    if (!session) {
      throw new ApiError(401, 'Sesi tidak valid atau sudah kedaluwarsa.');
    }

    const role = normalizeUserRole(session.role);
    const accountStatus = normalizeCashierStatus(session.account_status);
    if (role === 'cashier' && !canCashierLogin(accountStatus)) {
      throw new ApiError(403, 'Akun kasir nonaktif. Hubungi Owner/Admin.');
    }
    if (role === 'cashier' && !session.has_active_assignment) {
      throw new ApiError(403, 'Akun kasir belum terhubung ke outlet aktif.');
    }

    req.authUser = {
      id: session.user_id as string,
      email: (session.email as string | null) ?? null,
      email_verified_at: (session.email_verified_at as string | null) ?? null,
      role,
      permissions: getPermissionsForRole(role),
      account_status: accountStatus,
    };
    req.authSession = {
      id: session.session_id as string,
      tokenHash,
      expiresAt: session.expires_at as string,
    };

    void pool.query(
      `
        update public.app_auth_sessions
        set last_seen_at = now()
        where id = $1
      `,
      [session.session_id],
    ).catch(() => {});

    next();
  } catch (error) {
    next(error);
  }
}

async function bootstrapAuthSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    do $$
    declare
      profiles_auth_fk text;
      insight_auth_fk text;
    begin
      select con.conname
      into profiles_auth_fk
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refnsp on refnsp.oid = ref.relnamespace
      where con.contype = 'f'
        and nsp.nspname = 'public'
        and rel.relname = 'profiles'
        and refnsp.nspname = 'auth'
        and ref.relname = 'users'
      limit 1;

      if profiles_auth_fk is not null then
        execute format('alter table public.profiles drop constraint %I', profiles_auth_fk);
      end if;

      select con.conname
      into insight_auth_fk
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refnsp on refnsp.oid = ref.relnamespace
      where con.contype = 'f'
        and nsp.nspname = 'public'
        and rel.relname = 'ai_insight_logs'
        and refnsp.nspname = 'auth'
        and ref.relname = 'users'
      limit 1;

      if insight_auth_fk is not null then
        execute format('alter table public.ai_insight_logs drop constraint %I', insight_auth_fk);
      end if;
    end $$;
  `);

  await pool.query(`
    alter table public.profiles
      add column if not exists role text not null default 'owner_admin';

    alter table public.profiles
      add column if not exists account_status text not null default 'active';

    update public.profiles
    set role = 'owner_admin'
    where role is null
       or role not in ('owner_admin', 'cashier');

    update public.profiles
    set account_status = 'active'
    where account_status is null
       or account_status not in ('active', 'inactive');

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_role_check'
      ) then
        alter table public.profiles
          add constraint profiles_role_check
          check (role in ('owner_admin', 'cashier'));
      end if;

      if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_account_status_check'
      ) then
        alter table public.profiles
          add constraint profiles_account_status_check
          check (account_status in ('active', 'inactive'));
      end if;
    end $$;
  `);

  await pool.query(`
    create table if not exists public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      title text not null,
      message text not null,
      type text not null default 'system',
      read boolean not null default false,
      created_at timestamptz not null default now()
    );

    alter table public.notifications
      add column if not exists store_id uuid references public.stores(id) on delete cascade;

    alter table public.notifications
      add column if not exists metadata jsonb not null default '{}'::jsonb;

    alter table public.notifications
      drop constraint if exists notifications_type_check;

    alter table public.notifications
      add constraint notifications_type_check
      check (type in ('system', 'info', 'success', 'warning', 'error', 'challenge', 'stock', 'business_alert', 'gamification'));

    create index if not exists notifications_user_created_idx
      on public.notifications (user_id, created_at desc);

    create index if not exists notifications_store_created_idx
      on public.notifications (store_id, created_at desc)
      where store_id is not null;

    create table if not exists public.cashier_outlet_assignments (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references public.profiles(id) on delete cascade,
      cashier_id uuid not null references public.profiles(id) on delete cascade,
      store_id uuid not null references public.stores(id) on delete cascade,
      status text not null default 'active' check (status in ('active', 'inactive')),
      created_by uuid references public.profiles(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (owner_id, cashier_id)
    );

    create index if not exists cashier_outlet_assignments_owner_idx
      on public.cashier_outlet_assignments (owner_id, updated_at desc);

    create index if not exists cashier_outlet_assignments_cashier_idx
      on public.cashier_outlet_assignments (cashier_id, status);

    create table if not exists public.app_auth_credentials (
      user_id uuid primary key references public.profiles(id) on delete cascade,
      email text not null unique,
      password_hash text,
      email_verified_at timestamptz,
      last_login_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists public.app_auth_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      token_hash text not null unique,
      ip_address text,
      user_agent text,
      expires_at timestamptz not null,
      last_seen_at timestamptz not null default now(),
      revoked_at timestamptz,
      created_at timestamptz not null default now()
    );

    create index if not exists app_auth_sessions_user_id_idx
      on public.app_auth_sessions (user_id, expires_at desc)
      where revoked_at is null;

    create table if not exists public.app_password_reset_tokens (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      email text not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    );

    create index if not exists app_password_reset_tokens_email_idx
      on public.app_password_reset_tokens (email, created_at desc)
      where consumed_at is null;

    create table if not exists public.subscription_payment_sessions (
      id uuid primary key,
      user_id uuid not null references public.profiles(id) on delete cascade,
      store_id uuid references public.stores(id) on delete set null,
      subscription_id uuid references public.subscriptions(id) on delete set null,
      plan text not null,
      billing_cycle text not null,
      amount integer not null,
      currency_code text not null default 'IDR',
      midtrans_order_id text not null unique,
      midtrans_transaction_id text,
      snap_token text,
      redirect_url text,
      payment_type text,
      transaction_status text not null default 'pending',
      fraud_status text,
      status_code text,
      expires_at timestamptz,
      paid_at timestamptz,
      settled_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists subscription_payment_sessions_user_id_idx
      on public.subscription_payment_sessions (user_id, created_at desc);

    create index if not exists subscription_payment_sessions_order_id_idx
      on public.subscription_payment_sessions (midtrans_order_id);
  `);

  await pool.query(`
    insert into public.app_auth_credentials (user_id, email, email_verified_at, created_at, updated_at)
    select p.id, lower(trim(p.email)), now(), now(), now()
    from public.profiles p
    where p.email is not null
      and trim(p.email) <> ''
    on conflict (user_id) do update
    set
      email = excluded.email,
      updated_at = now()
  `);
}

async function bootstrapStockSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.inventory (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      name text not null,
      stock numeric not null default 0,
      unit text not null default 'pcs',
      min_stock numeric not null default 5,
      cost_per_unit numeric not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table public.inventory
      add column if not exists sku text;

    alter table public.inventory
      add column if not exists base_unit text;

    alter table public.inventory
      add column if not exists purchase_unit text;

    alter table public.inventory
      add column if not exists conversion_ratio numeric;

    alter table public.inventory
      add column if not exists is_active boolean not null default true;

    update public.inventory
    set base_unit = coalesce(nullif(trim(base_unit), ''), unit)
    where base_unit is null or trim(base_unit) = '';

    update public.inventory
    set purchase_unit = coalesce(nullif(trim(purchase_unit), ''), unit)
    where purchase_unit is null or trim(purchase_unit) = '';

    update public.inventory
    set conversion_ratio = 1
    where conversion_ratio is null or conversion_ratio <= 0;

    create index if not exists inventory_store_active_name_idx
      on public.inventory (store_id, is_active, name);

    create table if not exists public.inventory_unit_conversions (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      ingredient_id uuid references public.inventory(id) on delete cascade,
      from_unit text not null,
      to_unit text not null,
      ratio numeric not null check (ratio > 0),
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists inventory_unit_conversions_store_idx
      on public.inventory_unit_conversions (store_id, is_active, from_unit, to_unit);

    create index if not exists inventory_unit_conversions_ingredient_idx
      on public.inventory_unit_conversions (ingredient_id, is_active);

    create table if not exists public.transaction_inventory_audit (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      transaction_id text not null,
      inventory_id uuid references public.inventory(id) on delete set null,
      action text not null,
      qty_delta numeric not null,
      stock_before numeric not null,
      stock_after numeric not null,
      created_at timestamptz not null default now()
    );

    do $$
    declare
      audit_transaction_fk text;
    begin
      for audit_transaction_fk in
        select con.conname
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace nsp on nsp.oid = rel.relnamespace
        join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
        where con.contype = 'f'
          and nsp.nspname = 'public'
          and rel.relname = 'transaction_inventory_audit'
          and att.attname = 'transaction_id'
      loop
        execute format('alter table public.transaction_inventory_audit drop constraint %I', audit_transaction_fk);
      end loop;
    end $$;

    alter table public.transaction_inventory_audit
      alter column transaction_id type text using transaction_id::text;

    alter table public.transaction_inventory_audit
      drop constraint if exists transaction_inventory_audit_action_check;

    alter table public.transaction_inventory_audit
      add constraint transaction_inventory_audit_action_check
      check (action in ('sale', 'void', 'opname'));

    create index if not exists transaction_inventory_audit_transaction_idx
      on public.transaction_inventory_audit (transaction_id, created_at asc);

    create index if not exists transaction_inventory_audit_store_idx
      on public.transaction_inventory_audit (store_id, created_at desc);

    create table if not exists public.inventory_adjustments (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      inventory_id uuid not null references public.inventory(id) on delete cascade,
      counted_stock numeric not null check (counted_stock >= 0),
      stock_before numeric not null,
      qty_delta numeric not null,
      reason text not null,
      note text,
      adjusted_by uuid references public.profiles(id) on delete set null,
      adjusted_by_email text,
      created_at timestamptz not null default now()
    );

    create index if not exists inventory_adjustments_store_created_idx
      on public.inventory_adjustments (store_id, created_at desc);

    create index if not exists inventory_adjustments_inventory_created_idx
      on public.inventory_adjustments (inventory_id, created_at desc);
  `);
}

async function bootstrapKitchenSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.kitchen_orders (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      transaction_id text references public.transactions(id) on delete set null,
      order_number text not null,
      source text not null default 'cashier',
      customer_name text,
      table_number text,
      overall_status text not null default 'pending'
        check (overall_status in ('pending', 'preparing', 'ready', 'served', 'completed', 'cancelled')),
      created_by uuid references public.profiles(id) on delete set null,
      created_by_name text,
      status_version integer not null default 1,
      cancelled_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (store_id, transaction_id)
    );

    create index if not exists kitchen_orders_store_status_created_idx
      on public.kitchen_orders (store_id, overall_status, created_at desc);

    create index if not exists kitchen_orders_store_updated_idx
      on public.kitchen_orders (store_id, updated_at desc);

    create table if not exists public.kitchen_order_items (
      id uuid primary key default gen_random_uuid(),
      order_id uuid not null references public.kitchen_orders(id) on delete cascade,
      menu_item_id uuid references public.menu_items(id) on delete set null,
      item_name text not null,
      qty numeric not null check (qty > 0),
      note text,
      station text not null default 'other'
        check (station in ('kitchen', 'bar', 'dessert', 'other')),
      item_status text not null default 'pending'
        check (item_status in ('pending', 'preparing', 'ready', 'served', 'completed', 'cancelled')),
      status_version integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists kitchen_order_items_order_idx
      on public.kitchen_order_items (order_id, created_at asc);

    create index if not exists kitchen_order_items_station_status_idx
      on public.kitchen_order_items (station, item_status);

    create table if not exists public.kitchen_order_events (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      order_id uuid not null references public.kitchen_orders(id) on delete cascade,
      order_item_id uuid references public.kitchen_order_items(id) on delete set null,
      event_type text not null,
      old_status text,
      new_status text,
      changed_by uuid references public.profiles(id) on delete set null,
      changed_by_name text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists kitchen_order_events_store_created_idx
      on public.kitchen_order_events (store_id, created_at desc);

    create index if not exists kitchen_order_events_order_created_idx
      on public.kitchen_order_events (order_id, created_at asc);
  `);
}

async function bootstrapLoyaltySchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.loyalty_settings (
      store_id uuid primary key references public.stores(id) on delete cascade,
      stamps_required integer not null default 8 check (stamps_required between 2 and 20),
      points_per_rupiah numeric not null default 0.01 check (points_per_rupiah >= 0),
      minimum_transaction_amount integer not null default 0 check (minimum_transaction_amount >= 0),
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists public.loyalty_rewards (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      name text not null,
      description text,
      type text not null check (type in ('discount_amount', 'discount_percent', 'free_item')),
      reward_value integer not null default 0 check (reward_value >= 0),
      points_or_stamps_needed integer not null default 0 check (points_or_stamps_needed >= 0),
      points_cost integer not null default 0 check (points_cost >= 0),
      stamps_cost integer not null default 0 check (stamps_cost >= 0),
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists loyalty_rewards_store_active_idx
      on public.loyalty_rewards (store_id, is_active, created_at asc);

    alter table public.loyalty_rewards
      add column if not exists points_or_stamps_needed integer not null default 0 check (points_or_stamps_needed >= 0);

    create table if not exists public.loyalty_customers (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      name text,
      phone text not null,
      tier text not null default 'regular' check (tier in ('regular', 'kopi_lover', 'vvip')),
      total_points integer not null default 0 check (total_points >= 0),
      total_visits integer not null default 0 check (total_visits >= 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (store_id, phone)
    );

    create index if not exists loyalty_customers_store_phone_idx
      on public.loyalty_customers (store_id, phone);

    create table if not exists public.loyalty_tiers (
      id uuid primary key default gen_random_uuid(),
      store_id uuid references public.stores(id) on delete cascade,
      name text not null,
      min_visits integer not null default 0 check (min_visits >= 0),
      benefits jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (store_id, name)
    );

    create index if not exists loyalty_tiers_store_min_visits_idx
      on public.loyalty_tiers (store_id, min_visits asc);

    create table if not exists public.loyalty_passports (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      customer_name text,
      customer_phone text not null,
      tier text not null default 'regular' check (tier in ('regular', 'kopi_lover', 'vvip')),
      total_stamps integer not null default 0 check (total_stamps >= 0),
      available_stamps integer not null default 0 check (available_stamps >= 0),
      total_points integer not null default 0 check (total_points >= 0),
      available_points integer not null default 0 check (available_points >= 0),
      lifetime_spend integer not null default 0 check (lifetime_spend >= 0),
      last_visit_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (store_id, customer_phone)
    );

    create index if not exists loyalty_passports_store_updated_idx
      on public.loyalty_passports (store_id, updated_at desc);

    create index if not exists loyalty_passports_store_phone_idx
      on public.loyalty_passports (store_id, customer_phone);

    create table if not exists public.loyalty_stamp_events (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      passport_id uuid not null references public.loyalty_passports(id) on delete cascade,
      transaction_id text references public.transactions(id) on delete set null,
      stamps integer not null default 1 check (stamps >= 0),
      points integer not null default 0 check (points >= 0),
      transaction_amount integer not null default 0 check (transaction_amount >= 0),
      note text,
      created_by uuid references public.profiles(id) on delete set null,
      idempotency_key text,
      created_at timestamptz not null default now()
    );

    create unique index if not exists loyalty_stamp_events_idempotency_idx
      on public.loyalty_stamp_events (store_id, idempotency_key)
      where idempotency_key is not null;

    create index if not exists loyalty_stamp_events_passport_created_idx
      on public.loyalty_stamp_events (passport_id, created_at desc);

    create table if not exists public.loyalty_stamps (
      id uuid primary key default gen_random_uuid(),
      customer_id uuid not null references public.loyalty_customers(id) on delete cascade,
      transaction_id text references public.transactions(id) on delete set null,
      stamps_earned integer not null default 1 check (stamps_earned >= 0),
      created_at timestamptz not null default now()
    );

    create index if not exists loyalty_stamps_customer_created_idx
      on public.loyalty_stamps (customer_id, created_at desc);

    create table if not exists public.loyalty_redemptions (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      passport_id uuid not null references public.loyalty_passports(id) on delete cascade,
      reward_id uuid not null references public.loyalty_rewards(id) on delete restrict,
      transaction_id text references public.transactions(id) on delete set null,
      points_spent integer not null default 0 check (points_spent >= 0),
      stamps_spent integer not null default 0 check (stamps_spent >= 0),
      discount_amount integer not null default 0 check (discount_amount >= 0),
      status text not null default 'redeemed' check (status in ('pending', 'redeemed', 'void')),
      created_by uuid references public.profiles(id) on delete set null,
      idempotency_key text,
      created_at timestamptz not null default now()
    );

    create unique index if not exists loyalty_redemptions_idempotency_idx
      on public.loyalty_redemptions (store_id, idempotency_key)
      where idempotency_key is not null;

    create index if not exists loyalty_redemptions_passport_created_idx
      on public.loyalty_redemptions (passport_id, created_at desc);
  `);
}

async function bootstrapChallengeSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.challenges (
      id uuid primary key default gen_random_uuid(),
      store_id uuid references public.stores(id) on delete cascade,
      title text not null,
      description text not null default '',
      target_type text not null check (
        target_type in (
          'sell_drink',
          'average_checkout_time',
          'transactions_count',
          'upsell_value',
          'zero_voids'
        )
      ),
      target_value jsonb not null default '{}'::jsonb,
      points_reward integer not null default 0 check (points_reward >= 0),
      is_active boolean not null default true,
      valid_from date not null default current_date,
      valid_to date not null default current_date,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists challenges_store_active_valid_idx
      on public.challenges (store_id, is_active, valid_from, valid_to);

    create unique index if not exists challenges_store_title_day_idx
      on public.challenges (store_id, title, valid_from);

    create table if not exists public.user_challenge_progress (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      challenge_id uuid not null references public.challenges(id) on delete cascade,
      current_progress numeric not null default 0 check (current_progress >= 0),
      is_completed boolean not null default false,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, challenge_id)
    );

    create index if not exists user_challenge_progress_user_idx
      on public.user_challenge_progress (user_id, updated_at desc);

    create index if not exists user_challenge_progress_challenge_idx
      on public.user_challenge_progress (challenge_id, is_completed);
  `);
}

async function bootstrapSubscriptionPromptSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.subscription_upgrade_prompt_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references public.profiles(id) on delete set null,
      store_id uuid references public.stores(id) on delete set null,
      event_type text not null check (event_type in ('view', 'click', 'dismiss')),
      prompt_key text not null,
      trigger text not null,
      recommended_plan text not null default 'signature',
      current_plan text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists subscription_upgrade_prompt_events_user_idx
      on public.subscription_upgrade_prompt_events (user_id, created_at desc);

    create index if not exists subscription_upgrade_prompt_events_store_trigger_idx
      on public.subscription_upgrade_prompt_events (store_id, trigger, created_at desc);
  `);
}

async function bootstrapAiInsightsSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.ai_insights_cache (
      store_id uuid primary key references public.stores(id) on delete cascade,
      generated_by uuid references public.profiles(id) on delete set null,
      payload jsonb not null,
      generated_at timestamptz not null default now(),
      expires_at timestamptz not null,
      updated_at timestamptz not null default now()
    );

    create index if not exists ai_insights_cache_expires_idx
      on public.ai_insights_cache (expires_at);
  `);
}

// ── Modular routes ─────────────────────────────────────────────
// Health, system-status → extracted to routes/health.ts
setHealthRuntimeState({ serviceStartedAt, isShuttingDown: () => isShuttingDown });
app.use(healthRouter);
app.use(appVersionPublicRouter);
app.use(metricsRouter);

app.use(referralsRouter);
// Pre-auth webhook routes
app.use(webhooksRouter);

// Auth, profile → extracted to routes/auth.ts
app.use(authRouter);
app.use(stagingRouter);

function rewriteApiV1Request(req: Request, _res: Response, next: NextFunction) {
  req.url = `/api${req.url}`;
  next();
}

app.use('/api/v1', rewriteApiV1Request, webhooksRouter, authRouter);
app.use(
  '/api/v1',
  authenticate,
  rewriteApiV1Request,
  storesRouter,
  menuRouter,
  inventoryRouter,
  financeRouter,
  kitchenRouter,
  transactionsRouter,
  loyaltyRouter,
  challengesRouter,
  subscriptionsRouter,
  paymentRouter,
  adminMfaRouter,
  adminRouter,
  appVersionAuthenticatedRouter,
  miscRouter,
);

app.use('/api', authenticate);

// Stores, cashiers, menu, inventory, finance → extracted to route modules
app.use(storesRouter);
app.use(menuRouter);
app.use(inventoryRouter);
app.use(financeRouter);
app.use(kitchenRouter);
app.use(transactionsRouter);
app.use(loyaltyRouter);
app.use(challengesRouter);
app.use(subscriptionsRouter);
app.use(paymentRouter);
app.use(affiliateRouter);
app.use(adminMfaRouter);
app.use(adminRouter);
app.use(appVersionAuthenticatedRouter);
app.use(miscRouter);

app.use(errorLoggingMiddleware);

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    log('warn', 'request.validation_error', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      issues: error.issues,
    });
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: error.issues[0]?.message ?? 'Payload tidak valid.',
    });
    return;
  }

  if (error instanceof ApiError) {
    const clientMessage = getSafeApiErrorMessage(error);
    log('warn', 'request.api_error', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      statusCode: error.status,
      message: error.message,
    });
    res.status(error.status).json({ error: 'API_ERROR', message: clientMessage });
    return;
  }

  if (error instanceof KitchenStatusError) {
    log('warn', 'request.kitchen_status_error', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      statusCode: error.status,
      message: error.message,
    });
    res.status(error.status).json({ error: 'API_ERROR', message: error.message });
    return;
  }

  if (error instanceof Error && error.message.includes('is not allowed')) {
    log('warn', 'request.cors_rejected', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      message: error.message,
    });
    res.status(403).json({
      error: 'CORS_REJECTED',
      message: 'Origin tidak diizinkan.',
    });
    return;
  }

  log('error', 'request.unhandled_error', {
    requestId: req.requestId ?? null,
    method: req.method,
    path: req.originalUrl,
    error: serializeError(error),
  });
  captureBackendException(error, {
    source: 'global_error_handler',
    method: req.method,
    path: req.originalUrl,
    statusCode: 500,
    metadata: {
      requestId: req.requestId ?? null,
      userId: req.authUser?.id ?? null,
    },
  });
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Terjadi gangguan pada server. Coba lagi beberapa saat.',
  });
});

async function verifyDependenciesOnStartup() {
  const startedAt = Date.now();
  await bootstrapAuthSchema();
  await bootstrapStockSchema();
  await bootstrapKitchenSchema();
  await bootstrapLoyaltySchema();
  await bootstrapChallengeSchema();
  await bootstrapSubscriptionPromptSchema();
  await bootstrapAiInsightsSchema();
  await pool.query('select 1');
  log('info', 'startup.dependencies_ready', {
    database: {
      ok: true,
      latencyMs: Date.now() - startedAt,
    },
    email: {
      ok: Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL),
      provider: 'resend',
    },
    payment: {
      ok: isMidtransConfigured(),
      provider: 'midtrans',
      environment: env.MIDTRANS_ENVIRONMENT,
      mode: resolveSubscriptionPaymentConfig().mode,
    },
  });
}

async function shutdown(signal: NodeJS.Signals | 'FATAL') {
  jobQueue.stop();
  if (isShuttingDown) return;
  isShuttingDown = true;

  log('warn', 'shutdown.started', { signal });

  const forcedExitTimer = setTimeout(() => {
    log('error', 'shutdown.force_exit', { signal });
    process.exit(1);
  }, 10_000);
  forcedExitTimer.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    await pool.end();
    clearTimeout(forcedExitTimer);
    log('info', 'shutdown.completed', { signal });
    process.exit(signal === 'FATAL' ? 1 : 0);
  } catch (error) {
    clearTimeout(forcedExitTimer);
    log('error', 'shutdown.failed', {
      signal,
      error: serializeError(error),
    });
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('unhandledRejection', (reason) => {
  log('error', 'process.unhandled_rejection', { error: serializeError(reason) });
  void shutdown('FATAL');
});

process.on('uncaughtException', (error) => {
  log('error', 'process.uncaught_exception', { error: serializeError(error) });
  void shutdown('FATAL');
});

async function start() {
  jobQueue.registerHandler('email', handleEmailJob);
  jobQueue.registerHandler('analytics', handleAnalyticsJob);
  jobQueue.registerHandler('notification', handleNotificationJob);
  jobQueue.registerHandler('commission', handleCommissionJob);
  jobQueue.start();
  log('info', 'startup.boot', {
    port: env.PORT,
    env: env.NODE_ENV,
    corsOrigins: Array.from(allowedOrigins),
    databaseTarget: env.DATABASE_URL ? 'DATABASE_URL' : `${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`,
    webBaseUrl: env.WEB_BASE_URL,
    apiBaseUrl: env.API_BASE_URL,
    emailProvider: env.RESEND_API_KEY && env.RESEND_FROM_EMAIL ? 'resend' : 'disabled',
    paymentProvider: isMidtransConfigured() ? 'midtrans' : 'disabled',
    midtransEnvironment: env.MIDTRANS_ENVIRONMENT,
    subscriptionPaymentMode: resolveSubscriptionPaymentConfig().mode,
  });

  await verifyDependenciesOnStartup();

  server = app.listen(env.PORT, () => {
    log('info', 'startup.listening', {
      port: env.PORT,
      healthUrl: `http://0.0.0.0:${env.PORT}/health`,
    });
  });
}

start().catch((error) => {
  log('error', 'startup.failed', { error: serializeError(error) });
  process.exit(1);
});
