import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { type Server } from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createClient, type User } from '@supabase/supabase-js';
import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';

declare global {
  namespace Express {
    interface Request {
      authUser?: User;
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
  SUPABASE_URL: z.string().trim().url(),
  SUPABASE_ANON_KEY: z.string().trim().min(1),
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

const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

function isAdminUser(user: User | undefined) {
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;
  return adminEmails.has(email);
}

async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      throw new ApiError(401, 'Missing bearer token.');
    }

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      throw new ApiError(401, 'Sesi tidak valid atau sudah kedaluwarsa.');
    }

    req.authUser = data.user;
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

async function ensureProfile(client: PoolClient, user: User) {
  const existing = await client.query(
    `select ${profileColumns} from public.profiles where id = $1 limit 1`,
    [user.id],
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const email = user.email ?? null;
  const metadata = user.user_metadata ?? {};
  const fallbackName =
    (typeof metadata.display_name === 'string' && metadata.display_name.trim()) ||
    (typeof metadata.username === 'string' && metadata.username.trim()) ||
    user.email?.split('@')[0] ||
    'kaffepos';

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

app.use('/api', authenticate);

app.get('/api/profile/me', async (req, res, next) => {
  try {
    const profile = await withTransaction((client) => ensureProfile(client, req.authUser!));
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
    const [subscriptions, paymentHistory] = await Promise.all([
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
    ]);

    const subscriptionItems = subscriptions.rows.map((row: Record<string, unknown>) => normalizeSubscription(row));
    const paymentItems = paymentHistory.rows.map((row: Record<string, unknown>) => normalizePaymentHistory(row));

    res.json({
      currentSubscription: subscriptionItems[0] ?? null,
      subscriptions: subscriptionItems,
      paymentHistory: paymentItems,
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
    const now = new Date();
    const expiresAt = calculateExpiryDate(payload.billingCycle);

    const result = await withTransaction(async (client) => {
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

      const storeResult = await client.query(
        `select id from public.stores where owner_id = $1 order by created_at asc limit 1`,
        [payload.userId],
      );
      const store = storeResult.rows[0];

      await client.query(
        `
          update public.subscriptions
          set
            status = 'cancelled',
            updated_at = $2
          where user_id = $1
            and status = 'active'
        `,
        [payload.userId, now.toISOString()],
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
            $1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $11, $12, $13, $14
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
          now.toISOString(),
          expiresAt?.toISOString() ?? null,
          payload.paymentAmount,
          payload.paymentAmount,
          payload.plan === 'secangkir' ? 'free' : 'manual_transfer',
          payload.paymentNote ?? null,
          payload.plan === 'secangkir' ? 'FREE-AUTO' : `MANUAL-${now.getTime()}`,
          now.toISOString(),
        ],
      );
      const subscription = insertSubscription.rows[0];

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
          payload.plan === 'secangkir' ? 'free' : 'manual_transfer',
          payload.paymentNote ?? null,
          subscription.payment_ref,
          now.toISOString(),
        ],
      );

      return subscription;
    });

    res.status(201).json({
      success: true,
      subscription: normalizeSubscription(result),
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

      return subscription;
    });

    res.json({
      success: true,
      subscription: normalizeSubscription(result),
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
  await pool.query('select 1');
  log('info', 'startup.dependencies_ready', {
    database: {
      ok: true,
      latencyMs: Date.now() - startedAt,
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
