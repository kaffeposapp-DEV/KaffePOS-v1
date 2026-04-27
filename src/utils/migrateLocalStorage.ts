 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/utils/migrateLocalStorage.ts
// ═══════════════════════════════════════════════════════════════════
// Migration: KaffePOS v14 localStorage → backend API
// Run once after user logs in for the first time.
// ═══════════════════════════════════════════════════════════════════

import { importLocalStoragePayload } from '@/lib/backendApi';

interface MigrationResult {
  success: boolean;
  migrated: string[];
  errors: string[];
  skipped: string[];
}

// ── Main migration function ────────────────────────────────────────
export async function migrateFromLocalStorage(
  storeId: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    migrated: [],
    errors: [],
    skipped: [],
  };


  try {
    const rawStore = localStorage.getItem('kaffe_store');
    const rawMenu = localStorage.getItem('kaffe_menu');
    const rawInv = localStorage.getItem('kaffe_inv');
    const rawTrx = localStorage.getItem('kaffe_trx');
    const rawExp = localStorage.getItem('kaffe_expenses');
    const rawCf = localStorage.getItem('kaffe_cashflow');
    const rawAccounts = localStorage.getItem('kaffe_accounts');

    const storeSettings = rawStore
      ? (() => {
          const old = JSON.parse(rawStore);
          return {
            store_name: old.storeName || 'KaffePOS',
            address: old.address || '',
            whatsapp: old.whatsapp || '',
            tax_percent: old.taxPercent || 0,
            receipt_header: old.receiptHeader || '',
            receipt_footer: old.receiptFooter || '',
            logo_url: old.logoUrl || '',
            logo_base64: old.logoBase64 || '',
            logo_position: old.logoPosition || 'center',
            logo_size: old.logoSize || 80,
            show_logo_on_receipt: old.showLogoOnReceipt ?? true,
          };
        })()
      : null;

    const menuItems = rawMenu
      ? (() => {
          const items = JSON.parse(rawMenu);
          return Array.isArray(items)
            ? items.map((item: Record<string, any>, idx: number) => ({
                name: item.name || 'Unknown',
                price: parseInt(item.price) || 0,
                category: item.category || 'Coffee',
                image_url: item.image || '',
                description: item.description || '',
                is_available: true,
                sort_order: idx,
                recipe: Array.isArray(item.recipe) ? item.recipe : [],
                variants: Array.isArray(item.variants) ? item.variants : [],
              }))
            : [];
        })()
      : [];

    const inventoryItems = rawInv
      ? (() => {
          const items = JSON.parse(rawInv);
          return Array.isArray(items)
            ? items.map((item: Record<string, any>) => ({
                name: item.name || 'Unknown',
                stock: parseFloat(item.stock) || 0,
                unit: item.unit || 'pcs',
                min_stock: parseFloat(item.minStock) || 5,
                cost_per_unit: parseFloat(item.costPerUnit) || 0,
              }))
            : [];
        })()
      : [];

    const transactions = rawTrx
      ? (() => {
          const trxs = JSON.parse(rawTrx);
          return Array.isArray(trxs)
            ? trxs.map((t: Record<string, any>) => ({
                id: t.id,
                date: t.date || new Date().toISOString(),
                items: Array.isArray(t.items) ? t.items : [],
                subtotal: parseInt(t.subtotal) || 0,
                discount: parseInt(t.discount) || 0,
                discount_label: t.discountLabel || null,
                tax: parseInt(t.tax) || 0,
                total: parseInt(t.total) || 0,
                cogs: parseInt(t.cogs) || 0,
                paid: parseInt(t.paid) || 0,
                change: parseInt(t.change) || 0,
                method: t.method || 'Tunai',
                cashier: t.cashier || '',
                note: t.note || null,
                is_void: Boolean(t.isVoid || t.void),
                void_reason: t.voidReason || null,
                void_at: t.voidAt || null,
                void_by: t.voidBy || null,
              }))
            : [];
        })()
      : [];

    const expenses = rawExp
      ? (() => {
          const items = JSON.parse(rawExp);
          return Array.isArray(items)
            ? items
                .map((e: Record<string, any>) => ({
                  date: e.date || new Date().toISOString(),
                  description: e.desc || e.description || '',
                  amount: parseInt(e.amount) || 0,
                  category: e.category || 'Operasional',
                  cashier: e.user || e.cashier || '',
                  source: e.source || ((e.category || 'Operasional') === 'Bahan Baku' ? 'inventory' : 'cashier'),
                }))
                .filter((r: Record<string, any>) => r.amount > 0)
            : [];
        })()
      : [];

    const cashFlow = rawCf
      ? (() => {
          const items = JSON.parse(rawCf);
          return Array.isArray(items)
            ? items
                .map((c: Record<string, any>) => ({
                  date: c.date || new Date().toISOString(),
                  type: c.type === 'in' ? 'in' : 'out',
                  amount: parseInt(c.amount) || 0,
                  description: c.desc || c.description || '',
                  cashier: c.user || c.cashier || '',
                }))
                .filter((r: Record<string, any>) => r.amount > 0)
            : [];
        })()
      : [];

    const storeAccounts = rawAccounts
      ? (() => {
          const accounts = JSON.parse(rawAccounts);
          return Array.isArray(accounts)
            ? accounts.map((a: Record<string, any>) => ({
                username: a.username || a.uname || 'kasir',
                password_hash: a.password || a.pass || '',
                role: a.role === 'owner' ? 'owner' : 'kasir',
                is_active: true,
              }))
            : [];
        })()
      : [];

    const serverResult = await importLocalStoragePayload({
      store_id: storeId,
      store_settings: storeSettings,
      menu_items: menuItems,
      inventory_items: inventoryItems,
      transactions,
      expenses,
      cash_flow: cashFlow,
      store_accounts: storeAccounts,
    });

    result.success = serverResult.success;
    result.migrated = serverResult.migrated;
    result.errors = serverResult.errors;
    result.skipped = serverResult.skipped;

    // ── 8. Mark migration as done ────────────────────────────────
    localStorage.setItem('kaffepos_migrated_v2', new Date().toISOString());

    result.success = result.success && result.errors.length === 0;
    return result;

  } catch (e:any) {
    result.errors.push(`Fatal: ${(e as Error).message}`);
    console.error('[Migration] Fatal error:', e);
    return result;
  }
}

// ── Check if migration needed ──────────────────────────────────────
export function isMigrationNeeded(): boolean {
  const alreadyMigrated = localStorage.getItem('kaffepos_migrated_v2');
  if (alreadyMigrated) return false;

  // Check if there's old v14 data
  const hasOldData = !!(
    localStorage.getItem('kaffe_menu') ||
    localStorage.getItem('kaffe_trx') ||
    localStorage.getItem('kaffe_inv')
  );
  return hasOldData;
}
