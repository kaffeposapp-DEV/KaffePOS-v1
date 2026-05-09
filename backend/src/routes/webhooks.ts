/**
 * Pre-authentication webhook routes (e.g., Midtrans).
 * Extracted from monolith index.ts.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
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

router.post('/api/payments/midtrans/webhook', async (req, res, next) => {
  try {
    if (!isMidtransConfigured()) {
      throw new ApiError(503, 'Midtrans belum dikonfigurasi di backend.');
    }

    const payload = midtransWebhookSchema.parse(req.body);
    const expectedSignature = createMidtransSignature(payload.order_id, payload.status_code, payload.gross_amount);
    if (payload.signature_key !== expectedSignature) {
      throw new ApiError(401, 'Signature Midtrans tidak valid.');
    }

    const result = await withTransaction(async (client) => {
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

      if (statusDecision.shouldActivateLicense && !paymentSession.subscription_id) {
        activationResult = await activatePaidSubscription(client, {
          userId: paymentSession.user_id as string,
          plan: paymentSession.plan as 'secangkir' | 'kopi_susu' | 'signature' | 'founder',
          billingCycle: paymentSession.billing_cycle as 'free' | 'monthly' | 'quarterly' | 'yearly',
          paymentAmount: Number(paymentSession.amount ?? 0),
          paymentMethod: payload.payment_type ?? 'midtrans',
          paymentRef: paymentSession.midtrans_order_id as string,
          paymentNote: `Midtrans ${payload.payment_type ?? 'payment'} (${env.MIDTRANS_ENVIRONMENT})`,
          paidAt,
          sessionId: paymentSession.id as string,
        });
      } else if (statusDecision.shouldNotifyFailure) {
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
      };
    });

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
    });
  } catch (error) {
    next(error);
  }
});

export default router;
