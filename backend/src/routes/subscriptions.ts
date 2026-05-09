/**
 * Subscriptions and billing routes.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  pool,
  withTransaction,
  ApiError,
  requirePermission,
  normalizeSubscription,
  normalizePaymentHistory,
  normalizeSubscriptionPaymentSession,
  resolveSubscriptionPaymentConfig,
  requireOnlineSubscriptionPayment,
  createMidtransOrderId,
  getMidtransCallbackUrls,
  subscriptionPaymentRequestSchema,
  buildSubscriptionQuoteOrThrow,
  paymentCreateRateLimiter,
  ensureProfile,
  syncProfileSubscriptionState,
  env,
  getMidtransBaseUrl,
} from '../core';
import {
  listSubscriptionPaymentMethods,
} from '../lib/subscriptionBilling';
import {
  buildMidtransCreateTransactionPayload,
  appendMidtransRedirectOptions,
} from '../lib/midtrans';

const router = Router();

router.get('/api/subscriptions', requirePermission('can_manage_billing'), async (req, res, next) => {
  try {
    const [subscriptions, paymentHistory, pendingPayments] = await Promise.all([
      pool.query(
        `
          select
            id,
            user_id,
            store_id,
            tier,
            period,
            plan,
            billing_cycle,
            status,
            activated_at,
            expires_at,
            payment_ref,
            payment_amount,
            payment_method,
            payment_note,
            created_at,
            updated_at
          from public.subscriptions
          where user_id = $1
          order by activated_at desc
          limit 20
        `,
        [req.authUser!.id],
      ),
      pool.query(
        `
          select
            id,
            user_id,
            subscription_id,
            plan,
            billing_cycle,
            amount,
            payment_method,
            payment_note,
            payment_ref,
            status,
            paid_at,
            created_at
          from public.payment_history
          where user_id = $1
          order by paid_at desc
          limit 20
        `,
        [req.authUser!.id],
      ),
      pool.query(
        `
          select
            id,
            plan,
            billing_cycle,
            amount,
            currency_code,
            midtrans_order_id,
            redirect_url,
            payment_type,
            transaction_status,
            expires_at,
            paid_at,
            settled_at,
            created_at,
            updated_at
          from public.subscription_payment_sessions
          where user_id = $1
          order by created_at desc
          limit 20
        `,
        [req.authUser!.id],
      ),
    ]);

    const subscriptionItems = subscriptions.rows.map((row: Record<string, unknown>) => normalizeSubscription(row));
    const paymentItems = paymentHistory.rows.map((row: Record<string, unknown>) => normalizePaymentHistory(row));
    const pendingPaymentItems = pendingPayments.rows.map((row: Record<string, unknown>) => normalizeSubscriptionPaymentSession(row));

    res.json({
      currentSubscription: subscriptionItems[0] ?? null,
      subscriptions: subscriptionItems,
      paymentHistory: paymentItems,
      pendingPayments: pendingPaymentItems,
      paymentConfig: resolveSubscriptionPaymentConfig(),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/subscriptions/payments/quote', requirePermission('can_manage_billing'), async (req, res, next) => {
  try {
    const payload = subscriptionPaymentRequestSchema.parse(req.body);
    const paymentConfig = resolveSubscriptionPaymentConfig();
    const baseQuote = buildSubscriptionQuoteOrThrow(payload);
    const quote = paymentConfig.onlinePaymentAvailable
      ? baseQuote
      : {
          ...baseQuote,
          trustLabel: 'Aktivasi manual diproses admin sampai Midtrans production aktif.',
        };

    res.json({
      quote,
      paymentMethods: listSubscriptionPaymentMethods(),
      paymentConfig,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/subscriptions/payments/create', requirePermission('can_manage_billing'), paymentCreateRateLimiter, async (req, res, next) => {
  try {
    const paymentConfig = requireOnlineSubscriptionPayment();

    const payload = subscriptionPaymentRequestSchema.parse(req.body);
    const quote = buildSubscriptionQuoteOrThrow(payload);
    const amount = quote.total;
    if (amount <= 0) {
      throw new ApiError(400, 'Total pembayaran tidak valid untuk transaksi Midtrans.');
    }
    const voucherCode = quote.voucher?.code ?? '';

    const existingPending = await pool.query(
      `
        select
          id,
          plan,
          billing_cycle,
          amount,
          currency_code,
          midtrans_order_id,
          redirect_url,
          payment_type,
          transaction_status,
          expires_at,
          paid_at,
          settled_at,
          created_at,
          updated_at
        from public.subscription_payment_sessions
        where user_id = $1
          and plan = $2
          and billing_cycle = $3
          and amount = $4
          and coalesce(metadata->>'selectedPaymentMethod', '') = $5
          and coalesce(metadata->>'voucherCode', '') = $6
          and transaction_status = 'pending'
          and (expires_at is null or expires_at > now())
        order by created_at desc
        limit 1
      `,
      [req.authUser!.id, payload.plan, payload.billingCycle, amount, payload.paymentMethod, voucherCode],
    );

    if (existingPending.rows[0]) {
      res.status(200).json({
        reused: true,
        payment: normalizeSubscriptionPaymentSession(existingPending.rows[0]),
        quote,
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
    const orderId = createMidtransOrderId(req.authUser!.id, payload.plan, payload.billingCycle);
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

    if (!response.ok) {
      const errorPayload = await response.text().catch(() => '');
      throw new ApiError(502, `Midtrans create transaction gagal (${response.status}). ${errorPayload || 'Silakan coba lagi.'}`);
    }

    const paymentPayload = await response.json() as { token?: string; redirect_url?: string };
    if (!paymentPayload.token || !paymentPayload.redirect_url) {
      throw new ApiError(502, 'Respons Midtrans tidak lengkap.');
    }
    const redirectUrl = appendMidtransRedirectOptions(paymentPayload.redirect_url, quote.selectedPaymentMethod.redirectMode);

    const sessionId = randomUUID();
    const inserted = await pool.query(
      `
        insert into public.subscription_payment_sessions (
          id,
          user_id,
          store_id,
          plan,
          billing_cycle,
          amount,
          currency_code,
          midtrans_order_id,
          snap_token,
          redirect_url,
          transaction_status,
          expires_at,
          metadata,
          updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, 'IDR', $7, $8, $9, 'pending', now() + interval '30 minutes', $10::jsonb, now()
        )
        returning
          id,
          plan,
          billing_cycle,
          amount,
          currency_code,
          midtrans_order_id,
          redirect_url,
          payment_type,
          transaction_status,
          expires_at,
          paid_at,
          settled_at,
          created_at,
          updated_at
      `,
      [
        sessionId,
        req.authUser!.id,
        store?.id ?? null,
        payload.plan,
        payload.billingCycle,
        amount,
        orderId,
        paymentPayload.token,
        redirectUrl,
        JSON.stringify({
          env: env.MIDTRANS_ENVIRONMENT,
          paymentMode: paymentConfig.mode,
          callbackUrls,
          selectedPaymentMethod: payload.paymentMethod,
          enabledPayments: quote.selectedPaymentMethod.midtransPayments,
          voucherCode,
          quote,
          storeName: store?.store_name ?? null,
        }),
      ],
    );

    res.status(201).json({
      reused: false,
      payment: normalizeSubscriptionPaymentSession(inserted.rows[0]),
      quote,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
