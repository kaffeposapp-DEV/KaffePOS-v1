import { describe, expect, it } from 'vitest';
import {
  canProcessPosPaymentOffline,
  canStartOnlineBillingFlow,
  getOfflinePaymentBlockedMessage,
  getOnlineBillingBlockedMessage,
} from '@/lib/offlinePolicy';

describe('offline payment policy', () => {
  it('allows only local/manual POS payments while offline', () => {
    expect(canProcessPosPaymentOffline('Tunai')).toBe(true);
    expect(canProcessPosPaymentOffline('Transfer')).toBe(true);
    expect(canProcessPosPaymentOffline('QRIS')).toBe(false);
    expect(canProcessPosPaymentOffline('Debit')).toBe(false);
  });

  it('keeps online billing and Midtrans unavailable while offline', () => {
    expect(canStartOnlineBillingFlow(true)).toBe(true);
    expect(canStartOnlineBillingFlow(false)).toBe(false);
    expect(getOnlineBillingBlockedMessage()).toBe('Langganan dan pembayaran online membutuhkan koneksi internet.');
  });

  it('gives a human message when an offline payment method is blocked', () => {
    expect(getOfflinePaymentBlockedMessage('QRIS')).toContain('QRIS membutuhkan koneksi internet');
    expect(getOfflinePaymentBlockedMessage('Tunai')).toBe('');
  });
});
