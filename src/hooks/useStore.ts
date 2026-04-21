 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/hooks/useStore.ts — KaffePOS v5 — Full localStorage cache (menu+inv+trx)
import { create } from 'zustand';
import { clearStoredAuthSession, markExplicitSignOut } from '@/lib/authSession';
import {
  ApiError,
  checkoutTransaction,
  createCashFlow,
  createCashRegister,
  createExpense,
  createInventoryItem,
  createMenuItem,
  getCashFlow,
  getCashRegister,
  getExpenses,
  getInventory,
  getMenuItems,
  getStores,
  getTransactions,
  removeExpense,
  removeInventoryItem,
  removeMenuItem,
  updateCashRegisterEntry,
  updateInventoryItem,
  updateMenuItem,
  updateStore,
  voidTransactionRequest,
} from '@/lib/backendApi';
import { trackOpsEvent } from '@/lib/opsMetrics';
import { menuItemSchema } from '@/utils/validation';
import {
  clearIndexedDbCache,
  clearSessionStorage,
  getPendingWritesKey,
  getStoreSettingsKey,
  redirectToLogin,
} from '@/utils/sessionIsolation';
import type {
  MenuItem, InventoryItem, Transaction, Expense,
  CashFlowEntry, StoreSettings, CartItem, CashRegister,
  InventoryItemUpdate,
} from '@/types';

function makeClientId(prefix: string) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ── localStorage helpers ──────────────────────────────────────────
function saveSettingsToLS(storeId: string, data: StoreSettings | null) {
  try { if (data) localStorage.setItem(getStoreSettingsKey(storeId), JSON.stringify(data)); } catch { /* ignore */ }
}
function loadSettingsFromLS(storeId: string): StoreSettings | null {
  try {
    const raw = localStorage.getItem(getStoreSettingsKey(storeId));
    return raw ? JSON.parse(raw) as StoreSettings : null;
  } catch { return null; }
}

function getCartCacheKey(storeId: string) {
  return `kpos_cart_${storeId}`;
}

function getDiscountCacheKey(storeId: string) {
  return `kpos_discount_${storeId}`;
}

function persistCheckoutDraft(storeId: string | null, cart: CartItem[], discount: string) {
  if (!storeId) return;
  try {
    if (cart.length > 0) {
      localStorage.setItem(getCartCacheKey(storeId), JSON.stringify(cart));
    } else {
      localStorage.removeItem(getCartCacheKey(storeId));
    }

    if (discount) {
      localStorage.setItem(getDiscountCacheKey(storeId), discount);
    } else {
      localStorage.removeItem(getDiscountCacheKey(storeId));
    }
  } catch { /* ignore */ }
}

function loadCheckoutDraft(storeId: string) {
  try {
    return {
      cart: JSON.parse(localStorage.getItem(getCartCacheKey(storeId)) || '[]') as CartItem[],
      discount: localStorage.getItem(getDiscountCacheKey(storeId)) || '',
    };
  } catch {
    return { cart: [] as CartItem[], discount: '' };
  }
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
    localStorage.setItem(`kpos_trx_${storeId}`,   JSON.stringify(transactions));
    localStorage.setItem(`kpos_exp_${storeId}`,   JSON.stringify(expenses));
    localStorage.setItem(`kpos_cf_${storeId}`,    JSON.stringify(cashFlow));
    localStorage.setItem(`kpos_cr_${storeId}`,    JSON.stringify(cashRegister));
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
    settings: loadSettingsFromLS(storeId),
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

function getPendingWrites(storeId: string | null): PendingWrite[] {
  if (!storeId) return [];
  try { return JSON.parse(localStorage.getItem(getPendingWritesKey(storeId)) || '[]'); } catch { return []; }
}
function savePendingWrites(storeId: string | null, writes: PendingWrite[]) {
  if (!storeId) return;
  try { localStorage.setItem(getPendingWritesKey(storeId), JSON.stringify(writes)); } catch { /* ignore */ }
}
function addPendingWrite(storeId: string | null, pw: PendingWrite) {
  const writes = getPendingWrites(storeId);
  writes.push(pw);
  savePendingWrites(storeId, writes);
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
  const storeId = useStore.getState().storeId;
  const writes = getPendingWrites(storeId);
  if (writes.length === 0) return;
  useStore.setState({ syncing: true });
  const remaining: PendingWrite[] = [];
  for (const pw of writes) {
    try {
      if (pw.table === 'menu_items') {
        if (pw.op === 'insert') await createMenuItem(pw.data);
        if (pw.op === 'update' && pw.id) await updateMenuItem(pw.id, pw.data);
        if (pw.op === 'delete' && pw.id) await removeMenuItem(pw.id);
      } else if (pw.table === 'inventory') {
        if (pw.op === 'insert') await createInventoryItem(pw.data);
        if (pw.op === 'update' && pw.id) await updateInventoryItem(pw.id, pw.data);
        if (pw.op === 'delete' && pw.id) await removeInventoryItem(pw.id);
      } else if (pw.table === 'expenses') {
        if (pw.op === 'insert') await createExpense(pw.data);
        if (pw.op === 'delete' && pw.id) await removeExpense(pw.id);
      } else if (pw.table === 'cash_flow') {
        if (pw.op === 'insert') await createCashFlow(pw.data);
      } else if (pw.table === 'cash_register') {
        if (pw.op === 'insert') await createCashRegister(pw.data);
        if (pw.op === 'update' && pw.id) await updateCashRegisterEntry(pw.id, pw.data);
      } else if (pw.table === 'stores') {
        if (pw.op === 'update' && pw.id) await updateStore(pw.id, pw.data);
      }
    } catch {
      remaining.push(pw);
    }
  }
  savePendingWrites(storeId, remaining);
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
  saveTransaction:     (tx: Omit<Transaction, 'store_id'>) => Promise<Transaction>;
  voidTransaction:     (id: string, reason: string, by: string) => Promise<Transaction>;
  saveExpense:         (exp: Partial<Expense>) => Promise<void>;
  deleteExpense:       (id: string) => Promise<void>;
  saveCashFlow:        (entry: Partial<CashFlowEntry>) => Promise<void>;
  saveCashRegister:    (entry: Partial<CashRegister>) => Promise<void>;
  updateCashRegister:  (id: string, entry: Partial<CashRegister>) => Promise<void>;
  saveStoreSettings:   (settings: Partial<StoreSettings>) => Promise<void>;
  saveCustomCats:      (cats: string[]) => void;
  resetState:          () => void;
}

const initialState: Pick<
  AppStore,
  'storeId' | 'storeSettings' | 'menu' | 'inventory' | 'transactions' | 'expenses' | 'cashFlow' | 'cashRegister' | 'customCats' | 'cart' | 'discount' | 'loading' | 'syncing'
> = {
  storeId: null,
  storeSettings: null,
  menu: [],
  inventory: [],
  transactions: [],
  expenses: [],
  cashFlow: [],
  cashRegister: [],
  customCats: [],
  cart: [],
  discount: '',
  loading: false,
  syncing: false,
};

const loadAllPromises = new Map<string, Promise<void>>();

export const useStore = create<AppStore>((set, get) => ({
  ...initialState,
  isOnline:     typeof navigator !== 'undefined' ? navigator.onLine : true,

  setStoreId: (id) => set({ storeId: id }),

  cleanup: () => {
    // Main data layer now uses backend API polling and explicit refresh.
  },

  resetState: () => {
    get().cleanup();
    recentlyInserted.clear();
    clearSessionStorage();
    clearIndexedDbCache();
    loadAllPromises.clear();
    set({ ...initialState, isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true });
  },

  loadAll: async (storeId: string) => {
    const existingLoad = loadAllPromises.get(storeId);
    if (existingLoad) {
      return existingLoad;
    }

    const run = (async () => {
      const cache = loadCache(storeId);
      const { cart: cachedCart, discount: cachedDiscount } = loadCheckoutDraft(storeId);

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
      const [storesResponse, menuResponse, inventoryResponse] = await Promise.all([
        getStores(storeId),
        getMenuItems(storeId),
        getInventory(storeId),
      ]);

      const store = storesResponse.items[0];
      if (!store) throw new Error('Store tidak ditemukan');

      const menuData = (menuResponse.items || []) as MenuItem[];
      const invData  = (inventoryResponse.items  || []) as InventoryItem[];
      const stdCats  = ['Coffee', 'Non-Coffee', 'Snack'];
      const freshCats = [...new Set(menuData.map(m => m.category))].filter(c => c && !stdCats.includes(c));
      const freshSettings = (store as StoreSettings) || cache.settings;
      if (freshSettings) saveSettingsToLS(storeId, freshSettings);

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
      if (!navigator.onLine) {
        set({ storeId, loading: false, syncing: false });
        return;
      }
      if (e instanceof ApiError && e.status === 401) {
        import('@/utils/toast').then(m => m.showToast('Sesi kamu berakhir. Silakan login ulang.', 'error'));
        await markExplicitSignOut().catch(() => {});
        await clearStoredAuthSession().catch(() => {});
        redirectToLogin(true);
        return;
      }
      if (e instanceof ApiError && e.status === 403) {
        import('@/utils/toast').then(m => m.showToast('Akses ke data toko ditolak.', 'error'));
        await markExplicitSignOut().catch(() => {});
        await clearStoredAuthSession().catch(() => {});
        redirectToLogin(true);
        return;
      }
      const msg = e instanceof Error ? e.message : 'Koneksi bermasalah. Coba lagi.';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      set({ storeId, loading: false, syncing: false });
    }

    const loadSecondary = async () => {
      try {
        const [trx, exp, cf, cr] = await Promise.all([
          getTransactions(storeId),
          getExpenses(storeId),
          getCashFlow(storeId),
          getCashRegister(storeId),
        ]);

        const trxData = mergeById((trx.items || []) as Transaction[], get().transactions);
        const expData = mergeById((exp.items || []) as Expense[], get().expenses);
        const cfData = mergeById((cf.items || []) as CashFlowEntry[], get().cashFlow);
        const crData = mergeById((cr.items || []) as CashRegister[], get().cashRegister);
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
    })().finally(() => {
      loadAllPromises.delete(storeId);
    });

    loadAllPromises.set(storeId, run);
    return run;
  },

  addToCart: (item, variant) => {
    const cartItem: CartItem = variant
      ? { ...item, qty: 1, price: variant.price, name: `${item.name} (${variant.name})`, variantId: variant.name, _baseId: item.id, id: `${item.id}_${variant.name}` }
      : { ...item, qty: 1 };
    set(s => {
      const existing = s.cart.find(c => c.id === cartItem.id);
      const nextCart = existing
        ? s.cart.map(c => c.id === cartItem.id ? { ...c, qty: c.qty + 1 } : c)
        : [...s.cart, { ...cartItem, qty: 1 }];
      persistCheckoutDraft(s.storeId, nextCart, s.discount);
      return { cart: nextCart };
    });
  },

  removeFromCart: (id) => set(s => {
    const nextCart = s.cart.filter(c => c.id !== id);
    persistCheckoutDraft(s.storeId, nextCart, s.discount);
    return { cart: nextCart };
  }),

  updateQty: (id, qty) => set(s => {
    const nextCart = qty <= 0
      ? s.cart.filter(c => c.id !== id)
      : s.cart.map(c => c.id === id ? { ...c, qty } : c);
    persistCheckoutDraft(s.storeId, nextCart, s.discount);
    return { cart: nextCart };
  }),

  clearCart: () => set(s => {
    persistCheckoutDraft(s.storeId, [], '');
    return { cart: [], discount: '' };
  }),
  setDiscount: (d) => set(s => {
    persistCheckoutDraft(s.storeId, s.cart, d);
    return { discount: d };
  }),

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
        try {
          await updateMenuItem(item.id, {
            name: item.name, price: item.price, category: item.category,
            image_url: item.image_url || '', description: item.description || '',
            recipe: item.recipe || [], variants: item.variants || [],
            is_available: item.is_available ?? true,
          });
        } catch (error) {
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

        let data: MenuItem | null = null;
        try {
          data = await createMenuItem({
            id: tempId,
            store_id: storeId, name: item.name, price: item.price || 0,
            category: item.category || 'Coffee', image_url: item.image_url || '',
            description: item.description || '', recipe: item.recipe || [],
            variants: item.variants || [], sort_order: menu.length,
            is_available: item.is_available ?? true,
          });
        } catch {
          addPendingWrite(storeId, {
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
    try {
      await removeMenuItem(id);
    } catch {
      addPendingWrite(storeId, { table: 'menu_items', op: 'delete', id, data: {} });
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

    if (qty < 0 || totalCost < 0 || minStock < 0 || unitCost < 0) {
      throw new Error('Qty, biaya, dan stok minimum tidak boleh negatif.');
    }

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

      let data: InventoryItem | null = null;
      try {
        data = await createInventoryItem({
          id: tempId,
          store_id: storeId, name: item.name, stock: qty,
          unit: item.unit || 'pcs', min_stock: minStock, cost_per_unit: unitCost,
        });
      } catch {
        addPendingWrite(storeId, {
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
          let expData: Expense | null = null;
          try {
            expData = await createExpense({
              id: expId,
              store_id: storeId, date: new Date().toISOString(),
              description: `Beli ${item.name}`, amount: totalCost, category: 'Bahan Baku', source: 'inventory',
            });
          } catch {
            addPendingWrite(storeId, {
              table: 'expenses',
              op: 'insert',
              data: {
                id: expId,
                store_id: storeId, date: new Date().toISOString(),
                description: `Beli ${item.name}`, amount: totalCost, category: 'Bahan Baku', source: 'inventory',
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
      try {
        await updateInventoryItem(item.id!, {
          name: item.name, stock: qty, unit: item.unit, min_stock: minStock, cost_per_unit: newCost,
        });
      } catch (error) {
        if (existing) {
          set(s => ({ inventory: s.inventory.map(i => i.id === item.id ? existing : i) }));
          persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        }
        throw error;
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
      try {
        await updateInventoryItem(item.id!, {
          stock: newStock, cost_per_unit: newCost,
        });
      } catch (error) {
        set(s => ({ inventory: s.inventory.map(i => i.id === item.id ? existing : i) }));
        persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        throw error;
      }
      if (totalCost > 0) {
        const expId = makeClientId('exp');
        let expData: Expense | null = null;
        try {
          expData = await createExpense({
            id: expId,
            store_id: storeId, date: new Date().toISOString(),
            description: `Restock ${item.name}`, amount: totalCost, category: 'Bahan Baku', source: 'inventory',
          });
        } catch {
          addPendingWrite(storeId, {
            table: 'expenses',
            op: 'insert',
            data: {
              id: expId,
              store_id: storeId, date: new Date().toISOString(),
              description: `Restock ${item.name}`, amount: totalCost, category: 'Bahan Baku', source: 'inventory',
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
      try {
        await removeInventoryItem(id);
      } catch {
        addPendingWrite(storeId, { table: 'inventory', op: 'delete', id, data: {} });
        import('@/utils/toast').then(m => m.showToast('Penghapusan stok dijadwalkan saat online kembali', 'success'));
      }
    } catch (e:any) {
      const msg = e instanceof Error ? e.message : 'Gagal menghapus inventaris';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
    }
  },

  saveTransaction: async (tx) => {
    const { storeId, isOnline } = get();
    if (!storeId) throw new Error('Store belum dimuat.');
    if (!isOnline) throw new Error('Checkout butuh koneksi internet agar stok tetap akurat di semua perangkat.');
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
    const safeSubtotal = Math.max(0, txWithId.subtotal || 0);
    const safeDiscount = Math.min(Math.max(0, txWithId.discount || 0), safeSubtotal);
    const safeTaxBase = Math.max(0, safeSubtotal - safeDiscount);
    const safeTax = Math.max(0, txWithId.tax || 0);
    const safeTotal = Math.max(0, safeTaxBase + safeTax);
    const safePaid = Math.max(0, txWithId.paid || 0);
    const safeChange = Math.max(0, safePaid - safeTotal);
    const normalizedTx = {
      ...txWithId,
      subtotal: safeSubtotal,
      discount: safeDiscount,
      tax: safeTax,
      total: safeTotal,
      paid: safePaid,
      change: safeChange,
      cogs: Math.max(0, txWithId.cogs || 0),
    };

    try {
      const data = await checkoutTransaction({
        ...normalizedTx,
        store_id: storeId,
      });
      const savedTx = data as Transaction;
      void trackOpsEvent({
        event_name: 'checkout',
        status: 'success',
        store_id: storeId,
        transaction_id: savedTx.id,
        metadata: { total: savedTx.total, method: savedTx.method },
      });
      markInserted(savedTx.id);
      set(s => ({
        transactions: s.transactions.some(t => t.id === savedTx.id)
          ? s.transactions.map(t => t.id === savedTx.id ? savedTx : t)
          : [savedTx, ...s.transactions]
      }));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      await get().loadAll(storeId);
      return savedTx;
    } catch (error: any) {
      void trackOpsEvent({
        event_name: 'checkout',
        status: 'failure',
        store_id: storeId,
        transaction_id: normalizedTx.id,
        error_message: error?.message || 'Checkout gagal diproses.',
        metadata: { total: normalizedTx.total, method: normalizedTx.method },
      });
      throw error;
    }
  },

  voidTransaction: async (id, reason, by) => {
    try {
      const storeId = get().storeId;
      if (!storeId) throw new Error('Store belum dimuat.');
      if (!get().isOnline) throw new Error('Void transaksi butuh koneksi internet agar stok kembali dengan benar.');
      const data = await voidTransactionRequest(id, {
        store_id: storeId,
        reason,
        void_by: by,
      });
      const voidedTx = data as Transaction;
      set(s => ({
        transactions: s.transactions.map(t => t.id === id ? voidedTx : t)
      }));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      await get().loadAll(storeId);
      return voidedTx;
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
      if ((exp.amount || 0) <= 0) throw new Error('Jumlah pengeluaran harus lebih dari 0.');
      const optimisticId = exp.id || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `exp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      const payload = {
        id: optimisticId,
        store_id: storeId,
        date: new Date().toISOString(),
        source: 'cashier' as const,
        ...exp,
      };
      markInserted(optimisticId);
      set(s => ({ expenses: [{ ...payload } as Expense, ...s.expenses] }));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);

      try {
        const data = await createExpense({
          ...payload,
        });
        if (data) {
          set(s => ({
            expenses: s.expenses.map(existing => existing.id === optimisticId ? data as Expense : existing)
          }));
          persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        }
      } catch {
        addPendingWrite(storeId, { table: 'expenses', op: 'insert', data: payload as unknown as Record<string, unknown> });
        import('@/utils/toast').then(m => m.showToast('Pengeluaran disimpan offline dan akan disinkronkan otomatis', 'success'));
        return;
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
    try {
      await removeExpense(id);
    } catch {
      addPendingWrite(get().storeId, { table: 'expenses', op: 'delete', id, data: {} });
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

      try {
        const data = await createCashFlow({
          ...payload,
        });
        if (data) {
          set(s => ({
            cashFlow: s.cashFlow.map(existing => existing.id === optimisticId ? data as CashFlowEntry : existing)
          }));
          persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        }
      } catch {
        addPendingWrite(storeId, { table: 'cash_flow', op: 'insert', data: payload as unknown as Record<string, unknown> });
        import('@/utils/toast').then(m => m.showToast('Arus kas disimpan offline dan akan disinkronkan otomatis', 'success'));
        return;
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

      try {
        const data = await createCashRegister({
          ...payload,
        });
        if (data) {
          set(s => ({
            cashRegister: s.cashRegister.map(existing => existing.id === optimisticId ? data as CashRegister : existing)
          }));
          persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        }
      } catch {
        addPendingWrite(storeId, { table: 'cash_register', op: 'insert', data: payload as unknown as Record<string, unknown> });
        import('@/utils/toast').then(m => m.showToast('Register kasir disimpan offline dan akan disinkronkan otomatis', 'success'));
        return;
      }
    } catch (e:any) {
      const msg = e?.message || 'Gagal menyimpan register kasir';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      throw e;
    }
  },

  updateCashRegister: async (id, entry) => {
    const { storeId, cashRegister } = get();
    if (!storeId) return;

    const existingEntry = cashRegister.find((item) => item.id === id);
    if (!existingEntry) throw new Error('Saldo kasir tidak ditemukan');

    const nextEntry = {
      ...existingEntry,
      ...entry,
      id,
      store_id: existingEntry.store_id || storeId,
    } as CashRegister;

    try {
      set((s) => ({
        cashRegister: s.cashRegister.map((item) => (item.id === id ? nextEntry : item)),
      }));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);

      try {
        const data = await updateCashRegisterEntry(id, {
          amount: nextEntry.amount,
          note: nextEntry.note ?? null,
          opened_by: nextEntry.opened_by,
          date: nextEntry.date,
        });
        if (data) {
          set((s) => ({
            cashRegister: s.cashRegister.map((item) => (item.id === id ? data as CashRegister : item)),
          }));
          persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
        }
      } catch {
        addPendingWrite(storeId, {
          table: 'cash_register',
          op: 'update',
          id,
          data: {
            amount: nextEntry.amount,
            note: nextEntry.note ?? null,
            opened_by: nextEntry.opened_by,
            date: nextEntry.date,
          },
        });
        import('@/utils/toast').then(m => m.showToast('Perubahan saldo kasir disimpan offline dan akan disinkronkan otomatis', 'success'));
        return;
      }
    } catch (e:any) {
      const msg = e?.message || 'Gagal memperbarui register kasir';
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
      saveSettingsToLS(storeId, mergedSettings);

      const toSave: Partial<StoreSettings> = { ...settings };
      if (toSave.logo_base64 && (toSave.logo_base64?.length ?? 0) > 100_000) {
        delete toSave.logo_base64;
      }
      try {
        await updateStore(storeId, toSave);
      } catch {
        addPendingWrite(storeId, { table: 'stores', op: 'update', id: storeId, data: toSave as Record<string, unknown> });
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
