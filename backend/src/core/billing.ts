/**
 * Subscription billing domain helpers.
 * Extracted from monolith index.ts.
 */
import { env } from './env';
import { ApiError } from './errors';
import { createMidtransWebhookSignature } from '../lib/midtrans';
import type { PoolClient } from './db';
import { syncProfileSubscriptionState, insertNotification } from './helpers';

export type SubscriptionPaymentMode = 'manual' | 'disabled' | 'midtrans_sandbox' | 'midtrans_production';

export function getMidtransBaseUrl() {
  return env.MIDTRANS_ENVIRONMENT === 'production'
    ? 'https://app.midtrans.com'
    : 'https://app.sandbox.midtrans.com';
}

export function isMidtransConfigured() {
  return Boolean(env.MIDTRANS_SERVER_KEY && env.MIDTRANS_SNAP_ENABLED === 'true');
}

export function resolveSubscriptionPaymentConfig() {
  const midtransConfigured = isMidtransConfigured();
  const requestedMode = env.SUBSCRIPTION_PAYMENT_MODE;
  const productionMidtrans = env.MIDTRANS_ENVIRONMENT === 'production';
  let mode: SubscriptionPaymentMode;

  if (requestedMode === 'auto') {
    if (!midtransConfigured) {
      mode = 'manual';
    } else if (env.NODE_ENV === 'production' && !productionMidtrans) {
      mode = 'manual';
    } else {
      mode = productionMidtrans ? 'midtrans_production' : 'midtrans_sandbox';
    }
  } else if (requestedMode === 'midtrans_production' && !productionMidtrans) {
    mode = 'manual';
  } else if (requestedMode === 'midtrans_sandbox' && productionMidtrans) {
    mode = 'manual';
  } else {
    mode = requestedMode as SubscriptionPaymentMode;
  }

  const onlinePaymentAvailable =
    midtransConfigured &&
    ((mode === 'midtrans_production' && productionMidtrans) ||
      (mode === 'midtrans_sandbox' && !productionMidtrans));
  const commerciallyReady = onlinePaymentAvailable && mode === 'midtrans_production' && productionMidtrans;
  const manualActivationAvailable = mode === 'manual' || !onlinePaymentAvailable;

  return {
    mode,
    provider: 'midtrans',
    midtransEnvironment: env.MIDTRANS_ENVIRONMENT,
    onlinePaymentAvailable,
    manualActivationAvailable,
    commerciallyReady,
    message: onlinePaymentAvailable
      ? mode === 'midtrans_production'
        ? 'Pembayaran online Midtrans production aktif.'
        : 'Pembayaran online Midtrans sandbox aktif untuk QA internal.'
      : 'Pembayaran online belum dibuka. Aktivasi langganan dilakukan manual oleh admin sampai Midtrans production aktif.',
    recommendedAction: onlinePaymentAvailable
      ? 'Selesaikan pembayaran via checkout online.'
      : 'Hubungi admin untuk aktivasi manual setelah pembayaran transfer/QR manual.',
  };
}

export function requireOnlineSubscriptionPayment() {
  const paymentConfig = resolveSubscriptionPaymentConfig();
  if (!paymentConfig.onlinePaymentAvailable) {
    throw new ApiError(409, paymentConfig.message);
  }

  return paymentConfig;
}

export function isCommercialPaymentReady() {
  return resolveSubscriptionPaymentConfig().commerciallyReady;
}

export function createMidtransOrderId(userId: string, plan: string, billingCycle: string) {
  return `SUB-${plan.toUpperCase()}-${billingCycle.toUpperCase()}-${userId.slice(0, 8)}-${Date.now()}`;
}

export function getMidtransCallbackUrls() {
  const base = env.WEB_BASE_URL.replace(/\/$/, '');
  return {
    finish: env.MIDTRANS_FINISH_URL ?? `${base}/settings?billing=success`,
    unfinish: env.MIDTRANS_UNFINISH_URL ?? `${base}/settings?billing=pending`,
    error: env.MIDTRANS_ERROR_URL ?? `${base}/settings?billing=failed`,
  };
}

export function createMidtransSignature(orderId: string, statusCode: string, grossAmount: string) {
  return createMidtransWebhookSignature({
    orderId,
    statusCode,
    grossAmount,
    serverKey: env.MIDTRANS_SERVER_KEY,
  });
}

import { z } from 'zod';
import { buildSubscriptionBillingQuote, type SubscriptionPlanId, type BillingCycle, type SubscriptionPaymentMethodId } from '../lib/subscriptionBilling';

export const subscriptionPaymentMethodSchema = z.enum(['qris', 'bca_va', 'mandiri_bill', 'bni_va', 'bri_va']);
export const subscriptionPaymentRequestSchema = z.object({
  plan: z.enum(['kopi_susu', 'signature', 'founder']),
  billingCycle: z.enum(['monthly', 'quarterly', 'semiannual', 'yearly']),
  paymentMethod: subscriptionPaymentMethodSchema,
  voucherCode: z.string().trim().max(64).optional().nullable(),
});

export function calculateExpiryDate(billingCycle: 'free' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly') {
  if (billingCycle === 'free') return null;
  const expiresAt = new Date();
  const days = billingCycle === 'monthly' ? 30 : billingCycle === 'quarterly' ? 90 : billingCycle === 'semiannual' ? 180 : 365;
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

export function buildSubscriptionQuoteOrThrow(payload: {
  plan: SubscriptionPlanId;
  billingCycle: BillingCycle;
  paymentMethod: SubscriptionPaymentMethodId;
  voucherCode?: string | null;
}) {
  try {
    return buildSubscriptionBillingQuote(payload);
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : 'Detail checkout tidak valid.');
  }
}


export async function activatePaidSubscription(client: PoolClient, payload: {
  userId: string;
  plan: 'secangkir' | 'kopi_susu' | 'signature' | 'founder';
  billingCycle: 'free' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
  paymentAmount: number;
  paymentMethod: string;
  paymentRef: string;
  paymentNote?: string | null;
  paidAt?: string;
  sessionId?: string | null;
}) {
  const nowIso = payload.paidAt ?? new Date().toISOString();
  const expiresAt = calculateExpiryDate(payload.billingCycle)?.toISOString() ?? null;

  const profileResult = await client.query(
    `
      select id, email, username, display_name
      from public.profiles
      where id = $1
      limit 1
    `,
    [payload.userId],
  );
  const profile = profileResult.rows[0];
  if (!profile) {
    throw new ApiError(404, 'User tidak ditemukan.');
  }

  const sessionSubscriptionResult = payload.sessionId
    ? await client.query(
      `
        select
          s.id,
          s.user_id,
          s.store_id,
          s.tier,
          s.period,
          s.plan,
          s.billing_cycle,
          s.status,
          s.activated_at,
          s.expires_at,
          s.payment_ref,
          s.payment_amount,
          s.payment_method,
          s.payment_note,
          s.created_at,
          s.updated_at
        from public.subscription_payment_sessions ps
        join public.subscriptions s on s.id = ps.subscription_id
        where ps.id = $1
          and ps.user_id = $2
          and ps.subscription_id is not null
        limit 1
        for update of ps
      `,
      [payload.sessionId, payload.userId],
    )
    : { rows: [] };

  const existingSubscription = await client.query(
    `
      select
        s.id,
        s.user_id,
        s.store_id,
        s.tier,
        s.period,
        s.plan,
        s.billing_cycle,
        s.status,
        s.activated_at,
        s.expires_at,
        s.payment_ref,
        s.payment_amount,
        s.payment_method,
        s.payment_note,
        s.created_at,
        s.updated_at
      from public.subscriptions s
      where s.user_id = $1
        and s.payment_ref = $2
      limit 1
    `,
    [payload.userId, payload.paymentRef],
  );

  const storeResult = await client.query(
    `select id from public.stores where owner_id = $1 order by created_at asc limit 1`,
    [payload.userId],
  );
  const store = storeResult.rows[0];

  const sessionAlreadyActivated = Boolean(sessionSubscriptionResult.rows[0]);
  let subscription = sessionSubscriptionResult.rows[0] ?? existingSubscription.rows[0];

  if (!subscription) {
    await client.query(
      `
        update public.subscriptions
        set
          status = 'cancelled',
          updated_at = now()
        where user_id = $1
          and status = 'active'
      `,
      [payload.userId],
    );

    const insertSubscription = await client.query(
      `
        insert into public.subscriptions (
          user_id,
          store_id,
          tier,
          period,
          plan,
          billing_cycle,
          status,
          activated_at,
          expires_at,
          amount_paid,
          payment_amount,
          payment_method,
          payment_note,
          payment_ref,
          updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $11, $12, $13, now()
        )
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
      [
        payload.userId,
        store?.id ?? null,
        payload.plan === 'secangkir' ? 'basic' : 'pro',
        payload.billingCycle === 'free' ? 'free' : payload.billingCycle,
        payload.plan,
        payload.billingCycle,
        nowIso,
        expiresAt,
        payload.paymentAmount,
        payload.paymentAmount,
        payload.paymentMethod,
        payload.paymentNote ?? null,
        payload.paymentRef,
      ],
    );
    subscription = insertSubscription.rows[0];
  }

  const existingPaymentHistory = await client.query(
    `
      select id
      from public.payment_history
      where user_id = $1
        and payment_ref = $2
      limit 1
    `,
    [payload.userId, payload.paymentRef],
  );

  const shouldSkipPaymentHistory =
    sessionAlreadyActivated && subscription.payment_ref !== payload.paymentRef;

  if (!shouldSkipPaymentHistory && !existingPaymentHistory.rows[0]) {
    await client.query(
      `
        insert into public.payment_history (
          user_id,
          subscription_id,
          plan,
          billing_cycle,
          amount,
          payment_method,
          payment_note,
          payment_ref,
          status,
          paid_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, 'success', $9
        )
      `,
      [
        payload.userId,
        subscription.id,
        payload.plan,
        payload.billingCycle,
        payload.paymentAmount,
        payload.paymentMethod,
        payload.paymentNote ?? null,
        payload.paymentRef,
        nowIso,
      ],
    );
  }

  if (payload.sessionId) {
    await client.query(
      `
        update public.subscription_payment_sessions
        set
          subscription_id = $2,
          transaction_status = 'settlement',
          paid_at = coalesce(paid_at, $3),
          settled_at = coalesce(settled_at, $3),
          updated_at = now()
        where id = $1
      `,
      [payload.sessionId, subscription.id, nowIso],
    );
  }

  await syncProfileSubscriptionState(client, payload.userId);

  if (!sessionAlreadyActivated && !existingPaymentHistory.rows[0]) {
    await insertNotification(
      client,
      payload.userId,
      'Langganan aktif',
      `Pembayaran paket ${payload.plan} sudah diterima dan langganan kamu aktif.`,
      'success',
      { paymentRef: payload.paymentRef, billingCycle: payload.billingCycle, paymentMethod: payload.paymentMethod },
    );
  }

  return {
    subscription,
    email: (profile.email as string | null) ?? null,
    displayName: (profile.display_name as string | null) ?? (profile.username as string | null) ?? 'KaffePOS',
    plan: payload.plan,
    paymentAmount: payload.paymentAmount,
  };
}
