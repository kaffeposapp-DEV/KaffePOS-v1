/**
 * Admin routes with enhanced rate limiting and logging.
 * Updated: 2026-05-14
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
import { adminRateLimiter } from '../lib/rateLimiters';

const router = Router();

const adminSubscriptionActionSchema = z.object({
  userId: z.string().uuid(),
  plan: z.enum(['secangkir', 'kopi_susu', 'signature']),
  billingCycle: z.enum(['free', 'monthly', 'quarterly', 'semiannual', 'yearly']),
  paymentAmount: z.number().nonnegative(),
  paymentNote: z.string().trim().optional().nullable(),
});

// Apply rate limiting to all admin routes
router.use(adminRateLimiter);

router.get('/api/admin/subscriptions/overview', requireAdmin, async (req, res, next) => {
  try {
    log('info', 'admin.subscriptions_overview_accessed', {
      requestId: req.requestId ?? null,
      adminUserId: req.authUser?.id ?? null,
      adminEmail: req.authUser?.email ?? null,
    });

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

    log('info', 'admin.subscription_activation_started', {
      requestId: req.requestId ?? null,
      adminUserId: req.authUser?.id ?? null,
      adminEmail: req.authUser?.email ?? null,
      targetUserId: payload.userId,
      plan: payload.plan,
      billingCycle: payload.billingCycle,
      paymentAmount: payload.paymentAmount,
    });

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

    log('info', 'admin.subscription_activated', {
      requestId: req.requestId ?? null,
      adminUserId: req.authUser?.id ?? null,
      targetUserId: payload.userId,
      plan: payload.plan,
      billingCycle: payload.billingCycle,
      subscriptionId: result.subscription.id,
    });

    if (result.email) {
      await sendEmail({
        to: result.email,
        subject: 'Langganan KaffePOS aktif',
        text: `Paket ${payload.plan} (${payload.billingCycle}) sudah aktif untuk akun ${result.displayName}.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>Langganan aktif</h2><p>Paket <strong>${payload.plan}</strong> dengan siklus <strong>${payload.billingCycle}</strong> sudah aktif untuk akun ${result.displayName}.</p></div>`,
      }).catch((error) => {
        log('warn', 'email.subscription_activation_failed', { 
          error: serializeError(error), 
          userId: payload.userId,
          requestId: req.requestId ?? null,
        });
      });
    }

    res.status(201).json({
      success: true,
      subscription: normalizeSubscription(result.subscription),
      message: 'Langganan berhasil diaktifkan.',
    });
  } catch (error) {
    log('error', 'admin.subscription_activation_failed', {
      requestId: req.requestId ?? null,
      adminUserId: req.authUser?.id ?? null,
      error: serializeError(error),
    });
    next(error);
  }
});

router.post('/api/admin/subscriptions/:id/cancel', requireAdmin, async (req, res, next) => {
  try {
    const subscriptionId = req.params.id;

    log('info', 'admin.subscription_cancellation_started', {
      requestId: req.requestId ?? null,
      adminUserId: req.authUser?.id ?? null,
      adminEmail: req.authUser?.email ?? null,
      subscriptionId,
    });

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

    log('info', 'admin.subscription_cancelled', {
      requestId: req.requestId ?? null,
      adminUserId: req.authUser?.id ?? null,
      subscriptionId,
      targetUserId: result.subscription.user_id,
    });

    if (result.email) {
      await sendEmail({
        to: result.email,
        subject: 'Langganan KaffePOS dibatalkan',
        text: `Langganan pada akun ${result.displayName} telah dibatalkan.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>Langganan dibatalkan</h2><p>Langganan pada akun ${result.displayName} sudah dibatalkan.</p></div>`,
      }).catch((error) => {
        log('warn', 'email.subscription_cancel_failed', { 
          error: serializeError(error), 
          subscriptionId,
          requestId: req.requestId ?? null,
        });
      });
    }

    res.json({
      success: true,
      subscription: normalizeSubscription(result.subscription),
      message: 'Langganan dibatalkan.',
    });
  } catch (error) {
    log('error', 'admin.subscription_cancellation_failed', {
      requestId: req.requestId ?? null,
      adminUserId: req.authUser?.id ?? null,
      subscriptionId: req.params.id,
      error: serializeError(error),
    });
    next(error);
  }
});

export default router;
