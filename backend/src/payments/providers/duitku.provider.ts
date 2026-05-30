import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError, env, log, serializeError } from '../../core';
import type { CreatePaymentInput, CreatePaymentResult, InternalPaymentStatus, PaymentProvider, PaymentStatusResult, VerifiedPaymentCallback } from '../payment-provider.types';

function hmacSha256(value: string, key: string) {
  return createHmac('sha256', key).update(value).digest('hex');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function stringField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return value == null ? null : String(value);
}

function numberField(payload: Record<string, unknown>, key: string) {
  const value = stringField(payload, key);
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export class DuitkuPaymentProvider implements PaymentProvider {
  providerName = 'duitku' as const;

  private get merchantCode() {
    if (!env.DUITKU_MERCHANT_CODE) throw new ApiError(503, 'Duitku merchant code belum dikonfigurasi.');
    return env.DUITKU_MERCHANT_CODE;
  }

  private get merchantKey() {
    if (!env.DUITKU_MERCHANT_KEY) throw new ApiError(503, 'Duitku merchant key belum dikonfigurasi.');
    return env.DUITKU_MERCHANT_KEY;
  }

  private get baseUrl() {
    return (env.DUITKU_ENVIRONMENT === 'production' ? env.DUITKU_PRODUCTION_BASE_URL : env.DUITKU_SANDBOX_BASE_URL).replace(/\/$/, '');
  }

  createTransactionSignature(merchantOrderId: string, amount: number) {
    return hmacSha256(`${this.merchantCode}${merchantOrderId}${Math.round(amount)}`, this.merchantKey);
  }

  checkTransactionSignature(merchantOrderId: string) {
    return hmacSha256(`${this.merchantCode}${merchantOrderId}`, this.merchantKey);
  }

  callbackSignature(amount: string | number, merchantOrderId: string) {
    return hmacSha256(`${this.merchantCode}${amount}${merchantOrderId}`, this.merchantKey);
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const paymentAmount = Math.round(input.amount);
    const payload = {
      merchantCode: this.merchantCode,
      paymentAmount,
      paymentMethod: input.paymentMethod || env.DUITKU_DEFAULT_PAYMENT_METHOD,
      merchantOrderId: input.merchantOrderId,
      productDetails: input.productDetails,
      customerVaName: input.customerName || 'KaffePOS Customer',
      email: input.customerEmail || undefined,
      phoneNumber: input.customerPhone || undefined,
      itemDetails: input.itemDetails,
      customerDetail: input.customerDetail,
      callbackUrl: env.DUITKU_CALLBACK_URL,
      returnUrl: env.DUITKU_RETURN_URL,
      expiryPeriod: env.DUITKU_EXPIRY_PERIOD_MINUTES,
      signature: this.createTransactionSignature(input.merchantOrderId, paymentAmount),
    };

    try {
      const response = await fetch(`${this.baseUrl}/webapi/api/merchant/v2/inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const raw = await response.json().catch(async () => ({ message: await response.text().catch(() => '') })) as Record<string, unknown>;
      if (!response.ok) throw new ApiError(502, `Duitku create transaction gagal (${response.status}).`);
      const providerStatus = stringField(raw, 'statusCode') ?? stringField(raw, 'resultCode') ?? stringField(raw, 'statusMessage');
      return {
        provider: 'duitku',
        merchantOrderId: input.merchantOrderId,
        providerReference: stringField(raw, 'reference'),
        paymentUrl: stringField(raw, 'paymentUrl') ?? stringField(raw, 'payment_url'),
        vaNumber: stringField(raw, 'vaNumber') ?? stringField(raw, 'accountNumber'),
        qrString: stringField(raw, 'qrString') ?? stringField(raw, 'qrCode'),
        paymentMethod: stringField(raw, 'paymentMethod') ?? String(payload.paymentMethod),
        providerStatus,
        internalStatus: 'pending',
        raw,
      };
    } catch (error) {
      log('warn', 'duitku.create_payment_failed', { error: serializeError(error), merchantOrderId: input.merchantOrderId });
      throw error instanceof ApiError ? error : new ApiError(502, 'Duitku belum bisa membuat pembayaran.');
    }
  }

  async verifyCallback(input: { body: Record<string, unknown> }): Promise<VerifiedPaymentCallback> {
    const body = input.body;
    const merchantOrderId = stringField(body, 'merchantOrderId');
    const amountRaw = stringField(body, 'amount');
    const signature = stringField(body, 'signature');
    const expected = merchantOrderId && amountRaw ? this.callbackSignature(amountRaw, merchantOrderId) : '';
    const signatureValid = Boolean(signature && expected && safeEqual(signature, expected));
    return {
      provider: 'duitku',
      signatureValid,
      merchantOrderId,
      providerReference: stringField(body, 'reference') ?? stringField(body, 'publisherOrderId'),
      amount: numberField(body, 'amount'),
      paymentMethod: stringField(body, 'paymentCode') ?? stringField(body, 'issuerCode'),
      rawStatus: stringField(body, 'resultCode'),
      internalStatus: this.mapProviderStatus(stringField(body, 'resultCode')),
      paidAt: stringField(body, 'settlementDate') ?? (stringField(body, 'resultCode') === '00' ? new Date().toISOString() : null),
      raw: body,
    };
  }

  async checkTransactionStatus(input: { merchantOrderId: string }): Promise<PaymentStatusResult> {
    const payload = {
      merchantCode: this.merchantCode,
      merchantOrderId: input.merchantOrderId,
      signature: this.checkTransactionSignature(input.merchantOrderId),
    };
    try {
      const response = await fetch(`${this.baseUrl}/webapi/api/merchant/transactionStatus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const raw = await response.json().catch(async () => ({ message: await response.text().catch(() => '') })) as Record<string, unknown>;
      if (!response.ok) throw new ApiError(502, `Duitku status check gagal (${response.status}).`);
      const resultCode = stringField(raw, 'resultCode') ?? stringField(raw, 'statusCode');
      return {
        provider: 'duitku',
        signatureValid: true,
        merchantOrderId: input.merchantOrderId,
        providerReference: stringField(raw, 'reference'),
        amount: numberField(raw, 'amount'),
        paymentMethod: stringField(raw, 'paymentCode') ?? stringField(raw, 'paymentMethod'),
        rawStatus: resultCode,
        internalStatus: this.mapProviderStatus(resultCode),
        paidAt: stringField(raw, 'settlementDate') ?? (resultCode === '00' ? new Date().toISOString() : null),
        raw,
      };
    } catch (error) {
      log('warn', 'duitku.check_status_failed', { error: serializeError(error), merchantOrderId: input.merchantOrderId });
      throw error instanceof ApiError ? error : new ApiError(502, 'Status Duitku belum bisa dicek.');
    }
  }

  mapProviderStatus(rawStatus: unknown): InternalPaymentStatus {
    const status = String(rawStatus ?? '').toLowerCase();
    if (status === '00') return 'paid';
    if (status === '01') return 'failed';
    if (status === '02') return 'cancelled';
    if (['expired', 'expire'].includes(status)) return 'expired';
    if (['pending', ''].includes(status)) return 'pending';
    return 'unknown';
  }
}
