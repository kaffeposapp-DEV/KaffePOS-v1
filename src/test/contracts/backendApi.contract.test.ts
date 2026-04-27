import { beforeEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  apiFetch,
  createSubscriptionPayment,
  forgotPasswordRequest,
  getKitchenOrders,
  getSubscriptionPaymentQuote,
  loginRequest,
  resetPasswordRequest,
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

    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
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

    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
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
