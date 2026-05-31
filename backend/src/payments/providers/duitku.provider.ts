import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiError, env, log, serializeError } from '../../core';
import type { CreatePaymentInput, CreatePaymentResult, InternalPaymentStatus, PaymentProvider, PaymentStatusResult, VerifiedPaymentCallback } from '../payment-provider.types';

function md5(value: string) {
  return createHash('md5').update(value).digest('hex');
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

function toDuitkuPaymentMethod(method: string | null | undefined) {
  const normalized = String(method || '').trim().toLowerCase();
  const mapping: Record<string, string> = {
    qris: 'SP',
    bca_va: 'BC',
    mandiri_bill: 'M2',
    bni_va: 'I1',
    bri_va: 'BR',
  };
  if (mapping[normalized]) return mapping[normalized];
  if (normalized === 'credit_card') return 'VC';
  return env.DUITKU_DEFAULT_PAYMENT_METHOD || 'VC';
}

function maskMerchantCode(value: string) {
  if (value.length <= 4) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function safeDuitkuMessage(payload: Record<string, unknown>) {
  return stringField(payload, 'message')
    ?? stringField(payload, 'Message')
    ?? stringField(payload, 'responseMessage')
    ?? stringField(payload, 'statusMessage')
    ?? stringField(payload, 'resultMessage')
    ?? null;
}

function omitEmpty<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== '')) as Partial<T>;
}

function duitkuEmail(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized || 'billing@kaffepos.my.id';
}

function duitkuPhone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || '08123456789';
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
    return md5(`${this.merchantCode}${merchantOrderId}${Math.round(amount)}${this.merchantKey}`);
  }

  checkTransactionSignature(merchantOrderId: string) {
    return md5(`${this.merchantCode}${merchantOrderId}${this.merchantKey}`);
  }

  callbackSignature(amount: string | number, merchantOrderId: string) {
    return md5(`${this.merchantCode}${amount}${merchantOrderId}${this.merchantKey}`);
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const paymentAmount = Math.round(input.amount);
    const merchantCode = this.merchantCode;
    const paymentMethod = toDuitkuPaymentMethod(input.paymentMethod);
    const endpointPath = '/webapi/api/merchant/v2/inquiry';
    const expiryPeriod = Number(env.DUITKU_EXPIRY_PERIOD_MINUTES);
    const payload = omitEmpty({
      merchantCode,
      paymentAmount,
      paymentMethod,
      merchantOrderId: input.merchantOrderId,
      productDetails: input.productDetails,
      customerVaName: input.customerName || 'KaffePOS Customer',
      email: duitkuEmail(input.customerEmail),
      phoneNumber: duitkuPhone(input.customerPhone),
      callbackUrl: env.DUITKU_CALLBACK_URL,
      returnUrl: env.DUITKU_RETURN_URL,
      expiryPeriod: Number.isFinite(expiryPeriod) && expiryPeriod > 0 ? expiryPeriod : undefined,
      signature: this.createTransactionSignature(input.merchantOrderId, paymentAmount),
    });

    try {
      log('info', 'duitku.create_payment_request', {
        merchantCode: maskMerchantCode(merchantCode),
        environment: env.DUITKU_ENVIRONMENT,
        endpointPath,
        paymentAmount,
        paymentMethod,
        merchantOrderId: input.merchantOrderId,
        callbackUrlConfigured: Boolean(env.DUITKU_CALLBACK_URL),
        returnUrlConfigured: Boolean(env.DUITKU_RETURN_URL),
      });
      const response = await fetch(`${this.baseUrl}${endpointPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const raw = await response.json().catch(async () => ({ message: await response.text().catch(() => '') })) as Record<string, unknown>;
      const paymentUrl = stringField(raw, 'paymentUrl') ?? stringField(raw, 'payment_url');
      log(response.ok ? 'info' : 'warn', 'duitku.create_payment_response', {
        environment: env.DUITKU_ENVIRONMENT,
        endpointPath,
        httpStatus: response.status,
        paymentMethod,
        merchantOrderId: input.merchantOrderId,
        responseCode: stringField(raw, 'responseCode'),
        responseMessage: stringField(raw, 'responseMessage'),
        resultCode: stringField(raw, 'resultCode') ?? stringField(raw, 'statusCode'),
        message: safeDuitkuMessage(raw),
        paymentUrlPresent: Boolean(paymentUrl),
      });
      if (!response.ok) throw new ApiError(502, `Duitku create transaction gagal (${response.status}). ${safeDuitkuMessage(raw) ?? 'Silakan coba lagi.'}`);
      if (!paymentUrl) throw new ApiError(502, `Duitku create transaction tidak mengembalikan paymentUrl. ${safeDuitkuMessage(raw) ?? 'Silakan coba lagi.'}`);
      const providerStatus = stringField(raw, 'responseCode') ?? stringField(raw, 'statusCode') ?? stringField(raw, 'resultCode') ?? stringField(raw, 'statusMessage');
      return {
        provider: 'duitku',
        merchantOrderId: input.merchantOrderId,
        providerReference: stringField(raw, 'reference'),
        paymentUrl,
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
