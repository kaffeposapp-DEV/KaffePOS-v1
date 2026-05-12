




/* eslint-disable @typescript-eslint/no-explicit-any */
// src/hooks/useStore.ts — KaffePOS v5 — Full localStorage cache (menu+inv+trx)
import { create } from 'zustand';
import { clearStoredAuthSession, markExplicitSignOut } from '@/lib/authSession';
import {
  ApiError,
  checkoutTransaction,
  commitStockBulkImport,
  createStockUnitConversion,
  createCashFlow,
  createCashRegister,
  createExpense,
  createInventoryAdjustment,
  createInventoryItem,
  createMenuItem,
  getCashFlow,
  getCashRegister,
  getExpenses,
  getInventory,
  getKitchenOrders,
  getMyChallengeProgress,
  addLoyaltyStamp,
  redeemLoyaltyReward,
  getMenuItems,
  getStockUnitConversions,
  getStores,
  getTransactions,
  removeExpense,
  removeInventoryItem,
  removeMenuItem,
  deleteStockUnitConversion,
  subscribeKitchenEvents,
  updateKitchenItemStatus,
  updateKitchenOrderStatus,
  updateCashRegisterEntry,
  updateInventoryItem,
  updateMenuItem,
  updateStockUnitConversion,
  updateStore,
  voidTransactionRequest,
} from '@/lib/backendApi';
import { trackOpsEvent } from '@/lib/opsMetrics';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { DEFAULT_CUSTOM_THEME, applyThemeToDocument, type CustomThemeConfig, type ThemePresetId } from '@/lib/theme';
import {
  deriveConnectivityMode,
  enqueueOfflineOperation,
  getOfflineOutboxSummary,
  processOfflineOutbox,
  type ConnectivityMode,
} from '@/lib/offlineQueue';
import { canProcessPosPaymentOffline, getOfflinePaymentBlockedMessage } from '@/lib/offlinePolicy';
import { normalizeUserFacingError } from '@/lib/errorMessages';
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
  InventoryItemUpdate, KitchenOrder, KitchenOrderStatus, KitchenRealtimeEvent, KitchenRealtimeStatus,
  StockUnitConversion,
} from '@/types';
import type { Challenge, UserChallengeProgress } from '@/lib/challenges';
import { getChallengeProgressCacheKey, getChallengesCacheKey } from '@/lib/challenges';
import type { BulkImportMode, BulkImportPreview, BulkImportRow } from '@/lib/stockEngine';

function makeClientId(prefix: string) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getPersistedThemeState() {
  if (typeof window === 'undefined') {
    return {
      appTheme: 'classic' as ThemePresetId,
      customTheme: DEFAULT_CUSTOM_THEME,
    };
  }

  try {
    const appTheme = (localStorage.getItem('kpos_app_theme') as ThemePresetId | null) || 'classic';
    const rawCustomTheme = localStorage.getItem('kpos_app_theme_custom');
    const customTheme = rawCustomTheme
      ? { ...DEFAULT_CUSTOM_THEME, ...(JSON.parse(rawCustomTheme) as Partial<CustomThemeConfig>) }
      : DEFAULT_CUSTOM_THEME;

    return { appTheme, customTheme };
  } catch {
    return {
      appTheme: 'classic' as ThemePresetId,
      customTheme: DEFAULT_CUSTOM_THEME,
    };
  }
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

function getKitchenCacheKey(storeId: string) {
  return `kpos_kitchen_orders_${storeId}`;
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
  unitConversions?: StockUnitConversion[],
) {
  try {
    localStorage.setItem(`kpos_menu_${storeId}`,  JSON.stringify(menu));
    localStorage.setItem(`kpos_inv_${storeId}`,   JSON.stringify(inventory));
    localStorage.setItem(`kpos_trx_${storeId}`,   JSON.stringify(transactions));
    localStorage.setItem(`kpos_exp_${storeId}`,   JSON.stringify(expenses));
    localStorage.setItem(`kpos_cf_${storeId}`,    JSON.stringify(cashFlow));
    localStorage.setItem(`kpos_cr_${storeId}`,    JSON.stringify(cashRegister));
    if (unitConversions) {
      localStorage.setItem(`kpos_unit_conversions_${storeId}`, JSON.stringify(unitConversions));
    }
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
    unitConversions: (load(`kpos_unit_conversions_${storeId}`) || []) as StockUnitConversion[],
    kitchen:  (load(getKitchenCacheKey(storeId)) || []) as KitchenOrder[],
    settings: loadSettingsFromLS(storeId),
  };
}

function saveKitchenToLS(storeId: string | null, orders: KitchenOrder[]) {
  if (!storeId) return;
  try { localStorage.setItem(getKitchenCacheKey(storeId), JSON.stringify(orders)); } catch { /* ignore */ }
}

function saveChallengesToLS(storeId: string | null, challenges: Challenge[], progress: UserChallengeProgress[]) {
  if (!storeId) return;
  try {
    localStorage.setItem(getChallengesCacheKey(storeId), JSON.stringify(challenges));
    localStorage.setItem(getChallengeProgressCacheKey(storeId), JSON.stringify(progress));
  } catch { /* ignore */ }
}

function loadChallengesFromLS(storeId: string) {
  try {
    return {
      challenges: JSON.parse(localStorage.getItem(getChallengesCacheKey(storeId)) || '[]') as Challenge[],
      progress: JSON.parse(localStorage.getItem(getChallengeProgressCacheKey(storeId)) || '[]') as UserChallengeProgress[],
    };
  } catch {
    return { challenges: [] as Challenge[], progress: [] as UserChallengeProgress[] };
  }
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
  if (storeId) void updateSyncIndicators(storeId);
}

async function updateSyncIndicators(storeId: string | null, options: { syncing?: boolean; lastSyncSucceeded?: boolean } = {}) {
  if (!storeId) return;
  const outbox = await getOfflineOutboxSummary(storeId);
  const legacyCount = getPendingWrites(storeId).length;
  const summary = {
    total: outbox.total + legacyCount,
    pending: outbox.pending + legacyCount,
    syncing: outbox.syncing,
    failed: outbox.failed,
    conflicted: outbox.conflicted,
    resolved: outbox.resolved,
  };
  const state = useStore.getState();
  const isSyncing = options.syncing ?? state.syncing;
  const modeInput = {
    isOnline: state.isOnline,
    isSyncing,
    summary,
    ...(options.lastSyncSucceeded === undefined ? {} : { lastSyncSucceeded: options.lastSyncSucceeded }),
  };
  useStore.setState({
    pendingSyncCount: summary.total,
    failedSyncCount: summary.failed + summary.conflicted,
    syncStatus: deriveConnectivityMode(modeInput),
  });
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
    merged.set(item.id, item);
  }

  return sortByDateDesc(Array.from(merged.values()));
}

function sortKitchenOrders(orders: KitchenOrder[]) {
  return [...orders].sort((a, b) => {
    const statusWeight: Record<string, number> = { pending: 0, preparing: 1, ready: 2, served: 3, completed: 3, cancelled: 4 };
    const statusDiff = (statusWeight[a.overall_status] ?? 9) - (statusWeight[b.overall_status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function isKitchenOrderNewer(next: KitchenOrder, current?: KitchenOrder) {
  if (!current) return true;
  if ((next.status_version ?? 0) !== (current.status_version ?? 0)) {
    return (next.status_version ?? 0) >= (current.status_version ?? 0);
  }
  return new Date(next.updated_at || next.created_at).getTime() >= new Date(current.updated_at || current.created_at).getTime();
}

function mergeKitchenOrder(orders: KitchenOrder[], order: KitchenOrder) {
  const existing = orders.find((entry) => entry.id === order.id);
  if (existing && !isKitchenOrderNewer(order, existing)) {
    return orders;
  }
  const merged = existing
    ? orders.map((entry) => entry.id === order.id ? order : entry)
    : [order, ...orders];
  const active = merged.filter((entry) => !['served', 'completed', 'cancelled'].includes(entry.overall_status));
  return sortKitchenOrders(active);
}

async function flushPending() {
  const storeId = useStore.getState().storeId;
  if (!storeId) return;
  if (activeFlushStores.has(storeId)) return;
  activeFlushStores.add(storeId);
  try {
  const writes = getPendingWrites(storeId);
  const outboxSummary = await getOfflineOutboxSummary(storeId);
  if (writes.length === 0 && outboxSummary.total === 0) {
    await updateSyncIndicators(storeId);
    return;
  }
  useStore.setState({ syncing: true, syncStatus: 'syncing' });
  await updateSyncIndicators(storeId, { syncing: true });

  await processOfflineOutbox(storeId, {
    'transaction.create': async (item) => {
      const data = await checkoutTransaction(item.payload);
      const savedTx = data as Transaction;
      markInserted(savedTx.id);
      useStore.setState((state) => ({
        transactions: state.transactions.some(t => t.id === savedTx.id)
          ? state.transactions.map(t => t.id === savedTx.id ? savedTx : t)
          : [savedTx, ...state.transactions.filter(t => t.id !== item.payload.id)],
      }));
      if (savedTx.kitchen_order) {
        useStore.setState((state) => {
          const nextOrders = mergeKitchenOrder(state.kitchenOrders, savedTx.kitchen_order as KitchenOrder);
          saveKitchenToLS(storeId, nextOrders);
          return { kitchenOrders: nextOrders };
        });
      }
      persistCache(storeId, useStore.getState().menu, useStore.getState().inventory, useStore.getState().transactions, useStore.getState().expenses, useStore.getState().cashFlow, useStore.getState().cashRegister);
      try {
        const progressResponse = await getMyChallengeProgress(storeId);
        useStore.setState({
          activeChallenges: progressResponse.challenges || [],
          challengeProgress: progressResponse.items || [],
        });
        saveChallengesToLS(storeId, progressResponse.challenges || [], progressResponse.items || []);
      } catch { /* challenge progress will refresh on next load */ }
    },
    'loyalty.stamp.create': async (item) => {
      await addLoyaltyStamp(item.payload as {
        store_id: string;
        passport_id?: string;
        customer_name?: string | null;
        customer_phone?: string;
        transaction_id?: string | null;
        transaction_amount: number;
        note?: string | null;
        idempotency_key?: string | null;
      });
    },
    'loyalty.redemption.create': async (item) => {
      await redeemLoyaltyReward(item.payload as {
        store_id: string;
        passport_id: string;
        reward_id: string;
        transaction_id?: string | null;
        transaction_amount: number;
        idempotency_key?: string | null;
      });
    },
    'kitchen.order.update': async (item) => {
      const data = await updateKitchenOrderStatus(String(item.payload.id), {
        store_id: storeId,
        status: item.payload.status as KitchenOrderStatus,
        reason: typeof item.payload.reason === 'string' ? item.payload.reason : null,
      });
      const order = data as KitchenOrder;
      useStore.setState((state) => {
        const nextOrders = mergeKitchenOrder(state.kitchenOrders, order);
        saveKitchenToLS(storeId, nextOrders);
        return { kitchenOrders: nextOrders };
      });
    },
    'kitchen.item.update': async (item) => {
      const data = await updateKitchenItemStatus(String(item.payload.id), {
        store_id: storeId,
        status: item.payload.status as KitchenOrderStatus,
      });
      const order = data as KitchenOrder;
      useStore.setState((state) => {
        const nextOrders = mergeKitchenOrder(state.kitchenOrders, order);
        saveKitchenToLS(storeId, nextOrders);
        return { kitchenOrders: nextOrders };
      });
    },
    'store.settings.update': async (item) => {
      const updated = await updateStore(storeId, item.payload);
      saveSettingsToLS(storeId, updated as StoreSettings);
      useStore.setState({ storeSettings: updated as StoreSettings });
    },
  });

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
      } else if (pw.table === 'inventory_unit_conversions') {
        if (pw.op === 'insert') await createStockUnitConversion(pw.data);
        if (pw.op === 'update' && pw.id) await updateStockUnitConversion(pw.id, pw.data);
        if (pw.op === 'delete' && pw.id) await deleteStockUnitConversion(pw.id);
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
  const finalOutbox = await getOfflineOutboxSummary(storeId);
  const hasFailures = remaining.length > 0 || finalOutbox.failed > 0 || finalOutbox.conflicted > 0;
  useStore.setState({
    syncing: false,
    pendingSyncCount: finalOutbox.total + remaining.length,
    failedSyncCount: finalOutbox.failed + finalOutbox.conflicted,
    syncStatus: hasFailures ? 'sync_failed' : 'sync_success',
  });
  if (!hasFailures) {
    setTimeout(() => {
      const current = useStore.getState();
      if (current.storeId === storeId && current.syncStatus === 'sync_success') {
        useStore.setState({ syncStatus: current.isOnline ? 'online' : 'offline' });
      }
    }, 3000);
  }
  } finally {
    activeFlushStores.delete(storeId);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useStore.setState({ isOnline: true, syncStatus: 'reconnecting' });
    flushPending();
  });
  window.addEventListener('offline', () => {
    useStore.setState({ isOnline: false, syncStatus: 'offline' });
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
  unitConversions: StockUnitConversion[];
  transactions:  Transaction[];
  kitchenOrders: KitchenOrder[];
  kitchenRealtimeStatus: KitchenRealtimeStatus;
  expenses:      Expense[];
  cashFlow:      CashFlowEntry[];
  cashRegister:  CashRegister[];
  activeChallenges: Challenge[];
  challengeProgress: UserChallengeProgress[];
  customCats:    string[];
  cart:          CartItem[];
  discount:      string;
  loading:       boolean;
  syncing:       boolean;
  isOnline:      boolean;
  syncStatus:    ConnectivityMode;
  pendingSyncCount: number;
  failedSyncCount: number;
  appTheme:      ThemePresetId;
  customTheme:   CustomThemeConfig;

  setStoreId:          (id: string) => void;
  setAppTheme:         (theme: ThemePresetId) => void;
  setCustomTheme:      (theme: Partial<CustomThemeConfig>) => void;
  loadAll:             (storeId: string) => Promise<void>;
  cleanup:             () => void;
  loadKitchenOrders:    (storeId?: string) => Promise<void>;
  loadChallenges:        (storeId?: string) => Promise<void>;
  connectKitchenRealtime: (storeId?: string) => void;
  applyKitchenEvent:    (event: KitchenRealtimeEvent) => void;
  setCartItemNote:      (id: string, note: string) => void;
  addToCart:           (item: MenuItem, variant?: { name: string; price: number }) => void;
  removeFromCart:      (id: string) => void;
  updateQty:           (id: string, qty: number) => void;
  clearCart:           () => void;
  setDiscount:         (d: string) => void;
  saveMenuItem:        (item: Partial<MenuItem>) => Promise<void>;
  deleteMenuItem:      (id: string) => Promise<void>;
  saveInventoryItem:   (item: InventoryItemUpdate) => Promise<void>;
  adjustInventoryStock: (input: { inventoryId: string; countedStock: number; reason: string; note?: string | null }) => Promise<InventoryItem>;
  deleteInventoryItem: (id: string) => Promise<void>;
  saveStockUnitConversion: (conversion: Partial<StockUnitConversion> & { from_unit: string; to_unit: string; ratio: number }) => Promise<StockUnitConversion>;
  deleteStockUnitConversion: (id: string) => Promise<void>;
  commitStockBulkImportRows: (mode: BulkImportMode, rows: BulkImportRow[]) => Promise<{
    success: boolean;
    summary: BulkImportPreview['summary'];
    committed: BulkImportPreview['summary'];
  }>;
  saveTransaction:     (tx: Omit<Transaction, 'store_id'>) => Promise<Transaction>;
  voidTransaction:     (id: string, reason: string, by: string) => Promise<Transaction>;
  updateKitchenOrder:   (id: string, status: KitchenOrderStatus, reason?: string | null) => Promise<KitchenOrder>;
  updateKitchenItem:    (id: string, status: KitchenOrderStatus) => Promise<KitchenOrder>;
  saveExpense:         (exp: Partial<Expense>) => Promise<void>;
  deleteExpense:       (id: string) => Promise<void>;
  saveCashFlow:        (entry: Partial<CashFlowEntry>) => Promise<void>;
  saveCashRegister:    (entry: Partial<CashRegister>) => Promise<void>;
  updateCashRegister:  (id: string, entry: Partial<CashRegister>) => Promise<void>;
  saveStoreSettings:   (settings: Partial<StoreSettings>) => Promise<void>;
  saveCustomCats:      (cats: string[]) => void;
  flushPending:        () => Promise<void>;
  resetState:          () => void;
}

const initialState: Pick<
  AppStore,
  'storeId' | 'storeSettings' | 'menu' | 'inventory' | 'unitConversions' | 'transactions' | 'kitchenOrders' | 'kitchenRealtimeStatus' | 'expenses' | 'cashFlow' | 'cashRegister' | 'activeChallenges' | 'challengeProgress' | 'customCats' | 'cart' | 'discount' | 'loading' | 'syncing' | 'syncStatus' | 'pendingSyncCount' | 'failedSyncCount' | 'appTheme' | 'customTheme'
> = {
  storeId: null,
  storeSettings: null,
  menu: [],
  inventory: [],
  unitConversions: [],
  transactions: [],
  kitchenOrders: [],
  kitchenRealtimeStatus: 'idle',
  expenses: [],
  cashFlow: [],
  cashRegister: [],
  activeChallenges: [],
  challengeProgress: [],
  customCats: [],
  cart: [],
  discount: '',
  loading: false,
  syncing: false,
  syncStatus: 'online',
  pendingSyncCount: 0,
  failedSyncCount: 0,
  ...getPersistedThemeState(),
};

const loadAllPromises = new Map<string, Promise<void>>();
let kitchenRealtimeCleanup: (() => void) | null = null;
let kitchenReconnectTimer: ReturnType<typeof setTimeout> | null = null;
const seenKitchenEventIds = new Set<string>();
const activeFlushStores = new Set<string>();

export const useStore = create<AppStore>((set, get) => ({
  ...initialState,
  isOnline:     typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncStatus:   typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',

  setStoreId: (id) => set({ storeId: id }),

  setAppTheme: (theme) => {
    const { customTheme } = get();
    if (typeof window !== 'undefined') localStorage.setItem('kpos_app_theme', theme);
    applyThemeToDocument(theme, customTheme);
    set({ appTheme: theme });
  },

  setCustomTheme: (theme) => {
    const nextTheme = { ...get().customTheme, ...theme };
    if (typeof window !== 'undefined') {
      localStorage.setItem('kpos_app_theme_custom', JSON.stringify(nextTheme));
    }
    if (get().appTheme === 'custom') {
      applyThemeToDocument('custom', nextTheme);
    }
    set({ customTheme: nextTheme });
  },

  cleanup: () => {
    if (kitchenRealtimeCleanup) {
      kitchenRealtimeCleanup();
      kitchenRealtimeCleanup = null;
    }
    if (kitchenReconnectTimer) {
      clearTimeout(kitchenReconnectTimer);
      kitchenReconnectTimer = null;
    }
    seenKitchenEventIds.clear();
  },

  resetState: () => {
    get().cleanup();
    recentlyInserted.clear();
    clearSessionStorage();
    clearIndexedDbCache();
    loadAllPromises.clear();
    set({
      ...initialState,
      ...getPersistedThemeState(),
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      syncStatus: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',
    });
  },

  loadAll: async (storeId: string) => {
    const existingLoad = loadAllPromises.get(storeId);
    if (existingLoad) {
      return existingLoad;
    }

    const run = (async () => {
      const cache = loadCache(storeId);
      const challengeCache = loadChallengesFromLS(storeId);
      const { cart: cachedCart, discount: cachedDiscount } = loadCheckoutDraft(storeId);

    if (cache.settings || cache.menu.length > 0) {
      const stdCats = ['Coffee', 'Non-Coffee', 'Snack'];
      const cats = [...new Set(cache.menu.map((m: MenuItem) => m.category))].filter((c: string | null) => c && !stdCats.includes(c)) as string[];
      set({
        storeId,
        storeSettings: cache.settings || null,
        menu:          cache.menu,
        inventory:     cache.inv,
        unitConversions: cache.unitConversions,
        transactions:  cache.trx,
        kitchenOrders: sortKitchenOrders(cache.kitchen),
        expenses:      cache.expenses,
        cashFlow:      cache.cashFlow,
        cashRegister:  cache.cashReg,
        activeChallenges: challengeCache.challenges,
        challengeProgress: challengeCache.progress,
        customCats:    cats,
        loading:       false,
        cart:          cachedCart,
        discount:      cachedDiscount,
      });
    } else {
      set({ storeId, loading: true, cart: cachedCart, discount: cachedDiscount });
    }

    try {
      const [storesResponse, menuResponse, inventoryResponse, conversionResponse] = await Promise.all([
        getStores(storeId),
        getMenuItems(storeId),
        getInventory(storeId),
        getStockUnitConversions(storeId),
      ]);

      const store = storesResponse.items[0];
      if (!store) throw new Error('Store tidak ditemukan');

      const menuData = (menuResponse.items || []) as MenuItem[];
      const invData  = (inventoryResponse.items  || []) as InventoryItem[];
      const conversionData = (conversionResponse.items || []) as StockUnitConversion[];
      const stdCats  = ['Coffee', 'Non-Coffee', 'Snack'];
      const freshCats = [...new Set(menuData.map(m => m.category))].filter(c => c && !stdCats.includes(c));
      const freshSettings = (store as StoreSettings) || cache.settings;
      if (freshSettings) saveSettingsToLS(storeId, freshSettings);

      set(s => ({
        storeId,
        storeSettings: freshSettings,
        menu:       menuData,
        inventory:  invData,
        unitConversions: conversionData,
        customCats: freshCats,
        loading:    false,
        transactions: s.transactions,
        kitchenOrders: s.kitchenOrders,
      }));

      persistCache(
        storeId,
        menuData,
        invData,
        get().transactions,
        get().expenses,
        get().cashFlow,
        get().cashRegister,
        conversionData,
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
        const [trx, kitchen, exp, cf, cr, challengeResponse] = await Promise.all([
          getTransactions(storeId),
          getKitchenOrders(storeId),
          getExpenses(storeId),
          getCashFlow(storeId),
          getCashRegister(storeId),
          getMyChallengeProgress(storeId),
        ]);

        const trxData = mergeById((trx.items || []) as Transaction[], get().transactions);
        const kitchenData = sortKitchenOrders((kitchen.items || []) as KitchenOrder[]);
        const expData = mergeById((exp.items || []) as Expense[], get().expenses);
        const cfData = mergeById((cf.items || []) as CashFlowEntry[], get().cashFlow);
        const crData = mergeById((cr.items || []) as CashRegister[], get().cashRegister);
        set({
          transactions: trxData,
          kitchenOrders: kitchenData,
          expenses:     expData,
          cashFlow:     cfData,
          cashRegister: crData,
          activeChallenges: challengeResponse.challenges || [],
          challengeProgress: challengeResponse.items || [],
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
        saveKitchenToLS(storeId, kitchenData);
        saveChallengesToLS(storeId, challengeResponse.challenges || [], challengeResponse.items || []);
        get().connectKitchenRealtime(storeId);
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

  loadKitchenOrders: async (storeIdArg) => {
    const storeId = storeIdArg || get().storeId;
    if (!storeId) return;
    try {
      const response = await getKitchenOrders(storeId);
      const orders = sortKitchenOrders((response.items || []) as KitchenOrder[]);
      set({ kitchenOrders: orders });
      saveKitchenToLS(storeId, orders);
    } catch (error) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        set({ kitchenRealtimeStatus: 'offline' });
        return;
      }
      set({ kitchenRealtimeStatus: 'error' });
      throw error;
    }
  },

  loadChallenges: async (storeIdArg) => {
    const storeId = storeIdArg || get().storeId;
    if (!storeId) return;
    const cached = loadChallengesFromLS(storeId);
    if (cached.challenges.length > 0) {
      set({ activeChallenges: cached.challenges, challengeProgress: cached.progress });
    }
    try {
      const response = await getMyChallengeProgress(storeId);
      set({
        activeChallenges: response.challenges || [],
        challengeProgress: response.items || [],
      });
      saveChallengesToLS(storeId, response.challenges || [], response.items || []);
    } catch (error) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      throw error;
    }
  },

  connectKitchenRealtime: (storeIdArg) => {
    const storeId = storeIdArg || get().storeId;
    if (!storeId) return;
    if (kitchenRealtimeCleanup) return;

    kitchenRealtimeCleanup = subscribeKitchenEvents({
      storeId,
      onStatus: (status) => set({ kitchenRealtimeStatus: status }),
      onEvent: (event) => get().applyKitchenEvent(event),
      onError: () => {
        get().loadKitchenOrders(storeId).catch(() => {});
      },
    });
  },

  applyKitchenEvent: (event) => {
    const storeId = get().storeId;
    if (!storeId || event.store_id !== storeId) return;
    if (seenKitchenEventIds.has(event.id)) return;
    seenKitchenEventIds.add(event.id);
    if (seenKitchenEventIds.size > 500) {
      const oldest = seenKitchenEventIds.values().next().value;
      if (oldest) seenKitchenEventIds.delete(oldest);
    }

    if (event.type === 'snapshot_required') {
      get().loadKitchenOrders(storeId).catch(() => {});
      return;
    }

    const order = event.payload?.order || null;
    if (!order) {
      get().loadKitchenOrders(storeId).catch(() => {});
      return;
    }

    set((state) => {
      const nextOrders = mergeKitchenOrder(state.kitchenOrders, order);
      saveKitchenToLS(storeId, nextOrders);
      return { kitchenOrders: nextOrders };
    });
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

  setCartItemNote: (id, note) => set(s => {
    const nextCart = s.cart.map(c => c.id === id ? { ...c, note } : c);
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
      throw new Error(normalizeUserFacingError(e, 'Menu belum bisa disimpan. Periksa kembali data menu.'));
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
    const baseUnit = item.unit || 'pcs';
    const purchaseUnit = item.purchaseUnit || baseUnit;
    const conversionRatio = typeof item.conversionRatio === 'string'
      ? parseFloat(item.conversionRatio)
      : (item.conversionRatio || 1);

    if (qty < 0 || totalCost < 0 || minStock < 0 || unitCost < 0) {
      throw new Error('Qty, biaya, dan stok minimum tidak boleh negatif.');
    }

    if (item.type === 'new') {
      const tempId = makeClientId('inv');
      const optimistic: InventoryItem = {
        id: tempId, store_id: storeId,
        name: item.name, stock: qty,
        unit: baseUnit,
        sku: item.sku || null,
        base_unit: baseUnit,
        purchase_unit: purchaseUnit,
        conversion_ratio: conversionRatio,
        is_active: item.isActive ?? true,
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
          sku: item.sku || null,
          unit: baseUnit,
          base_unit: baseUnit,
          purchase_unit: purchaseUnit,
          conversion_ratio: conversionRatio,
          min_stock: minStock,
          cost_per_unit: unitCost,
          is_active: item.isActive ?? true,
        });
      } catch {
        addPendingWrite(storeId, {
          table: 'inventory',
          op: 'insert',
          data: {
            id: tempId,
            store_id: storeId, name: item.name, stock: qty,
            sku: item.sku || null,
            unit: baseUnit,
            base_unit: baseUnit,
            purchase_unit: purchaseUnit,
            conversion_ratio: conversionRatio,
            min_stock: minStock,
            cost_per_unit: unitCost,
            is_active: item.isActive ?? true,
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
        ? {
            ...i,
            name: item.name,
            stock: qty,
            unit: item.unit || i.unit,
            sku: item.sku ?? i.sku ?? null,
            base_unit: item.unit || i.base_unit || i.unit,
            purchase_unit: item.purchaseUnit || i.purchase_unit || item.unit || i.unit,
            conversion_ratio: conversionRatio || i.conversion_ratio || 1,
            is_active: item.isActive ?? i.is_active ?? true,
            min_stock: minStock,
            cost_per_unit: newCost,
          }
        : i
      )}));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      try {
        await updateInventoryItem(item.id!, {
          name: item.name,
          stock: qty,
          sku: item.sku,
          unit: item.unit,
          base_unit: item.unit,
          purchase_unit: item.purchaseUnit,
          conversion_ratio: conversionRatio || undefined,
          is_active: item.isActive,
          min_stock: minStock,
          cost_per_unit: newCost,
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

  adjustInventoryStock: async ({ inventoryId, countedStock, reason, note }) => {
    const { storeId, inventory, isOnline } = get();
    if (!storeId) throw new Error('Store belum dimuat.');
    if (!isOnline) {
      throw new Error('Opname stok membutuhkan koneksi internet agar stok fisik dan sistem tetap sinkron.');
    }
    if (!Number.isFinite(countedStock) || countedStock < 0) {
      throw new Error('Jumlah stok hasil opname tidak boleh negatif.');
    }
    const existing = inventory.find((item) => item.id === inventoryId);
    if (!existing) {
      throw new Error('Bahan baku tidak ditemukan. Muat ulang halaman lalu coba lagi.');
    }

    const updated = await createInventoryAdjustment({
      store_id: storeId,
      inventory_id: inventoryId,
      counted_stock: countedStock,
      reason,
      note: note ?? null,
    });
    set(s => ({ inventory: s.inventory.map(item => item.id === inventoryId ? updated : item) }));
    persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister, get().unitConversions);
    return updated;
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

  saveStockUnitConversion: async (conversion) => {
    const { storeId } = get();
    if (!storeId) throw new Error('Store belum dimuat.');
    if (conversion.ratio <= 0) throw new Error('Rasio konversi harus lebih dari 0.');

    const id = conversion.id || makeClientId('conv');
    const optimistic: StockUnitConversion = {
      id,
      store_id: storeId,
      ingredient_id: conversion.ingredient_id ?? null,
      from_unit: conversion.from_unit,
      to_unit: conversion.to_unit,
      ratio: conversion.ratio,
      is_active: conversion.is_active ?? true,
      ...(conversion.created_at ? { created_at: conversion.created_at } : {}),
      ...(conversion.updated_at ? { updated_at: conversion.updated_at } : {}),
    };
    const existing = get().unitConversions.find((entry) => entry.id === id);

    set(s => ({
      unitConversions: s.unitConversions.some(entry => entry.id === id)
        ? s.unitConversions.map(entry => entry.id === id ? { ...entry, ...optimistic } : entry)
        : [...s.unitConversions, optimistic],
    }));
    persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister, get().unitConversions);

    try {
      const payload = {
        id,
        store_id: storeId,
        ingredient_id: optimistic.ingredient_id,
        from_unit: optimistic.from_unit,
        to_unit: optimistic.to_unit,
        ratio: optimistic.ratio,
        is_active: optimistic.is_active,
      };
      const saved = existing
        ? await updateStockUnitConversion(id, payload)
        : await createStockUnitConversion(payload);
      set(s => ({
        unitConversions: s.unitConversions.map(entry => entry.id === id ? saved : entry),
      }));
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister, get().unitConversions);
      return saved;
    } catch (error) {
      addPendingWrite(storeId, {
        table: 'inventory_unit_conversions',
        op: existing ? 'update' : 'insert',
        id,
        data: {
          id,
          store_id: storeId,
          ingredient_id: optimistic.ingredient_id,
          from_unit: optimistic.from_unit,
          to_unit: optimistic.to_unit,
          ratio: optimistic.ratio,
          is_active: optimistic.is_active,
        },
      });
      import('@/utils/toast').then(m => m.showToast('Konversi disimpan offline dan akan disinkronkan otomatis', 'success'));
      return optimistic;
    }
  },

  deleteStockUnitConversion: async (id) => {
    const { storeId } = get();
    if (!storeId) return;
    const existing = get().unitConversions.find((entry) => entry.id === id);
    set(s => ({ unitConversions: s.unitConversions.filter(entry => entry.id !== id) }));
    persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister, get().unitConversions);
    try {
      await deleteStockUnitConversion(id);
    } catch {
      if (existing) {
        set(s => ({ unitConversions: [...s.unitConversions, existing] }));
        persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister, get().unitConversions);
      }
      addPendingWrite(storeId, { table: 'inventory_unit_conversions', op: 'delete', id, data: {} });
    }
  },

  commitStockBulkImportRows: async (mode, rows) => {
    const { storeId, isOnline } = get();
    if (!storeId) throw new Error('Store belum dimuat.');
    if (!isOnline) {
      throw new Error('Import bulk membutuhkan koneksi internet agar data produk, bahan, resep, dan stok tersimpan utuh.');
    }

    const result = await commitStockBulkImport({
      store_id: storeId,
      mode,
      rows,
    });
    await get().loadAll(storeId);
    return result;
  },

  saveTransaction: async (tx) => {
    const { storeId, isOnline } = get();
    if (!storeId) throw new Error('Store belum dimuat.');
    if (!isOnline && !canProcessPosPaymentOffline(tx.method)) {
      throw new Error(getOfflinePaymentBlockedMessage(tx.method));
    }
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

    const queueOfflineTransaction = async (error?: unknown) => {
      if (!canProcessPosPaymentOffline(normalizedTx.method)) {
        throw error instanceof Error ? error : new Error('Metode pembayaran ini membutuhkan koneksi internet.');
      }
      const offlineTx = {
        ...normalizedTx,
        store_id: storeId,
        sync_status: 'pending' as const,
        sync_error: null,
        local_only: true,
      } satisfies Transaction;
      markInserted(offlineTx.id);
      set(s => ({
        transactions: s.transactions.some(t => t.id === offlineTx.id)
          ? s.transactions.map(t => t.id === offlineTx.id ? offlineTx : t)
          : [offlineTx, ...s.transactions],
      }));
      await enqueueOfflineOperation(storeId, {
        operation: 'transaction.create',
        payload: {
          ...normalizedTx,
          store_id: storeId,
        },
        idempotencyKey: `transaction:${normalizedTx.id}`,
        createdAt: normalizedTx.created_at,
      });
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      await updateSyncIndicators(storeId);
      return offlineTx;
    };

    if (!isOnline) {
      return queueOfflineTransaction();
    }

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
      void trackOpsEvent({
        event_name: 'transaction_created',
        status: 'success',
        store_id: storeId,
        transaction_id: savedTx.id,
        metadata: { total: savedTx.total, method: savedTx.method, source: 'pos_checkout' },
      });
      trackAnalyticsEvent('transaction_created', {
        store_id: storeId,
        transaction_id: savedTx.id,
        value: savedTx.total,
        payment_method: savedTx.method,
      });
      markInserted(savedTx.id);
      set(s => ({
        transactions: s.transactions.some(t => t.id === savedTx.id)
          ? s.transactions.map(t => t.id === savedTx.id ? savedTx : t)
          : [savedTx, ...s.transactions]
      }));
      if (savedTx.kitchen_order) {
        set(s => {
          const nextOrders = mergeKitchenOrder(s.kitchenOrders, savedTx.kitchen_order as KitchenOrder);
          saveKitchenToLS(storeId, nextOrders);
          return { kitchenOrders: nextOrders };
        });
      }
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      await get().loadChallenges(storeId).catch(() => {});
      await get().loadAll(storeId);
      return savedTx;
    } catch (error: any) {
      if (!(error instanceof ApiError)) {
        return queueOfflineTransaction(error);
      }
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
      if (voidedTx.kitchen_order) {
        set(s => {
          const nextOrders = mergeKitchenOrder(s.kitchenOrders, voidedTx.kitchen_order as KitchenOrder);
          saveKitchenToLS(storeId, nextOrders);
          return { kitchenOrders: nextOrders };
        });
      }
      persistCache(storeId, get().menu, get().inventory, get().transactions, get().expenses, get().cashFlow, get().cashRegister);
      await get().loadAll(storeId);
      return voidedTx;
    } catch (e:any) {
      const msg = e?.message || 'Gagal membatalkan transaksi';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      throw e;
    }
  },

  updateKitchenOrder: async (id, status, reason) => {
    const storeId = get().storeId;
    if (!storeId) throw new Error('Store belum dimuat.');
    if (!get().isOnline) {
      let optimisticOrder: KitchenOrder | null = null;
      set(s => {
        const nextOrders = s.kitchenOrders.map((order) => {
          if (order.id !== id) return order;
          optimisticOrder = {
            ...order,
            overall_status: status,
            status_version: (order.status_version || 0) + 1,
            updated_at: new Date().toISOString(),
          };
          return optimisticOrder;
        });
        saveKitchenToLS(storeId, nextOrders);
        return { kitchenOrders: nextOrders };
      });
      await enqueueOfflineOperation(storeId, {
        operation: 'kitchen.order.update',
        payload: { id, store_id: storeId, status, reason: reason ?? null },
        idempotencyKey: `kitchen-order:${id}:${status}:${Date.now()}`,
      });
      await updateSyncIndicators(storeId);
      if (optimisticOrder) return optimisticOrder;
      throw new Error('Order dapur tidak ditemukan.');
    }
    const data = await updateKitchenOrderStatus(id, {
      store_id: storeId,
      status,
      reason: reason ?? null,
    });
    const order = data as KitchenOrder;
    set(s => {
      const nextOrders = mergeKitchenOrder(s.kitchenOrders, order);
      saveKitchenToLS(storeId, nextOrders);
      return { kitchenOrders: nextOrders };
    });
    return order;
  },

  updateKitchenItem: async (id, status) => {
    const storeId = get().storeId;
    if (!storeId) throw new Error('Store belum dimuat.');
    if (!get().isOnline) {
      let optimisticOrder: KitchenOrder | null = null;
      set(s => {
        const nextOrders = s.kitchenOrders.map((order) => {
          const hasItem = order.items.some((item) => item.id === id);
          if (!hasItem) return order;
          optimisticOrder = {
            ...order,
            status_version: (order.status_version || 0) + 1,
            updated_at: new Date().toISOString(),
            items: order.items.map((item) => item.id === id
              ? { ...item, item_status: status, status_version: (item.status_version || 0) + 1, updated_at: new Date().toISOString() }
              : item),
          };
          return optimisticOrder;
        });
        saveKitchenToLS(storeId, nextOrders);
        return { kitchenOrders: nextOrders };
      });
      await enqueueOfflineOperation(storeId, {
        operation: 'kitchen.item.update',
        payload: { id, store_id: storeId, status },
        idempotencyKey: `kitchen-item:${id}:${status}:${Date.now()}`,
      });
      await updateSyncIndicators(storeId);
      if (optimisticOrder) return optimisticOrder;
      throw new Error('Item dapur tidak ditemukan.');
    }
    const data = await updateKitchenItemStatus(id, {
      store_id: storeId,
      status,
    });
    const order = data as KitchenOrder;
    set(s => {
      const nextOrders = mergeKitchenOrder(s.kitchenOrders, order);
      saveKitchenToLS(storeId, nextOrders);
      return { kitchenOrders: nextOrders };
    });
    return order;
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
        await enqueueOfflineOperation(storeId, {
          operation: 'store.settings.update',
          payload: toSave as Record<string, unknown>,
          idempotencyKey: `store-settings:${storeId}`,
        });
        await updateSyncIndicators(storeId);
        import('@/utils/toast').then(m => m.showToast('Pengaturan disimpan offline dan akan disinkronkan otomatis', 'success'));
      }
    } catch (e:any) {
      const msg = e?.message || 'Gagal menyimpan pengaturan toko';
      import('@/utils/toast').then(m => m.showToast(msg, 'error'));
      throw e;
    }
  },

  saveCustomCats: (cats) => set({ customCats: cats }),
  flushPending: () => flushPending(),
}));
