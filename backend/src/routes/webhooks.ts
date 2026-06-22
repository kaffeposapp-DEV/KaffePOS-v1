/**
 * Pre-authentication payment webhook (DOKU).
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  broadcastKitchenEvent,
  withTransaction,
  ApiError,
  activatePaidSubscription,
  sendPaymentSuccessEmail,
  log,
  serializeError,
  insertNotification,
} from '../core';
import { PaymentService } from '../services/PaymentService';
import { CommissionService } from '../services/CommissionService';
import { isReferralCommissionCreationEnabled } from '../lib/config/feature-flags';
import { alertOnPaymentWebhookFailure } from '../lib/alerting';
import { createPaymentProvider } from '../payments/payment-provider.factory';
import type { PaymentStatusResult } from '../payments/payment-provider.types';

const router = Router();

async function applySubscriptionPaymentResult(result: PaymentStatusResult, eventType: string) {
  if (!result.signatureValid || !result.merchantOrderId) throw new ApiError(401, 'Signature pembayaran tidak valid.');
  const paidEmail = await withTransaction(async (client) => {
    const sessionResult = await client.query(
      `
        select *
        from public.subscription_payment_sessions
        where merchant_order_id = $1 or midtrans_order_id = $1
        limit 1
        for update
      `,
      [result.merchantOrderId],
    );
    const session = sessionResult.rows[0];
    if (!session) throw new ApiError(404, 'Sesi pembayaran tidak ditemukan.');
    if (result.amount != null && Math.round(Number(session.amount ?? 0)) !== Math.round(result.amount)) {
      throw new ApiError(400, 'Jumlah pembayaran tidak sesuai.');
    }

    await client.query(
      `
        insert into public.payment_events (
          payment_id, provider, event_type, provider_reference, merchant_order_id, raw_status,
          internal_status, payload, signature_valid, processed_at
        ) values ($1, $8, $2, $3, $4, $5, $6, $7::jsonb, true, now())
      `,
      [session.id, eventType, result.providerReference, result.merchantOrderId, result.rawStatus, result.internalStatus, JSON.stringify(result.raw), result.provider],
    ).catch(() => undefined);

    const paidAt = result.paidAt ?? new Date().toISOString();
    await client.query(
      `
        update public.subscription_payment_sessions
        set provider = $8,
            provider_reference = coalesce($2, provider_reference),
            payment_method = coalesce($3, payment_method),
            provider_status = $4,
            internal_status = $5,
            transaction_status = $5,
            callback_received_at = case when $6 then coalesce(callback_received_at, now()) else callback_received_at end,
            paid_at = case when $5 = 'paid' then coalesce(paid_at, $7::timestamptz) else paid_at end,
            settled_at = case when $5 = 'paid' then coalesce(settled_at, $7::timestamptz) else settled_at end,
            expired_at = case when $5 = 'expired' then coalesce(expired_at, now()) else expired_at end,
            updated_at = now()
        where id = $1
      `,
      [session.id, result.providerReference, result.paymentMethod, result.rawStatus, result.internalStatus, eventType === 'callback', paidAt, result.provider],
    );

    if (result.internalStatus !== 'paid' || session.subscription_id) return null;
    const activation = await activatePaidSubscription(client, {
      userId: session.user_id as string,
      plan: session.plan as 'secangkir' | 'kopi_susu' | 'signature' | 'founder',
      billingCycle: session.billing_cycle as 'free' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly',
      paymentAmount: Number(session.amount ?? 0),
      paymentMethod: result.paymentMethod ?? result.provider,
      paymentRef: result.merchantOrderId!,
      paymentNote: `${result.provider} ${result.paymentMethod ?? 'payment'}`,
      paidAt,
      sessionId: session.id as string,
    });
    if (isReferralCommissionCreationEnabled()) {
      await new CommissionService(client).createFromPayment({
        userId: session.user_id as string,
        paymentId: session.id as string,
        grossAmount: Number(session.amount ?? 0),
        paidAt,
        orderId: result.merchantOrderId!,
      }).catch((error) => log('warn', 'affiliate.commission_sync_failed', { error: serializeError(error), orderId: result.merchantOrderId }));
    }
    return activation;
  });

  if (paidEmail?.email) {
    await sendPaymentSuccessEmail(
      paidEmail.email,
      paidEmail.displayName ?? 'KaffePOS User',
      paidEmail.plan.toUpperCase(),
      paidEmail.paymentAmount,
      result.merchantOrderId,
    ).catch((error) => log('warn', 'email.settlement_failed', { error: serializeError(error), orderId: result.merchantOrderId }));
  }
}

/** Settle a POS payment_order from a gateway callback. Returns false if the
 *  order id does not belong to a POS order (so the caller can try subscriptions). */
async function applyPosPaymentResult(result: PaymentStatusResult, eventType: string): Promise<boolean> {
  if (!result.merchantOrderId) return false;
  const settlement = await withTransaction(async (client) => {
    const orderResult = await client.query(
      `
        select id, user_id, store_id, transaction_id, midtrans_order_id, merchant_order_id,
               gross_amount, subtotal, discount_amount, tax_amount, customer_name, items, status
        from public.payment_orders
        where merchant_order_id = $1 or midtrans_order_id = $1
        limit 1
        for update
      `,
      [result.merchantOrderId],
    );
    const paymentOrder = orderResult.rows[0];
    if (!paymentOrder) return null;

    if (result.amount != null && Math.round(Number(paymentOrder.gross_amount ?? 0)) !== Math.round(result.amount)) {
      throw new ApiError(400, 'Jumlah pembayaran tidak sesuai.');
    }

    const paidAt = result.paidAt ?? new Date().toISOString();
    const orderStatus = result.internalStatus === 'paid'
      ? 'paid'
      : result.internalStatus === 'cancelled'
        ? 'cancelled'
        : (result.internalStatus === 'failed' || result.internalStatus === 'expired')
          ? 'failed'
          : 'pending';

    await client.query(
      `
        update public.payment_orders
        set provider = $2,
            provider_reference = coalesce($3, provider_reference),
            payment_method = coalesce($4, payment_method),
            transaction_status = $5,
            internal_status = $5,
            provider_status = $6,
            status = $7,
            paid_at = case when $7 = 'paid' then coalesce(paid_at, $8::timestamptz) else paid_at end,
            failed_at = case when $7 = 'failed' then coalesce(failed_at, now()) else failed_at end,
            callback_received_at = coalesce(callback_received_at, now()),
            updated_at = now()
        where id = $1
      `,
      [paymentOrder.id, result.provider, result.providerReference, result.paymentMethod, result.internalStatus, result.rawStatus, orderStatus, paidAt],
    );

    await client.query(
      `
        insert into public.payment_events (
          payment_id, provider, event_type, provider_reference, merchant_order_id, raw_status,
          internal_status, payload, signature_valid, processed_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, true, now())
      `,
      [paymentOrder.id, result.provider, eventType, result.providerReference, result.merchantOrderId, result.rawStatus, result.internalStatus, JSON.stringify(result.raw)],
    ).catch(() => undefined);

    let transactionId: string | null = paymentOrder.transaction_id ?? null;
    let kitchenOrder: Record<string, unknown> | null = null;
    if (orderStatus === 'paid') {
      const finalized = await PaymentService.finalizePaidOrder(client, paymentOrder, { paymentType: result.paymentMethod ?? null, paidAt });
      transactionId = finalized.transactionId ?? transactionId;
      kitchenOrder = finalized.kitchenOrder as Record<string, unknown> | null;
      await insertNotification(client, paymentOrder.user_id as string, 'Pembayaran diterima', 'Pembayaran POS sudah diterima.', 'success', { paymentRef: result.merchantOrderId, transactionId }, paymentOrder.store_id as string);
    } else if (orderStatus === 'failed' || orderStatus === 'cancelled') {
      await PaymentService.voidCompletedOrderTransaction(client, paymentOrder, `Pembayaran ${result.rawStatus ?? orderStatus}`);
      await insertNotification(client, paymentOrder.user_id as string, 'Pembayaran gagal', 'Pembayaran POS belum berhasil. Coba ulang dari kasir.', 'warning', { paymentRef: result.merchantOrderId, status: result.rawStatus }, paymentOrder.store_id as string);
    }
    return { storeId: paymentOrder.store_id as string, transactionId, kitchenOrder };
  });

  if (!settlement) return false;
  if (settlement.kitchenOrder && settlement.storeId && settlement.transactionId) {
    broadcastKitchenEvent({
      id: randomUUID(),
      type: 'order_created',
      store_id: settlement.storeId,
      order_id: String(settlement.kitchenOrder.id),
      created_at: new Date().toISOString(),
      payload: { order: settlement.kitchenOrder, transactionId: settlement.transactionId },
    });
  }
  return true;
}

async function handleDokuWebhook(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1], next: Parameters<Parameters<typeof router.post>[1]>[2]) {
  try {
    const provider = createPaymentProvider('doku');
    const result = await provider.verifyCallback({
      body: req.body as Record<string, unknown>,
      headers: req.headers,
      rawBody: req.rawBody,
    });
    if (!result.signatureValid) {
      log('warn', 'doku_webhook_signature_failed', { merchantOrderId: result.merchantOrderId, rawStatus: result.rawStatus });
      throw new ApiError(401, 'Signature DOKU tidak valid.');
    }
    const settledPosOrder = await applyPosPaymentResult(result, 'callback');
    if (!settledPosOrder) {
      await applySubscriptionPaymentResult(result, 'callback');
    }
    res.status(200).json({ received: true, provider: 'doku', status: result.internalStatus, kind: settledPosOrder ? 'pos' : 'subscription' });
  } catch (error) {
    alertOnPaymentWebhookFailure('DOKU webhook processing failed', { error: String(error) });
    next(error);
  }
}

router.post('/api/webhooks/doku', handleDokuWebhook);

export default router;
