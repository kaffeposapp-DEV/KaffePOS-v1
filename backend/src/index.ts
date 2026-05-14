import 'dotenv/config';

import healthRouter, { setHealthRuntimeState } from './routes/health';
import authRouter from './routes/auth';
import storesRouter from './routes/stores';
import menuRouter from './routes/menu';
import inventoryRouter from './routes/inventory';
import financeRouter from './routes/finance';
import kitchenRouter from './routes/kitchen';
import transactionsRouter from './routes/transactions';
import loyaltyRouter from './routes/loyalty';
import challengesRouter from './routes/challenges';
import subscriptionsRouter from './routes/subscriptions';
import paymentRouter from './routes/payment';
import adminRouter from './routes/admin';
import miscRouter from './routes/misc';
import webhooksRouter from './routes/webhooks';
import { appVersionAuthenticatedRouter, appVersionPublicRouter } from './routes/appVersion';
import referralsRouter from './routes/referrals';
import affiliateRouter from './routes/affiliate';
import adminMfaRouter from './routes/admin-mfa';
import { securityHeaders } from './middleware/securityHeaders';
import { compression } from './middleware/compression';
import { trackApiCall } from './lib/monitoring';
import { initEmailJobs } from './lib/emailJobs';
import { jobQueue } from './lib/jobQueue';

import { handleAnalyticsJob, handleCommissionJob, handleEmailJob, handleNotificationJob } from './lib/jobQueueHandlers';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { type Server } from 'node:http';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { type PoolClient } from 'pg';
import { z } from 'zod';
import { appendMidtransRedirectOptions, buildMidtransCreateTransactionPayload, createMidtransWebhookSignature } from './lib/midtrans';
import { buildAllowedCorsOrigins, isOriginAllowed } from './lib/corsOrigins';
import { validateBackendDeploymentConfig } from './lib/deploymentReadiness';
import { buildPasswordResetLink } from './lib/emailLinks';
import { adminEmails, env } from './core/env';
import { pool } from './core/db';
import { ApiError, getSafeApiErrorMessage, log, serializeError } from './core/errors';
import { captureBackendException, initBackendErrorTracking } from './core/errorTracking';
import {
  KitchenStatusError,
  assertKitchenTransition,
  deriveKitchenOrderStatus,
  normalizeKitchenStatus,
  terminalKitchenStatuses,
  type KitchenStatus,
} from './lib/kitchenStatus';
import {
  buildSubscriptionBillingQuote,
  listSubscriptionPaymentMethods,
  type BillingCycle,
  type SubscriptionPaymentMethodId,
  type SubscriptionPlanId,
} from './lib/subscriptionBilling';
import {
  getPermissionsForRole,
  hasPermission,
  normalizeUserRole,
  type Permission,
  type UserRole,
} from './lib/accessControl';
import {
  canCashierLogin,
  cashierCreateInputSchema,
  cashierUpdateInputSchema,
  normalizeCashierStatus,
} from './lib/cashierManagement';
import { menuRecipeItemSchema, prepareMenuItemPatchPayload } from './lib/menuRecipePayload';
import { convertRecipeQuantityToBase, type UnitConversionRecord } from './lib/stockEngine';
import {
  validateStockBulkImportRows,
  type StockBulkImportMode,
  type StockBulkImportRow,
} from './lib/stockImport';

import {
  errorLoggingMiddleware,
  installDatabaseApm,
  metricsHandler,
  requestContextMiddleware,
  requestLoggingMiddleware,
  startApmMonitoring,
} from './middleware/apm';

type AuthenticatedUser = {
  id: string;
  email: string | null;
  email_verified_at?: string | null;
  created_at?: string | null;
  role: UserRole;
  permissions: Permission[];
  account_status?: string | null;
};

type AuthenticatedSession = {
  id: string;
  tokenHash: string;
  expiresAt: string;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      authSession?: AuthenticatedSession;
      requestId?: string;
    }
  }
}

const serviceStartedAt = Date.now();
let isShuttingDown = false;
let server: Server | null = null;

const allowedOrigins = buildAllowedCorsOrigins(env.CORS_ORIGIN);

const app = express();
app.use(securityHeaders);
initBackendErrorTracking();
initEmailJobs();
installDatabaseApm(pool);
startApmMonitoring();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(compression);
app.use(requestContextMiddleware());
app.use(requestLoggingMiddleware());

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
  }),
);

type RateLimitOptions = {
  name: string;
  max: number;
  windowMs: number;
  key: (req: Request) => string;
  message: string;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function normalizeRateLimitPart(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().slice(0, 160);
}

function getRateLimitIp(req: Request) {
  return req.ip || req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function createRateLimiter(options: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${options.name}:${options.key(req) || getRateLimitIp(req)}`;
    const current = rateLimitStore.get(key);

    if (!current || current.resetAt <= now) {
      rateLimitStore.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(new ApiError(429, options.message));
      return;
    }

    current.count += 1;
    next();
  };
}

function authEmailRateKey(req: Request) {
  const email = normalizeRateLimitPart((req.body as { email?: unknown } | undefined)?.email);
  return `${getRateLimitIp(req)}:${email || 'no-email'}`;
}

const authLoginRateLimiter = createRateLimiter({
  name: 'auth-login',
  max: env.AUTH_LOGIN_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  key: authEmailRateKey,
  message: 'Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.',
});

const authEmailRateLimiter = createRateLimiter({
  name: 'auth-email',
  max: env.AUTH_EMAIL_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  key: authEmailRateKey,
  message: 'Terlalu banyak permintaan email. Tunggu sebentar sebelum mencoba lagi.',
});

const authVerifyRateLimiter = createRateLimiter({
  name: 'auth-verify',
  max: env.AUTH_VERIFY_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  key: authEmailRateKey,
  message: 'Terlalu banyak percobaan verifikasi. Tunggu sebentar lalu coba lagi.',
});

const paymentCreateRateLimiter = createRateLimiter({
  name: 'payment-create',
  max: env.PAYMENT_CREATE_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  key: (req) => `${req.authUser?.id ?? getRateLimitIp(req)}:${getRateLimitIp(req)}`,
  message: 'Terlalu banyak percobaan membuat pembayaran. Tunggu sebentar lalu coba lagi.',
});

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, Math.min(env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000)).unref();

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return 0;
}

function normalizeStore(row: Record<string, unknown>) {
  return {
    ...row,
    tax_percent: toNumber(row.tax_percent),
    logo_size: row.logo_size == null ? null : Number(row.logo_size),
  };
}

function serializeCashier(row: Record<string, unknown>) {
  return {
    id: row.id,
    display_name: row.display_name,
    email: row.email,
    username: row.username,
    role: 'cashier',
    status: normalizeCashierStatus(row.account_status ?? row.status),
    store_id: row.store_id,
    store_name: row.store_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeInventory(row: Record<string, unknown>) {
  return {
    ...row,
    stock: toNumber(row.stock),
    conversion_ratio: row.conversion_ratio == null ? null : toNumber(row.conversion_ratio),
    min_stock: toNumber(row.min_stock),
    cost_per_unit: toNumber(row.cost_per_unit),
    is_active: row.is_active !== false,
  };
}

function normalizeStockUnitConversion(row: Record<string, unknown>) {
  return {
    ...row,
    ratio: toNumber(row.ratio),
    is_active: row.is_active !== false,
  };
}

function normalizeTransaction(row: Record<string, unknown>) {
  return {
    ...row,
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    tax: Number(row.tax ?? 0),
    total: Number(row.total ?? 0),
    cogs: Number(row.cogs ?? 0),
    paid: Number(row.paid ?? 0),
    change: Number(row.change ?? 0),
  };
}

function normalizeSubscription(row: Record<string, unknown>) {
  return {
    ...row,
    payment_amount: row.payment_amount == null ? null : Number(row.payment_amount),
  };
}

function normalizePaymentHistory(row: Record<string, unknown>) {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
  };
}

function normalizeSubscriptionPaymentSession(row: Record<string, unknown>) {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
  };
}

async function withTransaction<T>(runner: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();

  try {
    await client.query('begin');
    const result = await runner(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function pickDefined<T extends Record<string, unknown>>(payload: T, allowedKeys: string[]) {
  const result: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    if (payload[key] !== undefined) {
      result[key] = payload[key];
    }
  }

  return result;
}

function buildUpdateClause(payload: Record<string, unknown>, startIndex = 1) {
  const entries = Object.entries(payload);
  if (entries.length === 0) {
    throw new ApiError(400, 'Tidak ada field yang bisa diubah.');
  }

  const values = entries.map(([, value]) => value);
  const clause = entries
    .map(([column], index) => `${column} = $${index + startIndex}`)
    .join(', ');

  return { clause, values };
}

function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function isAdminUser(user: AuthenticatedUser | undefined) {
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;
  return adminEmails.has(email);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function generateOtpCode() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function getMidtransBaseUrl() {
  return env.MIDTRANS_ENVIRONMENT === 'production'
    ? 'https://app.midtrans.com'
    : 'https://app.sandbox.midtrans.com';
}

function isMidtransConfigured() {
  return Boolean(env.MIDTRANS_SERVER_KEY && env.MIDTRANS_SNAP_ENABLED === 'true');
}

type SubscriptionPaymentMode = 'manual' | 'disabled' | 'midtrans_sandbox' | 'midtrans_production';

function resolveSubscriptionPaymentConfig() {
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
    mode = requestedMode;
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

function requireOnlineSubscriptionPayment() {
  const paymentConfig = resolveSubscriptionPaymentConfig();
  if (!paymentConfig.onlinePaymentAvailable) {
    throw new ApiError(409, paymentConfig.message);
  }

  return paymentConfig;
}

function isCommercialPaymentReady() {
  return resolveSubscriptionPaymentConfig().commerciallyReady;
}

function createMidtransOrderId(userId: string, plan: string, billingCycle: string) {
  return `SUB-${plan.toUpperCase()}-${billingCycle.toUpperCase()}-${userId.slice(0, 8)}-${Date.now()}`;
}

function getMidtransCallbackUrls() {
  const base = env.WEB_BASE_URL.replace(/\/$/, '');
  return {
    finish: env.MIDTRANS_FINISH_URL ?? `${base}/settings?billing=success`,
    unfinish: env.MIDTRANS_UNFINISH_URL ?? `${base}/settings?billing=pending`,
    error: env.MIDTRANS_ERROR_URL ?? `${base}/settings?billing=failed`,
  };
}

function createMidtransSignature(orderId: string, statusCode: string, grossAmount: string) {
  return createMidtransWebhookSignature({
    orderId,
    statusCode,
    grossAmount,
    serverKey: env.MIDTRANS_SERVER_KEY,
  });
}

async function revokeUserSessions(client: PoolClient, userId: string) {
  await client.query(
    `
      update public.app_auth_sessions
      set revoked_at = now()
      where user_id = $1
        and revoked_at is null
    `,
    [userId],
  );
}

async function createSession(client: PoolClient, user: Pick<AuthenticatedUser, 'id'>, req: Request) {
  const token = createOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = addDays(new Date(), env.SESSION_TTL_DAYS).toISOString();

  const sessionResult = await client.query(
    `
      insert into public.app_auth_sessions (
        user_id,
        token_hash,
        ip_address,
        user_agent,
        expires_at
      ) values ($1, $2, $3, $4, $5)
      returning id, expires_at
    `,
    [
      user.id,
      tokenHash,
      req.ip,
      req.get('user-agent') ?? null,
      expiresAt,
    ],
  );

  return {
    accessToken: token,
    expiresAt: sessionResult.rows[0]?.expires_at ?? expiresAt,
    sessionId: sessionResult.rows[0]?.id as string,
  };
}

async function insertNotification(client: PoolClient, userId: string, title: string, message: string, type = 'info', metadata: Record<string, unknown> = {}) {
  await client.query(
    `
      insert into public.notifications (user_id, title, message, type, metadata)
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [userId, title, message, type, JSON.stringify(metadata)],
  );
}

async function sendEmail(payload: { to: string; subject: string; html: string; text: string }) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    log('warn', 'email.skipped_missing_config', {
      to: payload.to,
      subject: payload.subject,
    });
    return { delivered: false, skipped: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => '');
    throw new Error(`Resend error ${response.status}: ${errorPayload || 'unknown error'}`);
  }

  return { delivered: true, skipped: false };
}

async function createEmailCode(client: PoolClient, email: string, purpose: 'signup' | 'reset_password') {
  const code = generateOtpCode();
  const expiresAt = addMinutes(new Date(), env.EMAIL_CODE_TTL_MINUTES).toISOString();

  await client.query(
    `
      insert into public.email_verification_codes (
        email,
        purpose,
        code,
        expires_at
      ) values ($1, $2, $3, $4)
    `,
    [email, purpose, code, expiresAt],
  );

  return { code, expiresAt };
}

function getResetLink(email: string, token: string) {
  return buildPasswordResetLink({ webBaseUrl: env.WEB_BASE_URL, email, token });
}

function buildEmailTemplate(title: string, preheader: string, contentHtml: string) {
  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader}
  </div>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:24px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <tr>
            <td align="center" style="padding:32px 24px 24px;border-bottom:1px solid #f1f5f9;">
              <h1 style="margin:0;font-size:24px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">KaffePOS</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px;color:#334155;font-size:15px;line-height:1.6;">
              ${contentHtml}
            </td>
          </tr>
        </table>
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;margin-top:32px;">
          <tr>
            <td align="center" style="color:#64748b;font-size:13px;line-height:1.5;">
              <p style="margin:0 0 8px;">Butuh bantuan? Balas email ini atau hubungi tim KaffePOS.</p>
              <p style="margin:0;">&copy; ${new Date().getFullYear()} KaffePOS Indonesia. Hak cipta dilindungi.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

async function sendSignupOtpEmail(email: string, code: string, storeName: string) {
  const subject = `🔑 Kode Verifikasi KaffePOS: ${code}`;
  const text = `Halo, kode verifikasi untuk akun ${storeName} adalah ${code}. Kode ini berlaku ${env.EMAIL_CODE_TTL_MINUTES} menit.`;
  const preheader = 'Gunakan kode ini untuk masuk ke akun Anda. Berlaku selama 5 menit...';
  const html = buildEmailTemplate(subject, preheader, `
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Verifikasi akun Anda</h2>
    <p style="margin:0 0 24px;">Halo <strong>${storeName}</strong>, ini kunci masuk sementara Anda. Jangan bagikan kode ini kepada kasir Anda atau siapapun.</p>
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
      <p style="margin:0;font-size:36px;font-weight:900;letter-spacing:8px;color:#0f172a;">${code}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#64748b;">Kode ini berlaku ${env.EMAIL_CODE_TTL_MINUTES} menit. Jika Anda tidak merasa melakukan pendaftaran, abaikan email ini.</p>
  `);

  await sendEmail({ to: email, subject, text, html });
}

async function sendPasswordResetEmail(email: string, resetLink: string) {
  const subject = '🔐 Instruksi Reset Password KaffePOS';
  const text = `Klik tautan berikut untuk mereset password akun KaffePOS Anda: ${resetLink}`;
  const preheader = 'Kami menerima permintaan untuk mereset password akun Anda...';
  const html = buildEmailTemplate(subject, preheader, `
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Reset Password</h2>
    <p style="margin:0 0 24px;">Kami menerima permintaan untuk melakukan perubahan password pada akun KaffePOS Anda.</p>
    <a href="${resetLink}" style="display:block;width:100%;text-align:center;padding:16px 20px;background:#0f172a;color:#ffffff;border-radius:12px;font-weight:bold;text-decoration:none;box-sizing:border-box;">Ubah Password Sekarang</a>
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;">Jika tombol di atas tidak berfungsi, salin dan tempel tautan ini ke browser Anda: <br><a href="${resetLink}" style="color:#2563eb;word-break:break-all;">${resetLink}</a></p>
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;">Jika Anda tidak melakukan permintaan ini, abaikan email ini dan akun Anda akan tetap aman.</p>
  `);

  await sendEmail({ to: email, subject, text, html });
}

async function sendWelcomeEmail(email: string, storeName: string) {
  const subject = '👋 Selamat datang di ekosistem KaffePOS!';
  const text = `Akun ${storeName} sudah aktif. Masuk ke ${env.WEB_BASE_URL} untuk mulai operasional.`;
  const preheader = 'Langkah pertama untuk manajemen kasir yang lebih profesional...';
  const html = buildEmailTemplate(subject, preheader, `
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Selamat datang di KaffePOS</h2>
    <p style="margin:0 0 24px;">Akun bisnis <strong>${storeName}</strong> sudah aktif dan siap dipakai. Ini adalah langkah pertama menuju manajemen kasir yang lebih rapi dan terukur.</p>
    <a href="${env.WEB_BASE_URL}" style="display:block;width:100%;text-align:center;padding:16px 20px;background:#0f172a;color:#ffffff;border-radius:12px;font-weight:bold;text-decoration:none;box-sizing:border-box;">Buka Dashboard KaffePOS</a>
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;">Langkah selanjutnya: Lengkapi profil toko Anda, tambahkan menu, dan Anda siap bertransaksi!</p>
  `);

  await sendEmail({ to: email, subject, text, html });
}

async function sendPasswordChangedEmail(email: string) {
  const subject = '✅ Password KaffePOS Berhasil Diperbarui';
  const text = `Password akun KaffePOS Anda sudah berhasil diperbarui. Jika ini bukan Anda, segera hubungi tim KaffePOS.`;
  const preheader = 'Password akun KaffePOS Anda baru saja diganti...';
  const html = buildEmailTemplate(subject, preheader, `
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Password Berhasil Diperbarui</h2>
    <p style="margin:0 0 24px;">Password akun KaffePOS Anda baru saja berhasil diganti.</p>
    <a href="${env.WEB_BASE_URL}" style="display:block;width:100%;text-align:center;padding:16px 20px;background:#0f172a;color:#ffffff;border-radius:12px;font-weight:bold;text-decoration:none;box-sizing:border-box;">Buka KaffePOS</a>
    <div style="margin:24px 0 0;padding:16px;background:#fff1f2;border-radius:12px;">
      <p style="margin:0;font-size:14px;color:#be123c;"><strong>Penting:</strong> Jika Anda merasa tidak mengganti password ini, segera hubungi tim Support KaffePOS untuk mengamankan akun Anda.</p>
    </div>
  `);

  await sendEmail({ to: email, subject, text, html });
}

async function sendPaymentSuccessEmail(email: string, storeName: string, planName: string, amount: number, orderId: string) {
  const subject = `✅ Pembayaran Berhasil: KaffePOS ${planName} Aktif`;
  const text = `Pembayaran langganan ${planName} sudah diterima. Akun ${storeName} sekarang aktif dan siap dipakai.`;
  const preheader = 'Terima kasih! Pembayaran Anda telah kami terima dan fitur premium sudah aktif...';
  
  const formattedAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  
  const html = buildEmailTemplate(subject, preheader, `
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Pembayaran Berhasil</h2>
    <p style="margin:0 0 24px;">Terima kasih! Dana Anda sudah kami terima. Paket <strong>${planName}</strong> untuk outlet <strong>${storeName}</strong> resmi aktif.</p>
    
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <span style="color:#64748b;font-size:14px;">Nomor Order</span>
        <span style="color:#0f172a;font-size:14px;font-weight:600;">${orderId}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <span style="color:#64748b;font-size:14px;">Paket</span>
        <span style="color:#0f172a;font-size:14px;font-weight:600;">${planName}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding-top:12px;border-top:1px dashed #cbd5e1;">
        <span style="color:#64748b;font-size:14px;font-weight:600;">Total Dibayar</span>
        <span style="color:#0f172a;font-size:14px;font-weight:900;">${formattedAmount}</span>
      </div>
    </div>
    
    <p style="margin:0 0 24px;">Semua fitur premium seperti sinkronisasi cloud penuh dan koneksi printer pintar sudah dapat Anda nikmati sekarang.</p>
    <a href="${env.WEB_BASE_URL}" style="display:block;width:100%;text-align:center;padding:16px 20px;background:#10b981;color:#ffffff;border-radius:12px;font-weight:bold;text-decoration:none;box-sizing:border-box;">Buka KaffePOS Sekarang</a>
  `);

  await sendEmail({ to: email, subject, text, html });
}

async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      throw new ApiError(401, 'Missing bearer token.');
    }

    const tokenHash = hashToken(token);
    const result = await pool.query(
      `
        select
          s.id as session_id,
          s.expires_at,
          c.user_id,
          c.email,
          c.email_verified_at,
          p.role,
          p.account_status,
          exists (
            select 1
            from public.cashier_outlet_assignments a
            where a.cashier_id = c.user_id
              and a.status = 'active'
          ) as has_active_assignment
        from public.app_auth_sessions s
        join public.app_auth_credentials c on c.user_id = s.user_id
        left join public.profiles p on p.id = c.user_id
        where s.token_hash = $1
          and s.revoked_at is null
          and s.expires_at > now()
        limit 1
      `,
      [tokenHash],
    );

    const session = result.rows[0];
    if (!session) {
      throw new ApiError(401, 'Sesi tidak valid atau sudah kedaluwarsa.');
    }

    const role = normalizeUserRole(session.role);
    const accountStatus = normalizeCashierStatus(session.account_status);
    if (role === 'cashier' && !canCashierLogin(accountStatus)) {
      throw new ApiError(403, 'Akun kasir nonaktif. Hubungi Owner/Admin.');
    }
    if (role === 'cashier' && !session.has_active_assignment) {
      throw new ApiError(403, 'Akun kasir belum terhubung ke outlet aktif.');
    }

    req.authUser = {
      id: session.user_id as string,
      email: (session.email as string | null) ?? null,
      email_verified_at: (session.email_verified_at as string | null) ?? null,
      role,
      permissions: getPermissionsForRole(role),
      account_status: accountStatus,
    };
    req.authSession = {
      id: session.session_id as string,
      tokenHash,
      expiresAt: session.expires_at as string,
    };

    void pool.query(
      `
        update public.app_auth_sessions
        set last_seen_at = now()
        where id = $1
      `,
      [session.session_id],
    ).catch(() => {});

    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!isAdminUser(req.authUser)) {
    next(new ApiError(403, 'Akses admin ditolak.'));
    return;
  }

  next();
}

function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const role = req.authUser?.role;
    if (!role || !hasPermission(role, permission)) {
      log('warn', 'authz.denied', {
        requestId: req.requestId ?? null,
        userId: req.authUser?.id ?? null,
        role: role ?? null,
        permission,
        path: req.originalUrl,
        method: req.method,
      });
      next(new ApiError(403, 'Akses tidak diizinkan untuk role akun ini.'));
      return;
    }

    next();
  };
}

const profileColumns = `
  id,
  username,
  display_name,
  email,
  avatar_url,
  tier,
  tier_expires_at,
  is_pro,
  pro_plan,
  pro_order_id,
  pro_activated_at,
  pro_expires_at,
  role,
  account_status,
  created_at,
  updated_at
`;

function serializeProfile(row: Record<string, unknown> | null | undefined) {
  if (!row) return row;
  const role = normalizeUserRole(row.role);
  return {
    ...row,
    role,
    account_status: normalizeCashierStatus(row.account_status),
    permissions: getPermissionsForRole(role),
  };
}

async function getCashierAssignment(client: PoolClient, cashierId: string) {
  const result = await client.query(
    `
      select
        a.owner_id,
        a.store_id,
        a.status as assignment_status,
        s.store_name
      from public.cashier_outlet_assignments a
      join public.stores s on s.id = a.store_id
      where a.cashier_id = $1
      order by a.updated_at desc
      limit 1
    `,
    [cashierId],
  );

  const row = result.rows[0];
  if (!row) return {};

  return {
    owner_id: row.owner_id,
    assigned_store_id: row.store_id,
    assigned_store_name: row.store_name,
    assignment_status: normalizeCashierStatus(row.assignment_status),
  };
}

async function serializeProfileWithAssignment(client: PoolClient, row: Record<string, unknown> | null | undefined) {
  const profile = serializeProfile(row) as Record<string, unknown> | null | undefined;
  if (!profile || profile.role !== 'cashier') return profile;
  return {
    ...profile,
    ...(await getCashierAssignment(client, String(profile.id))),
  };
}

const storeColumns = `
  id,
  owner_id,
  store_name,
  address,
  whatsapp,
  tax_percent,
  receipt_header,
  receipt_footer,
  logo_url,
  logo_base64,
  logo_position,
  logo_size,
  show_logo_on_receipt,
  currency,
  tagline,
  email,
  website,
  paper_width,
  receipt_font_size,
  receipt_show_address,
  receipt_show_whatsapp,
  receipt_show_tax,
  receipt_show_cashier,
  receipt_show_trx_id,
  receipt_divider,
  receipt_custom_line1,
  receipt_custom_line2,
  timezone,
  created_at,
  updated_at
`;

const menuColumns = `
  id,
  store_id,
  name,
  price,
  category,
  image_url,
  description,
  is_available,
  sort_order,
  recipe,
  variants,
  created_at,
  updated_at
`;

const inventoryColumns = `
  id,
  store_id,
  name,
  sku,
  stock,
  unit,
  base_unit,
  purchase_unit,
  conversion_ratio,
  min_stock,
  cost_per_unit,
  is_active,
  created_at,
  updated_at
`;

const stockUnitConversionColumns = `
  id,
  store_id,
  ingredient_id,
  from_unit,
  to_unit,
  ratio,
  is_active,
  created_at,
  updated_at
`;

const expenseColumns = `
  id,
  store_id,
  date,
  description,
  amount,
  category,
  cashier,
  source,
  created_at
`;

const cashFlowColumns = `
  id,
  store_id,
  date,
  type,
  amount,
  description,
  cashier,
  created_at
`;

const cashRegisterColumns = `
  id,
  store_id,
  date,
  amount,
  note,
  opened_by,
  created_at
`;

const transactionColumns = `
  id,
  store_id,
  date,
  items,
  subtotal,
  discount,
  discount_label,
  tax,
  total,
  cogs,
  paid,
  change,
  method,
  customer_name,
  cashier,
  note,
  is_void,
  void_reason,
  void_at,
  void_by,
  created_at
`;

const kitchenOrderColumns = `
  id,
  store_id,
  transaction_id,
  order_number,
  source,
  customer_name,
  table_number,
  overall_status,
  created_by,
  created_by_name,
  status_version,
  cancelled_reason,
  created_at,
  updated_at
`;

const kitchenOrderItemColumns = `
  id,
  order_id,
  menu_item_id,
  item_name,
  qty,
  note,
  station,
  item_status,
  status_version,
  created_at,
  updated_at
`;

type KitchenRealtimeEventType =
  | 'order_created'
  | 'order_updated'
  | 'order_cancelled'
  | 'item_status_changed'
  | 'order_status_changed'
  | 'snapshot_required';

type KitchenRealtimeEvent = {
  id: string;
  type: KitchenRealtimeEventType;
  store_id: string;
  order_id?: string | null;
  created_at: string;
  payload?: Record<string, unknown>;
};

type KitchenSseClient = {
  id: string;
  storeId: string;
  userId: string;
  res: Response;
  keepAlive: NodeJS.Timeout;
};

const kitchenClients = new Map<string, Set<KitchenSseClient>>();

function normalizeKitchenItem(row: Record<string, unknown>) {
  return {
    ...row,
    qty: Number(row.qty ?? 0),
    status_version: Number(row.status_version ?? 0),
  };
}

function normalizeKitchenOrder(row: Record<string, unknown>, items: Record<string, unknown>[] = []) {
  return {
    ...row,
    status_version: Number(row.status_version ?? 0),
    items: items.map(normalizeKitchenItem),
  };
}

function inferKitchenStation(category: unknown) {
  const value = String(category ?? '').toLowerCase();
  if (value.includes('dessert') || value.includes('cake') || value.includes('pastry')) return 'dessert';
  if (
    value.includes('coffee') ||
    value.includes('kopi') ||
    value.includes('drink') ||
    value.includes('minum') ||
    value.includes('tea') ||
    value.includes('bar')
  ) {
    return 'bar';
  }
  if (value.includes('snack') || value.includes('food') || value.includes('makan') || value.includes('kitchen')) return 'kitchen';
  return 'other';
}

function writeSse(res: Response, event: KitchenRealtimeEvent | { type: 'ping'; ts: string }) {
  const id = 'id' in event ? event.id : `ping-${Date.now()}`;
  res.write(`id: ${id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function broadcastKitchenEvent(event: KitchenRealtimeEvent) {
  const clients = kitchenClients.get(event.store_id);
  if (!clients?.size) return;

  for (const client of clients) {
    try {
      writeSse(client.res, event);
    } catch (error) {
      log('warn', 'kitchen.sse_write_failed', {
        storeId: event.store_id,
        clientId: client.id,
        error: serializeError(error),
      });
    }
  }
}

async function fetchKitchenOrder(client: PoolClient, orderId: string) {
  const orderResult = await client.query(
    `select ${kitchenOrderColumns} from public.kitchen_orders where id = $1 limit 1`,
    [orderId],
  );
  const order = orderResult.rows[0];
  if (!order) return null;

  const itemsResult = await client.query(
    `select ${kitchenOrderItemColumns} from public.kitchen_order_items where order_id = $1 order by created_at asc, id asc`,
    [orderId],
  );

  return normalizeKitchenOrder(order, itemsResult.rows);
}

async function insertKitchenEvent(
  client: PoolClient,
  payload: {
    storeId: string;
    orderId: string;
    orderItemId?: string | null;
    eventType: KitchenRealtimeEventType;
    oldStatus?: string | null;
    newStatus?: string | null;
    changedBy?: string | null;
    changedByName?: string | null;
    data?: Record<string, unknown>;
  },
) {
  const result = await client.query(
    `
      insert into public.kitchen_order_events (
        store_id,
        order_id,
        order_item_id,
        event_type,
        old_status,
        new_status,
        changed_by,
        changed_by_name,
        payload
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      returning id, created_at
    `,
    [
      payload.storeId,
      payload.orderId,
      payload.orderItemId ?? null,
      payload.eventType,
      payload.oldStatus ?? null,
      payload.newStatus ?? null,
      payload.changedBy ?? null,
      payload.changedByName ?? null,
      JSON.stringify(payload.data ?? {}),
    ],
  );

  return {
    id: String(result.rows[0]?.id ?? randomUUID()),
    created_at: new Date(result.rows[0]?.created_at ?? Date.now()).toISOString(),
  };
}

async function createKitchenOrderFromTransaction(
  client: PoolClient,
  payload: {
    id: string;
    store_id: string;
    source?: 'cashier' | 'waiter' | 'web' | 'app';
    customer_name?: string | null;
    table_number?: string | null;
    cashier?: string | null;
    items: Array<{
      name: string;
      qty: number;
      menu_item_id?: string;
      note?: string | null;
      station?: 'kitchen' | 'bar' | 'dessert' | 'other' | null;
    }>;
  },
  changedBy: AuthenticatedUser,
) {
  const existing = await client.query(
    `select ${kitchenOrderColumns} from public.kitchen_orders where store_id = $1 and transaction_id = $2 limit 1`,
    [payload.store_id, payload.id],
  );
  if (existing.rows[0]) {
    return fetchKitchenOrder(client, existing.rows[0].id);
  }

  const orderResult = await client.query(
    `
      insert into public.kitchen_orders (
        store_id,
        transaction_id,
        order_number,
        source,
        customer_name,
        table_number,
        overall_status,
        created_by,
        created_by_name
      ) values ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
      returning ${kitchenOrderColumns}
    `,
    [
      payload.store_id,
      payload.id,
      payload.id,
      payload.source ?? 'cashier',
      payload.customer_name ?? null,
      payload.table_number ?? null,
      changedBy.id,
      payload.cashier ?? changedBy.email ?? null,
    ],
  );

  const order = orderResult.rows[0];
  for (const item of payload.items) {
    let station = item.station ?? null;
    if (!station && item.menu_item_id) {
      const menuResult = await client.query(
        `select category from public.menu_items where id = $1 and store_id = $2 limit 1`,
        [item.menu_item_id, payload.store_id],
      );
      station = inferKitchenStation(menuResult.rows[0]?.category);
    }

    await client.query(
      `
        insert into public.kitchen_order_items (
          order_id,
          menu_item_id,
          item_name,
          qty,
          note,
          station,
          item_status
        ) values ($1, $2, $3, $4, $5, $6, 'pending')
      `,
      [
        order.id,
        item.menu_item_id ?? null,
        item.name,
        item.qty,
        item.note ?? null,
        station ?? 'other',
      ],
    );
  }

  const fullOrder = await fetchKitchenOrder(client, order.id);
  await insertKitchenEvent(client, {
    storeId: payload.store_id,
    orderId: order.id,
    eventType: 'order_created',
    newStatus: 'pending',
    changedBy: changedBy.id,
    changedByName: payload.cashier ?? changedBy.email ?? null,
    data: { transactionId: payload.id },
  });

  return fullOrder;
}

async function recalculateKitchenOrderStatus(client: PoolClient, orderId: string) {
  const itemsResult = await client.query(
    `select item_status from public.kitchen_order_items where order_id = $1 order by created_at asc, id asc`,
    [orderId],
  );
  const statuses = itemsResult.rows.map((row) => normalizeKitchenStatus(String(row.item_status)));
  return deriveKitchenOrderStatus(statuses);
}

async function ensureProfile(client: PoolClient, user: AuthenticatedUser) {
  const existing = await client.query(
    `select ${profileColumns} from public.profiles where id = $1 limit 1`,
    [user.id],
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const email = user.email ?? null;
  const fallbackName = user.email?.split('@')[0] || 'kaffepos';

  const username = fallbackName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 30) || `user_${user.id.slice(0, 8)}`;
  const displayName = fallbackName.slice(0, 120);

  const inserted = await client.query(
    `
      insert into public.profiles (id, username, display_name, email, role, account_status)
      values ($1, $2, $3, $4, 'owner_admin', 'active')
      on conflict (id) do update
      set
        email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        role = coalesce(public.profiles.role, excluded.role),
        account_status = coalesce(public.profiles.account_status, excluded.account_status)
      returning ${profileColumns}
    `,
    [user.id, username, displayName, email],
  );

  return inserted.rows[0];
}

async function syncProfileSubscriptionState(client: PoolClient, userId: string) {
  const latestSubscription = await client.query(
    `
      select
        id,
        plan,
        billing_cycle,
        payment_ref,
        activated_at,
        expires_at,
        status
      from public.subscriptions
      where user_id = $1
      order by activated_at desc nulls last, created_at desc nulls last
      limit 1
    `,
    [userId],
  );

  const subscription = latestSubscription.rows[0];
  const isActive = Boolean(
    subscription &&
    subscription.status === 'active' &&
    (!subscription.expires_at || new Date(String(subscription.expires_at)).getTime() > Date.now()),
  );

  if (!isActive) {
    await client.query(
      `
        update public.profiles
        set
          tier = 'basic',
          tier_expires_at = null,
          is_pro = false,
          pro_plan = null,
          pro_order_id = null,
          pro_activated_at = null,
          pro_expires_at = null,
          updated_at = now()
        where id = $1
      `,
      [userId],
    );
    return null;
  }

  await client.query(
    `
      update public.profiles
      set
        tier = 'pro',
        tier_expires_at = $2,
        is_pro = true,
        pro_plan = $3,
        pro_order_id = $4,
        pro_activated_at = $5,
        pro_expires_at = $2,
        updated_at = now()
      where id = $1
    `,
    [
      userId,
      subscription.expires_at ?? null,
      subscription.plan,
      subscription.payment_ref ?? null,
      subscription.activated_at ?? new Date().toISOString(),
    ],
  );

  return subscription;
}

async function activatePaidSubscription(client: PoolClient, payload: {
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

  let subscription = existingSubscription.rows[0];

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

  if (!existingPaymentHistory.rows[0]) {
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

  await insertNotification(
    client,
    payload.userId,
    'Langganan aktif',
    `Pembayaran paket ${payload.plan} sudah diterima dan langganan kamu aktif.`,
    'success',
    { paymentRef: payload.paymentRef, billingCycle: payload.billingCycle, paymentMethod: payload.paymentMethod },
  );

  return {
    subscription,
    email: (profile.email as string | null) ?? null,
    displayName: (profile.display_name as string | null) ?? (profile.username as string | null) ?? 'KaffePOS',
    plan: payload.plan,
    paymentAmount: payload.paymentAmount,
  };
}

async function assertStoreOwned(client: PoolClient, storeId: string, userId: string) {
  const result = await client.query(
    `
      select ${storeColumns}
      from public.stores s
      where s.id = $1
        and (
          s.owner_id = $2
          or exists (
            select 1
            from public.cashier_outlet_assignments a
            join public.profiles p on p.id = a.cashier_id
            where a.store_id = s.id
              and a.cashier_id = $2
              and a.status = 'active'
              and p.role = 'cashier'
              and p.account_status = 'active'
          )
        )
      limit 1
    `,
    [storeId, userId],
  );

  const store = result.rows[0];
  if (!store) {
    throw new ApiError(404, 'Toko tidak ditemukan atau tidak bisa diakses.');
  }

  return store;
}

const storeIdSchema = z.string().uuid();
const menuItemWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  name: z.string().trim().min(1),
  price: z.number().nonnegative(),
  category: z.string().trim().min(1).default('Coffee'),
  image_url: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  recipe: z.array(menuRecipeItemSchema).optional(),
  variants: z.array(z.object({ name: z.string().trim().min(1), price: z.number().nonnegative() })).optional(),
});
const inventoryWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  name: z.string().trim().min(1),
  sku: z.string().trim().optional().nullable(),
  stock: z.number(),
  unit: z.string().trim().min(1).default('pcs'),
  base_unit: z.string().trim().optional().nullable(),
  purchase_unit: z.string().trim().optional().nullable(),
  conversion_ratio: z.number().positive().optional().nullable(),
  min_stock: z.number().nonnegative().optional(),
  cost_per_unit: z.number().nonnegative().optional(),
  is_active: z.boolean().optional(),
});
const stockUnitConversionWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  ingredient_id: z.string().uuid().optional().nullable(),
  from_unit: z.string().trim().min(1),
  to_unit: z.string().trim().min(1),
  ratio: z.number().positive(),
  is_active: z.boolean().optional(),
});
const stockBulkImportRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  kind: z.enum(['ingredient', 'conversion', 'product', 'recipe']).or(z.literal('unknown')),
  name: z.string().trim().optional(),
  stock: z.number().optional(),
  base_unit: z.string().trim().optional(),
  purchase_unit: z.string().trim().optional(),
  min_stock: z.number().optional(),
  total_cost: z.number().optional(),
  sku: z.string().trim().optional(),
  from_unit: z.string().trim().optional(),
  to_unit: z.string().trim().optional(),
  ratio: z.number().optional(),
  product_name: z.string().trim().optional(),
  ingredient_name: z.string().trim().optional(),
  qty_per_serving: z.number().optional(),
  unit_reference: z.string().trim().optional(),
  price: z.number().optional(),
  category: z.string().trim().optional(),
});
const stockBulkImportCommitSchema = z.object({
  store_id: z.string().uuid(),
  mode: z.enum(['create_only', 'update_existing', 'upsert']).default('create_only'),
  rows: z.array(stockBulkImportRowSchema).min(1).max(1000),
});
const expenseWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  date: z.string().datetime().optional(),
  description: z.string().trim().min(1),
  amount: z.number().positive(),
  category: z.string().trim().min(1).default('Operasional'),
  cashier: z.string().trim().optional().nullable(),
  source: z.enum(['cashier', 'inventory']).default('cashier'),
});
const cashFlowWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  date: z.string().datetime().optional(),
  type: z.enum(['in', 'out']),
  amount: z.number().positive(),
  description: z.string().trim().optional().nullable(),
  cashier: z.string().trim().optional().nullable(),
});
const cashRegisterWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  date: z.string().datetime().optional(),
  amount: z.number().nonnegative(),
  note: z.string().trim().optional().nullable(),
  opened_by: z.string().trim().min(1),
});
const opsEventSchema = z.object({
  event_name: z.enum(['login', 'checkout', 'client_error', 'printer_error', 'sync_error']),
  status: z.enum(['success', 'failure']),
  email: z.string().trim().email().optional(),
  store_id: z.string().uuid().optional(),
  transaction_id: z.string().trim().optional(),
  error_message: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const checkoutSchema = z.object({
  id: z.string().trim().min(1),
  date: z.string().datetime(),
  items: z.array(
    z.object({
      name: z.string().trim().min(1),
      qty: z.number().positive(),
      price: z.number().nonnegative(),
      subtotal: z.number().nonnegative(),
      menu_item_id: z.string().uuid().optional(),
      note: z.string().trim().max(500).optional().nullable(),
      station: z.enum(['kitchen', 'bar', 'dessert', 'other']).optional().nullable(),
    }),
  ),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  discount_label: z.string().trim().optional().nullable(),
  tax: z.number().nonnegative().default(0),
  total: z.number().nonnegative(),
  cogs: z.number().nonnegative().optional(),
  paid: z.number().nonnegative(),
  change: z.number().nonnegative(),
  method: z.enum(['Tunai', 'Transfer', 'QRIS', 'Debit', 'Kredit']).default('Tunai'),
  customer_name: z.string().trim().optional().nullable(),
  table_number: z.string().trim().max(80).optional().nullable(),
  source: z.enum(['cashier', 'waiter', 'web', 'app']).default('cashier'),
  cashier: z.string().trim().min(1).default('Kasir'),
  note: z.string().trim().optional().nullable(),
  store_id: z.string().uuid(),
});
const adminSubscriptionActionSchema = z.object({
  userId: z.string().uuid(),
  plan: z.enum(['secangkir', 'kopi_susu', 'signature']),
  billingCycle: z.enum(['free', 'monthly', 'quarterly', 'semiannual', 'yearly']),
  paymentAmount: z.number().nonnegative(),
  paymentNote: z.string().trim().optional().nullable(),
});
const subscriptionPaymentMethodSchema = z.enum(['qris', 'bca_va', 'mandiri_bill', 'bni_va', 'bri_va']);
const subscriptionPaymentRequestSchema = z.object({
  plan: z.enum(['kopi_susu', 'signature']),
  billingCycle: z.enum(['monthly', 'quarterly', 'semiannual', 'yearly']),
  paymentMethod: subscriptionPaymentMethodSchema,
  voucherCode: z.string().trim().max(64).optional().nullable(),
});
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
const localStorageImportSchema = z.object({
  store_id: z.string().uuid(),
  store_settings: z.record(z.string(), z.unknown()).optional().nullable(),
  menu_items: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  inventory_items: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  transactions: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  expenses: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  cash_flow: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  store_accounts: z.array(z.record(z.string(), z.unknown())).optional().default([]),
});
const aiInsightRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
});
const authRegisterSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(10),
  username: z.string().trim().min(3).max(30),
});
const authLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
const emailOnlySchema = z.object({
  email: z.string().trim().email(),
});
const verifyEmailSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6),
});
const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
  token: z.string().trim().min(20),
  password: z.string().min(10),
});
const aiInsightResponseSchema = z.object({
  summary: z.string().trim().min(1),
  bestMenu: z.string().trim().min(1),
  stockAlert: z.string().trim().min(1),
  prediction: z.string().trim().min(1),
  tips: z.array(z.string().trim().min(1)).min(1),
});

function calculateExpiryDate(billingCycle: 'free' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly') {
  if (billingCycle === 'free') return null;
  const expiresAt = new Date();
  const days = billingCycle === 'monthly' ? 30 : billingCycle === 'quarterly' ? 90 : billingCycle === 'semiannual' ? 180 : 365;
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

async function countRowsForStore(client: PoolClient, table: string, storeId: string) {
  const result = await client.query(`select count(*)::int as count from public.${table} where store_id = $1`, [storeId]);
  return result.rows[0]?.count ?? 0;
}

function buildSubscriptionQuoteOrThrow(payload: {
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

function mapGeminiError(status: number, message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('billing') || normalized.includes('limit: 0')) {
    return 'Billing Gemini belum aktif. Sistem akan memakai analisis cadangan.';
  }

  if (
    status === 429 ||
    normalized.includes('quota') ||
    normalized.includes('rate limit') ||
    normalized.includes('resource exhausted')
  ) {
    return 'Layanan AI sedang mencapai batas kuota. Sistem akan memakai analisis cadangan.';
  }

  return 'Layanan AI sedang tidak tersedia. Sistem akan memakai analisis cadangan.';
}

function getAiLimitWindow(isPro: boolean, now: Date) {
  if (isPro) {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return {
      startsAt: dayStart.toISOString(),
      limitMax: 20,
      limitLabel: '20x per hari',
      resetMessage: 'Coba lagi besok.',
    };
  }

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    startsAt: monthStart.toISOString(),
    limitMax: 1,
    limitLabel: '1x per bulan',
    resetMessage: 'Kuota bulanan habis. Upgrade ke PRO untuk 20x analisis per hari!',
  };
}

function parseGeminiText(payload: unknown) {
  const rawText =
    payload &&
    typeof payload === 'object' &&
    'candidates' in payload &&
    Array.isArray((payload as { candidates?: unknown[] }).candidates)
      ? (((payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]
          ?.content?.parts?.[0]?.text ?? '{}') as string)
      : '{}';

  const parsed = JSON.parse(rawText);
  return aiInsightResponseSchema.parse(parsed);
}

async function resolveUniqueUsername(client: PoolClient, requested: string) {
  const normalized = requested
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || `user_${randomUUID().slice(0, 8)}`;

  let candidate = normalized;
  let counter = 1;

  while (counter < 1000) {
    const existing = await client.query(
      `select 1 from public.profiles where username = $1 limit 1`,
      [candidate],
    );
    if (!existing.rows[0]) {
      return candidate;
    }

    counter += 1;
    candidate = `${normalized.slice(0, Math.max(1, 30 - `${counter}`.length - 1))}_${counter}`;
  }

  return `${normalized.slice(0, 20)}_${randomUUID().slice(0, 8)}`;
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

  if (!isMidtransConfigured()) {
    warnings.push('Midtrans belum dikonfigurasi penuh di backend.');
  } else if (!paymentConfig.onlinePaymentAvailable) {
    warnings.push('Pembayaran online subscription dinonaktifkan. Gunakan aktivasi manual sampai Midtrans production siap.');
  } else if (!paymentConfig.commerciallyReady) {
    warnings.push('Pembayaran online belum commercial-ready karena masih memakai mode sandbox/QA.');
  }

  return warnings;
}

async function bootstrapAuthSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    do $$
    declare
      profiles_auth_fk text;
      insight_auth_fk text;
    begin
      select con.conname
      into profiles_auth_fk
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refnsp on refnsp.oid = ref.relnamespace
      where con.contype = 'f'
        and nsp.nspname = 'public'
        and rel.relname = 'profiles'
        and refnsp.nspname = 'auth'
        and ref.relname = 'users'
      limit 1;

      if profiles_auth_fk is not null then
        execute format('alter table public.profiles drop constraint %I', profiles_auth_fk);
      end if;

      select con.conname
      into insight_auth_fk
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refnsp on refnsp.oid = ref.relnamespace
      where con.contype = 'f'
        and nsp.nspname = 'public'
        and rel.relname = 'ai_insight_logs'
        and refnsp.nspname = 'auth'
        and ref.relname = 'users'
      limit 1;

      if insight_auth_fk is not null then
        execute format('alter table public.ai_insight_logs drop constraint %I', insight_auth_fk);
      end if;
    end $$;
  `);

  await pool.query(`
    alter table public.profiles
      add column if not exists role text not null default 'owner_admin';

    alter table public.profiles
      add column if not exists account_status text not null default 'active';

    update public.profiles
    set role = 'owner_admin'
    where role is null
       or role not in ('owner_admin', 'cashier');

    update public.profiles
    set account_status = 'active'
    where account_status is null
       or account_status not in ('active', 'inactive');

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_role_check'
      ) then
        alter table public.profiles
          add constraint profiles_role_check
          check (role in ('owner_admin', 'cashier'));
      end if;

      if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_account_status_check'
      ) then
        alter table public.profiles
          add constraint profiles_account_status_check
          check (account_status in ('active', 'inactive'));
      end if;
    end $$;
  `);

  await pool.query(`
    create table if not exists public.cashier_outlet_assignments (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references public.profiles(id) on delete cascade,
      cashier_id uuid not null references public.profiles(id) on delete cascade,
      store_id uuid not null references public.stores(id) on delete cascade,
      status text not null default 'active' check (status in ('active', 'inactive')),
      created_by uuid references public.profiles(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (owner_id, cashier_id)
    );

    create index if not exists cashier_outlet_assignments_owner_idx
      on public.cashier_outlet_assignments (owner_id, updated_at desc);

    create index if not exists cashier_outlet_assignments_cashier_idx
      on public.cashier_outlet_assignments (cashier_id, status);

    create table if not exists public.app_auth_credentials (
      user_id uuid primary key references public.profiles(id) on delete cascade,
      email text not null unique,
      password_hash text,
      email_verified_at timestamptz,
      last_login_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists public.app_auth_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      token_hash text not null unique,
      ip_address text,
      user_agent text,
      expires_at timestamptz not null,
      last_seen_at timestamptz not null default now(),
      revoked_at timestamptz,
      created_at timestamptz not null default now()
    );

    create index if not exists app_auth_sessions_user_id_idx
      on public.app_auth_sessions (user_id, expires_at desc)
      where revoked_at is null;

    create table if not exists public.app_password_reset_tokens (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      email text not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    );

    create index if not exists app_password_reset_tokens_email_idx
      on public.app_password_reset_tokens (email, created_at desc)
      where consumed_at is null;

    create table if not exists public.subscription_payment_sessions (
      id uuid primary key,
      user_id uuid not null references public.profiles(id) on delete cascade,
      store_id uuid references public.stores(id) on delete set null,
      subscription_id uuid references public.subscriptions(id) on delete set null,
      plan text not null,
      billing_cycle text not null,
      amount integer not null,
      currency_code text not null default 'IDR',
      midtrans_order_id text not null unique,
      midtrans_transaction_id text,
      snap_token text,
      redirect_url text,
      payment_type text,
      transaction_status text not null default 'pending',
      fraud_status text,
      status_code text,
      expires_at timestamptz,
      paid_at timestamptz,
      settled_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists subscription_payment_sessions_user_id_idx
      on public.subscription_payment_sessions (user_id, created_at desc);

    create index if not exists subscription_payment_sessions_order_id_idx
      on public.subscription_payment_sessions (midtrans_order_id);
  `);

  await pool.query(`
    insert into public.app_auth_credentials (user_id, email, email_verified_at, created_at, updated_at)
    select p.id, lower(trim(p.email)), now(), now(), now()
    from public.profiles p
    where p.email is not null
      and trim(p.email) <> ''
    on conflict (user_id) do update
    set
      email = excluded.email,
      updated_at = now()
  `);
}

async function bootstrapStockSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.inventory (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      name text not null,
      stock numeric not null default 0,
      unit text not null default 'pcs',
      min_stock numeric not null default 5,
      cost_per_unit numeric not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table public.inventory
      add column if not exists sku text;

    alter table public.inventory
      add column if not exists base_unit text;

    alter table public.inventory
      add column if not exists purchase_unit text;

    alter table public.inventory
      add column if not exists conversion_ratio numeric;

    alter table public.inventory
      add column if not exists is_active boolean not null default true;

    update public.inventory
    set base_unit = coalesce(nullif(trim(base_unit), ''), unit)
    where base_unit is null or trim(base_unit) = '';

    update public.inventory
    set purchase_unit = coalesce(nullif(trim(purchase_unit), ''), unit)
    where purchase_unit is null or trim(purchase_unit) = '';

    update public.inventory
    set conversion_ratio = 1
    where conversion_ratio is null or conversion_ratio <= 0;

    create index if not exists inventory_store_active_name_idx
      on public.inventory (store_id, is_active, name);

    create table if not exists public.inventory_unit_conversions (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      ingredient_id uuid references public.inventory(id) on delete cascade,
      from_unit text not null,
      to_unit text not null,
      ratio numeric not null check (ratio > 0),
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists inventory_unit_conversions_store_idx
      on public.inventory_unit_conversions (store_id, is_active, from_unit, to_unit);

    create index if not exists inventory_unit_conversions_ingredient_idx
      on public.inventory_unit_conversions (ingredient_id, is_active);

    create table if not exists public.transaction_inventory_audit (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      transaction_id text not null,
      inventory_id uuid references public.inventory(id) on delete set null,
      action text not null,
      qty_delta numeric not null,
      stock_before numeric not null,
      stock_after numeric not null,
      created_at timestamptz not null default now()
    );

    create index if not exists transaction_inventory_audit_transaction_idx
      on public.transaction_inventory_audit (transaction_id, created_at asc);

    create index if not exists transaction_inventory_audit_store_idx
      on public.transaction_inventory_audit (store_id, created_at desc);

    create table if not exists public.inventory_adjustments (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      inventory_id uuid not null references public.inventory(id) on delete cascade,
      counted_stock numeric not null check (counted_stock >= 0),
      stock_before numeric not null,
      qty_delta numeric not null,
      reason text not null,
      note text,
      adjusted_by uuid references public.profiles(id) on delete set null,
      adjusted_by_email text,
      created_at timestamptz not null default now()
    );

    create index if not exists inventory_adjustments_store_created_idx
      on public.inventory_adjustments (store_id, created_at desc);

    create index if not exists inventory_adjustments_inventory_created_idx
      on public.inventory_adjustments (inventory_id, created_at desc);
  `);
}

async function bootstrapKitchenSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.kitchen_orders (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      transaction_id text references public.transactions(id) on delete set null,
      order_number text not null,
      source text not null default 'cashier',
      customer_name text,
      table_number text,
      overall_status text not null default 'pending'
        check (overall_status in ('pending', 'preparing', 'ready', 'served', 'completed', 'cancelled')),
      created_by uuid references public.profiles(id) on delete set null,
      created_by_name text,
      status_version integer not null default 1,
      cancelled_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (store_id, transaction_id)
    );

    create index if not exists kitchen_orders_store_status_created_idx
      on public.kitchen_orders (store_id, overall_status, created_at desc);

    create index if not exists kitchen_orders_store_updated_idx
      on public.kitchen_orders (store_id, updated_at desc);

    create table if not exists public.kitchen_order_items (
      id uuid primary key default gen_random_uuid(),
      order_id uuid not null references public.kitchen_orders(id) on delete cascade,
      menu_item_id uuid references public.menu_items(id) on delete set null,
      item_name text not null,
      qty numeric not null check (qty > 0),
      note text,
      station text not null default 'other'
        check (station in ('kitchen', 'bar', 'dessert', 'other')),
      item_status text not null default 'pending'
        check (item_status in ('pending', 'preparing', 'ready', 'served', 'completed', 'cancelled')),
      status_version integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists kitchen_order_items_order_idx
      on public.kitchen_order_items (order_id, created_at asc);

    create index if not exists kitchen_order_items_station_status_idx
      on public.kitchen_order_items (station, item_status);

    create table if not exists public.kitchen_order_events (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      order_id uuid not null references public.kitchen_orders(id) on delete cascade,
      order_item_id uuid references public.kitchen_order_items(id) on delete set null,
      event_type text not null,
      old_status text,
      new_status text,
      changed_by uuid references public.profiles(id) on delete set null,
      changed_by_name text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists kitchen_order_events_store_created_idx
      on public.kitchen_order_events (store_id, created_at desc);

    create index if not exists kitchen_order_events_order_created_idx
      on public.kitchen_order_events (order_id, created_at asc);
  `);
}

async function bootstrapLoyaltySchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.loyalty_settings (
      store_id uuid primary key references public.stores(id) on delete cascade,
      stamps_required integer not null default 8 check (stamps_required between 2 and 20),
      points_per_rupiah numeric not null default 0.01 check (points_per_rupiah >= 0),
      minimum_transaction_amount integer not null default 0 check (minimum_transaction_amount >= 0),
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists public.loyalty_rewards (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      name text not null,
      description text,
      type text not null check (type in ('discount_amount', 'discount_percent', 'free_item')),
      reward_value integer not null default 0 check (reward_value >= 0),
      points_or_stamps_needed integer not null default 0 check (points_or_stamps_needed >= 0),
      points_cost integer not null default 0 check (points_cost >= 0),
      stamps_cost integer not null default 0 check (stamps_cost >= 0),
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists loyalty_rewards_store_active_idx
      on public.loyalty_rewards (store_id, is_active, created_at asc);

    alter table public.loyalty_rewards
      add column if not exists points_or_stamps_needed integer not null default 0 check (points_or_stamps_needed >= 0);

    create table if not exists public.loyalty_customers (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      name text,
      phone text not null,
      tier text not null default 'regular' check (tier in ('regular', 'kopi_lover', 'vvip')),
      total_points integer not null default 0 check (total_points >= 0),
      total_visits integer not null default 0 check (total_visits >= 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (store_id, phone)
    );

    create index if not exists loyalty_customers_store_phone_idx
      on public.loyalty_customers (store_id, phone);

    create table if not exists public.loyalty_tiers (
      id uuid primary key default gen_random_uuid(),
      store_id uuid references public.stores(id) on delete cascade,
      name text not null,
      min_visits integer not null default 0 check (min_visits >= 0),
      benefits jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (store_id, name)
    );

    create index if not exists loyalty_tiers_store_min_visits_idx
      on public.loyalty_tiers (store_id, min_visits asc);

    create table if not exists public.loyalty_passports (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      customer_name text,
      customer_phone text not null,
      tier text not null default 'regular' check (tier in ('regular', 'kopi_lover', 'vvip')),
      total_stamps integer not null default 0 check (total_stamps >= 0),
      available_stamps integer not null default 0 check (available_stamps >= 0),
      total_points integer not null default 0 check (total_points >= 0),
      available_points integer not null default 0 check (available_points >= 0),
      lifetime_spend integer not null default 0 check (lifetime_spend >= 0),
      last_visit_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (store_id, customer_phone)
    );

    create index if not exists loyalty_passports_store_updated_idx
      on public.loyalty_passports (store_id, updated_at desc);

    create index if not exists loyalty_passports_store_phone_idx
      on public.loyalty_passports (store_id, customer_phone);

    create table if not exists public.loyalty_stamp_events (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      passport_id uuid not null references public.loyalty_passports(id) on delete cascade,
      transaction_id text references public.transactions(id) on delete set null,
      stamps integer not null default 1 check (stamps >= 0),
      points integer not null default 0 check (points >= 0),
      transaction_amount integer not null default 0 check (transaction_amount >= 0),
      note text,
      created_by uuid references public.profiles(id) on delete set null,
      idempotency_key text,
      created_at timestamptz not null default now()
    );

    create unique index if not exists loyalty_stamp_events_idempotency_idx
      on public.loyalty_stamp_events (store_id, idempotency_key)
      where idempotency_key is not null;

    create index if not exists loyalty_stamp_events_passport_created_idx
      on public.loyalty_stamp_events (passport_id, created_at desc);

    create table if not exists public.loyalty_stamps (
      id uuid primary key default gen_random_uuid(),
      customer_id uuid not null references public.loyalty_customers(id) on delete cascade,
      transaction_id text references public.transactions(id) on delete set null,
      stamps_earned integer not null default 1 check (stamps_earned >= 0),
      created_at timestamptz not null default now()
    );

    create index if not exists loyalty_stamps_customer_created_idx
      on public.loyalty_stamps (customer_id, created_at desc);

    create table if not exists public.loyalty_redemptions (
      id uuid primary key default gen_random_uuid(),
      store_id uuid not null references public.stores(id) on delete cascade,
      passport_id uuid not null references public.loyalty_passports(id) on delete cascade,
      reward_id uuid not null references public.loyalty_rewards(id) on delete restrict,
      transaction_id text references public.transactions(id) on delete set null,
      points_spent integer not null default 0 check (points_spent >= 0),
      stamps_spent integer not null default 0 check (stamps_spent >= 0),
      discount_amount integer not null default 0 check (discount_amount >= 0),
      status text not null default 'redeemed' check (status in ('pending', 'redeemed', 'void')),
      created_by uuid references public.profiles(id) on delete set null,
      idempotency_key text,
      created_at timestamptz not null default now()
    );

    create unique index if not exists loyalty_redemptions_idempotency_idx
      on public.loyalty_redemptions (store_id, idempotency_key)
      where idempotency_key is not null;

    create index if not exists loyalty_redemptions_passport_created_idx
      on public.loyalty_redemptions (passport_id, created_at desc);
  `);
}

async function bootstrapChallengeSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.challenges (
      id uuid primary key default gen_random_uuid(),
      store_id uuid references public.stores(id) on delete cascade,
      title text not null,
      description text not null default '',
      target_type text not null check (
        target_type in (
          'sell_drink',
          'average_checkout_time',
          'transactions_count',
          'upsell_value',
          'zero_voids'
        )
      ),
      target_value jsonb not null default '{}'::jsonb,
      points_reward integer not null default 0 check (points_reward >= 0),
      is_active boolean not null default true,
      valid_from date not null default current_date,
      valid_to date not null default current_date,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists challenges_store_active_valid_idx
      on public.challenges (store_id, is_active, valid_from, valid_to);

    create unique index if not exists challenges_store_title_day_idx
      on public.challenges (store_id, title, valid_from);

    create table if not exists public.user_challenge_progress (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      challenge_id uuid not null references public.challenges(id) on delete cascade,
      current_progress numeric not null default 0 check (current_progress >= 0),
      is_completed boolean not null default false,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, challenge_id)
    );

    create index if not exists user_challenge_progress_user_idx
      on public.user_challenge_progress (user_id, updated_at desc);

    create index if not exists user_challenge_progress_challenge_idx
      on public.user_challenge_progress (challenge_id, is_completed);
  `);
}

async function bootstrapSubscriptionPromptSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.subscription_upgrade_prompt_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references public.profiles(id) on delete set null,
      store_id uuid references public.stores(id) on delete set null,
      event_type text not null check (event_type in ('view', 'click', 'dismiss')),
      prompt_key text not null,
      trigger text not null,
      recommended_plan text not null default 'signature',
      current_plan text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists subscription_upgrade_prompt_events_user_idx
      on public.subscription_upgrade_prompt_events (user_id, created_at desc);

    create index if not exists subscription_upgrade_prompt_events_store_trigger_idx
      on public.subscription_upgrade_prompt_events (store_id, trigger, created_at desc);
  `);
}

async function bootstrapAiInsightsSchema() {
  await pool.query('create extension if not exists pgcrypto');

  await pool.query(`
    create table if not exists public.ai_insights_cache (
      store_id uuid primary key references public.stores(id) on delete cascade,
      generated_by uuid references public.profiles(id) on delete set null,
      payload jsonb not null,
      generated_at timestamptz not null default now(),
      expires_at timestamptz not null,
      updated_at timestamptz not null default now()
    );

    create index if not exists ai_insights_cache_expires_idx
      on public.ai_insights_cache (expires_at);
  `);
}

// ── Modular routes ─────────────────────────────────────────────
// Health, system-status → extracted to routes/health.ts
setHealthRuntimeState({ serviceStartedAt, isShuttingDown: () => isShuttingDown });
app.use(healthRouter);
app.use(appVersionPublicRouter);
app.get('/metrics', metricsHandler);


app.use(referralsRouter);
// Pre-auth webhook routes
app.use(webhooksRouter);

// Auth, profile → extracted to routes/auth.ts
app.use(authRouter);

function rewriteApiV1Request(req: Request, _res: Response, next: NextFunction) {
  req.url = `/api${req.url}`;
  next();
}

app.use('/api/v1', rewriteApiV1Request, webhooksRouter, authRouter);
app.use(
  '/api/v1',
  authenticate,
  rewriteApiV1Request,
  storesRouter,
  menuRouter,
  inventoryRouter,
  financeRouter,
  kitchenRouter,
  transactionsRouter,
  loyaltyRouter,
  challengesRouter,
  subscriptionsRouter,
  paymentRouter,
  adminMfaRouter,
  adminRouter,
  appVersionAuthenticatedRouter,
  miscRouter,
);

app.use('/api', authenticate);

// Stores, cashiers, menu, inventory, finance → extracted to route modules
app.use(storesRouter);
app.use(menuRouter);
app.use(inventoryRouter);
app.use(financeRouter);
app.use(kitchenRouter);
app.use(transactionsRouter);
app.use(loyaltyRouter);
app.use(challengesRouter);
app.use(subscriptionsRouter);
app.use(paymentRouter);
app.use(affiliateRouter);
app.use(adminMfaRouter);
app.use(adminRouter);
app.use(appVersionAuthenticatedRouter);
app.use(miscRouter);



app.use(errorLoggingMiddleware);

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    log('warn', 'request.validation_error', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      issues: error.issues,
    });
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: error.issues[0]?.message ?? 'Payload tidak valid.',
    });
    return;
  }

  if (error instanceof ApiError) {
    const clientMessage = getSafeApiErrorMessage(error);
    log('warn', 'request.api_error', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      statusCode: error.status,
      message: error.message,
    });
    res.status(error.status).json({ error: 'API_ERROR', message: clientMessage });
    return;
  }

  if (error instanceof KitchenStatusError) {
    log('warn', 'request.kitchen_status_error', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      statusCode: error.status,
      message: error.message,
    });
    res.status(error.status).json({ error: 'API_ERROR', message: error.message });
    return;
  }

  if (error instanceof Error && error.message.includes('is not allowed')) {
    log('warn', 'request.cors_rejected', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      message: error.message,
    });
    res.status(403).json({
      error: 'CORS_REJECTED',
      message: 'Origin tidak diizinkan.',
    });
    return;
  }

  log('error', 'request.unhandled_error', {
    requestId: req.requestId ?? null,
    method: req.method,
    path: req.originalUrl,
    error: serializeError(error),
  });
  captureBackendException(error, {
    source: 'global_error_handler',
    method: req.method,
    path: req.originalUrl,
    statusCode: 500,
    metadata: {
      requestId: req.requestId ?? null,
      userId: req.authUser?.id ?? null,
    },
  });
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Terjadi gangguan pada server. Coba lagi beberapa saat.',
  });
});

async function verifyDependenciesOnStartup() {
  const startedAt = Date.now();
  await bootstrapAuthSchema();
  await bootstrapStockSchema();
  await bootstrapKitchenSchema();
  await bootstrapLoyaltySchema();
  await bootstrapChallengeSchema();
  await bootstrapSubscriptionPromptSchema();
  await bootstrapAiInsightsSchema();
  await pool.query('select 1');
  log('info', 'startup.dependencies_ready', {
    database: {
      ok: true,
      latencyMs: Date.now() - startedAt,
    },
    email: {
      ok: Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL),
      provider: 'resend',
    },
    payment: {
      ok: isMidtransConfigured(),
      provider: 'midtrans',
      environment: env.MIDTRANS_ENVIRONMENT,
      mode: resolveSubscriptionPaymentConfig().mode,
    },
  });
}

async function shutdown(signal: NodeJS.Signals | 'FATAL') {
  jobQueue.stop();
  if (isShuttingDown) return;
  isShuttingDown = true;

  log('warn', 'shutdown.started', { signal });

  const forcedExitTimer = setTimeout(() => {
    log('error', 'shutdown.force_exit', { signal });
    process.exit(1);
  }, 10_000);
  forcedExitTimer.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    await pool.end();
    clearTimeout(forcedExitTimer);
    log('info', 'shutdown.completed', { signal });
    process.exit(signal === 'FATAL' ? 1 : 0);
  } catch (error) {
    clearTimeout(forcedExitTimer);
    log('error', 'shutdown.failed', {
      signal,
      error: serializeError(error),
    });
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('unhandledRejection', (reason) => {
  log('error', 'process.unhandled_rejection', { error: serializeError(reason) });
  void shutdown('FATAL');
});

process.on('uncaughtException', (error) => {
  log('error', 'process.uncaught_exception', { error: serializeError(error) });
  void shutdown('FATAL');
});

async function start() {
  jobQueue.registerHandler('email', handleEmailJob);
  jobQueue.registerHandler('analytics', handleAnalyticsJob);
  jobQueue.registerHandler('notification', handleNotificationJob);
  jobQueue.registerHandler('commission', handleCommissionJob);
  jobQueue.start();
  log('info', 'startup.boot', {
    port: env.PORT,
    env: env.NODE_ENV,
    corsOrigins: Array.from(allowedOrigins),
    databaseTarget: env.DATABASE_URL ? 'DATABASE_URL' : `${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`,
    webBaseUrl: env.WEB_BASE_URL,
    apiBaseUrl: env.API_BASE_URL,
    emailProvider: env.RESEND_API_KEY && env.RESEND_FROM_EMAIL ? 'resend' : 'disabled',
    paymentProvider: isMidtransConfigured() ? 'midtrans' : 'disabled',
    midtransEnvironment: env.MIDTRANS_ENVIRONMENT,
    subscriptionPaymentMode: resolveSubscriptionPaymentConfig().mode,
  });

  await verifyDependenciesOnStartup();

  server = app.listen(env.PORT, () => {
    log('info', 'startup.listening', {
      port: env.PORT,
      healthUrl: `http://0.0.0.0:${env.PORT}/health`,
    });
  });
}

start().catch((error) => {
  log('error', 'startup.failed', { error: serializeError(error) });
  process.exit(1);
});
