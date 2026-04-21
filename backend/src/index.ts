import 'dotenv/config';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { type Server } from 'node:http';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';

type AuthenticatedUser = {
  id: string;
  email: string | null;
  email_verified_at?: string | null;
  created_at?: string | null;
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

const envSchema = z.object({
  SERVICE_NAME: z.string().trim().default('kaffepos-backend'),
  APP_VERSION: z.string().trim().default('1.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().trim().optional(),
  DB_HOST: z.string().trim().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().trim().default('kaffepos_production'),
  DB_USER: z.string().trim().default('kaffepos'),
  DB_PASSWORD: z.string().trim().optional(),
  DB_SSL: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .default('false'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  WEB_BASE_URL: z.string().trim().url().default('https://kaffepos.my.id'),
  API_BASE_URL: z.string().trim().url().default('https://api.kaffepos.my.id'),
  RESEND_API_KEY: z.string().trim().optional(),
  RESEND_FROM_EMAIL: z.string().trim().optional(),
  MIDTRANS_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  MIDTRANS_SERVER_KEY: z.string().trim().optional(),
  MIDTRANS_CLIENT_KEY: z.string().trim().optional(),
  MIDTRANS_MERCHANT_ID: z.string().trim().optional(),
  MIDTRANS_SNAP_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .default('true'),
  MIDTRANS_WEBHOOK_BASE_URL: z.string().trim().url().optional(),
  MIDTRANS_FINISH_URL: z.string().trim().url().optional(),
  MIDTRANS_UNFINISH_URL: z.string().trim().url().optional(),
  MIDTRANS_ERROR_URL: z.string().trim().url().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  CORS_ORIGIN: z.string().trim().optional(),
  ADMIN_EMAILS: z.string().trim().optional(),
});

const env = envSchema.parse(process.env);
const serviceStartedAt = Date.now();
let isShuttingDown = false;
let server: Server | null = null;
const adminEmails = new Set(
  (env.ADMIN_EMAILS || 'kaffeposapp@gmail.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://kaffepos.my.id',
  'https://www.kaffepos.my.id',
  'https://api.kaffepos.my.id',
  'capacitor://localhost',
  'http://localhost',
];

const allowedOrigins = new Set(
  (env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',') : defaultOrigins)
    .map((item) => item.trim())
    .filter(Boolean),
);

const pool = new Pool(
  env.DATABASE_URL
    ? {
        connectionString: env.DATABASE_URL,
        ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      }
    : {
        host: env.DB_HOST,
        port: env.DB_PORT,
        database: env.DB_NAME,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      },
);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const logPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: LogLevel) {
  return logPriority[level] >= logPriority[env.LOG_LEVEL];
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: String(error) };
}

function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
  if (!shouldLog(level)) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    service: env.SERVICE_NAME,
    version: env.APP_VERSION,
    msg: message,
    ...meta,
  };

  const line = JSON.stringify(payload);
  if (level === 'error' || level === 'warn') {
    console.error(line);
    return;
  }

  console.log(line);
}

app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId = req.header('x-request-id')?.trim() || randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    log('info', 'request.completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userId: req.authUser?.id ?? null,
    });
  });

  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
  }),
);

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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

function normalizeInventory(row: Record<string, unknown>) {
  return {
    ...row,
    stock: toNumber(row.stock),
    min_stock: toNumber(row.min_stock),
    cost_per_unit: toNumber(row.cost_per_unit),
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

pool.on('error', (error) => {
  log('error', 'database.pool.error', { error: serializeError(error) });
});

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
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${env.MIDTRANS_SERVER_KEY ?? ''}`)
    .digest('hex');
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

async function createSession(client: PoolClient, user: AuthenticatedUser, req: Request) {
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
  const url = new URL('/reset-password', env.WEB_BASE_URL);
  url.searchParams.set('mode', 'reset');
  url.searchParams.set('email', email);
  url.searchParams.set('token', token);
  return url.toString();
}

async function sendSignupOtpEmail(email: string, code: string, storeName: string) {
  const subject = 'Kode verifikasi akun KaffePOS';
  const text = `Halo, kode verifikasi untuk akun ${storeName} adalah ${code}. Kode ini berlaku ${env.EMAIL_CODE_TTL_MINUTES} menit.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin:0 0 12px">Verifikasi akun KaffePOS</h2>
      <p>Kode OTP untuk akun <strong>${storeName}</strong> adalah:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:18px 0">${code}</p>
      <p>Kode ini berlaku ${env.EMAIL_CODE_TTL_MINUTES} menit.</p>
    </div>
  `;

  await sendEmail({ to: email, subject, text, html });
}

async function sendPasswordResetEmail(email: string, resetLink: string) {
  const subject = 'Reset password KaffePOS';
  const text = `Klik tautan berikut untuk reset password akun KaffePOS kamu: ${resetLink}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin:0 0 12px">Reset password</h2>
      <p>Kami menerima permintaan reset password untuk akun KaffePOS kamu.</p>
      <p><a href="${resetLink}" style="display:inline-block;padding:12px 18px;background:#d8823b;color:#111827;text-decoration:none;border-radius:8px;font-weight:700">Reset Password</a></p>
      <p>Jika tombol tidak bekerja, buka link ini:</p>
      <p>${resetLink}</p>
    </div>
  `;

  await sendEmail({ to: email, subject, text, html });
}

async function sendWelcomeEmail(email: string, storeName: string) {
  const subject = 'Selamat datang di KaffePOS';
  const text = `Akun ${storeName} sudah aktif. Masuk ke ${env.WEB_BASE_URL} untuk mulai operasional.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin:0 0 12px">Selamat datang di KaffePOS</h2>
      <p>Akun bisnis <strong>${storeName}</strong> sudah aktif dan siap dipakai.</p>
      <p><a href="${env.WEB_BASE_URL}" style="display:inline-block;padding:12px 18px;background:#d8823b;color:#111827;text-decoration:none;border-radius:8px;font-weight:700">Buka Dashboard</a></p>
    </div>
  `;

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
          c.email_verified_at
        from public.app_auth_sessions s
        join public.app_auth_credentials c on c.user_id = s.user_id
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

    req.authUser = {
      id: session.user_id as string,
      email: (session.email as string | null) ?? null,
      email_verified_at: (session.email_verified_at as string | null) ?? null,
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
  created_at,
  updated_at
`;

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
  stock,
  unit,
  min_stock,
  cost_per_unit,
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
      insert into public.profiles (id, username, display_name, email)
      values ($1, $2, $3, $4)
      on conflict (id) do update
      set
        email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name)
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
  billingCycle: 'free' | 'monthly' | 'quarterly' | 'yearly';
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
  };
}

async function assertStoreOwned(client: PoolClient, storeId: string, userId: string) {
  const result = await client.query(
    `select ${storeColumns} from public.stores where id = $1 and owner_id = $2 limit 1`,
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
  recipe: z.array(z.object({ matId: z.string().uuid(), qty: z.number().nonnegative() })).optional(),
  variants: z.array(z.object({ name: z.string().trim().min(1), price: z.number().nonnegative() })).optional(),
});
const inventoryWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  name: z.string().trim().min(1),
  stock: z.number(),
  unit: z.string().trim().min(1).default('pcs'),
  min_stock: z.number().nonnegative().optional(),
  cost_per_unit: z.number().nonnegative().optional(),
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
  event_name: z.enum(['login', 'checkout']),
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
  cashier: z.string().trim().min(1).default('Kasir'),
  note: z.string().trim().optional().nullable(),
  store_id: z.string().uuid(),
});
const adminSubscriptionActionSchema = z.object({
  userId: z.string().uuid(),
  plan: z.enum(['secangkir', 'kopi_susu', 'signature', 'founder']),
  billingCycle: z.enum(['free', 'monthly', 'quarterly', 'yearly']),
  paymentAmount: z.number().nonnegative(),
  paymentNote: z.string().trim().optional().nullable(),
});
const subscriptionPaymentCreateSchema = z.object({
  plan: z.enum(['kopi_susu', 'signature', 'founder']),
  billingCycle: z.enum(['monthly', 'quarterly', 'yearly']),
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

function calculateExpiryDate(billingCycle: 'free' | 'monthly' | 'quarterly' | 'yearly') {
  if (billingCycle === 'free') return null;
  const expiresAt = new Date();
  const days = billingCycle === 'monthly' ? 30 : billingCycle === 'quarterly' ? 90 : 365;
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

function getSubscriptionPlanPrice(
  plan: 'secangkir' | 'kopi_susu' | 'signature' | 'founder',
  billingCycle: 'free' | 'monthly' | 'quarterly' | 'yearly',
) {
  const pricing: Record<string, Partial<Record<'free' | 'monthly' | 'quarterly' | 'yearly', number>>> = {
    secangkir: { free: 0 },
    kopi_susu: { monthly: 49000, quarterly: 139000, yearly: 499000 },
    signature: { monthly: 99000, quarterly: 279000, yearly: 999000 },
    founder: { monthly: 199000, quarterly: 549000, yearly: 1999000 },
  };

  return pricing[plan]?.[billingCycle] ?? 0;
}

async function countRowsForStore(client: PoolClient, table: string, storeId: string) {
  const result = await client.query(`select count(*)::int as count from public.${table} where store_id = $1`, [storeId]);
  return result.rows[0]?.count ?? 0;
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
}) {
  return {
    database: params.databaseOk ? 10 : 4,
    backend: params.databaseOk ? 9 : 5,
    auth: params.emailOk ? 9 : 7,
    sync_consistency: 9,
    deployment: 9,
    email_flow: params.emailOk ? 9 : 5,
    payment_flow: params.paymentOk ? 8 : 4,
  };
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

app.get('/health', async (_req, res) => {
  const startedAt = Date.now();
  try {
    const db = await pool.query('select now() as now');
    res.json({
      ok: true,
      service: env.SERVICE_NAME,
      version: env.APP_VERSION,
      env: env.NODE_ENV,
      shuttingDown: isShuttingDown,
      uptimeSeconds: Math.round((Date.now() - serviceStartedAt) / 1000),
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
      shuttingDown: isShuttingDown,
      uptimeSeconds: Math.round((Date.now() - serviceStartedAt) / 1000),
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

app.get('/health/db', async (_req, res) => {
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

app.get('/system-status', async (_req, res) => {
  const startedAt = Date.now();
  try {
    await pool.query('select 1');
    const emailReady = Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
    const paymentReady = isMidtransConfigured();
    const readiness = buildReadinessScore({
      databaseOk: true,
      emailOk: emailReady,
      paymentOk: paymentReady,
    });

    res.json({
      ok: true,
      service: env.SERVICE_NAME,
      version: env.APP_VERSION,
      env: env.NODE_ENV,
      time: new Date().toISOString(),
      checks: {
        backend: { ok: true },
        database: { ok: true, latencyMs: Date.now() - startedAt },
        email: {
          ok: emailReady,
          provider: 'resend',
          fromEmail: env.RESEND_FROM_EMAIL ?? null,
        },
        payment: {
          ok: paymentReady,
          provider: 'midtrans',
          environment: env.MIDTRANS_ENVIRONMENT,
          merchantId: env.MIDTRANS_MERCHANT_ID ?? null,
        },
      },
      syncMatrix: {
        auth: true,
        profile: true,
        stores: true,
        menu_items: true,
        inventory: true,
        expenses: true,
        subscriptions: true,
        notifications: true,
        transactions: true,
        checkout: true,
        cashier_sessions: true,
        cash_register: true,
        subscription_payments: paymentReady,
        web: true,
        apk: true,
      },
      readiness,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: env.SERVICE_NAME,
      version: env.APP_VERSION,
      env: env.NODE_ENV,
      time: new Date().toISOString(),
      checks: {
        backend: { ok: true },
        database: { ok: false, latencyMs: Date.now() - startedAt },
        email: {
          ok: Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL),
          provider: 'resend',
          fromEmail: env.RESEND_FROM_EMAIL ?? null,
        },
        payment: {
          ok: isMidtransConfigured(),
          provider: 'midtrans',
          environment: env.MIDTRANS_ENVIRONMENT,
          merchantId: env.MIDTRANS_MERCHANT_ID ?? null,
        },
      },
      syncMatrix: {
        auth: false,
        profile: false,
        stores: false,
        menu_items: false,
        inventory: false,
        expenses: false,
        subscriptions: false,
        notifications: false,
        transactions: false,
        checkout: false,
        cashier_sessions: false,
        cash_register: false,
        subscription_payments: false,
        web: true,
        apk: true,
      },
      readiness: buildReadinessScore({
        databaseOk: false,
        emailOk: Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL),
        paymentOk: isMidtransConfigured(),
      }),
      error: serializeError(error),
    });
  }
});

app.post('/api/payments/midtrans/webhook', async (req, res, next) => {
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
      const settled = rawStatus === 'settlement' || (rawStatus === 'capture' && fraudStatus !== 'challenge');
      const pending = rawStatus === 'pending' || (rawStatus === 'capture' && fraudStatus === 'challenge');
      const failed = ['deny', 'cancel', 'expire', 'failure'].includes(rawStatus);
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
          pending ? 'pending' : failed ? rawStatus : 'settlement',
          fraudStatus,
          payload.status_code,
          payload.expiry_time ?? null,
          settled,
          paidAt,
        ],
      );

      let activationResult: Awaited<ReturnType<typeof activatePaidSubscription>> | null = null;

      if (settled && !paymentSession.subscription_id) {
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
      } else if (failed) {
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
        transactionStatus: pending ? 'pending' : failed ? rawStatus : 'settlement',
      };
    });

    if (result.activationResult?.email) {
      await sendEmail({
        to: result.activationResult.email,
        subject: 'Pembayaran KaffePOS berhasil',
        text: `Pembayaran langganan kamu sudah diterima. Akun ${result.activationResult.displayName} sekarang aktif.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><h2>Pembayaran berhasil</h2><p>Pembayaran langganan kamu sudah diterima. Akun <strong>${result.activationResult.displayName}</strong> sekarang aktif dan siap dipakai.</p></div>`,
      }).catch((error) => {
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

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const payload = authRegisterSchema.parse(req.body);
    const email = normalizeEmail(payload.email);

    const result = await withTransaction(async (client) => {
      const existingCredential = await client.query(
        `
          select c.user_id, c.email_verified_at, p.username, p.display_name
          from public.app_auth_credentials c
          join public.profiles p on p.id = c.user_id
          where c.email = $1
          limit 1
        `,
        [email],
      );

      if (existingCredential.rows[0]?.email_verified_at) {
        throw new ApiError(409, 'Email sudah terdaftar. Silakan login atau kirim ulang email verifikasi.');
      }

      const userId = existingCredential.rows[0]?.user_id ?? randomUUID();
      const resolvedUsername = await resolveUniqueUsername(client, payload.username);
      const displayName = payload.username.trim();
      const passwordHash = await bcrypt.hash(payload.password, 12);

      if (!existingCredential.rows[0]) {
        await client.query(
          `
            insert into public.profiles (id, username, display_name, email)
            values ($1, $2, $3, $4)
          `,
          [userId, resolvedUsername, displayName, email],
        );

        await client.query(
          `
            insert into public.stores (owner_id, store_name)
            values ($1, $2)
          `,
          [userId, `Kedai ${displayName}`],
        );
      } else {
        await client.query(
          `
            update public.profiles
            set username = coalesce(username, $2),
                display_name = coalesce(display_name, $3),
                email = $4,
                updated_at = now()
            where id = $1
          `,
          [userId, resolvedUsername, displayName, email],
        );
      }

      await client.query(
        `
          insert into public.app_auth_credentials (
            user_id,
            email,
            password_hash,
            email_verified_at,
            updated_at
          ) values ($1, $2, $3, null, now())
          on conflict (user_id) do update
          set
            email = excluded.email,
            password_hash = excluded.password_hash,
            email_verified_at = null,
            updated_at = now()
        `,
        [userId, email, passwordHash],
      );

      await client.query(
        `
          update public.email_verification_codes
          set consumed_at = now()
          where email = $1
            and purpose = 'signup'
            and consumed_at is null
        `,
        [email],
      );

      const code = await createEmailCode(client, email, 'signup');
      const profileResult = await client.query(
        `select display_name from public.profiles where id = $1 limit 1`,
        [userId],
      );

      return {
        email,
        code: code.code,
        storeName: (profileResult.rows[0]?.display_name as string | null) ?? displayName,
      };
    });

    await sendSignupOtpEmail(result.email, result.code, result.storeName);

    res.status(201).json({
      success: true,
      needsVerification: true,
      message: 'Akun berhasil dibuat. Cek email untuk kode verifikasi.',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/verification/resend', async (req, res, next) => {
  try {
    const payload = emailOnlySchema.parse(req.body);
    const email = normalizeEmail(payload.email);

    const result = await withTransaction(async (client) => {
      const credential = await client.query(
        `
          select c.user_id, c.email_verified_at, p.display_name
          from public.app_auth_credentials c
          join public.profiles p on p.id = c.user_id
          where c.email = $1
          limit 1
        `,
        [email],
      );

      const row = credential.rows[0];
      if (!row) {
        throw new ApiError(404, 'Akun tidak ditemukan.');
      }
      if (row.email_verified_at) {
        throw new ApiError(409, 'Email sudah terverifikasi. Silakan login.');
      }

      await client.query(
        `
          update public.email_verification_codes
          set consumed_at = now()
          where email = $1
            and purpose = 'signup'
            and consumed_at is null
        `,
        [email],
      );

      const code = await createEmailCode(client, email, 'signup');
      return {
        code: code.code,
        storeName: (row.display_name as string | null) ?? email.split('@')[0],
      };
    });

    await sendSignupOtpEmail(email, result.code, result.storeName);
    res.json({ success: true, message: 'Kode verifikasi baru sudah dikirim.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/verification/confirm', async (req, res, next) => {
  try {
    const payload = verifyEmailSchema.parse(req.body);
    const email = normalizeEmail(payload.email);

    const verified = await withTransaction(async (client) => {
      const codeResult = await client.query(
        `
          select id
          from public.email_verification_codes
          where email = $1
            and purpose = 'signup'
            and code = $2
            and consumed_at is null
            and expires_at > now()
          order by created_at desc
          limit 1
          for update
        `,
        [email, payload.code],
      );

      if (!codeResult.rows[0]) {
        throw new ApiError(400, 'Kode verifikasi tidak valid atau sudah kedaluwarsa.');
      }

      const credentialResult = await client.query(
        `
          update public.app_auth_credentials
          set email_verified_at = now(), updated_at = now()
          where email = $1
          returning user_id
        `,
        [email],
      );

      const credential = credentialResult.rows[0];
      if (!credential) {
        throw new ApiError(404, 'Akun tidak ditemukan.');
      }

      await client.query(
        `
          update public.email_verification_codes
          set consumed_at = now()
          where id = $1
        `,
        [codeResult.rows[0].id],
      );

      const profileResult = await client.query(
        `
          select display_name
          from public.profiles
          where id = $1
          limit 1
        `,
        [credential.user_id],
      );

      await insertNotification(
        client,
        credential.user_id as string,
        'Email terverifikasi',
        'Akun KaffePOS kamu sudah aktif dan siap dipakai.',
        'success',
      );

      return {
        userId: credential.user_id as string,
        storeName: (profileResult.rows[0]?.display_name as string | null) ?? email.split('@')[0],
      };
    });

    await sendWelcomeEmail(email, verified.storeName);

    res.json({
      success: true,
      message: 'Email berhasil diverifikasi. Silakan login ke KaffePOS.',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const payload = authLoginSchema.parse(req.body);
    const email = normalizeEmail(payload.email);

    const authResult = await withTransaction(async (client) => {
      const credentialResult = await client.query(
        `
          select
            c.user_id,
            c.email,
            c.password_hash,
            c.email_verified_at,
            p.username,
            p.display_name,
            p.avatar_url,
            p.tier,
            p.tier_expires_at,
            p.is_pro,
            p.pro_plan,
            p.pro_order_id,
            p.pro_activated_at,
            p.pro_expires_at,
            p.created_at,
            p.updated_at
          from public.app_auth_credentials c
          join public.profiles p on p.id = c.user_id
          where c.email = $1
          limit 1
        `,
        [email],
      );

      const credential = credentialResult.rows[0];
      if (!credential?.password_hash) {
        throw new ApiError(401, 'Akun belum punya password aktif. Gunakan menu lupa password.');
      }

      const passwordOk = await bcrypt.compare(payload.password, credential.password_hash as string);
      if (!passwordOk) {
        throw new ApiError(401, 'Email atau password salah.');
      }

      if (!credential.email_verified_at) {
        throw new ApiError(403, 'email_not_confirmed');
      }

      await revokeUserSessions(client, credential.user_id as string);
      const session = await createSession(client, {
        id: credential.user_id as string,
        email: credential.email as string,
        email_verified_at: credential.email_verified_at as string,
      }, req);

      await client.query(
        `
          update public.app_auth_credentials
          set last_login_at = now(), updated_at = now()
          where user_id = $1
        `,
        [credential.user_id],
      );

      await insertNotification(
        client,
        credential.user_id as string,
        'Login berhasil',
        'Sesi baru KaffePOS berhasil dibuat di perangkat kamu.',
        'info',
        { ip: req.ip },
      );

      return {
        session,
        user: {
          id: credential.user_id as string,
          email: (credential.email as string | null) ?? null,
          email_verified_at: (credential.email_verified_at as string | null) ?? null,
          user_metadata: {
            display_name: credential.display_name ?? null,
            username: credential.username ?? null,
          },
        },
        profile: {
          id: credential.user_id,
          username: credential.username,
          display_name: credential.display_name,
          email: credential.email,
          avatar_url: credential.avatar_url,
          tier: credential.tier,
          tier_expires_at: credential.tier_expires_at,
          is_pro: credential.is_pro,
          pro_plan: credential.pro_plan,
          pro_order_id: credential.pro_order_id,
          pro_activated_at: credential.pro_activated_at,
          pro_expires_at: credential.pro_expires_at,
          created_at: credential.created_at,
          updated_at: credential.updated_at,
        },
      };
    });

    res.json({
      accessToken: authResult.session.accessToken,
      expiresAt: authResult.session.expiresAt,
      user: authResult.user,
      profile: authResult.profile,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/password/forgot', async (req, res, next) => {
  try {
    const payload = emailOnlySchema.parse(req.body);
    const email = normalizeEmail(payload.email);

    const resetData = await withTransaction(async (client) => {
      const credentialResult = await client.query(
        `
          select c.user_id, c.email, p.display_name
          from public.app_auth_credentials c
          join public.profiles p on p.id = c.user_id
          where c.email = $1
          limit 1
        `,
        [email],
      );

      const credential = credentialResult.rows[0];
      if (!credential) {
        return null;
      }

      await client.query(
        `
          update public.app_password_reset_tokens
          set consumed_at = now()
          where email = $1
            and consumed_at is null
        `,
        [email],
      );

      const rawToken = createOpaqueToken();
      const expiresAt = addMinutes(new Date(), env.PASSWORD_RESET_TTL_MINUTES).toISOString();
      await client.query(
        `
          insert into public.app_password_reset_tokens (
            user_id,
            email,
            token_hash,
            expires_at
          ) values ($1, $2, $3, $4)
        `,
        [credential.user_id, email, hashToken(rawToken), expiresAt],
      );

      return {
        email,
        token: rawToken,
        displayName: (credential.display_name as string | null) ?? email.split('@')[0],
      };
    });

    if (resetData) {
      await sendPasswordResetEmail(resetData.email, getResetLink(resetData.email, resetData.token));
    }

    res.json({
      success: true,
      message: 'Jika email terdaftar, tautan reset password sudah dikirim.',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/password/reset', async (req, res, next) => {
  try {
    const payload = resetPasswordSchema.parse(req.body);
    const email = normalizeEmail(payload.email);
    const passwordHash = await bcrypt.hash(payload.password, 12);

    await withTransaction(async (client) => {
      const tokenResult = await client.query(
        `
          select id, user_id
          from public.app_password_reset_tokens
          where email = $1
            and token_hash = $2
            and consumed_at is null
            and expires_at > now()
          order by created_at desc
          limit 1
          for update
        `,
        [email, hashToken(payload.token)],
      );

      const tokenRow = tokenResult.rows[0];
      if (!tokenRow) {
        throw new ApiError(400, 'Tautan reset password tidak valid atau sudah kedaluwarsa.');
      }

      await client.query(
        `
          update public.app_auth_credentials
          set password_hash = $2,
              email_verified_at = coalesce(email_verified_at, now()),
              updated_at = now()
          where user_id = $1
        `,
        [tokenRow.user_id, passwordHash],
      );

      await client.query(
        `
          update public.app_password_reset_tokens
          set consumed_at = now()
          where id = $1
        `,
        [tokenRow.id],
      );

      await revokeUserSessions(client, tokenRow.user_id as string);

      await insertNotification(
        client,
        tokenRow.user_id as string,
        'Password diperbarui',
        'Password akun KaffePOS kamu baru saja diganti.',
        'warning',
      );
    });

    res.json({
      success: true,
      message: 'Password berhasil diperbarui. Silakan login kembali.',
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api', authenticate);

app.get('/api/auth/session', authenticate, async (req, res, next) => {
  try {
    const profile = await withTransaction(async (client) => {
      const ensured = await ensureProfile(client, req.authUser!);
      await syncProfileSubscriptionState(client, req.authUser!.id);
      const refreshed = await client.query(`select ${profileColumns} from public.profiles where id = $1 limit 1`, [req.authUser!.id]);
      return refreshed.rows[0] ?? ensured;
    });
    res.json({
      user: {
        ...req.authUser,
        user_metadata: {
          display_name: profile.display_name ?? null,
          username: profile.username ?? null,
        },
      },
      profile,
      sessionExpiresAt: req.authSession?.expiresAt ?? null,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      `
        update public.app_auth_sessions
        set revoked_at = now()
        where id = $1
      `,
      [req.authSession?.id ?? null],
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/profile/me', async (req, res, next) => {
  try {
    const profile = await withTransaction(async (client) => {
      const ensured = await ensureProfile(client, req.authUser!);
      await syncProfileSubscriptionState(client, req.authUser!.id);
      const refreshed = await client.query(`select ${profileColumns} from public.profiles where id = $1 limit 1`, [req.authUser!.id]);
      return refreshed.rows[0] ?? ensured;
    });
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/profile/me', async (req, res, next) => {
  try {
    const payload = pickDefined(req.body as Record<string, unknown>, [
      'display_name',
      'username',
      'avatar_url',
      'email',
    ]);

    const { clause, values } = buildUpdateClause(payload);
    const result = await withTransaction(async (client) => {
      await ensureProfile(client, req.authUser!);
      return client.query(
        `
          update public.profiles
          set ${clause}, updated_at = now()
          where id = $${values.length + 1}
          returning ${profileColumns}
        `,
        [...values, req.authUser!.id],
      );
    });

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/stores', async (req, res, next) => {
  try {
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : null;
    const query = storeId
      ? {
          text: `select ${storeColumns} from public.stores where owner_id = $1 and id = $2 order by created_at asc`,
          values: [req.authUser!.id, storeId],
        }
      : {
          text: `select ${storeColumns} from public.stores where owner_id = $1 order by created_at asc`,
          values: [req.authUser!.id],
        };

    const result = await pool.query(query.text, query.values);
    res.json({ items: result.rows.map((row: Record<string, unknown>) => normalizeStore(row)) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/stores', async (req, res, next) => {
  try {
    const payload = pickDefined(req.body as Record<string, unknown>, ['store_name']);
    const storeName =
      typeof payload.store_name === 'string' && payload.store_name.trim()
        ? payload.store_name.trim()
        : `Kedai ${req.authUser!.email?.split('@')[0] || 'Kopi'}`;

    const result = await pool.query(
      `
        insert into public.stores (owner_id, store_name)
        values ($1, $2)
        returning ${storeColumns}
      `,
      [req.authUser!.id, storeName],
    );

    res.status(201).json(normalizeStore(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/stores/:storeId', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.params.storeId);
    const payload = pickDefined(req.body as Record<string, unknown>, [
      'store_name',
      'address',
      'whatsapp',
      'tax_percent',
      'receipt_header',
      'receipt_footer',
      'logo_url',
      'logo_base64',
      'logo_position',
      'logo_size',
      'show_logo_on_receipt',
      'currency',
      'tagline',
      'email',
      'website',
      'paper_width',
      'receipt_font_size',
      'receipt_show_address',
      'receipt_show_whatsapp',
      'receipt_show_tax',
      'receipt_show_cashier',
      'receipt_show_trx_id',
      'receipt_divider',
      'receipt_custom_line1',
      'receipt_custom_line2',
      'timezone',
    ]);
    const { clause, values } = buildUpdateClause(payload);

    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `
          update public.stores
          set ${clause}, updated_at = now()
          where id = $${values.length + 1} and owner_id = $${values.length + 2}
          returning ${storeColumns}
        `,
        [...values, storeId, req.authUser!.id],
      );
    });

    res.json(normalizeStore(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.get('/api/menu-items', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `select ${menuColumns} from public.menu_items where store_id = $1 order by sort_order asc, created_at asc`,
        [storeId],
      );
    });

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/menu-items', async (req, res, next) => {
  try {
    const payload = menuItemWriteSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return client.query(
        `
          insert into public.menu_items (
            id, store_id, name, price, category, image_url, description, is_available, sort_order, recipe, variants
          ) values (
            coalesce($1, gen_random_uuid()),
            $2, $3, $4, $5, $6, $7, coalesce($8, true), coalesce($9, 0), coalesce($10, '[]'::jsonb), coalesce($11, '[]'::jsonb)
          )
          returning ${menuColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.name,
          Math.round(payload.price),
          payload.category,
          payload.image_url ?? null,
          payload.description ?? null,
          payload.is_available ?? true,
          payload.sort_order ?? 0,
          JSON.stringify(payload.recipe ?? []),
          JSON.stringify(payload.variants ?? []),
        ],
      );
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/menu-items/:id', async (req, res, next) => {
  try {
    const itemId = storeIdSchema.parse(req.params.id);
    const payload = pickDefined(req.body as Record<string, unknown>, [
      'name',
      'price',
      'category',
      'image_url',
      'description',
      'is_available',
      'sort_order',
      'recipe',
      'variants',
    ]);
    const { clause, values } = buildUpdateClause(payload);

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `
          select mi.id
          from public.menu_items mi
          join public.stores s on s.id = mi.store_id
          where mi.id = $1 and s.owner_id = $2
          limit 1
        `,
        [itemId, req.authUser!.id],
      );
      if (!existing.rows[0]) {
        throw new ApiError(404, 'Menu tidak ditemukan.');
      }

      return client.query(
        `
          update public.menu_items
          set ${clause}, updated_at = now()
          where id = $${values.length + 1}
          returning ${menuColumns}
        `,
        [...values, itemId],
      );
    });

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/menu-items/:id', async (req, res, next) => {
  try {
    const itemId = storeIdSchema.parse(req.params.id);
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          delete from public.menu_items mi
          using public.stores s
          where mi.store_id = s.id
            and mi.id = $1
            and s.owner_id = $2
          returning mi.id
        `,
        [itemId, req.authUser!.id],
      );
      if (!result.rows[0]) {
        throw new ApiError(404, 'Menu tidak ditemukan.');
      }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/inventory', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `select ${inventoryColumns} from public.inventory where store_id = $1 order by name asc, created_at asc`,
        [storeId],
      );
    });

    res.json({ items: result.rows.map((row: Record<string, unknown>) => normalizeInventory(row)) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/inventory', async (req, res, next) => {
  try {
    const payload = inventoryWriteSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return client.query(
        `
          insert into public.inventory (
            id, store_id, name, stock, unit, min_stock, cost_per_unit
          ) values (
            coalesce($1, gen_random_uuid()),
            $2, $3, $4, $5, $6, $7
          )
          returning ${inventoryColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.name,
          payload.stock,
          payload.unit,
          payload.min_stock ?? 5,
          payload.cost_per_unit ?? 0,
        ],
      );
    });

    res.status(201).json(normalizeInventory(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/inventory/:id', async (req, res, next) => {
  try {
    const itemId = storeIdSchema.parse(req.params.id);
    const payload = pickDefined(req.body as Record<string, unknown>, [
      'name',
      'stock',
      'unit',
      'min_stock',
      'cost_per_unit',
    ]);
    const { clause, values } = buildUpdateClause(payload);

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `
          select i.id
          from public.inventory i
          join public.stores s on s.id = i.store_id
          where i.id = $1 and s.owner_id = $2
          limit 1
        `,
        [itemId, req.authUser!.id],
      );
      if (!existing.rows[0]) {
        throw new ApiError(404, 'Inventaris tidak ditemukan.');
      }

      return client.query(
        `
          update public.inventory
          set ${clause}, updated_at = now()
          where id = $${values.length + 1}
          returning ${inventoryColumns}
        `,
        [...values, itemId],
      );
    });

    res.json(normalizeInventory(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/inventory/:id', async (req, res, next) => {
  try {
    const itemId = storeIdSchema.parse(req.params.id);
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          delete from public.inventory i
          using public.stores s
          where i.store_id = s.id
            and i.id = $1
            and s.owner_id = $2
          returning i.id
        `,
        [itemId, req.authUser!.id],
      );
      if (!result.rows[0]) {
        throw new ApiError(404, 'Inventaris tidak ditemukan.');
      }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/expenses', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `select ${expenseColumns} from public.expenses where store_id = $1 order by date desc, created_at desc`,
        [storeId],
      );
    });

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/expenses', async (req, res, next) => {
  try {
    const payload = expenseWriteSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return client.query(
        `
          insert into public.expenses (
            id, store_id, date, description, amount, category, cashier, source
          ) values (
            coalesce($1, gen_random_uuid()),
            $2, coalesce($3::timestamptz, now()), $4, $5, $6, $7, $8
          )
          returning ${expenseColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.date ?? null,
          payload.description,
          Math.round(payload.amount),
          payload.category,
          payload.cashier ?? null,
          payload.source,
        ],
      );
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/expenses/:id', async (req, res, next) => {
  try {
    const expenseId = storeIdSchema.parse(req.params.id);
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          delete from public.expenses e
          using public.stores s
          where e.store_id = s.id
            and e.id = $1
            and s.owner_id = $2
          returning e.id
        `,
        [expenseId, req.authUser!.id],
      );
      if (!result.rows[0]) {
        throw new ApiError(404, 'Pengeluaran tidak ditemukan.');
      }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cash-flow', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `select ${cashFlowColumns} from public.cash_flow where store_id = $1 order by date desc, created_at desc`,
        [storeId],
      );
    });

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/cash-flow', async (req, res, next) => {
  try {
    const payload = cashFlowWriteSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return client.query(
        `
          insert into public.cash_flow (
            id, store_id, date, type, amount, description, cashier
          ) values (
            coalesce($1, gen_random_uuid()),
            $2, coalesce($3::timestamptz, now()), $4, $5, $6, $7
          )
          returning ${cashFlowColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.date ?? null,
          payload.type,
          Math.round(payload.amount),
          payload.description ?? null,
          payload.cashier ?? null,
        ],
      );
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/cash-register', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `select ${cashRegisterColumns} from public.cash_register where store_id = $1 order by date desc, created_at desc`,
        [storeId],
      );
    });

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/cash-register', async (req, res, next) => {
  try {
    const payload = cashRegisterWriteSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return client.query(
        `
          insert into public.cash_register (
            id, store_id, date, amount, note, opened_by
          ) values (
            coalesce($1, gen_random_uuid()),
            $2, coalesce($3::timestamptz, now()), $4, $5, $6
          )
          returning ${cashRegisterColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.date ?? null,
          Math.round(payload.amount),
          payload.note ?? null,
          payload.opened_by,
        ],
      );
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/cash-register/:id', async (req, res, next) => {
  try {
    const registerId = storeIdSchema.parse(req.params.id);
    const payload = pickDefined(req.body as Record<string, unknown>, ['amount', 'note', 'opened_by', 'date']);
    const { clause, values } = buildUpdateClause(payload);

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `
          select cr.id
          from public.cash_register cr
          join public.stores s on s.id = cr.store_id
          where cr.id = $1 and s.owner_id = $2
          limit 1
        `,
        [registerId, req.authUser!.id],
      );
      if (!existing.rows[0]) {
        throw new ApiError(404, 'Register kasir tidak ditemukan.');
      }

      return client.query(
        `
          update public.cash_register
          set ${clause}
          where id = $${values.length + 1}
          returning ${cashRegisterColumns}
        `,
        [...values, registerId],
      );
    });

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/subscriptions', async (req, res, next) => {
  try {
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
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/subscriptions/payments/create', async (req, res, next) => {
  try {
    if (!isMidtransConfigured()) {
      throw new ApiError(503, 'Midtrans belum siap dipakai di backend.');
    }

    const payload = subscriptionPaymentCreateSchema.parse(req.body);
    const amount = getSubscriptionPlanPrice(payload.plan, payload.billingCycle);
    if (!amount) {
      throw new ApiError(400, 'Paket atau periode pembayaran tidak valid.');
    }

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
          and transaction_status = 'pending'
          and (expires_at is null or expires_at > now())
        order by created_at desc
        limit 1
      `,
      [req.authUser!.id, payload.plan, payload.billingCycle],
    );

    if (existingPending.rows[0]) {
      res.status(200).json({
        reused: true,
        payment: normalizeSubscriptionPaymentSession(existingPending.rows[0]),
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
    const orderId = createMidtransOrderId(req.authUser!.id, payload.plan, payload.billingCycle);
    const callbackUrls = getMidtransCallbackUrls();

    const response = await fetch(`${getMidtransBaseUrl()}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        item_details: [
          {
            id: `${payload.plan}-${payload.billingCycle}`,
            price: amount,
            quantity: 1,
            name: `Langganan ${payload.plan} (${payload.billingCycle})`,
          },
        ],
        customer_details: {
          first_name: (profile.display_name as string | null) ?? (profile.username as string | null) ?? 'KaffePOS User',
          email: (profile.email as string | null) ?? req.authUser!.email ?? undefined,
        },
        callbacks: callbackUrls,
        expiry: {
          unit: 'minutes',
          duration: 30,
        },
        custom_field1: payload.plan,
        custom_field2: payload.billingCycle,
        custom_field3: store?.id ?? '',
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.text().catch(() => '');
      throw new ApiError(502, `Midtrans create transaction gagal (${response.status}). ${errorPayload || 'Silakan coba lagi.'}`);
    }

    const paymentPayload = await response.json() as { token?: string; redirect_url?: string };
    if (!paymentPayload.token || !paymentPayload.redirect_url) {
      throw new ApiError(502, 'Respons Midtrans tidak lengkap.');
    }

    const sessionId = randomUUID();
    const inserted = await pool.query(
      `
        insert into public.subscription_payment_sessions (
          id,
          user_id,
          store_id,
          plan,
          billing_cycle,
          amount,
          currency_code,
          midtrans_order_id,
          snap_token,
          redirect_url,
          transaction_status,
          expires_at,
          metadata,
          updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, 'IDR', $7, $8, $9, 'pending', now() + interval '30 minutes', $10::jsonb, now()
        )
        returning
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
      `,
      [
        sessionId,
        req.authUser!.id,
        store?.id ?? null,
        payload.plan,
        payload.billingCycle,
        amount,
        orderId,
        paymentPayload.token,
        paymentPayload.redirect_url,
        JSON.stringify({
          env: env.MIDTRANS_ENVIRONMENT,
          callbackUrls,
          storeName: store?.store_name ?? null,
        }),
      ],
    );

    res.status(201).json({
      reused: false,
      payment: normalizeSubscriptionPaymentSession(inserted.rows[0]),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/ops/events', async (req, res, next) => {
  try {
    const payload = opsEventSchema.parse(req.body);

    if (payload.store_id) {
      await withTransaction(async (client) => {
        await assertStoreOwned(client, payload.store_id!, req.authUser!.id);
      });
    }

    await pool.query(
      `
        insert into public.ops_event_logs (
          event_name,
          status,
          actor_user_id,
          actor_email,
          store_id,
          transaction_id,
          source,
          error_message,
          metadata,
          ip_address,
          user_agent
        ) values (
          $1, $2, $3, $4, $5, $6, 'app', $7, $8::jsonb, $9, $10
        )
      `,
      [
        payload.event_name,
        payload.status,
        req.authUser!.id,
        payload.email ?? req.authUser!.email ?? null,
        payload.store_id ?? null,
        payload.transaction_id ?? null,
        payload.error_message ?? null,
        JSON.stringify(payload.metadata ?? {}),
        req.ip,
        req.get('user-agent') ?? null,
      ],
    );

    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/ai-insight', async (req, res, next) => {
  try {
    if (!env.GEMINI_API_KEY) {
      throw new ApiError(502, 'GEMINI_API_KEY belum dikonfigurasi di backend.');
    }

    const payload = aiInsightRequestSchema.parse(req.body);
    const now = new Date();

    const profileResult = await pool.query(
      `
        select is_pro, tier
        from public.profiles
        where id = $1
        limit 1
      `,
      [req.authUser!.id],
    );

    const profile = profileResult.rows[0];
    const isPro = profile?.is_pro === true || profile?.tier === 'pro';
    const limitWindow = getAiLimitWindow(isPro, now);
    const usageResult = await pool.query(
      `
        select count(*)::int as usage_count
        from public.ai_insight_logs
        where user_id = $1
          and created_at >= $2::timestamptz
      `,
      [req.authUser!.id, limitWindow.startsAt],
    );

    const usageCount = usageResult.rows[0]?.usage_count ?? 0;
    if (usageCount >= limitWindow.limitMax) {
      throw new ApiError(
        429,
        `Batas analisis AI tercapai (${limitWindow.limitLabel}). ${limitWindow.resetMessage}`,
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`;

    let geminiResponse: globalThis.Response;
    try {
      geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: payload.prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('abort')) {
        throw new ApiError(502, 'Layanan AI timeout. Sistem akan memakai analisis cadangan.');
      }

      throw new ApiError(502, 'Layanan AI sedang tidak tersedia. Sistem akan memakai analisis cadangan.');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!geminiResponse.ok) {
      const errorPayload = (await geminiResponse.json().catch(() => ({}))) as { error?: { message?: string } };
      const message = errorPayload.error?.message ?? `Gemini error ${geminiResponse.status}`;
      throw new ApiError(502, mapGeminiError(geminiResponse.status, message));
    }

    const geminiPayload = await geminiResponse.json();
    let insight: z.infer<typeof aiInsightResponseSchema>;
    try {
      insight = parseGeminiText(geminiPayload);
    } catch {
      throw new ApiError(502, 'Respons AI tidak valid. Coba lagi.');
    }

    await pool.query(
      `
        insert into public.ai_insight_logs (user_id, created_at)
        values ($1, $2)
      `,
      [req.authUser!.id, now.toISOString()],
    );

    res.json(insight);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/subscriptions/overview', requireAdmin, async (_req, res, next) => {
  try {
    const [profiles, subscriptions, paymentHistory] = await Promise.all([
      pool.query(
        `
          select id, email, display_name, username
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

app.post('/api/admin/subscriptions/activate', requireAdmin, async (req, res, next) => {
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

app.post('/api/admin/subscriptions/:id/cancel', requireAdmin, async (req, res, next) => {
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

app.post('/api/import/local-storage', async (req, res, next) => {
  try {
    const payload = localStorageImportSchema.parse(req.body);

    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);

      const summary = {
        success: true,
        migrated: [] as string[],
        errors: [] as string[],
        skipped: [] as string[],
      };

      if (payload.store_settings) {
        const storeFields = pickDefined(payload.store_settings, [
          'store_name',
          'address',
          'whatsapp',
          'tax_percent',
          'receipt_header',
          'receipt_footer',
          'logo_url',
          'logo_base64',
          'logo_position',
          'logo_size',
          'show_logo_on_receipt',
          'currency',
          'tagline',
          'email',
          'website',
          'paper_width',
          'receipt_font_size',
          'receipt_show_address',
          'receipt_show_whatsapp',
          'receipt_show_tax',
          'receipt_show_cashier',
          'receipt_show_trx_id',
          'receipt_divider',
          'receipt_custom_line1',
          'receipt_custom_line2',
          'timezone',
        ]);
        if (Object.keys(storeFields).length > 0) {
          const { clause, values } = buildUpdateClause(storeFields);
          await client.query(
            `
              update public.stores
              set ${clause}, updated_at = now()
              where id = $${values.length + 1}
            `,
            [...values, payload.store_id],
          );
          summary.migrated.push('store_settings');
        }
      }

      if (payload.menu_items.length > 0) {
        const existing = await countRowsForStore(client, 'menu_items', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('menu_items (destination not empty)');
        } else {
          for (const item of payload.menu_items) {
            await client.query(
              `
                insert into public.menu_items (
                  store_id, name, price, category, image_url, description, is_available, sort_order, recipe, variants
                ) values (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb
                )
              `,
              [
                payload.store_id,
                String(item.name || 'Unknown'),
                Math.max(0, Number(item.price || 0)),
                String(item.category || 'Coffee'),
                String(item.image_url || ''),
                String(item.description || ''),
                item.is_available ?? true,
                Number(item.sort_order || 0),
                JSON.stringify(Array.isArray(item.recipe) ? item.recipe : []),
                JSON.stringify(Array.isArray(item.variants) ? item.variants : []),
              ],
            );
          }
          summary.migrated.push(`menu_items (${payload.menu_items.length})`);
        }
      } else {
        summary.skipped.push('menu_items (empty)');
      }

      if (payload.inventory_items.length > 0) {
        const existing = await countRowsForStore(client, 'inventory', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('inventory (destination not empty)');
        } else {
          for (const item of payload.inventory_items) {
            await client.query(
              `
                insert into public.inventory (
                  store_id, name, stock, unit, min_stock, cost_per_unit
                ) values (
                  $1, $2, $3, $4, $5, $6
                )
              `,
              [
                payload.store_id,
                String(item.name || 'Unknown'),
                Number(item.stock || 0),
                String(item.unit || 'pcs'),
                Number(item.min_stock || 5),
                Number(item.cost_per_unit || 0),
              ],
            );
          }
          summary.migrated.push(`inventory (${payload.inventory_items.length})`);
        }
      } else {
        summary.skipped.push('inventory (empty)');
      }

      if (payload.transactions.length > 0) {
        const existing = await countRowsForStore(client, 'transactions', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('transactions (destination not empty)');
        } else {
          for (const trx of payload.transactions) {
            await client.query(
              `
                insert into public.transactions (
                  id, store_id, date, items, subtotal, discount, discount_label, tax, total, cogs, paid, change,
                  method, cashier, note, is_void, void_reason, void_at, void_by
                ) values (
                  $1, $2, $3::timestamptz, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::timestamptz, $19
                )
                on conflict (id) do nothing
              `,
              [
                String(trx.id),
                payload.store_id,
                String(trx.date || new Date().toISOString()),
                JSON.stringify(Array.isArray(trx.items) ? trx.items : []),
                Number(trx.subtotal || 0),
                Number(trx.discount || 0),
                trx.discount_label ?? null,
                Number(trx.tax || 0),
                Number(trx.total || 0),
                Number(trx.cogs || 0),
                Number(trx.paid || 0),
                Number(trx.change || 0),
                String(trx.method || 'Tunai'),
                String(trx.cashier || ''),
                trx.note ?? null,
                Boolean(trx.is_void),
                trx.void_reason ?? null,
                trx.void_at ?? null,
                trx.void_by ?? null,
              ],
            );
          }
          summary.migrated.push(`transactions (${payload.transactions.length})`);
        }
      } else {
        summary.skipped.push('transactions (empty)');
      }

      if (payload.expenses.length > 0) {
        const existing = await countRowsForStore(client, 'expenses', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('expenses (destination not empty)');
        } else {
          for (const expense of payload.expenses) {
            await client.query(
              `
                insert into public.expenses (
                  store_id, date, description, amount, category, cashier, source
                ) values (
                  $1, $2::timestamptz, $3, $4, $5, $6, $7
                )
              `,
              [
                payload.store_id,
                String(expense.date || new Date().toISOString()),
                String(expense.description || ''),
                Number(expense.amount || 0),
                String(expense.category || 'Operasional'),
                expense.cashier ?? null,
                String(expense.source || 'cashier'),
              ],
            );
          }
          summary.migrated.push(`expenses (${payload.expenses.length})`);
        }
      } else {
        summary.skipped.push('expenses (empty)');
      }

      if (payload.cash_flow.length > 0) {
        const existing = await countRowsForStore(client, 'cash_flow', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('cash_flow (destination not empty)');
        } else {
          for (const entry of payload.cash_flow) {
            await client.query(
              `
                insert into public.cash_flow (
                  store_id, date, type, amount, description, cashier
                ) values (
                  $1, $2::timestamptz, $3, $4, $5, $6
                )
              `,
              [
                payload.store_id,
                String(entry.date || new Date().toISOString()),
                String(entry.type === 'in' ? 'in' : 'out'),
                Number(entry.amount || 0),
                entry.description ?? null,
                entry.cashier ?? null,
              ],
            );
          }
          summary.migrated.push(`cash_flow (${payload.cash_flow.length})`);
        }
      } else {
        summary.skipped.push('cash_flow (empty)');
      }

      if (payload.store_accounts.length > 0) {
        const existing = await countRowsForStore(client, 'store_accounts', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('store_accounts (destination not empty)');
        } else {
          for (const account of payload.store_accounts) {
            await client.query(
              `
                insert into public.store_accounts (
                  store_id, username, password_hash, role, is_active
                ) values (
                  $1, $2, $3, $4, $5
                )
                on conflict (store_id, username) do update
                set
                  password_hash = excluded.password_hash,
                  role = excluded.role,
                  is_active = excluded.is_active
              `,
              [
                payload.store_id,
                String(account.username || 'kasir'),
                String(account.password_hash || ''),
                String(account.role === 'owner' ? 'owner' : 'kasir'),
                account.is_active ?? true,
              ],
            );
          }
          summary.migrated.push(`store_accounts (${payload.store_accounts.length})`);
        }
      }

      return summary;
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/notifications', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
    const [items, unreadCount] = await Promise.all([
      pool.query(
        `
          select id, user_id, title, message, type, is_read, metadata, created_at
          from public.notifications
          where user_id = $1
          order by created_at desc
          limit $2
        `,
        [req.authUser!.id, limit],
      ),
      pool.query(
        `
          select count(*)::int as unread_count
          from public.notifications
          where user_id = $1
            and is_read = false
        `,
        [req.authUser!.id],
      ),
    ]);

    res.json({
      items: items.rows,
      unreadCount: unreadCount.rows[0]?.unread_count ?? 0,
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/notifications/read-all', async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        update public.notifications
        set is_read = true
        where user_id = $1
          and is_read = false
      `,
      [req.authUser!.id],
    );

    res.json({ updated: result.rowCount ?? 0 });
  } catch (error) {
    next(error);
  }
});

app.get('/api/transactions', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `select ${transactionColumns} from public.transactions where store_id = $1 order by date desc, created_at desc`,
        [storeId],
      );
    });

    res.json({ items: result.rows.map((row: Record<string, unknown>) => normalizeTransaction(row)) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/transactions/checkout', async (req, res, next) => {
  try {
    const payload = checkoutSchema.parse(req.body);

    const transaction = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);

      const existing = await client.query(
        `select id from public.transactions where id = $1 and store_id = $2 limit 1`,
        [payload.id, payload.store_id],
      );
      if (existing.rows[0]) {
        throw new ApiError(409, 'ID transaksi sudah digunakan. Coba checkout lagi.');
      }

      const safeSubtotal = Math.max(0, Math.round(payload.subtotal));
      const safeDiscount = Math.min(Math.max(0, Math.round(payload.discount)), safeSubtotal);
      const safeTax = Math.max(0, Math.round(payload.tax));
      const safeTotal = Math.max(0, safeSubtotal - safeDiscount) + safeTax;
      const safePaid = Math.max(0, Math.round(payload.paid));
      const safeChange = Math.max(0, safePaid - safeTotal);

      let computedCogs = 0;

      for (const item of payload.items) {
        const qty = Math.max(0, item.qty);
        if (qty <= 0) continue;

        let menuId = item.menu_item_id ?? null;
        if (!menuId) {
          const menuLookup = await client.query(
            `
              select id
              from public.menu_items
              where store_id = $1 and name = $2
              order by created_at asc
              limit 1
            `,
            [payload.store_id, item.name],
          );
          menuId = menuLookup.rows[0]?.id ?? null;
        }

        if (!menuId) continue;

        const menuResult = await client.query(
          `select recipe from public.menu_items where id = $1 and store_id = $2 limit 1`,
          [menuId, payload.store_id],
        );
        const recipe = Array.isArray(menuResult.rows[0]?.recipe) ? menuResult.rows[0].recipe : [];

        for (const recipeItem of recipe) {
          const requiredQty = Math.max(0, toNumber(recipeItem?.qty)) * qty;
          if (requiredQty <= 0) continue;

          const inventoryId = String(recipeItem?.matId ?? '');
          const inventoryResult = await client.query(
            `
              select ${inventoryColumns}
              from public.inventory
              where id = $1 and store_id = $2
              for update
            `,
            [inventoryId, payload.store_id],
          );

          const inventoryRow = inventoryResult.rows[0];
          if (!inventoryRow) {
            throw new ApiError(400, 'Bahan inventory tidak ditemukan untuk menu yang dijual.');
          }

          const stockBefore = toNumber(inventoryRow.stock);
          if (stockBefore < requiredQty) {
            throw new ApiError(400, `Stok ${inventoryRow.name} tidak cukup untuk checkout.`);
          }

          const stockAfter = stockBefore - requiredQty;
          await client.query(
            `update public.inventory set stock = $1, updated_at = now() where id = $2`,
            [stockAfter, inventoryRow.id],
          );
          await client.query(
            `
              insert into public.transaction_inventory_audit (
                store_id,
                transaction_id,
                inventory_id,
                action,
                qty_delta,
                stock_before,
                stock_after
              ) values ($1, $2, $3, 'sale', $4, $5, $6)
            `,
            [payload.store_id, payload.id, inventoryRow.id, -requiredQty, stockBefore, stockAfter],
          );

          computedCogs += toNumber(inventoryRow.cost_per_unit) * requiredQty;
        }
      }

      const insertResult = await client.query(
        `
          insert into public.transactions (
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
            created_at
          ) values (
            $1, $2, $3::timestamptz, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, now()
          )
          returning ${transactionColumns}
        `,
        [
          payload.id,
          payload.store_id,
          payload.date,
          JSON.stringify(payload.items),
          safeSubtotal,
          safeDiscount,
          payload.discount_label ?? null,
          safeTax,
          safeTotal,
          Math.max(Math.round(payload.cogs ?? Math.round(computedCogs)), Math.round(computedCogs)),
          safePaid,
          safeChange,
          payload.method,
          payload.customer_name ?? null,
          payload.cashier,
          payload.note ?? null,
        ],
      );

      return insertResult.rows[0];
    });

    res.status(201).json(normalizeTransaction(transaction));
  } catch (error) {
    next(error);
  }
});

app.post('/api/transactions/:id/void', async (req, res, next) => {
  try {
    const transactionId = req.params.id;
    const body = z
      .object({
        store_id: z.string().uuid(),
        reason: z.string().trim().optional().nullable(),
        void_by: z.string().trim().optional().nullable(),
      })
      .parse(req.body);

    const transaction = await withTransaction(async (client) => {
      await assertStoreOwned(client, body.store_id, req.authUser!.id);

      const currentResult = await client.query(
        `
          select ${transactionColumns}
          from public.transactions
          where id = $1 and store_id = $2
          for update
        `,
        [transactionId, body.store_id],
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw new ApiError(404, 'Transaksi tidak ditemukan.');
      }
      if (current.is_void) {
        return current;
      }

      const audits = await client.query(
        `
          select inventory_id, qty_delta
          from public.transaction_inventory_audit
          where transaction_id = $1
            and action = 'sale'
          order by created_at asc, id asc
        `,
        [transactionId],
      );

      for (const audit of audits.rows) {
        const inventoryResult = await client.query(
          `
            select ${inventoryColumns}
            from public.inventory
            where id = $1 and store_id = $2
            for update
          `,
          [audit.inventory_id, body.store_id],
        );
        const inventoryRow = inventoryResult.rows[0];
        if (!inventoryRow) continue;

        const stockBefore = toNumber(inventoryRow.stock);
        const restoreQty = Math.abs(toNumber(audit.qty_delta));
        const stockAfter = stockBefore + restoreQty;

        await client.query(
          `update public.inventory set stock = $1, updated_at = now() where id = $2`,
          [stockAfter, inventoryRow.id],
        );
        await client.query(
          `
            insert into public.transaction_inventory_audit (
              store_id,
              transaction_id,
              inventory_id,
              action,
              qty_delta,
              stock_before,
              stock_after
            ) values ($1, $2, $3, 'void', $4, $5, $6)
          `,
          [body.store_id, transactionId, inventoryRow.id, restoreQty, stockBefore, stockAfter],
        );
      }

      const updated = await client.query(
        `
          update public.transactions
          set
            is_void = true,
            void_reason = $1,
            void_at = now(),
            void_by = $2
          where id = $3 and store_id = $4
          returning ${transactionColumns}
        `,
        [body.reason ?? null, body.void_by ?? null, transactionId, body.store_id],
      );

      return updated.rows[0];
    });

    res.json(normalizeTransaction(transaction));
  } catch (error) {
    next(error);
  }
});

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
    log('warn', 'request.api_error', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      statusCode: error.status,
      message: error.message,
    });
    res.status(error.status).json({ error: 'API_ERROR', message: error.message });
    return;
  }

  log('error', 'request.unhandled_error', {
    requestId: req.requestId ?? null,
    method: req.method,
    path: req.originalUrl,
    error: serializeError(error),
  });
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Terjadi kesalahan di backend.',
  });
});

async function verifyDependenciesOnStartup() {
  const startedAt = Date.now();
  await bootstrapAuthSchema();
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
    },
  });
}

async function shutdown(signal: NodeJS.Signals | 'FATAL') {
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
