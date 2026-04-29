import { describe, expect, it } from 'vitest';
import {
  canCashierLogin,
  cashierCreateInputSchema,
  cashierUpdateInputSchema,
  normalizeCashierStatus,
} from './cashierManagement';

describe('cashier management validation', () => {
  it('normalizes create input and defaults cashier status to active', () => {
    const parsed = cashierCreateInputSchema.parse({
      displayName: 'Sinta Kasir',
      email: 'SINTA@KAFFEPOS.TEST',
      password: 'password-awal',
      storeId: '11111111-1111-4111-8111-111111111111',
    });

    expect(parsed).toMatchObject({
      displayName: 'Sinta Kasir',
      email: 'sinta@kaffepos.test',
      status: 'active',
    });
  });

  it('rejects weak cashier credentials and invalid outlet ids', () => {
    expect(() =>
      cashierCreateInputSchema.parse({
        displayName: 'A',
        email: 'not-email',
        password: 'short',
        storeId: 'bad-store',
      }),
    ).toThrow();
  });

  it('allows owner/admin to update only explicit cashier fields', () => {
    const parsed = cashierUpdateInputSchema.parse({
      displayName: 'Raka',
      status: 'inactive',
    });

    expect(parsed).toEqual({ displayName: 'Raka', status: 'inactive' });
  });

  it('defines active/inactive login readiness clearly', () => {
    expect(canCashierLogin('active')).toBe(true);
    expect(canCashierLogin('inactive')).toBe(false);
    expect(canCashierLogin('suspended')).toBe(false);
    expect(normalizeCashierStatus('inactive')).toBe('inactive');
    expect(normalizeCashierStatus('unknown')).toBe('active');
  });
});

