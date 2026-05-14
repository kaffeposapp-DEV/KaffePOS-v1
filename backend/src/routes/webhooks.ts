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

const router = Router();

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
    next(error);
  }
}

router.post('/api/webhooks/midtrans', handleMidtransWebhook);
router.post('/api/payments/midtrans/webhook', handleMidtransWebhook);
router.post('/api/payment/webhook', handleMidtransWebhook);
router.post('/api/payment/midtrans-webhook', handleMidtransWebhook);

export default router;
