import { normalizeCashierStatus } from './cashierManagement';
import { toNumber } from './util';

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
