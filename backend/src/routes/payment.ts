import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ApiError,
  pool,
  paymentCreateRateLimiter,
  requirePermission,
  serializeError,
  withTransaction,
  activatePaidSubscription,
  env,
  requireOnlineSubscriptionPayment,
  subscriptionPaymentRequestSchema,
  buildSubscriptionQuoteOrThrow,
  ensureProfile,
  syncProfileSubscriptionState,
  createMidtransOrderId,
  getMidtransCallbackUrls,
  getMidtransBaseUrl,
} from '../core';
import { PaymentService, paymentCreateSchema } from '../services/PaymentService';
import { createPaymentProvider, getActivePaymentProviderName } from '../payments/payment-provider.factory';
import { buildMidtransCreateTransactionPayload, appendMidtransRedirectOptions } from '../lib/midtrans';

const router = Router();

function getRequestIp(req: Parameters<Parameters<typeof router.post>[1]>[0]) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || null;
}

async function createTransaction(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1], next: Parameters<Parameters<typeof router.post>[1]>[2]) {
  const ip = getRequestIp(req);
  const userAgent = req.headers['user-agent'] ?? null;
  let payload: z.infer<typeof paymentCreateSchema> | null = null;

  try {
    const parsedPayload = paymentCreateSchema.parse(req.body);
    payload = parsedPayload;
    const payment = await PaymentService.createTransaction({
      payload: parsedPayload,
      user: req.authUser!,
      ip,
      userAgent,
    });
    res.status(201).json(payment);
  } catch (error) {
    if (payload) {
      await PaymentService.logAttempt({
        userId: req.authUser?.id ?? null,
        storeId: payload.store_id,
        eventType: 'create_failed',
        ip,
        userAgent,
        metadata: { error: serializeError(error) },
      });
    } else if (error instanceof z.ZodError) {
      next(new ApiError(400, 'Payload pembayaran tidak valid.'));
      return;
    }
    next(error);
  }
}

async function createGenericSubscriptionPayment(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1], next: Parameters<Parameters<typeof router.post>[1]>[2]) {
  try {
    const paymentConfig = requireOnlineSubscriptionPayment();
    const payload = subscriptionPaymentRequestSchema.parse(req.body);
    const quote = buildSubscriptionQuoteOrThrow(payload);
    const amount = quote.total;
    if (amount <= 0) throw new ApiError(400, 'Total pembayaran tidak valid.');
    const voucherCode = quote.voucher?.code ?? '';
    const activeProvider = getActivePaymentProviderName();
    if (activeProvider === 'disabled') throw new ApiError(503, 'PAYMENT_DISABLED');

    const existingPending = await pool.query(
      `
        select id, provider, merchant_order_id, midtrans_order_id, redirect_url, payment_url, transaction_status, internal_status
        from public.subscription_payment_sessions
        where user_id = $1
          and plan = $2
          and billing_cycle = $3
          and amount = $4
          and coalesce(metadata->>'selectedPaymentMethod', '') = $5
          and coalesce(metadata->>'voucherCode', '') = $6
          and coalesce(internal_status, transaction_status) in ('pending', 'unknown')
          and (expires_at is null or expires_at > now())
        order by created_at desc
        limit 1
      `,
      [req.authUser!.id, payload.plan, payload.billingCycle, amount, payload.paymentMethod, voucherCode],
    );
    const existing = existingPending.rows[0];
    if (existing) {
      res.status(200).json({
        success: true,
        data: {
          paymentId: existing.id,
          provider: existing.provider ?? activeProvider,
          merchantOrderId: existing.merchant_order_id ?? existing.midtrans_order_id,
          paymentUrl: existing.payment_url ?? existing.redirect_url ?? null,
          status: existing.internal_status ?? existing.transaction_status ?? 'pending',
        },
      });
      return;
    }

    const profile = await withTransaction(async (client) => {
      const ensuredProfile = await ensureProfile(client, req.authUser!);
      await syncProfileSubscriptionState(client, req.authUser!.id);
      return ensuredProfile;
    });
    const storeResult = await pool.query(
      `select id, store_name from public.stores where owner_id = $1 order by created_at asc limit 1`,
      [req.authUser!.id],
    );
    const store = storeResult.rows[0];
    const orderId = createMidtransOrderId(req.authUser!.id, payload.plan, payload.billingCycle).replace('SUB-', `${activeProvider.toUpperCase()}-SUB-`);

    if (activeProvider === 'duitku') {
      const provider = createPaymentProvider('duitku');
      const payment = await provider.createPayment({
        merchantOrderId: orderId,
        amount,
        productDetails: `Langganan ${quote.planName} (${payload.billingCycle})`,
        customerName: (profile.display_name as string | null) ?? (profile.username as string | null) ?? 'KaffePOS User',
        customerEmail: (profile.email as string | null) ?? req.authUser!.email ?? null,
        paymentMethod: env.DUITKU_DEFAULT_PAYMENT_METHOD,
        itemDetails: [{ name: `Langganan ${quote.planName}`, price: amount, quantity: 1 }],
      });
      const sessionId = randomUUID();
      const inserted = await pool.query(
        `
          insert into public.subscription_payment_sessions (
            id, user_id, store_id, plan, billing_cycle, amount, currency_code,
            midtrans_order_id, redirect_url, transaction_status, expires_at, metadata, updated_at,
            provider, provider_reference, merchant_order_id, payment_url, va_number, qr_string,
            payment_method, provider_status, internal_status
          ) values (
            $1, $2, $3, $4, $5, $6, 'IDR', $7, $8, 'pending', now() + ($9::int || ' minutes')::interval, $10::jsonb, now(),
            'duitku', $11, $7, $8, $12, $13, $14, $15, 'pending'
          )
          returning id, provider, merchant_order_id, midtrans_order_id, payment_url, redirect_url, internal_status, transaction_status
        `,
        [sessionId, req.authUser!.id, store?.id ?? null, payload.plan, payload.billingCycle, amount, orderId, payment.paymentUrl, env.DUITKU_EXPIRY_PERIOD_MINUTES, JSON.stringify({ env: env.DUITKU_ENVIRONMENT, paymentMode: paymentConfig.mode, callbackUrl: env.DUITKU_CALLBACK_URL, returnUrl: env.DUITKU_RETURN_URL, selectedPaymentMethod: payload.paymentMethod, voucherCode, quote, storeName: store?.store_name ?? null, providerRaw: payment.raw }), payment.providerReference, payment.vaNumber, payment.qrString, payment.paymentMethod, payment.providerStatus],
      );
      const row = inserted.rows[0];
      res.status(201).json({ success: true, data: { paymentId: row.id, provider: row.provider, merchantOrderId: row.merchant_order_id, paymentUrl: row.payment_url ?? row.redirect_url ?? null, status: row.internal_status ?? 'pending' } });
      return;
    }

    const callbackUrls = getMidtransCallbackUrls();
    const response = await fetch(`${getMidtransBaseUrl()}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(buildMidtransCreateTransactionPayload({
        orderId,
        amount,
        itemId: `${payload.plan}-${payload.billingCycle}`,
        itemName: `Langganan ${quote.planName} (${payload.billingCycle})`,
        enabledPayments: quote.selectedPaymentMethod.midtransPayments,
        customerName: (profile.display_name as string | null) ?? (profile.username as string | null) ?? 'KaffePOS User',
        customerEmail: (profile.email as string | null) ?? req.authUser!.email ?? undefined,
        plan: payload.plan,
        billingCycle: payload.billingCycle,
        storeId: store?.id ?? null,
        callbackUrls,
      })),
    });
    if (!response.ok) throw new ApiError(502, `Midtrans create transaction gagal (${response.status}).`);
    const paymentPayload = await response.json() as { token?: string; redirect_url?: string };
    if (!paymentPayload.token || !paymentPayload.redirect_url) throw new ApiError(502, 'Respons Midtrans tidak lengkap.');
    const redirectUrl = appendMidtransRedirectOptions(paymentPayload.redirect_url, quote.selectedPaymentMethod.redirectMode);
    const sessionId = randomUUID();
    const inserted = await pool.query(
      `
        insert into public.subscription_payment_sessions (id, user_id, store_id, plan, billing_cycle, amount, currency_code, midtrans_order_id, snap_token, redirect_url, transaction_status, expires_at, metadata, updated_at, provider, merchant_order_id, payment_url, internal_status)
        values ($1, $2, $3, $4, $5, $6, 'IDR', $7, $8, $9, 'pending', now() + interval '30 minutes', $10::jsonb, now(), 'midtrans', $7, $9, 'pending')
        returning id, provider, merchant_order_id, midtrans_order_id, redirect_url, payment_url, internal_status, transaction_status
      `,
      [sessionId, req.authUser!.id, store?.id ?? null, payload.plan, payload.billingCycle, amount, orderId, paymentPayload.token, redirectUrl, JSON.stringify({ env: env.MIDTRANS_ENVIRONMENT, paymentMode: paymentConfig.mode, callbackUrls, selectedPaymentMethod: payload.paymentMethod, voucherCode, quote, storeName: store?.store_name ?? null })],
    );
    const row = inserted.rows[0];
    res.status(201).json({ success: true, data: { paymentId: row.id, provider: row.provider, merchantOrderId: row.merchant_order_id ?? row.midtrans_order_id, paymentUrl: row.payment_url ?? row.redirect_url, status: row.internal_status ?? row.transaction_status } });
  } catch (error) {
    next(error);
  }
}

router.post('/api/payment/create-transaction', requirePermission('can_use_pos'), paymentCreateRateLimiter, createTransaction);
router.post('/api/payment/create', requirePermission('can_use_pos'), paymentCreateRateLimiter, createTransaction);
router.post('/api/payments/start', requirePermission('can_manage_billing'), paymentCreateRateLimiter, createGenericSubscriptionPayment);
router.get('/api/payment/orders/:orderId', requirePermission('can_use_pos'), async (req, res, next) => {
  try {
    const orderId = z.string().trim().min(1).parse(req.params.orderId);
    const order = await PaymentService.getOrderStatus({ orderId, user: req.authUser! });
    res.json(order);
  } catch (error) {
    next(error);
  }
});

router.get('/api/payments/:paymentId/status', requirePermission('can_manage_billing'), async (req, res, next) => {
  try {
    const paymentId = z.string().uuid().parse(req.params.paymentId);
    const result = await pool.query(
      `
        select id, user_id, provider, merchant_order_id, midtrans_order_id, provider_reference,
          transaction_status, internal_status, redirect_url, payment_url, expires_at, paid_at, settled_at
        from public.subscription_payment_sessions
        where id = $1 and user_id = $2
        limit 1
      `,
      [paymentId, req.authUser!.id],
    );
    const row = result.rows[0];
    if (!row) throw new ApiError(404, 'Pembayaran tidak ditemukan.');
    res.json({
      paymentId: row.id,
      provider: row.provider ?? 'midtrans',
      merchantOrderId: row.merchant_order_id ?? row.midtrans_order_id,
      providerReference: row.provider_reference ?? null,
      status: row.internal_status ?? row.transaction_status,
      paymentUrl: row.payment_url ?? row.redirect_url ?? null,
      expiresAt: row.expires_at ?? null,
      paidAt: row.paid_at ?? row.settled_at ?? null,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/payments/:paymentId/check', requirePermission('can_manage_billing'), async (req, res, next) => {
  try {
    if (getActivePaymentProviderName() !== 'duitku') throw new ApiError(409, 'Status check Duitku hanya aktif saat provider Duitku.');
    const paymentId = z.string().uuid().parse(req.params.paymentId);
    const sessionResult = await pool.query(
      `select * from public.subscription_payment_sessions where id = $1 and user_id = $2 limit 1`,
      [paymentId, req.authUser!.id],
    );
    const session = sessionResult.rows[0];
    if (!session) throw new ApiError(404, 'Pembayaran tidak ditemukan.');
    const provider = createPaymentProvider('duitku');
    const checked = await provider.checkTransactionStatus({ merchantOrderId: String(session.merchant_order_id ?? session.midtrans_order_id) });
    if (checked.amount != null && Math.round(Number(session.amount ?? 0)) !== Math.round(checked.amount)) {
      throw new ApiError(400, 'Amount Duitku tidak sesuai.');
    }
    const paidAt = checked.paidAt ?? new Date().toISOString();
    await withTransaction(async (client) => {
      await client.query(
        `
          insert into public.payment_events (payment_id, provider, event_type, provider_reference, merchant_order_id, raw_status, internal_status, payload, signature_valid, processed_at)
          values ($1, 'duitku', 'manual_check', $2, $3, $4, $5, $6::jsonb, true, now())
        `,
        [session.id, checked.providerReference, checked.merchantOrderId, checked.rawStatus, checked.internalStatus, JSON.stringify(checked.raw)],
      ).catch(() => undefined);
      await client.query(
        `
          update public.subscription_payment_sessions
          set provider_reference = coalesce($2, provider_reference), payment_method = coalesce($3, payment_method),
              provider_status = $4, internal_status = $5, transaction_status = $5,
              paid_at = case when $5 = 'paid' then coalesce(paid_at, $6::timestamptz) else paid_at end,
              settled_at = case when $5 = 'paid' then coalesce(settled_at, $6::timestamptz) else settled_at end,
              updated_at = now()
          where id = $1
        `,
        [session.id, checked.providerReference, checked.paymentMethod, checked.rawStatus, checked.internalStatus, paidAt],
      );
      if (checked.internalStatus === 'paid' && !session.subscription_id) {
        await activatePaidSubscription(client, {
          userId: session.user_id as string,
          plan: session.plan,
          billingCycle: session.billing_cycle,
          paymentAmount: Number(session.amount ?? 0),
          paymentMethod: checked.paymentMethod ?? 'duitku',
          paymentRef: checked.merchantOrderId ?? String(session.merchant_order_id ?? session.midtrans_order_id),
          paymentNote: `Duitku ${checked.paymentMethod ?? 'payment'} (${env.DUITKU_ENVIRONMENT})`,
          paidAt,
          sessionId: session.id,
        });
      }
    });
    res.json({ paymentId: session.id, provider: 'duitku', status: checked.internalStatus, merchantOrderId: checked.merchantOrderId });
  } catch (error) {
    next(error);
  }
});

export default router;
