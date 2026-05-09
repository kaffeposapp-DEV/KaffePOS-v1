/**
 * Shared helper functions, normalizers, SQL column constants.
 * Extracted from monolith index.ts — exact same logic.
 */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from './errors';
import {
  getPermissionsForRole,
  normalizeUserRole,
} from '../lib/accessControl';
import { normalizeCashierStatus } from '../lib/cashierManagement';
import type { AuthenticatedUser } from './middleware';

// ── Numeric helpers ────────────────────────────────────────────

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return 0;
}

// ── Row normalizers ────────────────────────────────────────────

export function normalizeStore(row: Record<string, unknown>) {
  return {
    ...row,
    tax_percent: toNumber(row.tax_percent),
    logo_size: row.logo_size == null ? null : Number(row.logo_size),
  };
}

export function serializeCashier(row: Record<string, unknown>) {
  return {
    id: row.id,
    display_name: row.display_name,
    email: row.email,
    username: row.username,
    role: 'cashier',
    status: normalizeCashierStatus(row.account_status ?? row.status),
    store_id: row.store_id,
    store_name: row.store_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function normalizeInventory(row: Record<string, unknown>) {
  return {
    ...row,
    stock: toNumber(row.stock),
    conversion_ratio: row.conversion_ratio == null ? null : toNumber(row.conversion_ratio),
    min_stock: toNumber(row.min_stock),
    cost_per_unit: toNumber(row.cost_per_unit),
    is_active: row.is_active !== false,
  };
}

export function normalizeStockUnitConversion(row: Record<string, unknown>) {
  return {
    ...row,
    ratio: toNumber(row.ratio),
    is_active: row.is_active !== false,
  };
}

export function normalizeTransaction(row: Record<string, unknown>) {
  return {
    ...row,
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    tax: Number(row.tax ?? 0),
    total: Number(row.total ?? 0),
    cogs: Number(row.cogs ?? 0),
    paid: Number(row.paid ?? 0),
    change: Number(row.change ?? 0),
  };
}

export function normalizeSubscription(row: Record<string, unknown>) {
  return {
    ...row,
    payment_amount: row.payment_amount == null ? null : Number(row.payment_amount),
  };
}

export function normalizePaymentHistory(row: Record<string, unknown>) {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
  };
}

export function normalizeSubscriptionPaymentSession(row: Record<string, unknown>) {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
  };
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

// ── Profile helpers ────────────────────────────────────────────

export function serializeProfile(row: Record<string, unknown> | null | undefined) {
  if (!row) return row;
  const role = normalizeUserRole(row.role);
  return {
    ...row,
    role,
    account_status: normalizeCashierStatus(row.account_status),
    permissions: getPermissionsForRole(role),
  };
}

export async function getCashierAssignment(client: PoolClient, cashierId: string) {
  const result = await client.query(
    `
      select
        a.owner_id,
        a.store_id,
        a.status as assignment_status,
        s.store_name
      from public.cashier_outlet_assignments a
      join public.stores s on s.id = a.store_id
      where a.cashier_id = $1
      order by a.updated_at desc
      limit 1
    `,
    [cashierId],
  );

  const row = result.rows[0];
  if (!row) return {};

  return {
    owner_id: row.owner_id,
    assigned_store_id: row.store_id,
    assigned_store_name: row.store_name,
    assignment_status: normalizeCashierStatus(row.assignment_status),
  };
}

export async function serializeProfileWithAssignment(client: PoolClient, row: Record<string, unknown> | null | undefined) {
  const profile = serializeProfile(row) as Record<string, unknown> | null | undefined;
  if (!profile || profile.role !== 'cashier') return profile;
  return {
    ...profile,
    ...(await getCashierAssignment(client, String(profile.id))),
  };
}

// ── Store ownership assert ─────────────────────────────────────

export async function assertStoreOwned(client: PoolClient, storeId: string, userId: string) {
  const result = await client.query(
    `
      select ${storeColumns}
      from public.stores s
      where s.id = $1
        and (
          s.owner_id = $2
          or exists (
            select 1
            from public.cashier_outlet_assignments a
            join public.profiles p on p.id = a.cashier_id
            where a.store_id = s.id
              and a.cashier_id = $2
              and a.status = 'active'
              and p.role = 'cashier'
              and p.account_status = 'active'
          )
        )
      limit 1
    `,
    [storeId, userId],
  );

  const store = result.rows[0];
  if (!store) {
    throw new ApiError(404, 'Toko tidak ditemukan atau tidak bisa diakses.');
  }

  return store;
}

// ── Profile bootstrap ──────────────────────────────────────────

export async function ensureProfile(client: PoolClient, user: AuthenticatedUser) {
  const existing = await client.query(
    `select ${profileColumns} from public.profiles where id = $1 limit 1`,
    [user.id],
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const email = user.email ?? null;
  const fallbackName = user.email?.split('@')[0] || 'kaffepos';

  const username = fallbackName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 30) || `user_${user.id.slice(0, 8)}`;
  const displayName = fallbackName.slice(0, 120);

  const inserted = await client.query(
    `
      insert into public.profiles (id, username, display_name, email, role, account_status)
      values ($1, $2, $3, $4, 'owner_admin', 'active')
      on conflict (id) do update
      set
        email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        role = coalesce(public.profiles.role, excluded.role),
        account_status = coalesce(public.profiles.account_status, excluded.account_status)
      returning ${profileColumns}
    `,
    [user.id, username, displayName, email],
  );

  return inserted.rows[0];
}

// ── Notification insert ────────────────────────────────────────

export async function insertNotification(client: PoolClient, userId: string, title: string, message: string, type = 'info', metadata: Record<string, unknown> = {}) {
  await client.query(
    `
      insert into public.notifications (user_id, title, message, type, metadata)
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [userId, title, message, type, JSON.stringify(metadata)],
  );
}

// ── Unique username resolution ─────────────────────────────────

export async function resolveUniqueUsername(client: PoolClient, requested: string) {
  const normalized = requested
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || `user_${randomUUID().slice(0, 8)}`;

  let candidate = normalized;
  let counter = 1;

  while (counter < 1000) {
    const existing = await client.query(
      `select 1 from public.profiles where username = $1 limit 1`,
      [candidate],
    );
    if (!existing.rows[0]) {
      return candidate;
    }

    counter += 1;
    candidate = `${normalized.slice(0, Math.max(1, 30 - `${counter}`.length - 1))}_${counter}`;
  }

  return `${normalized.slice(0, 20)}_${randomUUID().slice(0, 8)}`;
}

// ── SQL column sets ────────────────────────────────────────────

export function pickDefined<T extends Record<string, unknown>>(payload: T, allowedKeys: string[]) {
  const result: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    if (payload[key] !== undefined) {
      result[key] = payload[key];
    }
  }

  return result;
}

export function buildUpdateClause(payload: Record<string, unknown>, startIndex = 1) {
  const entries = Object.entries(payload);
  if (entries.length === 0) {
    throw new ApiError(400, 'Tidak ada field yang bisa diubah.');
  }

  const values = entries.map(([, value]) => value);
  const clause = entries
    .map(([column], index) => `${column} = $${index + startIndex}`)
    .join(', ');

  return { clause, values };
}

export async function countRowsForStore(client: PoolClient, table: string, storeId: string) {
  const result = await client.query(`select count(*)::int as count from public.${table} where store_id = $1`, [storeId]);
  return result.rows[0]?.count ?? 0;
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function generateOtpCode() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

// ── Subscription sync ──────────────────────────────────────────

export async function syncProfileSubscriptionState(client: PoolClient, userId: string) {
  const latestSubscription = await client.query(
    `
      select
        id,
        plan,
        billing_cycle,
        payment_ref,
        activated_at,
        expires_at,
        status
      from public.subscriptions
      where user_id = $1
      order by activated_at desc nulls last, created_at desc nulls last
      limit 1
    `,
    [userId],
  );

  const subscription = latestSubscription.rows[0];
  const isActive = Boolean(
    subscription &&
    subscription.status === 'active' &&
    (!subscription.expires_at || new Date(String(subscription.expires_at)).getTime() > Date.now()),
  );

  if (!isActive) {
    await client.query(
      `
        update public.profiles
        set
          tier = 'basic',
          tier_expires_at = null,
          is_pro = false,
          pro_plan = null,
          pro_order_id = null,
          pro_activated_at = null,
          pro_expires_at = null,
          updated_at = now()
        where id = $1
      `,
      [userId],
    );
    return null;
  }

  await client.query(
    `
      update public.profiles
      set
        tier = 'pro',
        tier_expires_at = $2,
        is_pro = true,
        pro_plan = $3,
        pro_order_id = $4,
        pro_activated_at = $5,
        pro_expires_at = $2,
        updated_at = now()
      where id = $1
    `,
    [
      userId,
      subscription.expires_at ?? null,
      subscription.plan,
      subscription.payment_ref ?? null,
      subscription.activated_at ?? new Date().toISOString(),
    ],
  );

  return subscription;
}

// ── SQL column constants ───────────────────────────────────────

export const profileColumns = `
  id,
  username,
  display_name,
  email,
  avatar_url,
  tier,
  tier_expires_at,
  is_pro,
  pro_plan,
  pro_order_id,
  pro_activated_at,
  pro_expires_at,
  role,
  account_status,
  created_at,
  updated_at
`;

export const storeColumns = `
  id,
  owner_id,
  store_name,
  address,
  whatsapp,
  tax_percent,
  receipt_header,
  receipt_footer,
  logo_url,
  logo_base64,
  logo_position,
  logo_size,
  show_logo_on_receipt,
  currency,
  tagline,
  email,
  website,
  paper_width,
  receipt_font_size,
  receipt_show_address,
  receipt_show_whatsapp,
  receipt_show_tax,
  receipt_show_cashier,
  receipt_show_trx_id,
  receipt_divider,
  receipt_custom_line1,
  receipt_custom_line2,
  timezone,
  created_at,
  updated_at
`;

export const menuColumns = `
  id,
  store_id,
  name,
  price,
  category,
  image_url,
  description,
  is_available,
  sort_order,
  recipe,
  variants,
  created_at,
  updated_at
`;

export const inventoryColumns = `
  id,
  store_id,
  name,
  sku,
  stock,
  unit,
  base_unit,
  purchase_unit,
  conversion_ratio,
  min_stock,
  cost_per_unit,
  is_active,
  created_at,
  updated_at
`;

export const stockUnitConversionColumns = `
  id,
  store_id,
  ingredient_id,
  from_unit,
  to_unit,
  ratio,
  is_active,
  created_at,
  updated_at
`;

export const expenseColumns = `
  id,
  store_id,
  date,
  description,
  amount,
  category,
  cashier,
  source,
  created_at
`;

export const cashFlowColumns = `
  id,
  store_id,
  date,
  type,
  amount,
  description,
  cashier,
  created_at
`;

export const cashRegisterColumns = `
  id,
  store_id,
  date,
  amount,
  note,
  opened_by,
  created_at
`;

export const transactionColumns = `
  id,
  store_id,
  date,
  items,
  subtotal,
  discount,
  discount_label,
  tax,
  total,
  cogs,
  paid,
  change,
  method,
  customer_name,
  cashier,
  note,
  is_void,
  void_reason,
  void_at,
  void_by,
  created_at
`;

export const kitchenOrderColumns = `
  id,
  store_id,
  transaction_id,
  order_number,
  source,
  customer_name,
  table_number,
  overall_status,
  created_by,
  created_by_name,
  status_version,
  cancelled_reason,
  created_at,
  updated_at
`;

export const kitchenOrderItemColumns = `
  id,
  order_id,
  menu_item_id,
  item_name,
  qty,
  note,
  station,
  item_status,
  status_version,
  created_at,
  updated_at
`;
