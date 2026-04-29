import { beforeEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  apiFetch,
  createCashier,
  createSubscriptionPayment,
  forgotPasswordRequest,
  getAuthSession,
  getCashiers,
  getKitchenOrders,
  getSubscriptionPaymentQuote,
  loginRequest,
  resetPasswordRequest,
  updateCashier,
  updateKitchenOrderStatus,
} from '@/lib/backendApi';
import { createJsonResponse, getJsonRequestBody, getRequestHeader, installFetchMock } from '@/test/helpers/api';
import { seedStoredAuthSession } from '@/test/helpers/browser';

describe('backend API contract', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps auth and email recovery endpoints public with the expected payload shape', async () => {
    const { calls } = installFetchMock(() => createJsonResponse({ success: true, message: 'ok' }));

    await forgotPasswordRequest({ email: 'owner@kaffepos.test' });
    await resetPasswordRequest({ email: 'owner@kaffepos.test', token: 'reset-token', password: 'new-password' });
    await loginRequest({ email: 'owner@kaffepos.test', password: 'password' });

    expect(calls.map((call) => [call.url, call.init.method ?? 'GET'])).toEqual([
      ['/api/auth/password/forgot', 'POST'],
      ['/api/auth/password/reset', 'POST'],
      ['/api/auth/login', 'POST'],
    ]);
    expect(calls.every((call) => getRequestHeader(call, 'Authorization') === null)).toBe(true);
    expect(getJsonRequestBody(calls[0])).toEqual({ email: 'owner@kaffepos.test' });
    expect(getJsonRequestBody(calls[1])).toEqual({
      email: 'owner@kaffepos.test',
      token: 'reset-token',
      password: 'new-password',
    });
  });

  it('keeps subscription payment endpoints authenticated and aligned with Midtrans method ids', async () => {
    seedStoredAuthSession({ accessToken: 'token-payment' });
    const { calls } = installFetchMock(() =>
      createJsonResponse({
        quote: {},
        paymentMethods: [],
        payment: { redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/test' },
        reused: false,
      }),
    );

    await getSubscriptionPaymentQuote({
      plan: 'signature',
      billingCycle: 'monthly',
      paymentMethod: 'qris',
      voucherCode: 'SIGNATURE10',
    });
    await createSubscriptionPayment({
      plan: 'signature',
      billingCycle: 'monthly',
      paymentMethod: 'bca_va',
      voucherCode: null,
    });

    expect(calls.map((call) => [call.url, call.init.method ?? 'GET'])).toEqual([
      ['/api/subscriptions/payments/quote', 'POST'],
      ['/api/subscriptions/payments/create', 'POST'],
    ]);
    expect(calls.every((call) => getRequestHeader(call, 'Authorization') === 'Bearer token-payment')).toBe(true);
    expect(getJsonRequestBody(calls[0])).toEqual({
      plan: 'signature',
      billingCycle: 'monthly',
      paymentMethod: 'qris',
      voucherCode: 'SIGNATURE10',
    });
    expect(getJsonRequestBody(calls[1])).toEqual({
      plan: 'signature',
      billingCycle: 'monthly',
      paymentMethod: 'bca_va',
      voucherCode: null,
    });
  });

  it('keeps auth session role and permission contract explicit for RBAC sync', async () => {
    seedStoredAuthSession({ accessToken: 'token-role' });
    installFetchMock(() =>
      createJsonResponse({
        user: {
          id: 'user_1',
          email: 'cashier@kaffepos.test',
          user_metadata: { role: 'cashier' },
        },
        profile: {
          id: 'user_1',
          email: 'cashier@kaffepos.test',
          role: 'cashier',
          permissions: ['can_use_pos', 'can_view_kitchen', 'can_print_receipt'],
          assigned_store_id: '11111111-1111-4111-8111-111111111111',
          assigned_store_name: 'Outlet Utama',
          assignment_status: 'active',
        },
        sessionExpiresAt: '2026-05-01T00:00:00.000Z',
      }),
    );

    const session = await getAuthSession();

    expect(session.profile.role).toBe('cashier');
    expect(session.profile.assigned_store_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(session.profile.assignment_status).toBe('active');
    expect(session.profile.permissions).toContain('can_use_pos');
    expect(session.profile.permissions).not.toContain('can_manage_billing');
  });

  it('keeps cashier management endpoints owner-authenticated with stable payloads', async () => {
    seedStoredAuthSession({ accessToken: 'token-owner' });
    const { calls } = installFetchMock(() =>
      createJsonResponse({
        items: [],
        cashier: {
          id: 'cashier_1',
          display_name: 'Sinta',
          email: 'sinta@kaffepos.test',
          role: 'cashier',
          status: 'active',
          store_id: 'store_1',
          store_name: 'Outlet Utama',
        },
      }),
    );

    await getCashiers();
    await createCashier({
      displayName: 'Sinta',
      email: 'sinta@kaffepos.test',
      password: 'password-awal',
      storeId: '11111111-1111-4111-8111-111111111111',
      status: 'active',
    });
    await updateCashier('cashier_1', {
      displayName: 'Sinta Shift Malam',
      storeId: '22222222-2222-4222-8222-222222222222',
      status: 'inactive',
    });

    expect(calls.map((call) => [call.url, call.init.method ?? 'GET'])).toEqual([
      ['/api/cashiers', 'GET'],
      ['/api/cashiers', 'POST'],
      ['/api/cashiers/cashier_1', 'PATCH'],
    ]);
    expect(calls.every((call) => getRequestHeader(call, 'Authorization') === 'Bearer token-owner')).toBe(true);
    expect(getJsonRequestBody(calls[1])).toEqual({
      displayName: 'Sinta',
      email: 'sinta@kaffepos.test',
      password: 'password-awal',
      storeId: '11111111-1111-4111-8111-111111111111',
      status: 'active',
    });
    expect(getJsonRequestBody(calls[2])).toEqual({
      displayName: 'Sinta Shift Malam',
      storeId: '22222222-2222-4222-8222-222222222222',
      status: 'inactive',
    });
  });

  it('keeps kitchen checker query and status update contracts stable', async () => {
    seedStoredAuthSession({ accessToken: 'token-kitchen' });
    const { calls } = installFetchMock(() => createJsonResponse({ items: [] }));

    await getKitchenOrders('store A/B', { status: 'pending', station: 'all' });
    await updateKitchenOrderStatus('order_1', {
      store_id: 'store A/B',
      status: 'preparing',
      reason: null,
      changed_by_name: 'Kitchen',
    });

    expect(calls[0].url).toBe('/api/kitchen/orders?storeId=store+A%2FB&status=pending');
    expect(calls[0].url).not.toContain('station=all');
    expect(calls[1].url).toBe('/api/kitchen/orders/order_1/status');
    expect(calls[1].init.method).toBe('PATCH');
    expect(getRequestHeader(calls[1], 'Authorization')).toBe('Bearer token-kitchen');
    expect(getJsonRequestBody(calls[1])).toEqual({
      store_id: 'store A/B',
      status: 'preparing',
      reason: null,
      changed_by_name: 'Kitchen',
    });
  });

  it('fails protected requests before fetch when auth session is missing', async () => {
    const { fetchMock } = installFetchMock(() => createJsonResponse({ ok: true }));

    await expect(apiFetch('/api/profile/me')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Sesi login tidak ditemukan.',
      status: 401,
    } satisfies Partial<ApiError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves backend error messages for UI error states', async () => {
    seedStoredAuthSession({ accessToken: 'token-error' });
    installFetchMock(() =>
      createJsonResponse(
        { message: 'Voucher tidak berlaku untuk paket ini.' },
        { status: 422 },
      ),
    );

    await expect(
      createSubscriptionPayment({
        plan: 'founder',
        billingCycle: 'monthly',
        paymentMethod: 'qris',
        voucherCode: 'SIGNATURE10',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Voucher tidak berlaku untuk paket ini.',
      status: 422,
    } satisfies Partial<ApiError>);
  });
});
