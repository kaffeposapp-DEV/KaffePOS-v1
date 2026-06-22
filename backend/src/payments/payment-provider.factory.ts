import { env } from '../core';
import type { PaymentProviderName, PaymentProvider } from './payment-provider.types';
import { DisabledPaymentProvider } from './providers/disabled.provider';
import { DokuPaymentProvider } from './providers/doku.provider';

export function getActivePaymentProviderName(): PaymentProviderName {
  if (env.PAYMENT_INTEGRATION_ENABLED === 'false') return 'disabled';
  return env.PAYMENT_GATEWAY_PROVIDER;
}

export function createPaymentProvider(providerName: PaymentProviderName = getActivePaymentProviderName()): PaymentProvider {
  if (providerName === 'doku') return new DokuPaymentProvider();
  return new DisabledPaymentProvider();
}
