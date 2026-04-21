import { Capacitor } from '@capacitor/core';
import { getStoredAccessToken } from '@/lib/authSession';

const API_DEFAULT_PROD_ORIGIN = 'https://api.kaffepos.my.id';
const EXPLICIT_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

type RequestInitWithJson = RequestInit & {
  auth?: boolean;
  body?: BodyInit | null;
  json?: Record<string, unknown> | null;
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

function buildUrl(path: string) {
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

  const response = await fetch(buildUrl(path), {
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
export const getSystemStatus = () => apiFetch<any>('/system-status', { auth: false });

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

export const getProfileMe = () => apiFetch<ProfileResponse>('/api/profile/me');
export const updateProfileMe = (payload: Record<string, unknown>) =>
  apiFetch<ProfileResponse>('/api/profile/me', { method: 'PATCH', json: payload });

export const getStores = (storeId?: string) =>
  apiFetch<{ items: any[] }>(`/api/stores${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`);
export const createStore = (payload: { store_name?: string }) =>
  apiFetch<any>('/api/stores', { method: 'POST', json: payload });
export const updateStore = (storeId: string, payload: Record<string, unknown>) =>
  apiFetch<any>(`/api/stores/${storeId}`, { method: 'PATCH', json: payload });

export const getMenuItems = (storeId: string) =>
  apiFetch<{ items: any[] }>(`/api/menu-items?storeId=${encodeURIComponent(storeId)}`);
export const createMenuItem = (payload: Record<string, unknown>) =>
  apiFetch<any>('/api/menu-items', { method: 'POST', json: payload });
export const updateMenuItem = (id: string, payload: Record<string, unknown>) =>
  apiFetch<any>(`/api/menu-items/${id}`, { method: 'PATCH', json: payload });
export const removeMenuItem = (id: string) =>
  apiFetch<{ success: boolean }>(`/api/menu-items/${id}`, { method: 'DELETE' });

export const getInventory = (storeId: string) =>
  apiFetch<{ items: any[] }>(`/api/inventory?storeId=${encodeURIComponent(storeId)}`);
export const createInventoryItem = (payload: Record<string, unknown>) =>
  apiFetch<any>('/api/inventory', { method: 'POST', json: payload });
export const updateInventoryItem = (id: string, payload: Record<string, unknown>) =>
  apiFetch<any>(`/api/inventory/${id}`, { method: 'PATCH', json: payload });
export const removeInventoryItem = (id: string) =>
  apiFetch<{ success: boolean }>(`/api/inventory/${id}`, { method: 'DELETE' });

export const getExpenses = (storeId: string) =>
  apiFetch<{ items: any[] }>(`/api/expenses?storeId=${encodeURIComponent(storeId)}`);
export const createExpense = (payload: Record<string, unknown>) =>
  apiFetch<any>('/api/expenses', { method: 'POST', json: payload });
export const removeExpense = (id: string) =>
  apiFetch<{ success: boolean }>(`/api/expenses/${id}`, { method: 'DELETE' });

export const getCashFlow = (storeId: string) =>
  apiFetch<{ items: any[] }>(`/api/cash-flow?storeId=${encodeURIComponent(storeId)}`);
export const createCashFlow = (payload: Record<string, unknown>) =>
  apiFetch<any>('/api/cash-flow', { method: 'POST', json: payload });

export const getCashRegister = (storeId: string) =>
  apiFetch<{ items: any[] }>(`/api/cash-register?storeId=${encodeURIComponent(storeId)}`);
export const createCashRegister = (payload: Record<string, unknown>) =>
  apiFetch<any>('/api/cash-register', { method: 'POST', json: payload });
export const updateCashRegisterEntry = (id: string, payload: Record<string, unknown>) =>
  apiFetch<any>(`/api/cash-register/${id}`, { method: 'PATCH', json: payload });

export const getSubscriptions = () =>
  apiFetch<{ currentSubscription: any | null; subscriptions: any[]; paymentHistory: any[]; pendingPayments: any[] }>('/api/subscriptions');

export const createSubscriptionPayment = (payload: {
  plan: 'kopi_susu' | 'signature' | 'founder';
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
}) => apiFetch<{ reused: boolean; payment: any }>('/api/subscriptions/payments/create', {
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
  apiFetch<{ profiles: any[]; subscriptions: any[]; paymentHistory: any[] }>('/api/admin/subscriptions/overview');
export const activateAdminSubscription = (payload: {
  userId: string;
  plan: string;
  billingCycle: string;
  paymentAmount: number;
  paymentNote?: string;
}) => apiFetch<{ success: boolean; subscription: any; message: string }>('/api/admin/subscriptions/activate', {
  method: 'POST',
  json: payload,
});
export const cancelAdminSubscription = (id: string) =>
  apiFetch<{ success: boolean; subscription: any; message: string }>(`/api/admin/subscriptions/${id}/cancel`, {
    method: 'POST',
    json: {},
  });

export const getNotifications = (limit = 20) =>
  apiFetch<{ items: any[]; unreadCount: number }>(`/api/notifications?limit=${limit}`);
export const markAllNotificationsRead = () =>
  apiFetch<{ updated: number }>('/api/notifications/read-all', { method: 'PATCH', json: {} });

export const getTransactions = (storeId: string) =>
  apiFetch<{ items: any[] }>(`/api/transactions?storeId=${encodeURIComponent(storeId)}`);
export const checkoutTransaction = (payload: Record<string, unknown>) =>
  apiFetch<any>('/api/transactions/checkout', { method: 'POST', json: payload });
export const voidTransactionRequest = (
  id: string,
  payload: { store_id: string; reason?: string; void_by?: string },
) => apiFetch<any>(`/api/transactions/${id}/void`, { method: 'POST', json: payload });

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
