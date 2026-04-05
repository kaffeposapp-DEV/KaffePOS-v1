 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/utils/migrateLocalStorage.ts
// ═══════════════════════════════════════════════════════════════════
// Migration: KaffePOS v14 localStorage → Supabase
// Run once after user logs in for the first time.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';

interface MigrationResult {
  success: boolean;
  migrated: string[];
  errors: string[];
  skipped: string[];
}

// ── Main migration function ────────────────────────────────────────
export async function migrateFromLocalStorage(
  storeId: string,
  userId: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    migrated: [],
    errors: [],
    skipped: [],
  };


  try {
    // ── 1. Store Settings ────────────────────────────────────────
    try {
      const rawStore = localStorage.getItem('kaffe_store');
      if (rawStore) {
        const old = JSON.parse(rawStore);
        await supabase.from('stores').upsert({
          id: storeId,
          owner_id: userId,
          store_name:           old.storeName   || 'KaffePOS',
          address:              old.address     || '',
          whatsapp:             old.whatsapp    || '',
          tax_percent:          old.taxPercent  || 0,
          receipt_header:       old.receiptHeader || '',
          receipt_footer:       old.receiptFooter || '',
          logo_url:             old.logoUrl     || '',
          logo_base64:          old.logoBase64  || '',
          logo_position:        old.logoPosition || 'center',
          logo_size:            old.logoSize    || 80,
          show_logo_on_receipt: old.showLogoOnReceipt ?? true,
        }, { onConflict: 'id' });
        result.migrated.push('store_settings');
      } else {
        result.skipped.push('store_settings (empty)');
      }
    } catch (e:any) {
      result.errors.push(`store_settings: ${(e as Error).message}`);
    }

    // ── 2. Menu Items ────────────────────────────────────────────
    try {
      const rawMenu = localStorage.getItem('kaffe_menu');
      if (rawMenu) {
        const items = JSON.parse(rawMenu);
        if (Array.isArray(items) && items.length > 0) {
          const rows = items.map((item: Record<string, any>, idx: number) => ({
            store_id:     storeId,
            name:         item.name         || 'Unknown',
            price:        parseInt(item.price)       || 0,
            category:     item.category     || 'Coffee',
            image_url:    item.image        || '',
            description:  item.description  || '',
            is_available: true,
            sort_order:   idx,
            recipe:       Array.isArray(item.recipe)   ? item.recipe   : [],
            variants:     Array.isArray(item.variants) ? item.variants : [],
          }));

          // Insert in batches of 50
          for (let i = 0; i < rows.length; i += 50) {
            const batch = rows.slice(i, i + 50);
            const { error } = await supabase.from('menu_items').insert(batch);
            if (error) throw error;
          }
          result.migrated.push(`menu_items (${rows.length})`);
        }
      } else {
        result.skipped.push('menu_items (empty)');
      }
    } catch (e:any) {
      result.errors.push(`menu_items: ${(e as Error).message}`);
    }

    // ── 3. Inventory ─────────────────────────────────────────────
    try {
      const rawInv = localStorage.getItem('kaffe_inv');
      if (rawInv) {
        const items = JSON.parse(rawInv);
        if (Array.isArray(items) && items.length > 0) {
          const rows = items.map((item: Record<string, any>) => ({
            store_id:     storeId,
            name:         item.name         || 'Unknown',
            stock:        parseFloat(item.stock)       || 0,
            unit:         item.unit         || 'pcs',
            min_stock:    parseFloat(item.minStock)    || 5,
            cost_per_unit: parseFloat(item.costPerUnit) || 0,
          }));

          const { error } = await supabase.from('inventory').insert(rows);
          if (error) throw error;
          result.migrated.push(`inventory (${rows.length})`);
        }
      } else {
        result.skipped.push('inventory (empty)');
      }
    } catch (e:any) {
      result.errors.push(`inventory: ${(e as Error).message}`);
    }

    // ── 4. Transactions ──────────────────────────────────────────
    try {
      const rawTrx = localStorage.getItem('kaffe_trx');
      if (rawTrx) {
        const trxs = JSON.parse(rawTrx);
        if (Array.isArray(trxs) && trxs.length > 0) {
          const rows = trxs.map((t: Record<string, any>) => ({
            id:             t.id,
            store_id:       storeId,
            date:           t.date         || new Date().toISOString(),
            items:          Array.isArray(t.items) ? t.items : [],
            subtotal:       parseInt(t.subtotal)   || 0,
            discount:       parseInt(t.discount)   || 0,
            discount_label: t.discountLabel || null,
            tax:            parseInt(t.tax)        || 0,
            total:          parseInt(t.total)      || 0,
            cogs:           parseInt(t.cogs)       || 0,
            paid:           parseInt(t.paid)       || 0,
            change:         parseInt(t.change)     || 0,
            method:         t.method       || 'Tunai',
            cashier:        t.cashier      || '',
            note:           t.note         || null,
            is_void:        Boolean(t.isVoid || t.void),
            void_reason:    t.voidReason   || null,
            void_at:        t.voidAt       || null,
            void_by:        t.voidBy       || null,
          }));

          // Insert in batches of 100
          for (let i = 0; i < rows.length; i += 100) {
            const batch = rows.slice(i, i + 100);
            await supabase.from('transactions').upsert(batch, { onConflict: 'id' });
          }
          result.migrated.push(`transactions (${rows.length})`);
        }
      } else {
        result.skipped.push('transactions (empty)');
      }
    } catch (e:any) {
      result.errors.push(`transactions: ${(e as Error).message}`);
    }

    // ── 5. Expenses ──────────────────────────────────────────────
    try {
      const rawExp = localStorage.getItem('kaffe_expenses');
      if (rawExp) {
        const items = JSON.parse(rawExp);
        if (Array.isArray(items) && items.length > 0) {
          const rows = items.map((e: Record<string, any>) => ({
            store_id:    storeId,
            date:        e.date    || new Date().toISOString(),
            description: e.desc   || e.description || '',
            amount:      parseInt(e.amount) || 0,
            category:    e.category || 'Operasional',
            cashier:     e.user   || e.cashier || '',
            source:      e.source || ((e.category || 'Operasional') === 'Bahan Baku' ? 'inventory' : 'cashier'),
          })).filter((r: Record<string, any>) => r.amount > 0);

          if (rows.length) {
            const { error } = await supabase.from('expenses').insert(rows);
            if (error) throw error;
            result.migrated.push(`expenses (${rows.length})`);
          }
        }
      } else {
        result.skipped.push('expenses (empty)');
      }
    } catch (e:any) {
      result.errors.push(`expenses: ${(e as Error).message}`);
    }

    // ── 6. Cash Flow ─────────────────────────────────────────────
    try {
      const rawCf = localStorage.getItem('kaffe_cashflow');
      if (rawCf) {
        const items = JSON.parse(rawCf);
        if (Array.isArray(items) && items.length > 0) {
          const rows = items.map((c: Record<string, any>) => ({
            store_id:    storeId,
            date:        c.date || new Date().toISOString(),
            type:        c.type === 'in' ? 'in' : 'out',
            amount:      parseInt(c.amount) || 0,
            description: c.desc || c.description || '',
            cashier:     c.user || c.cashier || '',
          })).filter((r: Record<string, any>) => r.amount > 0);

          if (rows.length) {
            const { error } = await supabase.from('cash_flow').insert(rows);
            if (error) throw error;
            result.migrated.push(`cash_flow (${rows.length})`);
          }
        }
      } else {
        result.skipped.push('cash_flow (empty)');
      }
    } catch (e:any) {
      result.errors.push(`cash_flow: ${(e as Error).message}`);
    }

    // ── 7. Store Accounts ────────────────────────────────────────
    try {
      const rawAccounts = localStorage.getItem('kaffe_accounts');
      if (rawAccounts) {
        const accounts = JSON.parse(rawAccounts);
        if (Array.isArray(accounts) && accounts.length > 0) {
          const rows = accounts.map((a: Record<string, any>) => ({
            store_id:      storeId,
            username:      a.username || a.uname || 'kasir',
            password_hash: a.password || a.pass || '',  // already hashed in v14
            role:          a.role === 'owner' ? 'owner' : 'kasir',
            is_active:     true,
          }));

          for (const row of rows) {
            await supabase.from('store_accounts')
              .upsert(row, { onConflict: 'store_id,username' })
              .throwOnError().then(null, () => {});
          }
          result.migrated.push(`store_accounts (${rows.length})`);
        }
      }
    } catch (e:any) {
      result.errors.push(`store_accounts: ${(e as Error).message}`);
    }

    // ── 8. Mark migration as done ────────────────────────────────
    localStorage.setItem('kaffepos_migrated_v2', new Date().toISOString());

    result.success = result.errors.length === 0;
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
