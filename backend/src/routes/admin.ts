/**
 * Admin routes — subscription overview, activation, cancellation.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  pool,
  withTransaction,
  ApiError,
  requireAdmin,
  normalizeSubscription,
  normalizePaymentHistory,
  activatePaidSubscription,
  sendEmail,
  log,
  serializeError,
  insertNotification,
  syncProfileSubscriptionState,
} from '../core';

const router = Router();

const adminSubscriptionActionSchema = z.object({
  userId: z.string().uuid(),
  plan: z.enum(['secangkir', 'kopi_susu', 'signature', 'founder']),
  billingCycle: z.enum(['free', 'monthly', 'quarterly', 'yearly']),
  paymentAmount: z.number().nonnegative(),
  paymentNote: z.string().trim().optional().nullable(),
});

router.get('/api/admin/subscriptions/overview', requireAdmin, async (_req, res, next) => {
  try {
    const [profiles, subscriptions, paymentHistory] = await Promise.all([
      pool.query(
        `
          select id, email, display_name, username, role
          from public.profiles
          order by created_at desc
        `,
      ),
      pool.query(
        `
          select id, user_id, plan, billing_cycle, activated_at, expires_at, status, payment_amount
          from public.subscriptions
          order by activated_at desc
        `,
      ),
      pool.query(
        `
          select id, user_id, plan, billing_cycle, amount, payment_method, paid_at, status, payment_note
          from public.payment_history
          order by paid_at desc
        `,
      ),
    ]);

    res.json({
      profiles: profiles.rows,
      subscriptions: subscriptions.rows.map((row: Record<string, unknown>) => normalizeSubscription(row)),
      paymentHistory: paymentHistory.rows.map((row: Record<string, unknown>) => normalizePaymentHistory(row)),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/admin/subscriptions/activate', requireAdmin, async (req, res, next) => {
  try {
    const payload = adminSubscriptionActionSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      return activatePaidSubscription(client, {
        userId: payload.userId,
        plan: payload.plan,
        billingCycle: payload.billingCycle,
        paymentAmount: payload.paymentAmount,
        paymentMethod: payload.plan === 'secangkir' ? 'free' : 'manual_transfer',
        paymentNote: payload.paymentNote ?? null,
        paymentRef: payload.plan === 'secangkir' ? 'FREE-AUTO' : `MANUAL-${Date.now()}`,
      });
    });

    if (result.email) {
      await sendEmail({
        to: result.email,
        subject: 'Langganan KaffePOS aktif',
        text: `Paket ${payload.plan} (${payload.billingCycle}) sudah aktif untuk akun ${result.displayName}.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>Langganan aktif</h2><p>Paket <strong>${payload.plan}</strong> dengan siklus <strong>${payload.billingCycle}</strong> sudah aktif untuk akun ${result.displayName}.</p></div>`,
      }).catch((error) => {
        log('warn', 'email.subscription_activation_failed', { error: serializeError(error), userId: payload.userId });
      });
    }

    res.status(201).json({
      success: true,
      subscription: normalizeSubscription(result.subscription),
      message: 'Langganan berhasil diaktifkan.',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/admin/subscriptions/:id/cancel', requireAdmin, async (req, res, next) => {
  try {
    const subscriptionId = req.params.id;
    const result = await withTransaction(async (client) => {
      const updated = await client.query(
        `
          update public.subscriptions
          set
            status = 'cancelled',
            expires_at = now(),
            updated_at = now()
          where id = $1
          returning
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
        `,
        [subscriptionId],
      );

      const subscription = updated.rows[0];
      if (!subscription) {
        throw new ApiError(404, 'Langganan tidak ditemukan.');
      }

      const profileResult = await client.query(
        `select email, display_name, username from public.profiles where id = $1 limit 1`,
        [subscription.user_id],
      );

      await insertNotification(
        client,
        subscription.user_id as string,
        'Langganan dibatalkan',
        'Langganan aktif pada akun kamu telah dibatalkan.',
        'warning',
      );

      await syncProfileSubscriptionState(client, subscription.user_id as string);

      return {
        subscription,
        email: (profileResult.rows[0]?.email as string | null) ?? null,
        displayName: (profileResult.rows[0]?.display_name as string | null) ?? (profileResult.rows[0]?.username as string | null) ?? 'KaffePOS',
      };
    });

    if (result.email) {
      await sendEmail({
        to: result.email,
        subject: 'Langganan KaffePOS dibatalkan',
        text: `Langganan pada akun ${result.displayName} telah dibatalkan.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>Langganan dibatalkan</h2><p>Langganan pada akun ${result.displayName} sudah dibatalkan.</p></div>`,
      }).catch((error) => {
        log('warn', 'email.subscription_cancel_failed', { error: serializeError(error), subscriptionId });
      });
    }

    res.json({
      success: true,
      subscription: normalizeSubscription(result.subscription),
      message: 'Langganan dibatalkan.',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
