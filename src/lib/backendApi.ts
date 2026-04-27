import { Capacitor } from '@capacitor/core';
import { getStoredAccessToken } from '@/lib/authSession';
import type {
  CashFlowEntry,
  CashRegister,
  Expense,
  InventoryItem,
  KitchenOrder,
  KitchenOrderStatus,
  KitchenRealtimeEvent,
  KitchenRealtimeStatus,
  KitchenStation,
  MenuItem,
  StoreSettings,
  Transaction,
} from '@/types';
import type { SubscriptionBillingQuote, SubscriptionPaymentMethod, SubscriptionPaymentMethodId } from '@/lib/subscriptionBilling';

const API_DEFAULT_PROD_ORIGIN = 'https://api.kaffepos.my.id';
const EXPLICIT_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

type RequestInitWithJson = RequestInit & {
  auth?: boolean;
  body?: BodyInit | null;
  json?: Record<string, unknown> | null;
};

type ApiListResponse<T> = { items: T[] };
type ApiRecord = Record<string, unknown>;

export type SystemStatusResponse = {
  ok: boolean;
  service: string;
  version: string;
  env: string;
  time: string;
  checks: {
    backend: { ok: boolean };
    database: { ok: boolean; latencyMs?: number | null };
    email: { ok: boolean; provider: string; fromEmail: string | null };
    payment: {
      ok: boolean;
      commerciallyReady?: boolean;
      provider: string;
      environment: string;
      merchantId: string | null;
    };
  };
  syncMatrix: Record<string, boolean>;
  readiness: Record<string, number>;
  warnings?: string[];
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
}

export function resolveApiBaseUrl() {
  if (EXPLICIT_API_BASE_URL) {
    return EXPLICIT_API_BASE_URL;
  }

  if (typeof window === 'undefined') {
    return '';
  }

  if (Capacitor.isNativePlatform()) {
    return API_DEFAULT_PROD_ORIGIN;
  }

  const { hostname } = window.location;
  if (isLocalHostname(hostname)) {
    return '';
  }

  if (hostname === 'kaffepos.my.id' || hostname.endsWith('.kaffepos.my.id')) {
    return API_DEFAULT_PROD_ORIGIN;
  }

  return '';
}

export function buildApiUrl(path: string) {
  const apiBaseUrl = resolveApiBaseUrl();
  if (!apiBaseUrl) return path;
  return `${apiBaseUrl}${path}`;
}

async function getAccessToken() {
  return getStoredAccessToken();
}

async function readErrorMessage(response: Response) {
  try {
    const data = await response.json() as { message?: string };
    return data.message || `Request gagal (${response.status})`;
  } catch {
    return `Request gagal (${response.status})`;
  }
}

export async function apiFetch<T>(path: string, init: RequestInitWithJson = {}): Promise<T> {
  const { auth = true, json = null, ...requestInit } = init;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  if (json) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth) {
    const token = await getAccessToken();
    if (!token) {
      throw new ApiError('Sesi login tidak ditemukan.', 401);
    }
    headers.set('Authorization', `Bearer ${token}`);
  }

  const body = json ? JSON.stringify(json) : (requestInit.body ?? null);

  const response = await fetch(buildApiUrl(path), {
    ...requestInit,
    headers,
    body,
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export type AuthSessionResponse = {
  accessToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string | null;
    email_verified_at?: string | null;
    user_metadata?: Record<string, unknown> | null;
  };
  profile: ProfileResponse;
};

export const loginRequest = (payload: { email: string; password: string }) =>
  apiFetch<AuthSessionResponse>('/api/auth/login', {
    method: 'POST',
    auth: false,
    json: payload,
  });

export const registerRequest = (payload: { email: string; password: string; username: string }) =>
  apiFetch<{ success: boolean; needsVerification: boolean; message: string }>('/api/auth/register', {
    method: 'POST',
    auth: false,
    json: payload,
  });

export const resendVerificationRequest = (payload: { email: string }) =>
  apiFetch<{ success: boolean; message: string }>('/api/auth/verification/resend', {
    method: 'POST',
    auth: false,
    json: payload,
  });

export const verifyEmailCodeRequest = (payload: { email: string; code: string }) =>
  apiFetch<{ success: boolean; message: string }>('/api/auth/verification/confirm', {
    method: 'POST',
    auth: false,
    json: payload,
  });

export const forgotPasswordRequest = (payload: { email: string }) =>
  apiFetch<{ success: boolean; message: string }>('/api/auth/password/forgot', {
    method: 'POST',
    auth: false,
    json: payload,
  });

export const resetPasswordRequest = (payload: { email: string; token: string; password: string }) =>
  apiFetch<{ success: boolean; message: string }>('/api/auth/password/reset', {
    method: 'POST',
    auth: false,
    json: payload,
  });

export const getAuthSession = () => apiFetch<{ user: AuthSessionResponse['user']; profile: ProfileResponse; sessionExpiresAt: string }>('/api/auth/session');
export const logoutRequest = () => apiFetch<{ success: boolean }>('/api/auth/logout', {
  method: 'POST',
  json: {},
});
export const getSystemStatus = () => apiFetch<SystemStatusResponse>('/system-status', { auth: false });

export type ProfileResponse = {
  id: string;
  username?: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
  tier?: string;
  tier_expires_at?: string | null;
  is_pro?: boolean;
  pro_plan?: string | null;
  pro_order_id?: string | null;
  pro_activated_at?: string | null;
  pro_expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StoreResponse = StoreSettings & ApiRecord;
export type SubscriptionRecord = {
  id: string;
  plan: string;
  billing_cycle: string;
  status: string;
  activated_at: string;
  expires_at: string | null;
  payment_amount: number | null;
} & ApiRecord;

export type PaymentHistoryRecord = {
  id: string;
  plan: string;
  billing_cycle: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  status: string;
  payment_note: string | null;
} & ApiRecord;

export type PendingPaymentRecord = {
  id: string;
  plan: string;
  billing_cycle: string;
  amount: number;
  redirect_url: string | null;
  transaction_status: string;
  expires_at: string | null;
  created_at: string;
} & ApiRecord;

export type AdminProfileResponse = {
  id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
} & ApiRecord;

export type AdminSubscriptionRecord = SubscriptionRecord & {
  user_id: string;
};

export type AdminPaymentHistoryRecord = PaymentHistoryRecord & {
  user_id: string;
};
export type SubscriptionPaymentSession = {
  redirect_url?: string;
  token?: string;
  order_id?: string;
  status?: string;
} & ApiRecord;

export const getProfileMe = () => apiFetch<ProfileResponse>('/api/profile/me');
export const updateProfileMe = (payload: Record<string, unknown>) =>
  apiFetch<ProfileResponse>('/api/profile/me', { method: 'PATCH', json: payload });

export const getStores = (storeId?: string) =>
  apiFetch<ApiListResponse<StoreResponse>>(`/api/stores${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`);
export const createStore = (payload: { store_name?: string }) =>
  apiFetch<StoreResponse>('/api/stores', { method: 'POST', json: payload });
export const updateStore = (storeId: string, payload: Record<string, unknown>) =>
  apiFetch<StoreResponse>(`/api/stores/${storeId}`, { method: 'PATCH', json: payload });

export const getMenuItems = (storeId: string) =>
  apiFetch<ApiListResponse<MenuItem>>(`/api/menu-items?storeId=${encodeURIComponent(storeId)}`);
export const createMenuItem = (payload: Record<string, unknown>) =>
  apiFetch<MenuItem>('/api/menu-items', { method: 'POST', json: payload });
export const updateMenuItem = (id: string, payload: Record<string, unknown>) =>
  apiFetch<MenuItem>(`/api/menu-items/${id}`, { method: 'PATCH', json: payload });
export const removeMenuItem = (id: string) =>
  apiFetch<{ success: boolean }>(`/api/menu-items/${id}`, { method: 'DELETE' });

export const getInventory = (storeId: string) =>
  apiFetch<ApiListResponse<InventoryItem>>(`/api/inventory?storeId=${encodeURIComponent(storeId)}`);
export const createInventoryItem = (payload: Record<string, unknown>) =>
  apiFetch<InventoryItem>('/api/inventory', { method: 'POST', json: payload });
export const updateInventoryItem = (id: string, payload: Record<string, unknown>) =>
  apiFetch<InventoryItem>(`/api/inventory/${id}`, { method: 'PATCH', json: payload });
export const removeInventoryItem = (id: string) =>
  apiFetch<{ success: boolean }>(`/api/inventory/${id}`, { method: 'DELETE' });

export const getExpenses = (storeId: string) =>
  apiFetch<ApiListResponse<Expense>>(`/api/expenses?storeId=${encodeURIComponent(storeId)}`);
export const createExpense = (payload: Record<string, unknown>) =>
  apiFetch<Expense>('/api/expenses', { method: 'POST', json: payload });
export const removeExpense = (id: string) =>
  apiFetch<{ success: boolean }>(`/api/expenses/${id}`, { method: 'DELETE' });

export const getCashFlow = (storeId: string) =>
  apiFetch<ApiListResponse<CashFlowEntry>>(`/api/cash-flow?storeId=${encodeURIComponent(storeId)}`);
export const createCashFlow = (payload: Record<string, unknown>) =>
  apiFetch<CashFlowEntry>('/api/cash-flow', { method: 'POST', json: payload });

export const getCashRegister = (storeId: string) =>
  apiFetch<ApiListResponse<CashRegister>>(`/api/cash-register?storeId=${encodeURIComponent(storeId)}`);
export const createCashRegister = (payload: Record<string, unknown>) =>
  apiFetch<CashRegister>('/api/cash-register', { method: 'POST', json: payload });
export const updateCashRegisterEntry = (id: string, payload: Record<string, unknown>) =>
  apiFetch<CashRegister>(`/api/cash-register/${id}`, { method: 'PATCH', json: payload });

export type SubscriptionPaymentConfig = {
  mode: 'manual' | 'disabled' | 'midtrans_sandbox' | 'midtrans_production';
  provider: string;
  midtransEnvironment: 'sandbox' | 'production';
  onlinePaymentAvailable: boolean;
  manualActivationAvailable: boolean;
  commerciallyReady: boolean;
  message: string;
  recommendedAction: string;
};

export const getSubscriptions = () =>
  apiFetch<{
    currentSubscription: SubscriptionRecord | null;
    subscriptions: SubscriptionRecord[];
    paymentHistory: PaymentHistoryRecord[];
    pendingPayments: PendingPaymentRecord[];
    paymentConfig?: SubscriptionPaymentConfig;
  }>('/api/subscriptions');

export const createSubscriptionPayment = (payload: {
  plan: 'kopi_susu' | 'signature' | 'founder';
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  paymentMethod: SubscriptionPaymentMethodId;
  voucherCode?: string | null;
}) => apiFetch<{ reused: boolean; payment: SubscriptionPaymentSession; quote: SubscriptionBillingQuote }>('/api/subscriptions/payments/create', {
  method: 'POST',
  json: payload,
});

export const getSubscriptionPaymentQuote = (payload: {
  plan: 'kopi_susu' | 'signature' | 'founder';
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  paymentMethod: SubscriptionPaymentMethodId;
  voucherCode?: string | null;
}) => apiFetch<{ quote: SubscriptionBillingQuote; paymentMethods: SubscriptionPaymentMethod[]; paymentConfig?: SubscriptionPaymentConfig }>('/api/subscriptions/payments/quote', {
  method: 'POST',
  json: payload,
});

export const trackOpsEventRequest = (payload: {
  event_name: 'login' | 'checkout';
  status: 'success' | 'failure';
  email?: string;
  store_id?: string;
  transaction_id?: string;
  error_message?: string;
  metadata?: Record<string, unknown>;
}) => apiFetch<{ success: boolean }>('/api/ops/events', {
  method: 'POST',
  json: payload,
});

export const requestAiInsight = (payload: { prompt: string }) =>
  apiFetch<{
    summary: string;
    bestMenu: string;
    stockAlert: string;
    prediction: string;
    tips: string[];
  }>('/api/ai-insight', {
    method: 'POST',
    json: payload,
  });

export const getAdminSubscriptionOverview = () =>
  apiFetch<{ profiles: AdminProfileResponse[]; subscriptions: AdminSubscriptionRecord[]; paymentHistory: AdminPaymentHistoryRecord[] }>('/api/admin/subscriptions/overview');
export const activateAdminSubscription = (payload: {
  userId: string;
  plan: string;
  billingCycle: string;
  paymentAmount: number;
  paymentNote?: string;
}) => apiFetch<{ success: boolean; subscription: SubscriptionRecord; message: string }>('/api/admin/subscriptions/activate', {
  method: 'POST',
  json: payload,
});
export const cancelAdminSubscription = (id: string) =>
  apiFetch<{ success: boolean; subscription: SubscriptionRecord; message: string }>(`/api/admin/subscriptions/${id}/cancel`, {
    method: 'POST',
    json: {},
  });

export const getNotifications = (limit = 20) =>
  apiFetch<{ items: ApiRecord[]; unreadCount: number }>(`/api/notifications?limit=${limit}`);
export const markAllNotificationsRead = () =>
  apiFetch<{ updated: number }>('/api/notifications/read-all', { method: 'PATCH', json: {} });

export const getTransactions = (storeId: string) =>
  apiFetch<ApiListResponse<Transaction>>(`/api/transactions?storeId=${encodeURIComponent(storeId)}`);
export const checkoutTransaction = (payload: Record<string, unknown>) =>
  apiFetch<Transaction>('/api/transactions/checkout', { method: 'POST', json: payload });
export const voidTransactionRequest = (
  id: string,
  payload: { store_id: string; reason?: string; void_by?: string },
) => apiFetch<Transaction>(`/api/transactions/${id}/void`, { method: 'POST', json: payload });

export const getKitchenOrders = (storeId: string, filters?: { status?: KitchenOrderStatus; station?: KitchenStation | 'all' }) => {
  const params = new URLSearchParams({ storeId });
  if (filters?.status) params.set('status', filters.status);
  if (filters?.station && filters.station !== 'all') params.set('station', filters.station);
  return apiFetch<{ items: KitchenOrder[] }>(`/api/kitchen/orders?${params.toString()}`);
};

export const updateKitchenOrderStatus = (
  id: string,
  payload: { store_id: string; status: KitchenOrderStatus; reason?: string | null; changed_by_name?: string | null },
) => apiFetch<KitchenOrder>(`/api/kitchen/orders/${id}/status`, { method: 'PATCH', json: payload });

export const updateKitchenItemStatus = (
  id: string,
  payload: { store_id: string; status: KitchenOrderStatus; changed_by_name?: string | null },
) => apiFetch<KitchenOrder>(`/api/kitchen/items/${id}/status`, { method: 'PATCH', json: payload });

export function subscribeKitchenEvents(options: {
  storeId: string;
  onEvent: (event: KitchenRealtimeEvent) => void;
  onStatus?: (status: KitchenRealtimeStatus) => void;
  onError?: (error: unknown) => void;
}) {
  const controller = new AbortController();
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;

  const connect = async () => {
    if (stopped) return;
    options.onStatus?.(retryAttempt > 0 ? 'reconnecting' : 'connecting');
    try {
      const token = await getStoredAccessToken();
      if (!token) throw new ApiError('Sesi login tidak ditemukan.', 401);

      const response = await fetch(buildApiUrl(`/api/kitchen/events?storeId=${encodeURIComponent(options.storeId)}`), {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new ApiError(await readErrorMessage(response), response.status);
      }

      retryAttempt = 0;
      options.onStatus?.('connected');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(6)) as KitchenRealtimeEvent | { type: 'ping' };
            if (event.type === 'ping') continue;
            if ('id' in event) {
              options.onEvent(event as KitchenRealtimeEvent);
            }
          } catch {
            // Ignore malformed event chunks and wait for the next full SSE frame.
          }
        }
      }

      if (!stopped) throw new Error('Kitchen realtime terputus.');
    } catch (error) {
      if (stopped || controller.signal.aborted) return;
      retryAttempt += 1;
      options.onError?.(error);
      options.onStatus?.(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'reconnecting');
      const delay = Math.min(20_000, 1000 * 2 ** Math.min(retryAttempt, 5));
      retryTimer = setTimeout(connect, delay);
    }
  };

  void connect();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller.abort();
  };
}

export const importLocalStoragePayload = (payload: {
  store_id: string;
  store_settings?: Record<string, unknown> | null;
  menu_items?: Record<string, unknown>[];
  inventory_items?: Record<string, unknown>[];
  transactions?: Record<string, unknown>[];
  expenses?: Record<string, unknown>[];
  cash_flow?: Record<string, unknown>[];
  store_accounts?: Record<string, unknown>[];
}) => apiFetch<{
  success: boolean;
  migrated: string[];
  errors: string[];
  skipped: string[];
}>('/api/import/local-storage', {
  method: 'POST',
  json: payload,
});
