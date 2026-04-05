/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/hooks/useStore.ts — KaffePOS v5 — Full localStorage cache (menu+inv+trx)
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { menuItemSchema } from '@/utils/validation';
import type {
  MenuItem, InventoryItem, Transaction, Expense,
  CashFlowEntry, StoreSettings, CartItem, CashRegister,
  InventoryItemUpdate,
} from '@/types';

const STORE_SELECT =
  'id,owner_id,store_name,address,whatsapp,tax_percent,receipt_header,receipt_footer,logo_url,logo_base64,logo_position,logo_size,show_logo_on_receipt,currency,tagline,email,website,paper_width,receipt_font_size,receipt_show_address,receipt_show_whatsapp,receipt_show_tax,receipt_show_cashier,receipt_show_trx_id,receipt_divider,receipt_custom_line1,receipt_custom_line2,created_at,updated_at';
const MENU_SELECT =
  'id,store_id,name,price,category,image_url,description,is_available,sort_order,recipe,variants,created_at,updated_at';
const INVENTORY_SELECT =
  'id,store_id,name,stock,unit,min_stock,cost_per_unit,created_at,updated_at';
const TRANSACTION_SELECT =
  'id,store_id,date,items,subtotal,discount,discount_label,tax,total,cogs,paid,change,method,cashier,note,is_void,void_reason,void_at,void_by,created_at';
const EXPENSE_SELECT =
  'id,store_id,date,description,amount,category,cashier,created_at';
const CASH_FLOW_SELECT =
  'id,store_id,date,type,amount,description,cashier,created_at';
const CASH_REGISTER_SELECT =
  'id,store_id,date,amount,note,opened_by,created_at';

function makeClientId(prefix: string) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ── localStorage helpers ──────────────────────────────────────────
const LS_SETTINGS_KEY = 'kaffepos_store_settings';

function saveSettingsToLS(data: StoreSettings | null) {
  try { if (data) localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
function loadSettingsFromLS(): StoreSettings | null {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    return raw ? JSON.parse(raw) as StoreSettings : null;
  } catch { return null; }
}

// ── Persist seluruh state ke localStorage setelah setiap perubahan ─
function persistCache(
  storeId: string,
  menu: MenuItem[],
  inventory: InventoryItem[],
  transactions: Transaction[],
  expenses: Expense[] = [],
  cashFlow: CashFlowEntry[] = [],
  cashRegister: CashRegister[] = [],
) {
  try {
    localStorage.setItem(`kpos_menu_${storeId}`,  JSON.stringify(menu));
    localStorage.setItem(`kpos_inv_${storeId}`,   JSON.stringify(inventory));
    // Simpan cache lebih panjang agar riwayat tidak mudah terpotong saat restart.
    localStorage.setItem(`kpos_trx_${storeId}`,   JSON.stringify(transactions.slice(0, 5000)));
    localStorage.setItem(`kpos_exp_${storeId}`,   JSON.stringify(expenses.slice(0, 5000)));
    localStorage.setItem(`kpos_cf_${storeId}`,    JSON.stringify(cashFlow.slice(0, 5000)));
    localStorage.setItem(`kpos_cr_${storeId}`,    JSON.stringify(cashRegister.slice(0, 5000)));
  } catch { /* ignore */ }
}

function loadCache(storeId: string) {
  const load = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  return {
    menu:     (load(`kpos_menu_${storeId}`) || []) as MenuItem[],
    inv:      (load(`kpos_inv_${storeId}`)  || []) as InventoryItem[],
    trx:      (load(`kpos_trx_${storeId}`)  || []) as Transaction[],
    expenses: (load(`kpos_exp_${storeId}`)  || []) as Expense[],
    cashFlow: (load(`kpos_cf_${storeId}`)   || []) as CashFlowEntry[],
    cashReg:  (load(`kpos_cr_${storeId}`)   || []) as CashRegister[],
    settings: loadSettingsFromLS(),
  };
}

// ── Anti-duplikat: track ID yang baru di-INSERT oleh kita sendiri ─
const recentlyInserted = new Set<string>();
function markInserted(id: string) {
  recentlyInserted.add(id);
  setTimeout(() => recentlyInserted.delete(id), 20_000);
}

function makeUniqueTransactionId(preferredId?: string, existingIds: string[] = []) {
  const baseId = preferredId?.trim() || `trx_${Date.now()}`;
  if (!existingIds.includes(baseId)) return baseId;
  const isoCleanupPattern = ['[', '-', ':', '.', 'T', 'Z', ']'].join('');
  const suffix = new Date().toISOString().replace(new RegExp(isoCleanupPattern, 'g'), '').slice(-8);
  let nextId = `${baseId}-${suffix}`;
  let attempt = 1;
  while (existingIds.includes(nextId)) {
    nextId = `${baseId}-${suffix}-${attempt}`;
    attempt += 1;
  }
  return nextId;
}

// ── Offline queue (persisted ke localStorage agar survive app restart) ──
interface PendingWrite { table: string; op: 'insert'|'update'|'delete'; data: Record<string, unknown>; id?: string }
const PENDING_KEY = 'kpos_pending_writes';

function getPendingWrites(): PendingWrite[] {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; }
}
function savePendingWrites(writes: PendingWrite[]) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(writes.slice(0, 100))); } catch { /* ignore */ }
}
function addPendingWrite(pw: PendingWrite) {
  const writes = getPendingWrites();
  writes.push(pw);
  savePendingWrites(writes);
}

function sortByDateDesc<T extends { date?: string; created_at?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.date || a.created_at || 0).getTime();
    const bTime = new Date(b.date || b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

function mergeById<T extends { id: string; date?: string; created_at?: string }>(
  remoteItems: T[],
  localItems: T[],
) {
  const merged = new Map<string, T>();

  for (const item of localItems) {
    merged.set(item.id, item);
  }
  for (const item of remoteItems) {
    merged.set(item.id, { ...(merged.get(item.id) || {}), ...item });
  }

  return sortByDateDesc(Array.from(merged.values()));
}

async function flushPending() {
  const writes = getPendingWrites();
  if (writes.length === 0) return;
  useStore.setState({ syncing: true });
  const remaining: PendingWrite[] = [];
  for (const pw of writes) {
    try {
      if (pw.op === 'insert') {
        const { error } = await supabase.from(pw.table).insert(pw.data);
        if (error) throw error;
      } else if (pw.op === 'update') {
        const { error } = await supabase.from(pw.table).update(pw.data).eq('id', pw.id!);
        if (error) throw error;
      } else if (pw.op === 'delete') {
        const { error } = await supabase.from(pw.table).delete().eq('id', pw.id!);
        if (error) throw error;
      }
    } catch {
      remaining.push(pw);
    }
  }
  savePendingWrites(remaining);
  useStore.setState({ syncing: remaining.length > 0 });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useStore.setState({ isOnline: true });
    flushPending();
  });
  window.addEventListener('offline', () => {
    useStore.setState({ isOnline: false });
  });
  let visibilityDebounce: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      visibilityDebounce = setTimeout(() => {
        // LS_MENU and LS_INV are intentionally not used here as loadCache handles it
        const state = useStore.getState();
        const storeId = state.storeId;
        const loadAll = state.loadAll;
        if (storeId) {
          flushPending().then(() => loadAll(storeId));
        }
        visibilityDebounce = null;
      }, 2000);
    }
  });
}

// ── Store interface ───────────────────────────────────────────────
interface AppStore {
  storeId:       string | null;
  storeSettings: StoreSettings | null;
  menu:          MenuItem[];
  inventory:     InventoryItem[];
  transactions:  Transaction[];
  expenses:      Expense[];
  cashFlow:      CashFlowEntry[];
  cashRegister:  CashRegister[];
  customCats:    string[];
  cart:          CartItem[];
  discount:      string;
  loading:       boolean;
  syncing:       boolean;
  isOnline:      boolean;

  setStoreId:          (id: string) => void;
  loadAll:             (storeId: string) => Promise<void>;
  cleanup:             () => void;
  addToCart:           (item: MenuItem, variant?: { name: string; price: number }) => void;
  removeFromCart:      (id: string) => void;
  updateQty:           (id: string, qty: number) => void;
  clearCart:           () => void;
  setDiscount:         (d: string) => void;
  saveMenuItem:        (item: Partial<MenuItem>) => Promise<void>;
  deleteMenuItem:      (id: string) => Promise<void>;
  saveInventoryItem:   (item: InventoryItemUpdate) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  saveTransaction:     (tx: Omit<Transaction, 'store_id'>) => Promise<void>;
  voidTransaction:     (id: string, reason: string, by: string) => Promise<void>;
  saveExpense:         (exp: Partial<Expense>) => Promise<void>;
  deleteExpense:       (id: string) => Promise<void>;
  saveCashFlow:        (entry: Partial<CashFlowEntry>) => Promise<void>;
  saveCashRegister:    (entry: Partial<CashRegister>) => Promise<void>;
  saveStoreSettings:   (settings: Partial<StoreSettings>) => Promise<void>;
  saveCustomCats:      (cats: string[]) => void;
}

const activeChannels: string[] = [];

export const useStore = create<AppStore>((set, get) => ({
  storeId:      null,
  storeSettings: null,
  menu:         [],
  inventory:    [],
  transactions: [],
  expenses:     [],
  cashFlow:     [],
  cashRegister: [],
  customCats:   [],
  cart:         [],
  discount:     '',
  loading:      false,
  syncing:      false,
  isOnline:     typeof navigator !== 'undefined' ? navigator.onLine : true,

  setStoreId: (id) => set({ storeId: id }),

  cleanup: () => {
    supabase.getChannels().forEach(ch => {
      if (activeChannels.includes(ch.topic)) {
        supabase.removeChannel(ch);
      }
    });
    activeChannels.length = 0;
    try { supabase.removeAllChannels(); } catch { /* ignore */ }
  },

  loadAll: async (storeId: string) => {
    const cache = loadCache(storeId);
    let cachedCart: CartItem[] = [];
    let cachedDiscount = '';
    try {
      cachedCart = JSON.parse(localStorage.getItem(`kpos_cart_${storeId}`) || '[]');
      cachedDiscount = localStorage.getItem(`kpos_discount_${storeId}`) || '';
    } catch { /* ignore */ }

    if (cache.settings || cache.menu.length > 0) {
      const stdCats = ['Coffee', 'Non-Coffee', 'Snack'];
      const cats = [...new Set(cache.menu.map((m: MenuItem) => m.category))].filter((c: string | null) => c && !stdCats.includes(c)) as string[];
      set({
        storeId,
        storeSettings: cache.settings || null,
        menu:          cache.menu,
        inventory:     cache.inv,
        transactions:  cache.trx,
        expenses:      cache.expenses,
        cashFlow:      cache.cashFlow,
        cashRegister:  cache.cashReg,
        customCats:    cats,
        loading:       false,
        cart:          cachedCart,
        discount:      cachedDiscount,
      });
    } else {
      set({ storeId, loading: true, cart: cachedCart, discount: cachedDiscount });
    }

    get().cleanup();

    try {
      const [store, menu, inv] = await Promise.all([
        supabase.from('stores').select(STORE_SELECT).eq('id', storeId).single(),
        supabase.from('menu_items').select(MENU_SELECT).eq('store_id', storeId).order('sort_order'),
        supabase.from('inventory').select(INVENTORY_SELECT).eq('store_id', storeId).order('name'),
      ]);

      if (store.error) throw store.error;
      if (menu.error) throw menu.error;
      if (inv.error) throw inv.error;

      const menuData = (menu.data || []) as MenuItem[];
      const invData  = (inv.data  || []) as InventoryItem[];
      const stdCats  = ['Coffee', 'Non-Coffee', 'Snack'];
      const freshCats = [...new Set(menuData.map(m => m.category))].filter(c => c && !stdCats.includes(c));
      const freshSettings = (store.data as StoreSettings) || cache.settings;
      if (freshSettings) saveSettingsToLS(freshSettings);

      set(s => ({
        storeId,
        storeSettings: freshSettings,
        menu:       menuData,
        inventory:  invData,
        customCats: freshCats,
        loading:    false,
        transactions: s.transactions,
      }));

      persistCache(
        storeId,
        menuData,
        invData,
        get().transactions,
        get().expenses,
        get().cashFlow,
        get().cashRegister,
      );
    } catch (e:any) {
      const msg = e instanceof Error ? e.message : 'Gagal memuat data dari server';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      set({ storeId, loading: false });
    }

    const loadSecondary = async () => {
      try {
        const [trx, exp, cf, cr] = await Promise.all([
          supabase.from('transactions').select(TRANSACTION_SELECT).eq('store_id', storeId)
            .order('date', { ascending: false }).limit(5000),
          supabase.from('expenses').select(EXPENSE_SELECT).eq('store_id', storeId)
            .order('date', { ascending: false }).limit(5000),
          supabase.from('cash_flow').select(CASH_FLOW_SELECT).eq('store_id', storeId)
            .order('date', { ascending: false }).limit(5000),
          supabase.from('cash_register').select(CASH_REGISTER_SELECT).eq('store_id', storeId)
            .order('date', { ascending: false }).limit(5000),
        ]);

        const trxData = mergeById((trx.data || []) as Transaction[], get().transactions);
        const expData = mergeById((exp.data || []) as Expense[], get().expenses);
        const cfData = mergeById((cf.data || []) as CashFlowEntry[], get().cashFlow);
        const crData = mergeById((cr.data || []) as CashRegister[], get().cashRegister);
        set({
          transactions: trxData,
          expenses:     expData,
          cashFlow:     cfData,
          cashRegister: crData,
          syncing: false,
        });
        persistCache(
          storeId,
          get().menu,
          get().inventory,
          trxData,
          expData,
          cfData,
          crData,
        );
      } catch {
        set({ syncing: false });
      }
    };

    set({ syncing: true });
    loadSecondary();

    const storeId_ = storeId;
    const channelMap = new Map<string, any>();

    const setupChannel = (name: string, table: string, filter: string, handler: (p: { eventType: string; new:any; old:any }) => void) => {
      const topic = `kaffepos_${name}`;
      if (!activeChannels.includes(`realtime:${topic}`)) {
        activeChannels.push(`realtime:${topic}`);
      }
      const existing = channelMap.get(topic);
      if (existing) { supabase.removeChannel(existing); channelMap.delete(topic); }

      const ch = supabase.channel(topic)
        .on('postgres_changes' as any, { event: '*', schema: 'public', table, filter }, handler)
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setTimeout(() => {
              if (get().storeId !== storeId_) return;
              if (!activeChannels.includes(`realtime:${topic}`)) return;
              try { supabase.removeChannel(ch); } catch { /* ignore */ }
              channelMap.delete(topic);
              setupChannel(name, table, filter, handler);
            }, 3000);
          }
        });
      channelMap.set(topic, ch);
      return ch;
    };

    setupChannel('menu', 'menu_items', `store_id=eq.${storeId_}`, (payload) => {
      const payloadNew = payload.new as MenuItem;
      const payloadOld = payload.old as MenuItem;
      set(s => {
        let newMenu = s.menu;
        if (payload.eventType === 'INSERT') {
          if (recentlyInserted.has(payloadNew.id)) {
            recentlyInserted.delete(payloadNew.id);
            return {};
          }
          const exists = s.menu.some(m => m.id === payloadNew.id);
          newMenu = exists ? s.menu : [...s.menu, payloadNew];
        } else if (payload.eventType === 'UPDATE') {
          newMenu = s.menu.map(m => m.id === payloadNew.id ? { ...m, ...payloadNew } : m);
        } else if (payload.eventType === 'DELETE') {
          newMenu = s.menu.filter(m => m.id !== payloadOld.id);
        }
        const stdCats = ['Coffee', 'Non-Coffee', 'Snack'];
        const freshCats = [...new Set(newMenu.map(m => m.category))].filter(c => c && !stdCats.includes(c));
        persistCache(storeId_, newMenu, s.inventory, s.transactions, s.expenses, s.cashFlow, s.cashRegister);
        return { menu: newMenu, customCats: freshCats };
      });
    });

    setupChannel('inventory', 'inventory', `store_id=eq.${storeId_}`, (payload) => {
      const payloadNew = payload.new as InventoryItem;
      const payloadOld = payload.old as InventoryItem;
      set(s => {
        if (payload.eventType === 'INSERT') {
          if (recentlyInserted.has(payloadNew.id)) {
            recentlyInserted.delete(payloadNew.id);
            return {};
          }
          const exists = s.inventory.some(i => i.id === payloadNew.id);
          if (exists) return {};
          const newInventory = [...s.inventory, payloadNew].sort((a,b)=>a.name.localeCompare(b.name));
          persistCache(storeId_, s.menu, newInventory, s.transactions, s.expenses, s.cashFlow, s.cashRegister);
          return { inventory: newInventory };
        }
        if (payload.eventType === 'UPDATE') {
          const newInventory = s.inventory.map(i => i.id === payloadNew.id ? { ...i, ...payloadNew } : i);
          persistCache(storeId_, s.menu, newInventory, s.transactions, s.expenses, s.cashFlow, s.cashRegister);
          return { inventory: newInventory };
        }
        if (payload.eventType === 'DELETE') {
          const newInventory = s.inventory.filter(i => i.id !== payloadOld.id);
          persistCache(storeId_, s.menu, newInventory, s.transactions, s.expenses, s.cashFlow, s.cashRegister);
          return { inventory: newInventory };
        }
        return {};
      });
    });

    setupChannel('transactions', 'transactions', `store_id=eq.${storeId_}`, (payload) => {
      const payloadNew = payload.new as Transaction;
      const payloadOld = payload.old as Transaction;
      set(s => {
        if (payload.eventType === 'INSERT') {
          if (recentlyInserted.has(payloadNew.id)) {
            recentlyInserted.delete(payloadNew.id);
            return {};
          }
          const exists = s.transactions.some(t => t.id === payloadNew.id);
          if (exists) return {};
          const newTransactions = [payloadNew, ...s.transactions];
          persistCache(storeId_, s.menu, s.inventory, newTransactions, s.expenses, s.cashFlow, s.cashRegister);
          return { transactions: newTransactions };
        }
        if (payload.eventType === 'UPDATE') {
          const newTransactions = s.transactions.map(t => t.id === payloadNew.id ? { ...t, ...payloadNew } : t);
          persistCache(storeId_, s.menu, s.inventory, newTransactions, s.expenses, s.cashFlow, s.cashRegister);
          return { transactions: newTransactions };
        }
        if (payload.eventType === 'DELETE') {
          const newTransactions = s.transactions.filter(t => t.id !== payloadOld.id);
          persistCache(storeId_, s.menu, s.inventory, newTransactions, s.expenses, s.cashFlow, s.cashRegister);
          return { transactions: newTransactions };
        }
        return {};
      });
    });

    setupChannel('store', 'stores', `id=eq.${storeId_}`, (payload) => {
      if (payload.eventType === 'UPDATE') {
        const payloadNew = payload.new as StoreSettings;
        set({ storeSettings: payloadNew });
        saveSettingsToLS(payloadNew);
      }
    });

    setupChannel('expenses', 'expenses', `store_id=eq.${storeId_}`, (payload) => {
      const payloadNew = payload.new as Expense;
      const payloadOld = payload.old as Expense;
      set(s => {
        if (payload.eventType === 'INSERT') {
          if (recentlyInserted.has(payloadNew.id)) {
            recentlyInserted.delete(payloadNew.id);
            return {};
          }
          const exists = s.expenses.some(e => e.id === payloadNew.id);
          if (exists) return {};
          const newExpenses = [payloadNew, ...s.expenses];
          persistCache(storeId_, s.menu, s.inventory, s.transactions, newExpenses, s.cashFlow, s.cashRegister);
          return { expenses: newExpenses };
        }
        if (payload.eventType === 'UPDATE') {
          const newExpenses = s.expenses.map(e => e.id === payloadNew.id ? { ...e, ...payloadNew } : e);
          persistCache(storeId_, s.menu, s.inventory, s.transactions, newExpenses, s.cashFlow, s.cashRegister);
          return { expenses: newExpenses };
        }
        if (payload.eventType === 'DELETE') {
          const newExpenses = s.expenses.filter(e => e.id !== payloadOld.id);
          persistCache(storeId_, s.menu, s.inventory, s.transactions, newExpenses, s.cashFlow, s.cashRegister);
          return { expenses: newExpenses };
        }
        return {};
      });
    });

    setupChannel('cash_flow', 'cash_flow', `store_id=eq.${storeId_}`, (payload) => {
      const payloadNew = payload.new as CashFlowEntry;
      const payloadOld = payload.old as CashFlowEntry;
      set(s => {
        if (payload.eventType === 'INSERT') {
          if (recentlyInserted.has(payloadNew.id)) {
            recentlyInserted.delete(payloadNew.id);
            return {};
          }
          const exists = s.cashFlow.some(entry => entry.id === payloadNew.id);
          if (exists) return {};
          const newCashFlow = [payloadNew, ...s.cashFlow];
          persistCache(storeId_, s.menu, s.inventory, s.transactions, s.expenses, newCashFlow, s.cashRegister);
          return { cashFlow: newCashFlow };
        }
        if (payload.eventType === 'UPDATE') {
          const newCashFlow = s.cashFlow.map(entry => entry.id === payloadNew.id ? { ...entry, ...payloadNew } : entry);
          persistCache(storeId_, s.menu, s.inventory, s.transactions, s.expenses, newCashFlow, s.cashRegister);
          return { cashFlow: newCashFlow };
        }
        if (payload.eventType === 'DELETE') {
          const newCashFlow = s.cashFlow.filter(entry => entry.id !== payloadOld.id);
          persistCache(storeId_, s.menu, s.inventory, s.transactions, s.expenses, newCashFlow, s.cashRegister);
          return { cashFlow: newCashFlow };
        }
        return {};
      });
    });

    setupChannel('cash_register', 'cash_register', `store_id=eq.${storeId_}`, (payload) => {
      const payloadNew = payload.new as CashRegister;
      const payloadOld = payload.old as CashRegister;
      set(s => {
        if (payload.eventType === 'INSERT') {
          if (recentlyInserted.has(payloadNew.id)) {
            recentlyInserted.delete(payloadNew.id);
            return {};
          }
          const exists = s.cashRegister.some(r => r.id === payloadNew.id);
          if (exists) return {};
          const newCashRegister = [payloadNew, ...s.cashRegister];
          persistCache(storeId_, s.menu, s.inventory, s.transactions, s.expenses, s.cashFlow, newCashRegister);
          return { cashRegister: newCashRegister };
        }
        if (payload.eventType === 'UPDATE') {
          const newCashRegister = s.cashRegister.map(r => r.id === payloadNew.id ? { ...r, ...payloadNew } : r);
          persistCache(storeId_, s.menu, s.inventory, s.transactions, s.expenses, s.cashFlow, newCashRegister);
          return { cashRegister: newCashRegister };
        }
        if (payload.eventType === 'DELETE') {
          const newCashRegister = s.cashRegister.filter(r => r.id !== payloadOld.id);
          persistCache(storeId_, s.menu, s.inventory, s.transactions, s.expenses, s.cashFlow, newCashRegister);
          return { cashRegister: newCashRegister };
        }
        return {};
      });
    });
  },

  addToCart: (item, variant) => {
    const cartItem: CartItem = variant
      ? { ...item, qty: 1, price: variant.price, name: `${item.name} (${variant.name})`, variantId: variant.name, _baseId: item.id, id: `${item.id}_${variant.name}` }
      : { ...item, qty: 1 };
    set(s => {
      const existing = s.cart.find(c => c.id === cartItem.id);
      if (existing) {
        return { cart: s.cart.map(c => c.id === cartItem.id ? { ...c, qty: c.qty + 1 } : c) };
      }
      return { cart: [...s.cart, { ...cartItem, qty: 1 }] };
    });
  },

  removeFromCart: (id) => set(s => ({ cart: s.cart.filter(c => c.id !== id) })),

  updateQty: (id, qty) => set(s => ({
    cart: qty <= 0 ? s.cart.filter(c => c.id !== id) : s.cart.map(c => c.id === id ? { ...c, qty } : c)
  })),

  clearCart: () => set({ cart: [], discount: '' }),
  setDiscount: (d) => set({ discount: d }),

  saveMenuItem: async (item) => {
    // ── Input Sanitization ──
    if (!item.id) { // Only for new items
      const validation = menuItemSchema.safeParse(item);
      if (!validation.success) {
        throw new Error(validation.error.issues[0].message);
      }
    }
    const { storeId, menu, customCats } = get();
    if (!storeId) throw new Error('Store belum dimuat');
    const stdCats = ['Coffee', 'Non-Coffee', 'Snack'];

    try {
      if (item.id) {
        const updated = menu.map(m => m.id === item.id ? { ...m, ...item } as MenuItem : m);
        const freshCats = [...new Set(updated.map(m => m.category))].filter(c => c && !stdCats.includes(c));
        set({ menu: updated, customCats: freshCats });
        persistCache(storeId, updated, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        const { error } = await supabase.from('menu_items').update({
          name: item.name, price: item.price, category: item.category,
          image_url: item.image_url || '', description: item.description || '',
          recipe: item.recipe || [], variants: item.variants || [],
          is_available: item.is_available ?? true,
        }).eq('id', item.id);
        if (error) {
          set({ menu, customCats });
          persistCache(storeId, menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
          throw error;
        }
      } else {
        const tempId = makeClientId('menu');
        const optimistic: MenuItem = {
          id: tempId, store_id: storeId,
          name: item.name || '', price: item.price || 0,
          category: item.category || 'Coffee', image_url: item.image_url || '',
          description: item.description || '', recipe: item.recipe || [],
          variants: item.variants || [], is_available: item.is_available ?? true,
          sort_order: menu.length,
        };
        const newMenu = [...menu, optimistic];
        const freshCats = [...new Set(newMenu.map(m => m.category))].filter(c => c && !stdCats.includes(c));
        set({ menu: newMenu, customCats: freshCats });
        persistCache(storeId, newMenu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);

        const { data, error } = await supabase.from('menu_items').insert({
          id: tempId,
          store_id: storeId, name: item.name, price: item.price || 0,
          category: item.category || 'Coffee', image_url: item.image_url || '',
          description: item.description || '', recipe: item.recipe || [],
          variants: item.variants || [], sort_order: menu.length,
        }).select().single();

        if (error) {
          addPendingWrite({
            table: 'menu_items',
            op: 'insert',
            data: {
              id: tempId,
              store_id: storeId, name: item.name, price: item.price || 0,
              category: item.category || 'Coffee', image_url: item.image_url || '',
              description: item.description || '', recipe: item.recipe || [],
              variants: item.variants || [], sort_order: menu.length, is_available: item.is_available ?? true,
            }
          });
          import('@/utils/toast').then(m => m.showToast('Menu disimpan offline dan akan disinkronkan otomatis', 'success'));
          return;
        }
        if (data) {
          markInserted(data.id);
          set(s => ({ menu: s.menu.map(m => m.id === tempId ? data as MenuItem : m) }));
          persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        }
      }
    } catch (e:any) {
      const msg = e instanceof Error ? e.message : 'Terjadi kesalahan saat menyimpan menu';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      throw e;
    }
  },

  deleteMenuItem: async (id) => {
    const { storeId } = get();
    if (!storeId) return;
    set(s => ({ menu: s.menu.filter(m => m.id !== id) }));
    persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) {
      addPendingWrite({ table: 'menu_items', op: 'delete', id, data: {} });
      import('@/utils/toast').then(m => m.showToast('Penghapusan menu dijadwalkan saat online kembali', 'success'));
    }
  },

  saveInventoryItem: async (item) => {
    const { storeId, inventory } = get();
    if (!storeId) throw new Error('Store belum dimuat');

    const qty       = typeof item.qty === 'string' ? parseFloat(item.qty) : (item.qty || 0);
    const totalCost = typeof item.cost === 'string' ? parseFloat(item.cost) : (item.cost || 0);
    const minStock  = typeof item.minStock === 'string' ? parseFloat(item.minStock) : (item.minStock || 5);
    const unitCost  = qty > 0 ? totalCost / qty  : 0;

    if (item.type === 'new') {
      const tempId = makeClientId('inv');
      const optimistic: InventoryItem = {
        id: tempId, store_id: storeId,
        name: item.name, stock: qty,
        unit: item.unit || 'pcs',
        min_stock: minStock, cost_per_unit: unitCost,
      };
      const newInv = [...get().inventory, optimistic].sort((a,b) => a.name.localeCompare(b.name));
      set({ inventory: newInv });
      persistCache(storeId, get().menu, newInv, get().transactions, get().expenses, get().cashFlow, get().cashRegister);

      const { data, error } = await supabase.from('inventory').insert({
        id: tempId,
        store_id: storeId, name: item.name, stock: qty,
        unit: item.unit || 'pcs', min_stock: minStock, cost_per_unit: unitCost,
      }).select().single();

      if (error) {
        addPendingWrite({
          table: 'inventory',
          op: 'insert',
          data: {
            id: tempId,
            store_id: storeId, name: item.name, stock: qty,
            unit: item.unit || 'pcs', min_stock: minStock, cost_per_unit: unitCost,
          }
        });
        import('@/utils/toast').then(m => m.showToast('Stok disimpan offline dan akan disinkronkan otomatis', 'success'));
        return;
      }
      if (data) {
        markInserted(data.id);
        set(s => ({ inventory: s.inventory.map(i => i.id === tempId ? data as InventoryItem : i) }));
        persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        if (totalCost > 0) {
          const expId = makeClientId('exp');
          const { data: expData, error: expError } = await supabase.from('expenses').insert({
            id: expId,
            store_id: storeId, date: new Date().toISOString(),
            description: `Beli ${item.name}`, amount: totalCost, category: 'Bahan Baku',
          }).select().single();
          if (expError) {
            addPendingWrite({
              table: 'expenses',
              op: 'insert',
              data: {
                id: expId,
                store_id: storeId, date: new Date().toISOString(),
                description: `Beli ${item.name}`, amount: totalCost, category: 'Bahan Baku',
              }
            });
          }
          if (expData) {
            markInserted(expData.id);
            set(s => ({ expenses: [expData as Expense, ...s.expenses] }));
          }
        }
      }

    } else if (item.type === 'edit') {
      const existing = inventory.find(i => i.id === item.id);
      const newCost  = qty > 0 ? unitCost : (existing?.cost_per_unit || 0);
      set(s => ({ inventory: s.inventory.map(i => i.id === item.id
        ? { ...i, name: item.name, stock: qty, unit: item.unit || i.unit, min_stock: minStock, cost_per_unit: newCost }
        : i
      )}));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      const { error } = await supabase.from('inventory').update({
        name: item.name, stock: qty, unit: item.unit, min_stock: minStock, cost_per_unit: newCost,
      }).eq('id', item.id);
      if (error) {
        if (existing) {
          set(s => ({ inventory: s.inventory.map(i => i.id === item.id ? existing : i) }));
          persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        }
        throw new Error(error.message);
      }

    } else {
      const existing = inventory.find(i => i.id === item.id);
      if (!existing) return;
      const newStock = existing.stock + qty;
      const newCost  = newStock > 0
        ? (existing.stock * existing.cost_per_unit + totalCost) / newStock
        : existing.cost_per_unit;
      set(s => ({ inventory: s.inventory.map(i => i.id === item.id
        ? { ...i, stock: newStock, cost_per_unit: newCost } : i
      )}));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      const { error } = await supabase.from('inventory').update({
        stock: newStock, cost_per_unit: newCost,
      }).eq('id', item.id);
      if (error) {
        set(s => ({ inventory: s.inventory.map(i => i.id === item.id ? existing : i) }));
        persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        throw new Error(error.message);
      }
      if (totalCost > 0) {
        const expId = makeClientId('exp');
        const { data: expData, error: expError } = await supabase.from('expenses').insert({
          id: expId,
          store_id: storeId, date: new Date().toISOString(),
          description: `Restock ${item.name}`, amount: totalCost, category: 'Bahan Baku',
        }).select().single();
        if (expError) {
          addPendingWrite({
            table: 'expenses',
            op: 'insert',
            data: {
              id: expId,
              store_id: storeId, date: new Date().toISOString(),
              description: `Restock ${item.name}`, amount: totalCost, category: 'Bahan Baku',
            }
          });
        }
        if (expData) {
          markInserted(expData.id);
          set(s => ({ expenses: [expData as Expense, ...s.expenses] }));
        }
      }
    }
  },

  deleteInventoryItem: async (id) => {
    const { storeId } = get();
    if (!storeId) return;
    try {
      set(s => ({ inventory: s.inventory.filter(i => i.id !== id) }));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if (error) {
        addPendingWrite({ table: 'inventory', op: 'delete', id, data: {} });
        import('@/utils/toast').then(m => m.showToast('Penghapusan stok dijadwalkan saat online kembali', 'success'));
      }
    } catch (e:any) {
      const msg = e instanceof Error ? e.message : 'Gagal menghapus inventaris';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
    }
  },

  saveTransaction: async (tx) => {
    const { storeId, inventory, menu } = get();
    if (!storeId) return;
    const existingIds = get().transactions.map(transaction => transaction.id);
    const normalizedDate = tx.date || new Date().toISOString();
    const normalizedId = makeUniqueTransactionId(tx.id, existingIds);

    const txWithId = {
      ...tx,
      id: normalizedId,
      date: normalizedDate,
      created_at: tx.created_at || normalizedDate,
      cashier: tx.cashier || 'Kasir',
      is_void: tx.is_void ?? false,
    };

    const updates: { id: string; newStock: number }[] = [];
    for (const cartItem of txWithId.items) {
      const baseName = cartItem.name.split(' (')[0];
      const menuItem = menu.find(m => m.name === cartItem.name || m.name === baseName || m.id === (cartItem as unknown as CartItem)._baseId);
      if (menuItem?.recipe?.length) {
        for (const r of menuItem.recipe) {
          const inv = inventory.find(i => i.id === r.matId);
          if (inv) {
            const existing = updates.find(u => u.id === r.matId);
            if (existing) {
              existing.newStock = Math.max(0, existing.newStock - r.qty * cartItem.qty);
            } else {
              updates.push({ id: r.matId, newStock: Math.max(0, inv.stock - r.qty * cartItem.qty) });
            }
          }
        }
      }
    }

    if (updates.length > 0) {
      set(s => ({
        inventory: s.inventory.map(i => {
          const u = updates.find(u => u.id === i.id);
          return u ? { ...i, stock: u.newStock } : i;
        })
      }));
      for (const u of updates) {
        supabase.from('inventory').update({ stock: u.newStock }).eq('id', u.id)
          .then(({ error }) => {
            if (error) {
              addPendingWrite({ table: 'inventory', op: 'update', data: { stock: u.newStock }, id: u.id });
            }
          });
      }
    }

    markInserted(txWithId.id);
    set(s => ({
      transactions: s.transactions.some(t => t.id === txWithId.id)
        ? s.transactions
        : [{ ...txWithId, store_id: storeId } as Transaction, ...s.transactions]
    }));
    persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);

    const { data, error } = await supabase.from('transactions').insert({
      ...txWithId, store_id: storeId,
    }).select().single();

    if (error) {
      addPendingWrite({ table: 'transactions', op: 'insert', data: { ...txWithId, store_id: storeId } as unknown as Record<string, unknown> });
      import('@/utils/toast').then(m => m.showToast('Transaksi disimpan offline dan akan disinkronkan otomatis', 'success'));
      return;
    }

    if (data) {
      set(s => ({
        transactions: s.transactions.map(t => t.id === txWithId.id ? data as Transaction : t)
      }));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
    }
  },

  voidTransaction: async (id, reason, by) => {
    try {
      const payload = {
        is_void: true, void_reason: reason,
        void_at: new Date().toISOString(), void_by: by,
      };
      const { error } = await supabase.from('transactions').update(payload).eq('id', id);
      if (error) {
        addPendingWrite({ table: 'transactions', op: 'update', id, data: payload as Record<string, unknown> });
        import('@/utils/toast').then(m => m.showToast('Void transaksi dijadwalkan saat online kembali', 'success'));
      }
      set(s => ({
        transactions: s.transactions.map(t => t.id === id ? { ...t, is_void: true, void_reason: reason } : t)
      }));
      if (get().storeId) {
        persistCache(get().storeId!, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      }
    } catch (e:any) {
      const msg = e?.message || 'Gagal membatalkan transaksi';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      throw e;
    }
  },

  saveExpense: async (exp) => {
    const { storeId } = get();
    if (!storeId) return;
    try {
      const optimisticId = exp.id || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `exp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      const payload = {
        id: optimisticId,
        store_id: storeId,
        date: new Date().toISOString(),
        ...exp,
      };
      markInserted(optimisticId);
      set(s => ({ expenses: [{ ...payload } as Expense, ...s.expenses] }));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);

      const { data, error } = await supabase.from('expenses').insert({
        ...payload,
      }).select().single();
      if (error) {
        addPendingWrite({ table: 'expenses', op: 'insert', data: payload as unknown as Record<string, unknown> });
        import('@/utils/toast').then(m => m.showToast('Pengeluaran disimpan offline dan akan disinkronkan otomatis', 'success'));
        return;
      }
      if (data) {
        set(s => ({
          expenses: s.expenses.map(existing => existing.id === optimisticId ? data as Expense : existing)
        }));
        persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      }
    } catch (e:any) {
      const msg = e?.message || 'Gagal mencatat pengeluaran';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      throw e;
    }
  },

  deleteExpense: async (id) => {
    set(s => ({ expenses: s.expenses.filter(e => e.id !== id) }));
    if (get().storeId) {
      persistCache(get().storeId!, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
    }
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) {
      addPendingWrite({ table: 'expenses', op: 'delete', id, data: {} });
      import('@/utils/toast').then(m => m.showToast('Penghapusan pengeluaran dijadwalkan saat online kembali', 'success'));
    }
  },

  saveCashFlow: async (entry) => {
    const { storeId } = get();
    if (!storeId) return;
    try {
      const optimisticId = entry.id || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cf_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      const payload = {
        id: optimisticId,
        store_id: storeId,
        date: new Date().toISOString(),
        ...entry,
      };
      markInserted(optimisticId);
      set(s => ({ cashFlow: [{ ...payload } as CashFlowEntry, ...s.cashFlow] }));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);

      const { data, error } = await supabase.from('cash_flow').insert({
        ...payload,
      }).select().single();
      if (error) {
        addPendingWrite({ table: 'cash_flow', op: 'insert', data: payload as unknown as Record<string, unknown> });
        import('@/utils/toast').then(m => m.showToast('Arus kas disimpan offline dan akan disinkronkan otomatis', 'success'));
        return;
      }
      if (data) {
        set(s => ({
          cashFlow: s.cashFlow.map(existing => existing.id === optimisticId ? data as CashFlowEntry : existing)
        }));
        persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      }
    } catch (e:any) {
      const msg = e?.message || 'Gagal menyimpan arus kas';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      throw e;
    }
  },

  saveCashRegister: async (entry) => {
    const { storeId } = get();
    if (!storeId) return;
    try {
      const optimisticId = entry.id || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cr_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      const payload = {
        id: optimisticId,
        store_id: storeId,
        date: new Date().toISOString(),
        ...entry,
      };
      markInserted(optimisticId);
      set(s => ({ cashRegister: [{ ...payload } as CashRegister, ...s.cashRegister] }));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);

      const { data, error } = await supabase.from('cash_register').insert({
        ...payload,
      }).select().single();
      if (error) {
        addPendingWrite({ table: 'cash_register', op: 'insert', data: payload as unknown as Record<string, unknown> });
        import('@/utils/toast').then(m => m.showToast('Register kasir disimpan offline dan akan disinkronkan otomatis', 'success'));
        return;
      }
      if (data) {
        set(s => ({
          cashRegister: s.cashRegister.map(existing => existing.id === optimisticId ? data as CashRegister : existing)
        }));
        persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      }
    } catch (e:any) {
      const msg = e?.message || 'Gagal menyimpan register kasir';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      throw e;
    }
  },

  saveStoreSettings: async (settings) => {
    const { storeId, storeSettings } = get();
    if (!storeId) throw new Error('Store belum dimuat');
    try {
      const mergedSettings = storeSettings
        ? { ...storeSettings, ...settings }
        : ({ ...settings } as StoreSettings);
      set({ storeSettings: mergedSettings });
      saveSettingsToLS(mergedSettings);

      const toSave: Partial<StoreSettings> = { ...settings };
      if (toSave.logo_base64 && (toSave.logo_base64?.length ?? 0) > 100_000) {
        delete toSave.logo_base64;
      }
      const { error } = await supabase.from('stores').update(toSave).eq('id', storeId);
      if (error) {
        addPendingWrite({ table: 'stores', op: 'update', id: storeId, data: toSave as Record<string, unknown> });
        import('@/utils/toast').then(m => m.showToast('Pengaturan disimpan offline dan akan disinkronkan otomatis', 'success'));
      }
    } catch (e:any) {
      const msg = e?.message || 'Gagal menyimpan pengaturan toko';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      throw e;
    }
  },

  saveCustomCats: (cats) => set({ customCats: cats }),
}));
