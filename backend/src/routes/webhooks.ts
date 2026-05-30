/**
 * Pre-authentication webhook routes (e.g., Midtrans).
 * Extracted from monolith index.ts.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  broadcastKitchenEvent,
  pool,
  withTransaction,
  ApiError,
  env,
  createMidtransSignature,
  isMidtransConfigured,
  activatePaidSubscription,
  sendPaymentSuccessEmail,
  log,
  serializeError,
  insertNotification,
} from '../core';
import { classifyMidtransWebhookStatus } from '../lib/midtransStatus';
import { PaymentService } from '../services/PaymentService';
import { CommissionService } from '../services/CommissionService';
import { isReferralCommissionCreationEnabled } from '../lib/config/feature-flags';
import { alertOnPaymentWebhookFailure } from '../lib/alerting';
import { createPaymentProvider } from '../payments/payment-provider.factory';
import type { PaymentStatusResult } from '../payments/payment-provider.types';

const router = Router();

async function applySubscriptionPaymentResult(result: PaymentStatusResult, eventType: string) {
  if (!result.signatureValid || !result.merchantOrderId) throw new ApiError(401, 'Signature Duitku tidak valid.');
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
      throw new ApiError(400, 'Amount Duitku tidak sesuai.');
    }

    await client.query(
      `
        insert into public.payment_events (
          payment_id, provider, event_type, provider_reference, merchant_order_id, raw_status,
          internal_status, payload, signature_valid, processed_at
        ) values ($1, 'duitku', $2, $3, $4, $5, $6, $7::jsonb, true, now())
      `,
      [session.id, eventType, result.providerReference, result.merchantOrderId, result.rawStatus, result.internalStatus, JSON.stringify(result.raw)],
    ).catch(() => undefined);

    const paidAt = result.paidAt ?? new Date().toISOString();
    await client.query(
      `
        update public.subscription_payment_sessions
        set provider = 'duitku',
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
      [session.id, result.providerReference, result.paymentMethod, result.rawStatus, result.internalStatus, eventType === 'callback', paidAt],
    );

    if (result.internalStatus !== 'paid' || session.subscription_id) return null;
    return activatePaidSubscription(client, {
      userId: session.user_id as string,
      plan: session.plan as 'secangkir' | 'kopi_susu' | 'signature' | 'founder',
      billingCycle: session.billing_cycle as 'free' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly',
      paymentAmount: Number(session.amount ?? 0),
      paymentMethod: result.paymentMethod ?? 'duitku',
      paymentRef: result.merchantOrderId!,
      paymentNote: `Duitku ${result.paymentMethod ?? 'payment'} (${env.DUITKU_ENVIRONMENT})`,
      paidAt,
      sessionId: session.id as string,
    });
  });

  if (paidEmail?.email) {
    await sendPaymentSuccessEmail(
      paidEmail.email,
      paidEmail.displayName ?? 'KaffePOS User',
      paidEmail.plan.toUpperCase(),
      paidEmail.paymentAmount,
      result.merchantOrderId,
    ).catch((error) => log('warn', 'email.duitku_settlement_failed', { error: serializeError(error), orderId: result.merchantOrderId }));
  }
}

async function handleDuitkuWebhook(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1], next: Parameters<Parameters<typeof router.post>[1]>[2]) {
  try {
    const provider = createPaymentProvider('duitku');
    const result = await provider.verifyCallback({ body: req.body as Record<string, unknown> });
    if (!result.signatureValid) {
      log('warn', 'duitku_webhook_signature_failed', { merchantOrderId: result.merchantOrderId, rawStatus: result.rawStatus });
      throw new ApiError(401, 'Signature Duitku tidak valid.');
    }
    await applySubscriptionPaymentResult(result, 'callback');
    res.status(200).json({ received: true, provider: 'duitku', status: result.internalStatus });
  } catch (error) {
    alertOnPaymentWebhookFailure('Duitku webhook processing failed', { error: String(error) });
    next(error);
  }
}

const midtransWebhookSchema = z.object({
  order_id: z.string().trim().min(1),
  status_code: z.union([z.string(), z.number()]).transform((value) => String(value)),
  gross_amount: z.union([z.string(), z.number()]).transform((value) => String(value)),
  signature_key: z.string().trim().min(1),
  transaction_status: z.string().trim().min(1),
  payment_type: z.string().trim().optional(),
  transaction_id: z.string().trim().optional(),
  fraud_status: z.string().trim().optional(),
  settlement_time: z.string().trim().optional(),
  transaction_time: z.string().trim().optional(),
  expiry_time: z.string().trim().optional(),
});

async function logPaymentWebhook(input: {
  orderId?: string | null;
  paymentOrderId?: string | null;
  signatureValid: boolean;
  transactionStatus?: string | null;
  payload: Record<string, unknown>;
}) {
  try {
    await pool.query(
      `
        insert into public.payment_webhook_logs (
          provider, order_id, payment_order_id, signature_valid, transaction_status, payload
        ) values (
          'midtrans', $1, $2, $3, $4, $5::jsonb
        )
      `,
      [
        input.orderId ?? null,
        input.paymentOrderId ?? null,
        input.signatureValid,
        input.transactionStatus ?? null,
        JSON.stringify(input.payload),
      ],
    );
  } catch (error) {
    log('warn', 'payment.webhook_log_failed', { error: serializeError(error), orderId: input.orderId ?? null });
  }
}

async function handleMidtransWebhook(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1], next: Parameters<Parameters<typeof router.post>[1]>[2]) {
  try {
    if (!isMidtransConfigured()) {
      throw new ApiError(503, 'Midtrans belum dikonfigurasi di backend.');
    }

    const payload = midtransWebhookSchema.parse(req.body);
    const expectedSignature = createMidtransSignature(payload.order_id, payload.status_code, payload.gross_amount);
    if (payload.signature_key !== expectedSignature) {
      log('warn', 'payment_webhook_signature_failed', { orderId: payload.order_id, transactionStatus: payload.transaction_status });
      alertOnPaymentWebhookFailure('Midtrans webhook signature validation failed', {
        orderId: payload.order_id,
        transactionStatus: payload.transaction_status,
      });
      await logPaymentWebhook({
        orderId: payload.order_id,
        signatureValid: false,
        transactionStatus: payload.transaction_status,
        payload: req.body as Record<string, unknown>,
      });
      throw new ApiError(401, 'Signature Midtrans tidak valid.');
    }

    log('info', 'midtrans_webhook_received', { orderId: payload.order_id, transactionStatus: payload.transaction_status });

    await logPaymentWebhook({
      orderId: payload.order_id,
      signatureValid: true,
      transactionStatus: payload.transaction_status,
      payload: req.body as Record<string, unknown>,
    });

    const result = await withTransaction(async (client) => {
      const paymentOrderResult = await client.query(
        `
          select
            id,
            user_id,
            store_id,
            transaction_id,
            midtrans_order_id,
            gross_amount,
            subtotal,
            discount_amount,
            tax_amount,
            customer_name,
            items,
            status
          from public.payment_orders
          where midtrans_order_id = $1
          limit 1
          for update
        `,
        [payload.order_id],
      );
      const paymentOrder = paymentOrderResult.rows[0];
      if (paymentOrder) {
        const expectedGrossAmount = Math.round(Number(paymentOrder.gross_amount ?? 0));
        const receivedGrossAmount = Math.round(Number(payload.gross_amount));
        if (expectedGrossAmount !== receivedGrossAmount) {
          log('warn', 'payment.webhook_amount_mismatch', {
            orderId: payload.order_id,
            expectedGrossAmount,
            receivedGrossAmount,
          });
          throw new ApiError(400, 'Gross amount Midtrans tidak sesuai.');
        }

        const rawStatus = payload.transaction_status.toLowerCase();
        const fraudStatus = payload.fraud_status?.toLowerCase() ?? null;
        const statusDecision = classifyMidtransWebhookStatus({
          transactionStatus: rawStatus,
          fraudStatus,
        });
        const paidAt = payload.settlement_time ?? payload.transaction_time ?? new Date().toISOString();
        const orderStatus = statusDecision.shouldActivateLicense
          ? 'paid'
          : statusDecision.shouldNotifyFailure
            ? rawStatus === 'cancel' ? 'cancelled' : 'failed'
            : 'pending';

        await client.query(
          `
            update public.payment_orders
            set
              midtrans_transaction_id = coalesce($2, midtrans_transaction_id),
              payment_type = coalesce($3, payment_type),
              transaction_status = $4,
              fraud_status = $5,
              status_code = $6,
              status = $7,
              paid_at = case when $7 = 'paid' then coalesce(paid_at, $8::timestamptz) else paid_at end,
              failed_at = case when $7 = 'failed' then coalesce(failed_at, now()) else failed_at end,
              expires_at = coalesce($9::timestamptz, expires_at),
              updated_at = now()
            where id = $1
          `,
          [
            paymentOrder.id,
            payload.transaction_id ?? null,
            payload.payment_type ?? null,
            statusDecision.storedStatus,
            fraudStatus,
            payload.status_code,
            orderStatus,
            paidAt,
            payload.expiry_time ?? null,
          ],
        );

        let finalOrderStatus = orderStatus;
        let transactionId: string | null = paymentOrder.transaction_id ?? null;
        let kitchenOrder: Record<string, unknown> | null = null;
        if (orderStatus === 'paid') {
          const finalized = await PaymentService.finalizePaidOrder(client, paymentOrder, {
            paymentType: payload.payment_type ?? null,
            paidAt,
          });
          finalOrderStatus = 'completed';
          transactionId = finalized.transactionId ?? transactionId;
          kitchenOrder = finalized.kitchenOrder as Record<string, unknown> | null;
          log('info', 'payment.pos_order_completed', {
            orderId: payload.order_id,
            transactionId,
            paymentType: payload.payment_type ?? null,
          });
        } else if (orderStatus === 'failed' || orderStatus === 'cancelled') {
          const reason = `Pembayaran ${rawStatus} dari Midtrans`;
          await PaymentService.voidCompletedOrderTransaction(client, paymentOrder, reason);
          log('warn', 'payment.pos_order_failed', {
            orderId: payload.order_id,
            transactionId,
            status: rawStatus,
            paymentType: payload.payment_type ?? null,
          });
        }

        await pool.query(
          `
            update public.payment_webhook_logs
            set payment_order_id = $2
            where order_id = $1
              and payment_order_id is null
          `,
          [payload.order_id, paymentOrder.id],
        ).catch(() => undefined);

        if (orderStatus === 'paid') {
          await insertNotification(
            client,
            paymentOrder.user_id as string,
            'Pembayaran diterima',
            'Pembayaran Midtrans untuk checkout POS sudah diterima.',
            'success',
            { paymentRef: payload.order_id, paymentType: payload.payment_type ?? null, transactionId },
            paymentOrder.store_id as string,
          );
        } else if (orderStatus === 'failed') {
          await insertNotification(
            client,
            paymentOrder.user_id as string,
            'Pembayaran gagal',
            'Pembayaran Midtrans belum berhasil. Coba ulang dari kasir.',
            'warning',
            { paymentRef: payload.order_id, status: rawStatus, paymentType: payload.payment_type ?? null },
            paymentOrder.store_id as string,
          );
        }

        return {
          activationResult: null,
          paymentType: payload.payment_type ?? 'midtrans',
          transactionStatus: statusDecision.storedStatus,
          orderStatus: finalOrderStatus,
          orderKind: 'pos',
          kitchenOrder,
          storeId: paymentOrder.store_id as string,
          transactionId,
        };
      }

      const paymentSessionResult = await client.query(
        `
          select
            id,
            user_id,
            subscription_id,
            plan,
            billing_cycle,
            amount,
            midtrans_order_id,
            transaction_status,
            paid_at,
            settled_at
          from public.subscription_payment_sessions
          where midtrans_order_id = $1
          limit 1
          for update
        `,
        [payload.order_id],
      );

      const paymentSession = paymentSessionResult.rows[0];
      if (!paymentSession) {
        throw new ApiError(404, 'Sesi pembayaran tidak ditemukan.');
      }

      const rawStatus = payload.transaction_status.toLowerCase();
      const fraudStatus = payload.fraud_status?.toLowerCase() ?? null;
      const statusDecision = classifyMidtransWebhookStatus({
        transactionStatus: rawStatus,
        fraudStatus,
      });
      const paidAt = payload.settlement_time ?? payload.transaction_time ?? new Date().toISOString();

      await client.query(
        `
          update public.subscription_payment_sessions
          set
            midtrans_transaction_id = coalesce($2, midtrans_transaction_id),
            payment_type = coalesce($3, payment_type),
            transaction_status = $4,
            fraud_status = $5,
            status_code = $6,
            expires_at = coalesce($7::timestamptz, expires_at),
            paid_at = case when $8 then coalesce(paid_at, $9::timestamptz) else paid_at end,
            settled_at = case when $8 then coalesce(settled_at, $9::timestamptz) else settled_at end,
            updated_at = now()
          where id = $1
        `,
        [
          paymentSession.id,
          payload.transaction_id ?? null,
          payload.payment_type ?? null,
          statusDecision.storedStatus,
          fraudStatus,
          payload.status_code,
          payload.expiry_time ?? null,
          statusDecision.shouldActivateLicense,
          paidAt,
        ],
      );

      let activationResult: Awaited<ReturnType<typeof activatePaidSubscription>> | null = null;

      const commissionService = new CommissionService(client);
      let commissionSync: Awaited<ReturnType<CommissionService['createFromPayment']>> | Awaited<ReturnType<CommissionService['cancelForPayment']>> | null = null;

      if (statusDecision.shouldActivateLicense && !paymentSession.subscription_id) {
        activationResult = await activatePaidSubscription(client, {
          userId: paymentSession.user_id as string,
          plan: paymentSession.plan as 'secangkir' | 'kopi_susu' | 'signature' | 'founder',
          billingCycle: paymentSession.billing_cycle as 'free' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly',
          paymentAmount: Number(paymentSession.amount ?? 0),
          paymentMethod: payload.payment_type ?? 'midtrans',
          paymentRef: paymentSession.midtrans_order_id as string,
          paymentNote: `Midtrans ${payload.payment_type ?? 'payment'} (${env.MIDTRANS_ENVIRONMENT})`,
          paidAt,
          sessionId: paymentSession.id as string,
        });
      }

      if (statusDecision.shouldActivateLicense) {
        if (isReferralCommissionCreationEnabled()) {
          commissionSync = await commissionService.createFromPayment({
            userId: paymentSession.user_id as string,
            paymentId: paymentSession.id as string,
            grossAmount: Number(paymentSession.amount ?? 0),
            paidAt,
            orderId: payload.order_id,
          });
          log('info', 'affiliate.commission_sync_success', {
            orderId: payload.order_id,
            userId: paymentSession.user_id,
            created: 'created' in commissionSync ? commissionSync.created : false,
            reason: 'reason' in commissionSync ? commissionSync.reason : null,
          });
        } else {
          log('info', 'affiliate.commission_sync_disabled', { orderId: payload.order_id, userId: paymentSession.user_id });
        }
      } else if (statusDecision.shouldNotifyFailure) {
        if (isReferralCommissionCreationEnabled()) {
          commissionSync = await commissionService.cancelForPayment({
            userId: paymentSession.user_id as string,
            paymentId: paymentSession.id as string,
            status: rawStatus,
            orderId: payload.order_id,
          });
        }
        await insertNotification(
          client,
          paymentSession.user_id as string,
          'Pembayaran subscription gagal',
          'Pembayaran Midtrans belum berhasil. Kamu bisa coba lagi kapan saja.',
          'warning',
          { paymentRef: payload.order_id, status: rawStatus, paymentType: payload.payment_type ?? null },
        );
      }

      return {
        activationResult,
        paymentType: payload.payment_type ?? 'midtrans',
        transactionStatus: statusDecision.storedStatus,
        orderStatus: statusDecision.shouldActivateLicense ? 'paid' : statusDecision.shouldNotifyFailure ? 'failed' : 'pending',
        orderKind: 'subscription',
        commissionSync,
        kitchenOrder: null,
        storeId: null,
        transactionId: null,
      };
    });

    if (result.orderKind === 'pos' && result.kitchenOrder && result.storeId && result.transactionId) {
      broadcastKitchenEvent({
        id: randomUUID(),
        type: 'order_created',
        store_id: result.storeId,
        order_id: String(result.kitchenOrder.id),
        created_at: new Date().toISOString(),
        payload: { order: result.kitchenOrder, transactionId: result.transactionId },
      });
    }

    if (result.activationResult?.email) {
      await sendPaymentSuccessEmail(
        result.activationResult.email,
        result.activationResult.displayName ?? 'KaffePOS User',
        result.activationResult.plan.toUpperCase(),
        result.activationResult.paymentAmount,
        payload.order_id
      ).catch((error) => {
        log('warn', 'email.midtrans_settlement_failed', { error: serializeError(error), orderId: payload.order_id });
      });
    }

    res.json({
      received: true,
      paymentType: result.paymentType,
      transactionStatus: result.transactionStatus,
      orderStatus: result.orderStatus,
      orderKind: result.orderKind,
    });
  } catch (error) {
    alertOnPaymentWebhookFailure('Midtrans webhook processing failed', {
      error: String(error),
      orderId: (error as any)?.orderId ?? null,
    });
    next(error);
  }
}

router.post('/api/webhooks/midtrans', handleMidtransWebhook);
router.post('/api/webhooks/duitku', handleDuitkuWebhook);
router.post('/api/payments/midtrans/webhook', handleMidtransWebhook);
router.post('/api/payment/webhook', handleMidtransWebhook);
router.post('/api/payment/midtrans-webhook', handleMidtransWebhook);

export default router;
