import { beforeEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  apiFetch,
  commitStockBulkImport,
  createCashier,
  createInventoryAdjustment,
  createStockUnitConversion,
  createSubscriptionPayment,
  deleteStockUnitConversion,
  forgotPasswordRequest,
  getAuthSession,
  getCashiers,
  getKitchenOrders,
  getStockUnitConversions,
  getSubscriptionPaymentQuote,
  loginRequest,
  resetPasswordRequest,
  trackOpsEventRequest,
  updateCashier,
  updateKitchenOrderStatus,
  updateStockUnitConversion,
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

  it('keeps stock conversion endpoints owner-authenticated and scoped by store', async () => {
    seedStoredAuthSession({ accessToken: 'token-stock' });
    const { calls } = installFetchMock(() =>
      createJsonResponse({
        items: [],
        id: 'conv_1',
        store_id: 'store_1',
        ingredient_id: 'ingredient_1',
        from_unit: 'mika',
        to_unit: 'pcs',
        ratio: 15,
        is_active: true,
      }),
    );

    await getStockUnitConversions('store A/B');
    await createStockUnitConversion({
      store_id: 'store_1',
      ingredient_id: 'ingredient_1',
      from_unit: 'mika',
      to_unit: 'pcs',
      ratio: 15,
    });
    await updateStockUnitConversion('conv_1', { ratio: 12, is_active: false });
    await deleteStockUnitConversion('conv_1');

    expect(calls.map((call) => [call.url, call.init.method ?? 'GET'])).toEqual([
      ['/api/inventory/conversions?storeId=store%20A%2FB', 'GET'],
      ['/api/inventory/conversions', 'POST'],
      ['/api/inventory/conversions/conv_1', 'PATCH'],
      ['/api/inventory/conversions/conv_1', 'DELETE'],
    ]);
    expect(calls.every((call) => getRequestHeader(call, 'Authorization') === 'Bearer token-stock')).toBe(true);
    expect(getJsonRequestBody(calls[1])).toEqual({
      store_id: 'store_1',
      ingredient_id: 'ingredient_1',
      from_unit: 'mika',
      to_unit: 'pcs',
      ratio: 15,
    });
    expect(getJsonRequestBody(calls[2])).toEqual({ ratio: 12, is_active: false });
  });

  it('keeps stock bulk import committed through one authenticated backend contract', async () => {
    seedStoredAuthSession({ accessToken: 'token-stock-import' });
    const { calls } = installFetchMock(() =>
      createJsonResponse({
        success: true,
        summary: { ingredients: 1, conversions: 1, products: 1, recipes: 1 },
        committed: { ingredients: 1, conversions: 1, products: 1, recipes: 1 },
      }),
    );

    await commitStockBulkImport({
      store_id: '11111111-1111-4111-8111-111111111111',
      mode: 'upsert',
      rows: [
        { rowNumber: 2, kind: 'ingredient', name: 'Gula Aren', stock: 10, base_unit: 'kg', total_cost: 45000 },
        { rowNumber: 3, kind: 'product', name: 'Kopi Susu', price: 18000, category: 'Coffee' },
        { rowNumber: 4, kind: 'conversion', ingredient_name: 'Gula Aren', from_unit: 'kg', to_unit: 'gram', ratio: 1000 },
        { rowNumber: 5, kind: 'recipe', product_name: 'Kopi Susu', ingredient_name: 'Gula Aren', qty_per_serving: 20, unit_reference: 'gram' },
      ],
    });

    expect(calls.map((call) => [call.url, call.init.method ?? 'GET'])).toEqual([
      ['/api/inventory/bulk-import/commit', 'POST'],
    ]);
    expect(getRequestHeader(calls[0], 'Authorization')).toBe('Bearer token-stock-import');
    expect(getJsonRequestBody(calls[0])).toEqual({
      store_id: '11111111-1111-4111-8111-111111111111',
      mode: 'upsert',
      rows: [
        { rowNumber: 2, kind: 'ingredient', name: 'Gula Aren', stock: 10, base_unit: 'kg', total_cost: 45000 },
        { rowNumber: 3, kind: 'product', name: 'Kopi Susu', price: 18000, category: 'Coffee' },
        { rowNumber: 4, kind: 'conversion', ingredient_name: 'Gula Aren', from_unit: 'kg', to_unit: 'gram', ratio: 1000 },
        { rowNumber: 5, kind: 'recipe', product_name: 'Kopi Susu', ingredient_name: 'Gula Aren', qty_per_serving: 20, unit_reference: 'gram' },
      ],
    });
  });

  it('keeps stock opname adjustments on one authenticated backend contract', async () => {
    seedStoredAuthSession({ accessToken: 'token-stock-adjust' });
    const { calls } = installFetchMock(() =>
      createJsonResponse({
        id: 'ingredient-1',
        store_id: 'store-1',
        name: 'Gula Aren',
        stock: 12,
        unit: 'kg',
        min_stock: 2,
        cost_per_unit: 10000,
      }),
    );

    await createInventoryAdjustment({
      store_id: 'store-1',
      inventory_id: 'ingredient-1',
      counted_stock: 12,
      reason: 'Opname bulanan',
      note: 'Rak A',
    });

    expect(calls.map((call) => [call.url, call.init.method ?? 'GET'])).toEqual([
      ['/api/inventory/adjustments', 'POST'],
    ]);
    expect(getRequestHeader(calls[0], 'Authorization')).toBe('Bearer token-stock-adjust');
    expect(getJsonRequestBody(calls[0])).toEqual({
      store_id: 'store-1',
      inventory_id: 'ingredient-1',
      counted_stock: 12,
      reason: 'Opname bulanan',
      note: 'Rak A',
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
        plan: 'kopi_susu',
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

  it('maps generic backend failures to a safe user-facing message', async () => {
    seedStoredAuthSession({ accessToken: 'token-error' });
    installFetchMock(() =>
      createJsonResponse(
        { message: 'Terjadi kesalahan di backend.' },
        { status: 500 },
      ),
    );

    await expect(getStockUnitConversions('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Terjadi gangguan pada server. Coba lagi beberapa saat.',
      status: 500,
    } satisfies Partial<ApiError>);
  });

  it('maps login network failures to a safe message instead of raw Failed to fetch', async () => {
    installFetchMock(() => {
      throw new TypeError('Failed to fetch');
    });

    await expect(loginRequest({ email: 'owner@kaffepos.test', password: 'password' })).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Tidak bisa terhubung ke server. Pastikan internet aktif atau coba lagi beberapa saat.',
      status: 0,
    } satisfies Partial<ApiError>);
  });

  it('keeps client error telemetry on the authenticated ops event contract', async () => {
    seedStoredAuthSession({ accessToken: 'token-ops' });
    const { calls } = installFetchMock(() => createJsonResponse({ success: true }, { status: 201 }));

    await trackOpsEventRequest({
      event_name: 'client_error',
      status: 'failure',
      error_message: 'Render gagal',
      metadata: { source: 'global_error_boundary' },
    });

    expect(calls.map((call) => [call.url, call.init.method ?? 'GET'])).toEqual([
      ['/api/ops/events', 'POST'],
    ]);
    expect(getRequestHeader(calls[0], 'Authorization')).toBe('Bearer token-ops');
    expect(getJsonRequestBody(calls[0])).toEqual({
      event_name: 'client_error',
      status: 'failure',
      error_message: 'Render gagal',
      metadata: { source: 'global_error_boundary' },
    });
  });
});
