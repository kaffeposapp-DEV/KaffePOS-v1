/**
 * Subscriptions and billing routes.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  pool,
  withTransaction,
  ApiError,
  requirePermission,
  assertStoreOwned,
  normalizeSubscription,
  normalizePaymentHistory,
  normalizeSubscriptionPaymentSession,
  resolveSubscriptionPaymentConfig,
  requireOnlineSubscriptionPayment,
  subscriptionPaymentRequestSchema,
  buildSubscriptionQuoteOrThrow,
  paymentCreateRateLimiter,
  ensureProfile,
  syncProfileSubscriptionState,
  env,
  insertNotification,
  sendTrialReminderEmail,
  log,
  serializeError,
} from '../core';
import {
  listSubscriptionPaymentMethods,
} from '../lib/subscriptionBilling';
import { createPaymentProvider, getActivePaymentProviderName } from '../payments/payment-provider.factory';

const router = Router();

const PAID_PLANS = new Set(['kopi_susu', 'signature', 'founder']);

function createDokuOrderId(userId: string, plan: string, billingCycle: string) {
  const planCode = plan.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'SUB';
  const cycleCode = billingCycle.replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase() || 'M';
  return `DOKU-${planCode}${cycleCode}-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
}

function resolveProfilePlan(profile: Record<string, unknown> | null | undefined) {
  if (!profile) return 'secangkir';
  const rawExpiry = profile.pro_expires_at ?? profile.tier_expires_at ?? null;
  const expired = rawExpiry ? new Date(String(rawExpiry)).getTime() <= Date.now() : false;
  const hasPaidTier = !expired && (profile.tier === 'pro' || profile.is_pro === true);
  const plan = typeof profile.pro_plan === 'string' && PAID_PLANS.has(profile.pro_plan)
    ? profile.pro_plan
    : null;
  if (hasPaidTier && profile.pro_plan === 'secangkir') return 'secangkir';
  return hasPaidTier && plan ? plan : 'secangkir';
}

const promptEventSchema = z.object({
  event_type: z.enum(['view', 'click', 'dismiss']),
  prompt_key: z.string().trim().min(1).max(120),
  trigger: z.string().trim().min(1).max(120),
  recommended_plan: z.enum(['kopi_susu', 'signature']).default('signature'),
  store_id: z.string().uuid().optional().nullable(),
  current_plan: z.string().trim().max(40).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

router.get('/api/subscriptions/usage-limits', async (req, res, next) => {
  try {
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : null;
    let store: Record<string, unknown> | null = null;

    if (storeId) {
      store = await assertStoreOwned(pool, storeId, req.authUser!.id);
    } else {
      const fallbackStore = await pool.query(
        `
          select id, owner_id, created_at
          from public.stores
          where owner_id = $1
          order by created_at asc
          limit 1
        `,
        [req.authUser!.id],
      );
      store = fallbackStore.rows[0] ?? null;
    }

    if (!store?.id) {
      throw new ApiError(404, 'Toko tidak ditemukan atau belum bisa diakses.');
    }

    const ownerId = String(store.owner_id);
    await withTransaction(async (client) => {
      await syncProfileSubscriptionState(client, ownerId);
    });

    const [profileResult, usageResult, firstTransactionResult] = await Promise.all([
      pool.query(
        `
          select id, email, display_name, username, tier, tier_expires_at, is_pro, pro_plan, pro_expires_at, created_at
          from public.profiles
          where id = $1
          limit 1
        `,
        [ownerId],
      ),
      pool.query(
        `
          select count(*)::int as used
          from public.transactions
          where store_id = $1
            and coalesce(is_void, false) = false
            and date >= date_trunc('month', now())
            and date < date_trunc('month', now()) + interval '1 month'
        `,
        [store.id],
      ),
      pool.query(
        `
          select min(date) as first_transaction_at
          from public.transactions
          where store_id = $1
        `,
        [store.id],
      ),
    ]);

    const profile = profileResult.rows[0] ?? null;
    const plan = resolveProfilePlan(profile);
    const isTrial = plan === 'secangkir' && (profile?.tier === 'pro' || profile?.is_pro === true) && Boolean(profile?.pro_expires_at || profile?.tier_expires_at);
    const trialEndsAt = isTrial ? (profile?.pro_expires_at ?? profile?.tier_expires_at ?? null) : null;
    const trialDaysRemaining = trialEndsAt
      ? Math.max(0, Math.ceil((new Date(String(trialEndsAt)).getTime() - Date.now()) / 86_400_000))
      : null;
    if (isTrial && (trialDaysRemaining === 4 || trialDaysRemaining === 1) && profile?.email) {
      const daysUsed = trialDaysRemaining === 4 ? 10 : 13;
      const promptKey = `trial_email_day_${daysUsed}`;
      const reminderLogged = await pool.query(
        `
          select id
          from public.notifications
          where user_id = $1
            and metadata->>'promptKey' = $2
          limit 1
        `,
        [ownerId, promptKey],
      );
      if (!reminderLogged.rows[0]) {
        await withTransaction(async (client) => {
          await insertNotification(
            client,
            ownerId,
            'Email reminder trial terkirim',
            `Reminder trial hari ke-${daysUsed} sudah dikirim ke email owner.`,
            'info',
            { promptKey, daysUsed, daysRemaining: trialDaysRemaining, trialEndsAt },
            String(store.id),
          );
        });
        sendTrialReminderEmail(
          String(profile.email),
          String(profile.display_name || profile.username || 'KaffePOS'),
          daysUsed,
          trialDaysRemaining,
          trialEndsAt ? String(trialEndsAt) : null,
        ).catch((error) => log('warn', 'subscription.trial_reminder_email_failed', {
          ownerId,
          daysUsed,
          error: serializeError(error),
        }));
      }
    }
    const transactionLimit = isTrial || plan !== 'secangkir' ? -1 : 100;
    const transactionsUsed = Number(usageResult.rows[0]?.used ?? 0);
    const percentUsed = transactionLimit > 0
      ? Math.min(100, Math.round((transactionsUsed / transactionLimit) * 100))
      : 0;
    const firstActivityAt = firstTransactionResult.rows[0]?.first_transaction_at
      ?? profile?.created_at
      ?? store.created_at
      ?? null;
    const daysSinceFirstActivity = firstActivityAt
      ? Math.max(0, Math.floor((Date.now() - new Date(String(firstActivityAt)).getTime()) / 86_400_000))
      : 0;

    res.json({
      storeId: store.id,
      ownerId,
      currentPlan: plan,
      transactionLimit,
      transactionsUsed,
      transactionsRemaining: transactionLimit > 0 ? Math.max(transactionLimit - transactionsUsed, 0) : null,
      percentUsed,
      period: {
        type: 'monthly',
        startsAt: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      },
      firstActivityAt,
      daysSinceFirstActivity,
      shouldShowTransactionLimitPrompt: transactionLimit > 0 && percentUsed >= 80 && transactionsUsed < transactionLimit,
      shouldShowAppAgePrompt: false,
      isTrial,
      trialEndsAt,
      trialDaysRemaining,
      shouldShowTrialUpgradePrompt: isTrial && [4, 1, 0].includes(trialDaysRemaining ?? -1),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/subscriptions/upgrade-prompts/log', async (req, res, next) => {
  try {
    const payload = promptEventSchema.parse(req.body);
    let storeId = payload.store_id ?? null;

    if (storeId) {
      await assertStoreOwned(pool, storeId, req.authUser!.id);
    }

    await pool.query(
      `
        insert into public.subscription_upgrade_prompt_events (
          id,
          user_id,
          store_id,
          event_type,
          prompt_key,
          trigger,
          recommended_plan,
          current_plan,
          metadata
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [
        randomUUID(),
        req.authUser!.id,
        storeId,
        payload.event_type,
        payload.prompt_key,
        payload.trigger,
        payload.recommended_plan,
        payload.current_plan ?? null,
        JSON.stringify(payload.metadata ?? {}),
      ],
    );

    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/api/subscriptions', requirePermission('can_manage_billing'), async (req, res, next) => {
  try {
    await withTransaction(async (client) => {
      await syncProfileSubscriptionState(client, req.authUser!.id);
    });

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
    const activeProvider = getActivePaymentProviderName();
    await pool.query(`
        alter table public.subscription_payment_sessions
          add column if not exists provider text,
          add column if not exists provider_reference text,
          add column if not exists merchant_order_id text,
          add column if not exists payment_url text,
          add column if not exists va_number text,
          add column if not exists qr_string text,
          add column if not exists payment_method text,
          add column if not exists provider_status text,
          add column if not exists internal_status text,
          add column if not exists callback_received_at timestamptz,
          add column if not exists expired_at timestamptz;

        create table if not exists public.payment_events (
          id uuid primary key default gen_random_uuid(),
          payment_id uuid,
          provider text not null,
          event_type text not null,
          provider_reference text,
          merchant_order_id text,
          raw_status text,
          internal_status text,
          payload jsonb not null default '{}'::jsonb,
          received_at timestamptz not null default now(),
          created_at timestamptz not null default now()
        );
      `);

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
    const orderId = createDokuOrderId(req.authUser!.id, payload.plan, payload.billingCycle);
    const provider = createPaymentProvider(activeProvider);
    const payment = await provider.createPayment({
      merchantOrderId: orderId,
      amount,
      productDetails: `Langganan ${quote.planName} (${payload.billingCycle})`,
      customerName: (profile.display_name as string | null) ?? (profile.username as string | null) ?? 'KaffePOS User',
      customerEmail: (profile.email as string | null) ?? req.authUser!.email ?? null,
      paymentMethod: payload.paymentMethod,
      itemDetails: [{ name: `Langganan ${quote.planName}`, price: amount, quantity: 1 }],
      metadata: { plan: payload.plan, billingCycle: payload.billingCycle },
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
          $16, $11, $7, $8, $12, $13, $14, $15, 'pending'
        )
        returning id, plan, billing_cycle, amount, currency_code, midtrans_order_id, redirect_url,
          payment_type, transaction_status, expires_at, paid_at, settled_at, created_at, updated_at,
          provider, provider_reference, merchant_order_id, payment_url, va_number, qr_string,
          payment_method, provider_status, internal_status
      `,
      [
        sessionId, req.authUser!.id, store?.id ?? null, payload.plan, payload.billingCycle, amount,
        orderId, payment.paymentUrl, env.DOKU_PAYMENT_DUE_MINUTES,
        JSON.stringify({ env: env.DOKU_ENVIRONMENT, paymentMode: paymentConfig.mode, callbackUrl: env.DOKU_CALLBACK_URL, selectedPaymentMethod: payload.paymentMethod, voucherCode, quote, storeName: store?.store_name ?? null, providerRaw: payment.raw }),
        payment.providerReference, payment.vaNumber, payment.qrString, payment.paymentMethod, payment.providerStatus, activeProvider,
      ],
    );

    res.status(201).json({ reused: false, payment: normalizeSubscriptionPaymentSession(inserted.rows[0]), quote });
  } catch (error) {
    next(error);
  }
});

export default router;
