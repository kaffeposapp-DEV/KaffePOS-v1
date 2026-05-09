/**
 * Environment configuration — parsed and validated with Zod.
 * Single source of truth for all backend env vars.
 */
import { z } from 'zod';

export const envSchema = z.object({
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
  DB_SSL_REJECT_UNAUTHORIZED: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .default('true'),
  DB_SSL_CA: z.string().optional(),
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
  SUBSCRIPTION_PAYMENT_MODE: z
    .enum(['auto', 'manual', 'disabled', 'midtrans_sandbox', 'midtrans_production'])
    .default('auto'),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  AUTH_VERIFY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  PAYMENT_CREATE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(12),
  GEMINI_API_KEY: z.string().trim().optional(),
  CORS_ORIGIN: z.string().trim().optional(),
  ADMIN_EMAILS: z.string().trim().optional(),
  SENTRY_DSN: z.string().trim().optional(),
  SENTRY_ENVIRONMENT: z.string().trim().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.string().trim().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);

export const adminEmails = new Set(
  (env.ADMIN_EMAILS || 'kaffeposapp@gmail.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
