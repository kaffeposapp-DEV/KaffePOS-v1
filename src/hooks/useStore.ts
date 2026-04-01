// src/hooks/useStore.ts — KaffePOS v5 — Full localStorage cache (menu+inv+trx)
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type {
  MenuItem, InventoryItem, Transaction, Expense,
  CashFlowEntry, StoreSettings, CartItem, CashRegister,
} from '@/types';

// ── localStorage helpers ──────────────────────────────────────────
const LS_SETTINGS_KEY = 'kaffepos_store_settings';

function saveSettingsToLS(data: StoreSettings | null) {
  try { if (data) localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(data)); } catch {}
}
function loadSettingsFromLS(): StoreSettings | null {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    return raw ? JSON.parse(raw) as StoreSettings : null;
  } catch { return null; }
}

// ── Persist seluruh state ke localStorage setelah setiap perubahan ─
function persistCache(storeId: string, menu: MenuItem[], inventory: InventoryItem[], transactions: Transaction[]) {
  try {
    localStorage.setItem(`kpos_menu_${storeId}`,  JSON.stringify(menu));
    localStorage.setItem(`kpos_inv_${storeId}`,   JSON.stringify(inventory));
    // Simpan maks 300 transaksi terbaru aja
    // FIX #3: cache 1000 transaksi agar riwayat tidak hilang
    localStorage.setItem(`kpos_trx_${storeId}`,   JSON.stringify(transactions.slice(0, 1000)));
  } catch {}
}

function loadCache(storeId: string) {
  const load = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  return {
    menu:     (load(`kpos_menu_${storeId}`) || []) as MenuItem[],
    inv:      (load(`kpos_inv_${storeId}`)  || []) as InventoryItem[],
    trx:      (load(`kpos_trx_${storeId}`)  || []) as Transaction[],
    settings: loadSettingsFromLS(),
  };
}

// ── 90-day window helper ──────────────────────────────────────────
const d90ago = () => {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString();
};

// ── Anti-duplikat: track ID yang baru di-INSERT oleh kita sendiri ─
// Realtime channel akan skip INSERT event jika ID ada di set ini
const recentlyInserted = new Set<string>();
function markInserted(id: string) {
  recentlyInserted.add(id);
  // FIX #3: 20 detik (bukan 8) untuk koneksi tablet yang lambat
  setTimeout(() => recentlyInserted.delete(id), 20_000);
}

// ── Offline queue (persisted ke localStorage agar survive app restart) ──
interface PendingWrite { table: string; op: 'insert'|'update'|'delete'; data: any; id?: string }
const PENDING_KEY = 'kpos_pending_writes';

function getPendingWrites(): PendingWrite[] {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; }
}
function savePendingWrites(writes: PendingWrite[]) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(writes.slice(0, 100))); } catch {}
}
function addPendingWrite(pw: PendingWrite) {
  const writes = getPendingWrites();
  writes.push(pw);
  savePendingWrites(writes);
}

async function flushPending() {
  const writes = getPendingWrites();
  if (writes.length === 0) return;
  const remaining: PendingWrite[] = [];
  for (const pw of writes) {
    try {
      if (pw.op === 'insert')      await supabase.from(pw.table).insert(pw.data);
      else if (pw.op === 'update') await supabase.from(pw.table).update(pw.data).eq('id', pw.id!);
      else if (pw.op === 'delete') await supabase.from(pw.table).delete().eq('id', pw.id!);
    } catch {
      remaining.push(pw);
    }
  }
  savePendingWrites(remaining);
}

if (typeof window !== 'undefined') {
  // FIX #1: flush pending writes on online event
  window.addEventListener('online', () => {
    useStore.setState({ isOnline: true });
    flushPending();
  });
  window.addEventListener('offline', () => {
    useStore.setState({ isOnline: false });
  });
  // FIX #4 & #5: re-sync data saat app kembali ke foreground
  // Debounce 2 detik agar tidak spam loadAll saat rapid visibility changes
  let visibilityDebounce: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      visibilityDebounce = setTimeout(() => {
        const { storeId, loadAll } = useStore.getState();
        if (storeId) {
          // Flush pending offline writes dulu, lalu re-sync
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

  // Actions
  setStoreId:          (id: string) => void;
  loadAll:             (storeId: string) => Promise<void>;
  cleanup:             () => void;

  // Cart
  addToCart:           (item: MenuItem, variant?: { name: string; price: number }) => void;
  removeFromCart:      (id: string) => void;
  updateQty:           (id: string, qty: number) => void;
  clearCart:           () => void;
  setDiscount:         (d: string) => void;

  // Menu
  saveMenuItem:        (item: Partial<MenuItem>) => Promise<void>;
  deleteMenuItem:      (id: string) => Promise<void>;

  // Inventory
  saveInventoryItem:   (item: any) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;

  // Transaction
  saveTransaction:     (tx: Omit<Transaction, 'store_id'>) => Promise<void>;
  voidTransaction:     (id: string, reason: string, by: string) => Promise<void>;

  // Expense
  saveExpense:         (exp: Partial<Expense>) => Promise<void>;
  deleteExpense:       (id: string) => Promise<void>;

  // Cash flow
  saveCashFlow:        (entry: Partial<CashFlowEntry>) => Promise<void>;

  // Cash register
  saveCashRegister:    (entry: Partial<CashRegister>) => Promise<void>;

  // Store settings
  saveStoreSettings:   (settings: Partial<StoreSettings>) => Promise<void>;

  // Categories
  saveCustomCats:      (cats: string[]) => void;
}

// ── Active channels tracker ───────────────────────────────────────
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

  // ── Cleanup: remove all realtime channels ────────────────────
  cleanup: () => {
    // Per-channel cleanup
    supabase.getChannels().forEach(ch => {
      if (activeChannels.includes(ch.topic)) {
        supabase.removeChannel(ch);
      }
    });
    activeChannels.length = 0;
    // FIX #5: Fallback — remove ALL channels agar tidak ada channel zombie
    try { supabase.removeAllChannels(); } catch {}
  },

  // ── Load all data + realtime subscriptions ───────────────────
  loadAll: async (storeId: string) => {
    const LS_MENU = `kpos_menu_${storeId}`;
    const LS_INV  = `kpos_inv_${storeId}`;

    // ── STEP 1: Restore ALL data from cache INSTANTLY (0ms) ─────
    const cache = loadCache(storeId);
    let cachedCart = [];
    let cachedDiscount = '';
    try {
      cachedCart = JSON.parse(localStorage.getItem(`kpos_cart_${storeId}`) || '[]');
      cachedDiscount = localStorage.getItem(`kpos_discount_${storeId}`) || '';
    } catch {}

    if (cache.settings || cache.menu.length > 0) {
      const stdCats = ['Coffee', 'Non-Coffee', 'Snack'];
      const cats = [...new Set(cache.menu.map((m: any) => m.category))].filter((c: any) => c && !stdCats.includes(c)) as string[];
      set({
        storeId,
        storeSettings: cache.settings ?? undefined,
        menu:          cache.menu,
        inventory:     cache.inv,
        transactions:  cache.trx,   // ← Restore transaksi dari cache!
        customCats:    cats,
        loading:       false,
        cart:          cachedCart,
        discount:      cachedDiscount,
      });
    } else {
      set({ storeId, loading: true, cart: cachedCart, discount: cachedDiscount });
    }

    get().cleanup();

    // ── STEP 2: Fetch CRITICAL data (store + menu + inventory) ───
    try {
      const [store, menu, inv] = await Promise.all([
        supabase.from('stores').select('*').eq('id', storeId).single(),
        supabase.from('menu_items').select('*').eq('store_id', storeId).order('sort_order'),
        supabase.from('inventory').select('*').eq('store_id', storeId).order('name'),
      ]);

      const menuData = (menu.data || []) as MenuItem[];
      const invData  = (inv.data  || []) as InventoryItem[];
      const stdCats  = ['Coffee', 'Non-Coffee', 'Snack'];
      const freshCats = [...new Set(menuData.map(m => m.category))].filter(c => c && !stdCats.includes(c));
      const freshSettings = (store.data as StoreSettings) ?? cache.settings;
      if (freshSettings) saveSettingsToLS(freshSettings);

      set(s => ({
        storeId,
        storeSettings: freshSettings,
        menu:       menuData,
        inventory:  invData,
        customCats: freshCats,
        loading:    false,
        // Pertahankan transaksi dari cache sampai background fetch selesai
        transactions: s.transactions,
      }));

      // Update localStorage dengan data terbaru dari Supabase
      persistCache(storeId, menuData, invData, get().transactions);

    } catch (e) {
      console.error('loadAll critical error:', e);
      set({ storeId, loading: false });
    }

    // ── STEP 3: Fetch SECONDARY data di background ──────────────
    const loadSecondary = async () => {
      try {
        const cutoff = d90ago();
        const [trx, exp, cf, cr] = await Promise.all([
          // FIX #3: limit 1000 agar riwayat transaksi tidak terpotong
          supabase.from('transactions').select('*').eq('store_id', storeId)
            .gte('date', cutoff).order('date', { ascending: false }).limit(1000),
          supabase.from('expenses').select('*').eq('store_id', storeId)
            .gte('date', cutoff).order('date', { ascending: false }).limit(1000),
          supabase.from('cash_flow').select('*').eq('store_id', storeId)
            .gte('date', cutoff).order('date', { ascending: false }),
          supabase.from('cash_register').select('*').eq('store_id', storeId)
            .gte('date', cutoff).order('date', { ascending: false }),
        ]);

        const trxData = (trx.data || []) as Transaction[];
        set({
          transactions: trxData,
          expenses:     (exp.data  || []) as Expense[],
          cashFlow:     (cf.data   || []) as CashFlowEntry[],
          cashRegister: (cr.data   || []) as CashRegister[],
          syncing: false,
        });
        // Update cache transaksi dengan data fresh dari server
        persistCache(storeId, get().menu, get().inventory, trxData);
      } catch {
        // Gagal fetch secondary — tetap pakai cache, tidak error
      }
    };

    set({ syncing: true });
    loadSecondary();

    // ── Setup realtime subscriptions ───────────────────────────
    const storeId_ = storeId; // capture for closure

    const channelMap = new Map<string, ReturnType<typeof supabase.channel>>();

    const setupChannel = (name: string, table: string, filter: string, handler: (p: any) => void) => {
      const topic = `kaffepos_${name}`;
      if (!activeChannels.includes(`realtime:${topic}`)) {
        activeChannels.push(`realtime:${topic}`);
      }
      // FIX: remove existing channel instance, not a new empty one
      const existing = channelMap.get(topic);
      if (existing) { supabase.removeChannel(existing); channelMap.delete(topic); }

      const ch = supabase.channel(topic)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter }, handler)
        .subscribe((status) => {
          // FIX #5: hapus 'CLOSED' dari kondisi auto-reconnect karena akan menyebabkan loop mematikan saat cleanup
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setTimeout(() => {
              if (get().storeId !== storeId_) return; // Cegah zombie channel jika storeId sudah berganti
              if (!activeChannels.includes(`realtime:${topic}`)) return; // Cegah respawn jika sudah di cleanup
              try { supabase.removeChannel(ch); } catch {}
              channelMap.delete(topic);
              setupChannel(name, table, filter, handler);
            }, 3000);
          }
        });
      channelMap.set(topic, ch);
      return ch;
    };

    // 1. Menu — dedup via recentlyInserted
    setupChannel('menu', 'menu_items', `store_id=eq.${storeId_}`, (payload) => {
      set(s => {
        let newMenu = s.menu;
        if (payload.eventType === 'INSERT') {
          // FIX: skip jika kita yang insert (sudah ada via optimistic)
          if (recentlyInserted.has(payload.new.id)) {
            recentlyInserted.delete(payload.new.id);
            return {};
          }
          const exists = s.menu.some(m => m.id === payload.new.id);
          newMenu = exists ? s.menu : [...s.menu, payload.new as MenuItem];
        } else if (payload.eventType === 'UPDATE') {
          newMenu = s.menu.map(m => m.id === payload.new.id ? { ...m, ...payload.new } as MenuItem : m);
        } else if (payload.eventType === 'DELETE') {
          newMenu = s.menu.filter(m => m.id !== payload.old.id);
        }
        const stdCats = ['Coffee', 'Non-Coffee', 'Snack'];
        const freshCats = [...new Set(newMenu.map(m => m.category))].filter(c => c && !stdCats.includes(c));
        return { menu: newMenu, customCats: freshCats };
      });
    });

    // 2. Inventory — dedup via recentlyInserted
    setupChannel('inventory', 'inventory', `store_id=eq.${storeId_}`, (payload) => {
      set(s => {
        if (payload.eventType === 'INSERT') {
          if (recentlyInserted.has(payload.new.id)) {
            recentlyInserted.delete(payload.new.id);
            return {};
          }
          const exists = s.inventory.some(i => i.id === payload.new.id);
          return exists ? {} : { inventory: [...s.inventory, payload.new as InventoryItem].sort((a,b)=>a.name.localeCompare(b.name)) };
        }
        if (payload.eventType === 'UPDATE')
          return { inventory: s.inventory.map(i => i.id === payload.new.id ? { ...i, ...payload.new } as InventoryItem : i) };
        if (payload.eventType === 'DELETE')
          return { inventory: s.inventory.filter(i => i.id !== payload.old.id) };
        return {};
      });
    });

    // 3. Transactions — dedup via recentlyInserted
    setupChannel('transactions', 'transactions', `store_id=eq.${storeId_}`, (payload) => {
      set(s => {
        if (payload.eventType === 'INSERT') {
          if (recentlyInserted.has(payload.new.id)) {
            recentlyInserted.delete(payload.new.id);
            return {};
          }
          const exists = s.transactions.some(t => t.id === payload.new.id);
          return exists ? {} : { transactions: [payload.new as Transaction, ...s.transactions] };
        }
        if (payload.eventType === 'UPDATE')
          return { transactions: s.transactions.map(t => t.id === payload.new.id ? { ...t, ...payload.new } as Transaction : t) };
        if (payload.eventType === 'DELETE')
          return { transactions: s.transactions.filter(t => t.id !== payload.old.id) };
        return {};
      });
    });

    // 4. Store settings — update localStorage cache juga
    setupChannel('store', 'stores', `id=eq.${storeId_}`, (payload) => {
      if (payload.eventType === 'UPDATE') {
        const s = payload.new as StoreSettings;
        set({ storeSettings: s });
        saveSettingsToLS(s);
      }
    });

    // 5. Expenses — dedup via recentlyInserted
    setupChannel('expenses', 'expenses', `store_id=eq.${storeId_}`, (payload) => {
      set(s => {
        if (payload.eventType === 'INSERT') {
          if (recentlyInserted.has(payload.new.id)) {
            recentlyInserted.delete(payload.new.id);
            return {};
          }
          const exists = s.expenses.some(e => e.id === payload.new.id);
          return exists ? {} : { expenses: [payload.new as Expense, ...s.expenses] };
        }
        if (payload.eventType === 'UPDATE')
          return { expenses: s.expenses.map(e => e.id === payload.new.id ? { ...e, ...payload.new } as Expense : e) };
        if (payload.eventType === 'DELETE')
          return { expenses: s.expenses.filter(e => e.id !== payload.old.id) };
        return {};
      });
    });

    // 6. Cash register — dedup via recentlyInserted
    setupChannel('cash_register', 'cash_register', `store_id=eq.${storeId_}`, (payload) => {
      set(s => {
        if (payload.eventType === 'INSERT') {
          if (recentlyInserted.has(payload.new.id)) {
            recentlyInserted.delete(payload.new.id);
            return {};
          }
          const exists = s.cashRegister.some(r => r.id === payload.new.id);
          return exists ? {} : { cashRegister: [payload.new as CashRegister, ...s.cashRegister] };
        }
        if (payload.eventType === 'DELETE')
          return { cashRegister: s.cashRegister.filter(r => r.id !== payload.old.id) };
        return {};
      });
    });
  },

  // ── CART ──────────────────────────────────────────────────────
  addToCart: (item, variant) => {
    const cartItem: CartItem = variant
      ? { ...item, qty: 1, price: variant.price, name: `${item.name} (${variant.name})`, variantId: variant.name, _baseId: item.id, id: `${item.id}_${variant.name}` }
      : { ...item, qty: 1 };
    set(s => {
      const existing = s.cart.find(c => c.id === cartItem.id);
      return existing
        ? { cart: s.cart.map(c => c.id === cartItem.id ? { ...c, qty: c.qty + 1 } : c) }
        : { cart: [...s.cart, { ...cartItem, qty: 1 }] };
    });
  },

  removeFromCart: (id) => set(s => ({ cart: s.cart.filter(c => c.id !== id) })),

  updateQty: (id, qty) => set(s => ({
    cart: qty <= 0 ? s.cart.filter(c => c.id !== id) : s.cart.map(c => c.id === id ? { ...c, qty } : c)
  })),

  clearCart: () => set({ cart: [], discount: '' }),
  setDiscount: (d) => set({ discount: d }),

  // ── MENU ──────────────────────────────────────────────────────
  saveMenuItem: async (item) => {
    const { storeId, menu, customCats } = get();
    if (!storeId) throw new Error('Store belum dimuat');
    const stdCats = ['Coffee', 'Non-Coffee', 'Snack'];

    if (item.id) {
      // Optimistic update
      const updated = menu.map(m => m.id === item.id ? { ...m, ...item } as MenuItem : m);
      const freshCats = [...new Set(updated.map(m => m.category))].filter(c => c && !stdCats.includes(c));
      set({ menu: updated, customCats: freshCats });
      // ✔ Cache langsung setelah optimistic update
      persistCache(storeId, updated, get().inventory, get().transactions);
      const { error } = await supabase.from('menu_items').update({
        name: item.name, price: item.price, category: item.category,
        image_url: item.image_url || '', description: item.description || '',
        recipe: item.recipe || [], variants: item.variants || [],
        is_available: item.is_available ?? true,
      }).eq('id', item.id);
      if (error) {
        // Rollback
        set({ menu, customCats });
        persistCache(storeId, menu, get().inventory, get().transactions);
        throw new Error(error.message);
      }
    } else {
      const tempId = `temp_${Date.now()}`;
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
      // ✔ Cache dengan tempId agar refresh pun tetap tampil
      persistCache(storeId, newMenu, get().inventory, get().transactions);

      const { data, error } = await supabase.from('menu_items').insert({
        store_id: storeId, name: item.name, price: item.price || 0,
        category: item.category || 'Coffee', image_url: item.image_url || '',
        description: item.description || '', recipe: item.recipe || [],
        variants: item.variants || [], sort_order: menu.length,
      }).select().single();

      if (error) {
        set(s => ({
          menu: s.menu.filter(m => m.id !== tempId),
          customCats,
        }));
        persistCache(storeId, menu, get().inventory, get().transactions);
        throw new Error(error.message);
      }
      if (data) {
        // FIX duplikat: mark realId SEBELUM replace tempId
        // Sehingga saat Realtime INSERT event masuk, kita skip
        markInserted(data.id);
        set(s => ({ menu: s.menu.map(m => m.id === tempId ? data as MenuItem : m) }));
        persistCache(storeId, get().menu, get().inventory, get().transactions);
      }
    }
  },

  deleteMenuItem: async (id) => {
    const { storeId } = get();
    if (!storeId) return;
    set(s => ({ menu: s.menu.filter(m => m.id !== id) }));
    persistCache(storeId, get().menu, get().inventory, get().transactions); // FIX: storeId bukan id
    await supabase.from('menu_items').delete().eq('id', id);
  },

  // ── INVENTORY ─────────────────────────────────────────────────
  saveInventoryItem: async (item) => {
    const { storeId, inventory } = get();
    if (!storeId) throw new Error('Store belum dimuat');

    const qty       = parseFloat(item.qty)      || 0;
    const totalCost = parseFloat(item.cost)      || 0;
    const minStock  = parseFloat(item.minStock)  || 5;
    const unitCost  = qty > 0 ? totalCost / qty  : 0;

    if (item.type === 'new') {
      const tempId = `inv_temp_${Date.now()}`;
      const optimistic: InventoryItem = {
        id: tempId, store_id: storeId,
        name: item.name, stock: qty,
        unit: item.unit || 'pcs',
        min_stock: minStock, cost_per_unit: unitCost,
      };
      const newInv = [...get().inventory, optimistic].sort((a,b) => a.name.localeCompare(b.name));
      set({ inventory: newInv });
      // ✔ Cache langsung termasuk item baru dengan tempId
      persistCache(storeId, get().menu, newInv, get().transactions);

      const { data, error } = await supabase.from('inventory').insert({
        store_id: storeId, name: item.name, stock: qty,
        unit: item.unit || 'pcs', min_stock: minStock, cost_per_unit: unitCost,
      }).select().single();

      if (error) {
        set(s => ({ inventory: s.inventory.filter(i => i.id !== tempId) }));
        persistCache(storeId, get().menu, get().inventory, get().transactions);
        throw new Error(error.message);
      }
      if (data) {
        // FIX duplikat: mark realId sebelum replace tempId
        markInserted(data.id);
        set(s => ({ inventory: s.inventory.map(i => i.id === tempId ? data as InventoryItem : i) }));
        persistCache(storeId, get().menu, get().inventory, get().transactions);
        if (totalCost > 0) {
          const { data: expData } = await supabase.from('expenses').insert({
            store_id: storeId, date: new Date().toISOString(),
            description: `Beli ${item.name}`, amount: totalCost, category: 'Bahan Baku',
          }).select().single();
          if (expData) {
            markInserted(expData.id); // FIX: expense juga perlu dedup
            set(s => ({ expenses: [expData as Expense, ...s.expenses] }));
          }
        }
      }

    } else if (item.type === 'edit') {
      const existing = inventory.find(i => i.id === item.id);
      const newCost  = qty > 0 ? unitCost : (existing?.cost_per_unit || 0);
      set(s => ({ inventory: s.inventory.map(i => i.id === item.id
        ? { ...i, name: item.name, stock: qty, unit: item.unit, min_stock: minStock, cost_per_unit: newCost }
        : i
      )}));
      persistCache(storeId, get().menu, get().inventory, get().transactions);
      const { error } = await supabase.from('inventory').update({
        name: item.name, stock: qty, unit: item.unit, min_stock: minStock, cost_per_unit: newCost,
      }).eq('id', item.id);
      if (error) {
        if (existing) {
          set(s => ({ inventory: s.inventory.map(i => i.id === item.id ? existing : i) }));
          persistCache(storeId, get().menu, get().inventory, get().transactions);
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
      persistCache(storeId, get().menu, get().inventory, get().transactions);
      const { error } = await supabase.from('inventory').update({
        stock: newStock, cost_per_unit: newCost,
      }).eq('id', item.id);
      if (error) {
        set(s => ({ inventory: s.inventory.map(i => i.id === item.id ? existing : i) }));
        persistCache(storeId, get().menu, get().inventory, get().transactions);
        throw new Error(error.message);
      }
      if (totalCost > 0) {
        const { data: expData } = await supabase.from('expenses').insert({
          store_id: storeId, date: new Date().toISOString(),
          description: `Restock ${item.name}`, amount: totalCost, category: 'Bahan Baku',
        }).select().single();
        if (expData) {
          markInserted(expData.id); // FIX: dedup expense restock
          set(s => ({ expenses: [expData as Expense, ...s.expenses] }));
        }
      }
    }
  },

  deleteInventoryItem: async (id) => {
    const { storeId } = get();
    if (!storeId) return;
    set(s => ({ inventory: s.inventory.filter(i => i.id !== id) }));
    persistCache(storeId, get().menu, get().inventory, get().transactions); // FIX: storeId bukan id
    await supabase.from('inventory').delete().eq('id', id);
  },

  // ── TRANSACTION — with serialized inventory deduction ─────────
  saveTransaction: async (tx) => {
    const { storeId, inventory, menu } = get();
    if (!storeId) return;

    // FIX #3: Pastikan tx.id selalu ada — generate UUID client-side jika tidak ada
    // Ini memastikan transaksi selalu bisa di-track di UI sebelum server confirm
    const txWithId = {
      ...tx,
      id: tx.id || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `trx_${Date.now()}_${Math.random().toString(36).slice(2)}`),
    };

    // Build inventory updates: serialize to avoid race condition
    const updates: { id: string; newStock: number }[] = [];
    for (const cartItem of txWithId.items) {
      const baseName = cartItem.name.split(' (')[0];
      const menuItem = menu.find(m => m.name === cartItem.name || m.name === baseName || m.id === (cartItem as any)._baseId);
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

    // Apply optimistic inventory update
    if (updates.length > 0) {
      set(s => ({
        inventory: s.inventory.map(i => {
          const u = updates.find(u => u.id === i.id);
          return u ? { ...i, stock: u.newStock } : i;
        })
      }));
      // Persist to DB — sequential to avoid race condition
      for (const u of updates) {
        supabase.from('inventory').update({ stock: u.newStock }).eq('id', u.id)
          .then(({ error }) => {
            if (error) {
              addPendingWrite({ table: 'inventory', op: 'update', data: { stock: u.newStock }, id: u.id });
            }
          });
      }
    }

    // FIX #3: Update UI optimistically DULU — sebelum insert ke DB
    // Ini memastikan transaksi selalu tercatat di Riwayat meski ada latency
    markInserted(txWithId.id); // pre-mark agar realtime INSERT tidak duplikat
    set(s => ({
      transactions: s.transactions.some(t => t.id === txWithId.id)
        ? s.transactions
        : [{ ...txWithId, store_id: storeId } as Transaction, ...s.transactions]
    }));
    persistCache(storeId, get().menu, get().inventory, get().transactions);

    // Save transaction to DB
    const { data, error } = await supabase.from('transactions').insert({
      ...txWithId, store_id: storeId,
    }).select().single();

    if (error) {
      // Queue for retry when online (persisted ke localStorage)
      addPendingWrite({ table: 'transactions', op: 'insert', data: { ...txWithId, store_id: storeId } });
      // Data sudah ada di UI (optimistic insert di atas) — tidak perlu insert ulang
      return;
    }

    if (data) {
      // Replace optimistic entry dengan data resmi dari server
      set(s => ({
        transactions: s.transactions.map(t => t.id === txWithId.id ? data as Transaction : t)
      }));
      persistCache(storeId, get().menu, get().inventory, get().transactions);
    }
  },

  voidTransaction: async (id, reason, by) => {
    const { error } = await supabase.from('transactions').update({
      is_void: true, void_reason: reason,
      void_at: new Date().toISOString(), void_by: by,
    }).eq('id', id);
    if (error) throw new Error(error.message);
    set(s => ({
      transactions: s.transactions.map(t => t.id === id ? { ...t, is_void: true, void_reason: reason } : t)
    }));
  },

  // ── EXPENSE ───────────────────────────────────────────────────
  saveExpense: async (exp) => {
    const { storeId } = get();
    if (!storeId) return;
    const { data, error } = await supabase.from('expenses').insert({
      store_id: storeId, date: new Date().toISOString(), ...exp,
    }).select().single();
    if (error) throw new Error(error.message);
    if (data) {
      markInserted(data.id); // FIX: dedup dengan Realtime
      set(s => ({ expenses: [data as Expense, ...s.expenses] }));
    }
  },

  deleteExpense: async (id) => {
    set(s => ({ expenses: s.expenses.filter(e => e.id !== id) }));
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) {
      // Rollback if delete failed
      const { data } = await supabase.from('expenses').select('*').eq('id', id).single();
      if (data) set(s => ({ expenses: [data as Expense, ...s.expenses] }));
    }
  },

  // ── CASH FLOW ─────────────────────────────────────────────────
  saveCashFlow: async (entry) => {
    const { storeId } = get();
    if (!storeId) return;
    const { data, error } = await supabase.from('cash_flow').insert({
      store_id: storeId, date: new Date().toISOString(), ...entry,
    }).select().single();
    if (error) throw new Error(error.message);
    if (data) set(s => ({ cashFlow: [data as CashFlowEntry, ...s.cashFlow] }));
  },

  // ── CASH REGISTER ─────────────────────────────────────────────
  saveCashRegister: async (entry) => {
    const { storeId } = get();
    if (!storeId) return;
    const { data, error } = await supabase.from('cash_register').insert({
      store_id: storeId, date: new Date().toISOString(), ...entry,
    }).select().single();
    if (error) throw new Error(error.message);
    if (data) {
      markInserted(data.id); // FIX: dedup dengan Realtime
      set(s => ({ cashRegister: [data as CashRegister, ...s.cashRegister] }));
    }
  },

  // ── STORE SETTINGS ────────────────────────────────────────────
  saveStoreSettings: async (settings) => {
    const { storeId, storeSettings } = get();
    if (!storeId) throw new Error('Store belum dimuat');

    // FIX: Update state lokal dulu (optimistic) + simpan ke localStorage sekarang
    const mergedSettings = storeSettings
      ? { ...storeSettings, ...settings }
      : ({ ...settings } as StoreSettings);
    set({ storeSettings: mergedSettings });
    saveSettingsToLS(mergedSettings);

    const toSave: any = { ...settings };
    // Skip oversized logo_base64 (simpan URL saja ke Supabase)
    if (toSave.logo_base64 && toSave.logo_base64.length > 100_000) {
      delete toSave.logo_base64;
    }
    const { error } = await supabase.from('stores').update(toSave).eq('id', storeId);
    if (error) {
      // Supabase error tapi localStorage sudah tersimpan — tidak rollback
      // karena data tetap tersimpan di localStorage
      console.error('saveStoreSettings Supabase error:', error.message);
      throw new Error(error.message);
    }
  },

  // ── CATEGORIES ────────────────────────────────────────────────
  saveCustomCats: (cats) => set({ customCats: cats }),
}));

// Auto-persist Cart to localStorage
useStore.subscribe((state, prevState) => {
  if (state.storeId && (state.cart !== prevState.cart || state.discount !== prevState.discount)) {
    try {
      localStorage.setItem(`kpos_cart_${state.storeId}`, JSON.stringify(state.cart));
      localStorage.setItem(`kpos_discount_${state.storeId}`, state.discount);
    } catch {}
  }
});
