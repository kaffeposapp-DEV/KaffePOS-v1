import { ApiError } from '../../core';
import type { CreatePaymentInput, CreatePaymentResult, InternalPaymentStatus, PaymentProvider, PaymentStatusResult, VerifiedPaymentCallback } from '../payment-provider.types';

export class MidtransPaymentProvider implements PaymentProvider {
  providerName = 'midtrans' as const;
  async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    throw new ApiError(501, 'Midtrans rollback memakai endpoint legacy.');
  }
  async verifyCallback(): Promise<VerifiedPaymentCallback> {
    throw new ApiError(501, 'Midtrans rollback memakai webhook legacy.');
  }
  async checkTransactionStatus(): Promise<PaymentStatusResult> {
    throw new ApiError(501, 'Midtrans status check memakai alur legacy.');
  }
  mapProviderStatus(rawStatus: unknown): InternalPaymentStatus {
    const status = String(rawStatus ?? '').toLowerCase();
    if (['settlement', 'capture', 'paid'].includes(status)) return 'paid';
    if (['deny', 'failure', 'failed'].includes(status)) return 'failed';
    if (status === 'expire') return 'expired';
    if (status === 'cancel') return 'cancelled';
    if (status === 'refund') return 'refunded';
    if (['pending', 'challenge'].includes(status)) return 'pending';
    return 'unknown';
  }
}
