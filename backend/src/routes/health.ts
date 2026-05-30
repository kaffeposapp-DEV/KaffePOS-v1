/**
 * Health check + system status routes.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { Router } from 'express';
import {
  env,
  pool,
  log,
  serializeError,
  authenticate,
  requireAdmin,
} from '../core';
import { validateBackendDeploymentConfig } from '../lib/deploymentReadiness';
import {
  isCommercialPaymentReady,
  isDuitkuConfigured,
  isMidtransConfigured,
  resolveSubscriptionPaymentConfig,
} from '../core/billing';

const router = Router();

function isPaymentConfigured() {
  const paymentConfig = resolveSubscriptionPaymentConfig();
  if (paymentConfig.provider === 'duitku') return isDuitkuConfigured();
  if (paymentConfig.provider === 'midtrans') return isMidtransConfigured();
  return false;
}

function getPaymentEnvironment() {
  const paymentConfig = resolveSubscriptionPaymentConfig();
  return paymentConfig.provider === 'duitku' ? paymentConfig.duitkuEnvironment : paymentConfig.midtransEnvironment;
}

function buildReadinessScore(params: {
  databaseOk: boolean;
  emailOk: boolean;
  paymentOk?: boolean;
  paymentCommercialReady?: boolean;
}) {
  return {
    database: params.databaseOk ? 10 : 4,
    backend: params.databaseOk ? 9 : 5,
    auth: params.emailOk ? 9 : 7,
    sync_consistency: 9,
    deployment: params.paymentCommercialReady === false ? 8 : 9,
    email_flow: params.emailOk ? 9 : 5,
    payment_flow: params.paymentCommercialReady
      ? 9
      : params.paymentOk
      ? 6
      : 4,
  };
}

function getOperationalWarnings() {
  const warnings: string[] = [];
  const paymentConfig = resolveSubscriptionPaymentConfig();
  const deploymentValidation = validateBackendDeploymentConfig({
    nodeEnv: env.NODE_ENV,
    webBaseUrl: env.WEB_BASE_URL,
    apiBaseUrl: env.API_BASE_URL,
    corsOrigin: env.CORS_ORIGIN,
    midtransEnvironment: env.MIDTRANS_ENVIRONMENT,
    subscriptionPaymentMode: env.SUBSCRIPTION_PAYMENT_MODE,
    midtransSnapEnabled: env.MIDTRANS_SNAP_ENABLED === 'true',
    midtransServerKey: env.MIDTRANS_SERVER_KEY,
    midtransMerchantId: env.MIDTRANS_MERCHANT_ID,
    resendApiKey: env.RESEND_API_KEY,
    resendFromEmail: env.RESEND_FROM_EMAIL,
    sentryDsn: env.SENTRY_DSN,
  });

  warnings.push(...deploymentValidation.errors, ...deploymentValidation.warnings);

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    warnings.push('Email delivery belum dikonfigurasi penuh.');
  }

  if (!isPaymentConfigured()) {
    warnings.push('Payment gateway belum dikonfigurasi penuh di backend.');
  } else if (!paymentConfig.onlinePaymentAvailable) {
    warnings.push('Pembayaran online subscription dinonaktifkan. Gunakan aktivasi manual sampai payment gateway production siap.');
  } else if (!paymentConfig.commerciallyReady) {
    warnings.push('Pembayaran online belum commercial-ready karena masih memakai mode sandbox/QA.');
  }

  return warnings;
}

export type SystemStatusPayload = {
  ok: boolean;
  service: string;
  version: string;
  env: string;
  time: string;
  checks: {
    backend: { ok: boolean };
    database: { ok: boolean; latencyMs?: number | null };
    email: { ok: boolean; provider: string; fromEmail: string | null };
    payment: {
      ok: boolean;
      commerciallyReady: boolean;
      mode: string;
      onlinePaymentAvailable: boolean;
      manualActivationAvailable: boolean;
      provider: string;
      environment: string;
      merchantId: string | null;
    };
    monitoring: {
      backendErrorTracking: boolean;
      provider: string;
    };
  };
  syncMatrix: Record<string, boolean>;
  warnings: string[];
  readiness: Record<string, number>;
  error?: unknown;
};

export function redactOperationalWarnings(warnings: string[]) {
  const redacted = new Set<string>();

  for (const warning of warnings) {
    if (/resend|email/i.test(warning)) {
      redacted.add('Email delivery perlu dicek oleh tim operasional.');
    } else if (/midtrans|payment|pembayaran|subscription/i.test(warning)) {
      redacted.add('Payment flow perlu dicek oleh tim operasional.');
    } else if (/sentry|cors|base_url|origin|environment|production|sandbox/i.test(warning)) {
      redacted.add('Konfigurasi deployment perlu dicek oleh tim operasional.');
    } else {
      redacted.add('Ada konfigurasi operasional yang perlu dicek oleh tim.');
    }
  }

  return Array.from(redacted);
}

export function redactSystemStatusForPublic(payload: SystemStatusPayload): SystemStatusPayload {
  return {
    ...payload,
    checks: {
      ...payload.checks,
      email: {
        ...payload.checks.email,
        fromEmail: null,
      },
      payment: {
        ...payload.checks.payment,
        merchantId: null,
      },
    },
    warnings: redactOperationalWarnings(payload.warnings),
    error: undefined,
  };
}

function buildSystemStatusPayload(params: {
  ok: boolean;
  databaseOk: boolean;
  databaseLatencyMs: number;
  warnings: string[];
  error?: unknown;
}): SystemStatusPayload {
  const emailReady = Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
  const paymentConfig = resolveSubscriptionPaymentConfig();
  const paymentReady = isPaymentConfigured();
  const paymentCommercialReady = isCommercialPaymentReady();

  return {
    ok: params.ok,
    service: env.SERVICE_NAME,
    version: env.APP_VERSION,
    env: env.NODE_ENV,
    time: new Date().toISOString(),
    checks: {
      backend: { ok: true },
      database: { ok: params.databaseOk, latencyMs: params.databaseLatencyMs },
      email: {
        ok: emailReady,
        provider: 'resend',
        fromEmail: env.RESEND_FROM_EMAIL ?? null,
      },
      payment: {
        ok: paymentReady,
        commerciallyReady: paymentCommercialReady,
        mode: paymentConfig.mode,
        onlinePaymentAvailable: paymentConfig.onlinePaymentAvailable,
        manualActivationAvailable: paymentConfig.manualActivationAvailable,
        provider: paymentConfig.provider,
        environment: getPaymentEnvironment(),
        merchantId: env.PAYMENT_GATEWAY_PROVIDER === 'duitku' ? env.DUITKU_MERCHANT_CODE ?? null : env.MIDTRANS_MERCHANT_ID ?? null,
      },
      monitoring: {
        backendErrorTracking: Boolean(env.SENTRY_DSN),
        provider: 'sentry',
      },
    },
    syncMatrix: {
      auth: params.databaseOk,
      profile: params.databaseOk,
      stores: params.databaseOk,
      menu_items: params.databaseOk,
      inventory: params.databaseOk,
      inventory_unit_conversions: params.databaseOk,
      product_recipes: params.databaseOk,
      expenses: params.databaseOk,
      subscriptions: params.databaseOk,
      notifications: params.databaseOk,
      transactions: params.databaseOk,
      checkout: params.databaseOk,
      cashier_sessions: params.databaseOk,
      cash_register: params.databaseOk,
      subscription_payments: params.databaseOk && paymentCommercialReady,
      web: true,
      apk: true,
    },
    warnings: params.warnings,
    readiness: buildReadinessScore({
      databaseOk: params.databaseOk,
      emailOk: emailReady,
      paymentOk: paymentReady,
      paymentCommercialReady,
    }),
    ...(params.error === undefined ? {} : { error: serializeError(params.error) }),
  };
}

async function getSystemStatusPayload() {
  const startedAt = Date.now();

  try {
    await pool.query('select 1');
    return {
      statusCode: 200,
      payload: buildSystemStatusPayload({
        ok: true,
        databaseOk: true,
        databaseLatencyMs: Date.now() - startedAt,
        warnings: getOperationalWarnings(),
      }),
    };
  } catch (error) {
    return {
      statusCode: 503,
      payload: buildSystemStatusPayload({
        ok: false,
        databaseOk: false,
        databaseLatencyMs: Date.now() - startedAt,
        warnings: getOperationalWarnings(),
        error,
      }),
    };
  }
}

// ── Shared runtime state (injected on mount) ───────────────────

let _serviceStartedAt = Date.now();
let _isShuttingDown = false;

export function setHealthRuntimeState(state: { serviceStartedAt: number; isShuttingDown: () => boolean }) {
  _serviceStartedAt = state.serviceStartedAt;
  _isShuttingDown = false;
  // Re-read on each call via closure
  Object.defineProperty(router, '_getShuttingDown', { value: state.isShuttingDown, configurable: true });
}

function getShuttingDown() {
  const getter = (router as unknown as { _getShuttingDown?: () => boolean })._getShuttingDown;
  return getter ? getter() : _isShuttingDown;
}

// ── Routes ─────────────────────────────────────────────────────

router.get('/health', async (_req, res) => {
  const startedAt = Date.now();
  try {
    const db = await pool.query('select now() as now');
    res.json({
      ok: true,
      service: env.SERVICE_NAME,
      version: env.APP_VERSION,
      env: env.NODE_ENV,
      shuttingDown: getShuttingDown(),
      uptimeSeconds: Math.round((Date.now() - _serviceStartedAt) / 1000),
      time: new Date().toISOString(),
      checks: {
        database: {
          ok: true,
          latencyMs: Date.now() - startedAt,
          time: db.rows[0]?.now ?? null,
        },
      },
    });
  } catch (error) {
    log('error', 'healthcheck.failed', { error: serializeError(error) });
    res.status(503).json({
      ok: false,
      service: env.SERVICE_NAME,
      version: env.APP_VERSION,
      env: env.NODE_ENV,
      shuttingDown: getShuttingDown(),
      uptimeSeconds: Math.round((Date.now() - _serviceStartedAt) / 1000),
      time: new Date().toISOString(),
      checks: {
        database: {
          ok: false,
          latencyMs: Date.now() - startedAt,
        },
      },
    });
  }
});

router.get('/health/db', async (_req, res) => {
  const startedAt = Date.now();
  try {
    await pool.query('select 1');
    res.json({
      ok: true,
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: serializeError(error),
      time: new Date().toISOString(),
    });
  }
});

router.get('/system-status', async (_req, res) => {
  const result = await getSystemStatusPayload();
  res.status(result.statusCode).json(redactSystemStatusForPublic(result.payload));
});

router.get('/api/admin/system-status', authenticate, requireAdmin, async (_req, res) => {
  const result = await getSystemStatusPayload();
  res.status(result.statusCode).json(result.payload);
});

export { isMidtransConfigured, resolveSubscriptionPaymentConfig, isCommercialPaymentReady };

export default router;
