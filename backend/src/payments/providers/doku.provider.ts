import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { ApiError, env, log, serializeError } from '../../core';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  InternalPaymentStatus,
  PaymentProvider,
  PaymentStatusResult,
  VerifiedPaymentCallback,
} from '../payment-provider.types';

/** DOKU Request-Timestamp / Response-Timestamp format: ISO-8601 UTC, no millis. */
function dokuTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function sha256Base64(body: string) {
  return createHash('sha256').update(body, 'utf8').digest('base64');
}

function hmacSha256Base64(component: string, secret: string) {
  return createHmac('sha256', secret).update(component, 'utf8').digest('base64');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function headerValue(headers: Record<string, string | string[] | undefined> | undefined, name: string) {
  if (!headers) return null;
  const raw = headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

function pick(payload: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = payload;
  for (const key of path) {
    if (cursor && typeof cursor === 'object' && key in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function asString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export class DokuPaymentProvider implements PaymentProvider {
  providerName = 'doku' as const;

  private get clientId() {
    if (!env.DOKU_CLIENT_ID) throw new ApiError(503, 'DOKU client id belum dikonfigurasi.');
    return env.DOKU_CLIENT_ID;
  }

  private get secretKey() {
    if (!env.DOKU_SECRET_KEY) throw new ApiError(503, 'DOKU secret key belum dikonfigurasi.');
    return env.DOKU_SECRET_KEY;
  }

  private get baseUrl() {
    const base = env.DOKU_ENVIRONMENT === 'production' ? env.DOKU_PRODUCTION_BASE_URL : env.DOKU_SANDBOX_BASE_URL;
    return base.replace(/\/$/, '');
  }

  /**
   * DOKU signature: component lines joined by "\n" (no trailing newline),
   * HMAC-SHA256 with the secret key, base64-encoded, prefixed with "HMACSHA256=".
   * For GET requests (and any request without a body) the Digest line is omitted.
   * `timestampHeader` is "Request-Timestamp" for outbound calls and
   * "Response-Timestamp" when verifying an inbound notification.
   */
  buildSignature(input: {
    requestId: string;
    timestamp: string;
    target: string;
    digest?: string | null;
    timestampHeader?: 'Request-Timestamp' | 'Response-Timestamp';
  }) {
    const timestampHeader = input.timestampHeader ?? 'Request-Timestamp';
    const lines = [
      `Client-Id:${this.clientId}`,
      `Request-Id:${input.requestId}`,
      `${timestampHeader}:${input.timestamp}`,
      `Request-Target:${input.target}`,
    ];
    if (input.digest) lines.push(`Digest:${input.digest}`);
    return `HMACSHA256=${hmacSha256Base64(lines.join('\n'), this.secretKey)}`;
  }

  private signedHeaders(target: string, bodyString: string | null) {
    const requestId = randomUUID();
    const timestamp = dokuTimestamp();
    const digest = bodyString == null ? null : sha256Base64(bodyString);
    const signature = this.buildSignature({ requestId, timestamp, target, digest });
    const headers: Record<string, string> = {
      'Client-Id': this.clientId,
      'Request-Id': requestId,
      'Request-Timestamp': timestamp,
      Signature: signature,
    };
    if (bodyString != null) {
      headers['Content-Type'] = 'application/json';
      headers.Accept = 'application/json';
    }
    return headers;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const amount = Math.round(input.amount);
    const lineItems = (input.itemDetails && input.itemDetails.length > 0
      ? input.itemDetails
      : [{ name: input.productDetails || 'KaffePOS', price: amount, quantity: 1 }]
    ).map((item) => ({ name: item.name, price: Math.round(item.price), quantity: item.quantity }));

    const body = {
      order: {
        amount,
        invoice_number: input.merchantOrderId,
        currency: 'IDR',
        callback_url: env.DOKU_CALLBACK_URL ?? undefined,
        line_items: lineItems,
      },
      payment: {
        payment_due_date: env.DOKU_PAYMENT_DUE_MINUTES,
      },
      customer: {
        id: input.merchantOrderId,
        name: input.customerName || 'KaffePOS Customer',
        email: input.customerEmail || 'billing@kaffepos.my.id',
        phone: input.customerPhone || undefined,
      },
    };

    const target = env.DOKU_CHECKOUT_PATH;
    const bodyString = JSON.stringify(body);

    try {
      log('info', 'doku.create_payment_request', {
        environment: env.DOKU_ENVIRONMENT,
        target,
        amount,
        merchantOrderId: input.merchantOrderId,
        callbackUrlConfigured: Boolean(env.DOKU_CALLBACK_URL),
      });
      const response = await fetch(`${this.baseUrl}${target}`, {
        method: 'POST',
        headers: this.signedHeaders(target, bodyString),
        body: bodyString,
        signal: AbortSignal.timeout(15000),
      });
      const raw = (await response.json().catch(async () => ({ message: await response.text().catch(() => '') }))) as Record<string, unknown>;
      const paymentUrl = asString(pick(raw, ['response', 'payment', 'url'])) ?? asString(pick(raw, ['payment', 'url']));
      const tokenId = asString(pick(raw, ['response', 'payment', 'token_id'])) ?? asString(pick(raw, ['payment', 'token_id']));
      log(response.ok ? 'info' : 'warn', 'doku.create_payment_response', {
        environment: env.DOKU_ENVIRONMENT,
        httpStatus: response.status,
        merchantOrderId: input.merchantOrderId,
        paymentUrlPresent: Boolean(paymentUrl),
      });
      if (!response.ok) throw new ApiError(502, `DOKU create payment gagal (${response.status}).`);
      if (!paymentUrl) throw new ApiError(502, 'DOKU create payment tidak mengembalikan payment url.');
      return {
        provider: 'doku',
        merchantOrderId: input.merchantOrderId,
        providerReference: tokenId,
        paymentUrl,
        vaNumber: asString(pick(raw, ['virtual_account_info', 'virtual_account_number'])),
        qrString: asString(pick(raw, ['response', 'payment', 'qr_string'])),
        paymentMethod: asString(pick(raw, ['response', 'payment', 'payment_method'])),
        providerStatus: asString(pick(raw, ['response', 'order', 'status'])) ?? 'pending',
        internalStatus: 'pending',
        raw,
      };
    } catch (error) {
      log('warn', 'doku.create_payment_failed', { error: serializeError(error), merchantOrderId: input.merchantOrderId });
      throw error instanceof ApiError ? error : new ApiError(502, 'DOKU belum bisa membuat pembayaran.');
    }
  }

  async verifyCallback(input: { body: Record<string, unknown>; headers?: Record<string, string | string[] | undefined>; rawBody?: string }): Promise<VerifiedPaymentCallback> {
    const body = input.body ?? {};
    const rawBody = input.rawBody ?? JSON.stringify(body);
    const receivedSignature = headerValue(input.headers, 'Signature');
    const requestId = headerValue(input.headers, 'Request-Id');
    const timestamp = headerValue(input.headers, 'Response-Timestamp') ?? headerValue(input.headers, 'Request-Timestamp');

    let signatureValid = false;
    if (receivedSignature && requestId && timestamp && env.DOKU_CLIENT_ID && env.DOKU_SECRET_KEY) {
      const expected = this.buildSignature({
        requestId,
        timestamp,
        target: env.DOKU_NOTIFICATION_PATH,
        digest: sha256Base64(rawBody),
        timestampHeader: 'Response-Timestamp',
      });
      signatureValid = safeEqual(receivedSignature, expected);
    }

    const rawStatus = asString(pick(body, ['transaction', 'status']));
    const paidAt = asString(pick(body, ['transaction', 'date']));
    const internalStatus = this.mapProviderStatus(rawStatus);
    return {
      provider: 'doku',
      signatureValid,
      merchantOrderId: asString(pick(body, ['order', 'invoice_number'])),
      providerReference: asString(pick(body, ['transaction', 'original_request_id'])) ?? asString(pick(body, ['order', 'session_id'])),
      amount: asNumber(pick(body, ['order', 'amount'])),
      paymentMethod: asString(pick(body, ['service', 'id'])) ?? asString(pick(body, ['channel', 'id'])),
      rawStatus,
      internalStatus,
      paidAt: internalStatus === 'paid' ? (paidAt ?? new Date().toISOString()) : paidAt,
      raw: body,
    };
  }

  async checkTransactionStatus(input: { merchantOrderId: string }): Promise<PaymentStatusResult> {
    const target = `${env.DOKU_STATUS_PATH_PREFIX.replace(/\/$/, '')}/${encodeURIComponent(input.merchantOrderId)}`;
    try {
      const response = await fetch(`${this.baseUrl}${target}`, {
        method: 'GET',
        headers: this.signedHeaders(target, null),
        signal: AbortSignal.timeout(15000),
      });
      const raw = (await response.json().catch(async () => ({ message: await response.text().catch(() => '') }))) as Record<string, unknown>;
      if (!response.ok) throw new ApiError(502, `DOKU status check gagal (${response.status}).`);
      const rawStatus = asString(pick(raw, ['transaction', 'status']));
      const internalStatus = this.mapProviderStatus(rawStatus);
      return {
        provider: 'doku',
        signatureValid: true,
        merchantOrderId: asString(pick(raw, ['order', 'invoice_number'])) ?? input.merchantOrderId,
        providerReference: asString(pick(raw, ['transaction', 'original_request_id'])),
        amount: asNumber(pick(raw, ['order', 'amount'])),
        paymentMethod: asString(pick(raw, ['service', 'id'])) ?? asString(pick(raw, ['channel', 'id'])),
        rawStatus,
        internalStatus,
        paidAt: internalStatus === 'paid' ? (asString(pick(raw, ['transaction', 'date'])) ?? new Date().toISOString()) : null,
        raw,
      };
    } catch (error) {
      log('warn', 'doku.check_status_failed', { error: serializeError(error), merchantOrderId: input.merchantOrderId });
      throw error instanceof ApiError ? error : new ApiError(502, 'Status DOKU belum bisa dicek.');
    }
  }

  mapProviderStatus(rawStatus: unknown): InternalPaymentStatus {
    const status = String(rawStatus ?? '').trim().toUpperCase();
    if (status === 'SUCCESS') return 'paid';
    if (status === 'PENDING' || status === '') return 'pending';
    if (status === 'FAILED' || status === 'DECLINE' || status === 'DECLINED') return 'failed';
    if (status === 'EXPIRED') return 'expired';
    if (status === 'CANCELLED' || status === 'CANCELED' || status === 'VOID') return 'cancelled';
    if (status === 'REFUND' || status === 'REFUNDED') return 'refunded';
    return 'unknown';
  }
}
