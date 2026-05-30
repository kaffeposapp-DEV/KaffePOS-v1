import { ApiError } from '../../core';
import type { CreatePaymentInput, CreatePaymentResult, InternalPaymentStatus, PaymentProvider, PaymentStatusResult, VerifiedPaymentCallback } from '../payment-provider.types';

export class DisabledPaymentProvider implements PaymentProvider {
  providerName = 'disabled' as const;
  async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    throw new ApiError(503, 'Pembayaran online belum aktif.');
  }
  async verifyCallback(): Promise<VerifiedPaymentCallback> {
    throw new ApiError(503, 'Pembayaran online belum aktif.');
  }
  async checkTransactionStatus(): Promise<PaymentStatusResult> {
    throw new ApiError(503, 'Pembayaran online belum aktif.');
  }
  mapProviderStatus(): InternalPaymentStatus {
    return 'unknown';
  }
}
