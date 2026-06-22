export type PaymentProviderName = 'doku' | 'disabled';
export type InternalPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded' | 'unknown';

export type CreatePaymentInput = {
  merchantOrderId: string;
  amount: number;
  productDetails: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  paymentMethod?: string | null;
  itemDetails?: Array<{ name: string; price: number; quantity: number }>;
  customerDetail?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type CreatePaymentResult = {
  provider: PaymentProviderName;
  merchantOrderId: string;
  providerReference: string | null;
  paymentUrl: string | null;
  vaNumber: string | null;
  qrString: string | null;
  paymentMethod: string | null;
  providerStatus: string | null;
  internalStatus: InternalPaymentStatus;
  raw: Record<string, unknown>;
};

export type VerifiedPaymentCallback = {
  provider: PaymentProviderName;
  signatureValid: boolean;
  merchantOrderId: string | null;
  providerReference: string | null;
  amount: number | null;
  paymentMethod: string | null;
  rawStatus: string | null;
  internalStatus: InternalPaymentStatus;
  paidAt: string | null;
  raw: Record<string, unknown>;
};

export type PaymentStatusResult = VerifiedPaymentCallback;

export interface PaymentProvider {
  providerName: PaymentProviderName;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  // `headers` + `rawBody` are required by providers that sign the webhook in the
  // HTTP header over the raw payload (e.g. DOKU). Body-signature providers
  // (Duitku) ignore them.
  verifyCallback(input: { body: Record<string, unknown>; headers?: Record<string, string | string[] | undefined>; rawBody?: string }): Promise<VerifiedPaymentCallback>;
  checkTransactionStatus(input: { merchantOrderId: string; amount?: number | null }): Promise<PaymentStatusResult>;
  mapProviderStatus(rawStatus: unknown): InternalPaymentStatus;
}
