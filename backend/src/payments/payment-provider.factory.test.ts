import { describe, expect, it, vi } from 'vitest';

vi.mock('../core', () => ({
  env: {
    PAYMENT_INTEGRATION_ENABLED: 'true',
    PAYMENT_GATEWAY_PROVIDER: 'duitku',
  },
}));

import { createPaymentProvider, getActivePaymentProviderName } from './payment-provider.factory';

describe('payment provider factory', () => {
  it('selects Duitku from env', () => {
    expect(getActivePaymentProviderName()).toBe('duitku');
    expect(createPaymentProvider().providerName).toBe('duitku');
  });

  it('supports rollback and disabled providers explicitly', () => {
    expect(createPaymentProvider('midtrans').providerName).toBe('midtrans');
    expect(createPaymentProvider('disabled').providerName).toBe('disabled');
  });
});
