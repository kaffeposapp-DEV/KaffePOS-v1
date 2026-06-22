/**
 * Environment configuration — parsed and validated with Zod.
 * Single source of truth for all backend env vars.
 */
import { z } from 'zod';

export const envSchema = z.object({
  SERVICE_NAME: z.string().trim().default('kaffepos-backend'),
  APP_VERSION: z.string().trim().default('1.0.0'),
  MIN_SUPPORTED_WEB_VERSION: z.string().trim().default('0.0.0'),
  MIN_SUPPORTED_APK_VERSION: z.string().trim().default('0.0.0'),
  APP_RELEASE_CHANNEL: z.enum(['development', 'beta', 'stable']).default('beta'),
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  STAGING_PROFILE: z.string().trim().optional(),
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
  // PII (affiliate payout/bank) encryption key. If unset, the key derives from
  // DATABASE_URL — so changing the DB password rotates the PII key too. Pin this
  // to a stable value before rotating DB creds to keep existing data decryptable.
  PII_ENCRYPTION_KEY: z.string().trim().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  WEB_BASE_URL: z.string().trim().url().default('https://kaffepos.my.id'),
  API_BASE_URL: z.string().trim().url().default('https://api.kaffepos.my.id'),
  CLOUDFLARE_ACCOUNT_ID: z.string().trim().optional(),
  CLOUDFLARE_R2_BUCKET: z.string().trim().optional(),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().trim().url().optional(),
  CLOUDFLARE_IMAGES_ACCOUNT_HASH: z.string().trim().optional(),
  CLOUDFLARE_IMAGES_DELIVERY_URL: z.string().trim().url().optional(),
  RESEND_API_KEY: z.string().trim().optional(),
  RESEND_FROM_EMAIL: z.string().trim().optional(),
  PAYMENT_GATEWAY_PROVIDER: z.enum(['duitku', 'midtrans', 'doku', 'disabled']).default('midtrans'),
  PAYMENT_INTEGRATION_ENABLED: z.union([z.literal('true'), z.literal('false')]).optional().default('true'),
  DUITKU_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  DUITKU_MERCHANT_CODE: z.string().trim().optional(),
  DUITKU_MERCHANT_KEY: z.string().trim().optional(),
  DUITKU_SANDBOX_BASE_URL: z.string().trim().url().default('https://sandbox.duitku.com'),
  DUITKU_PRODUCTION_BASE_URL: z.string().trim().url().default('https://passport.duitku.com'),
  DUITKU_CALLBACK_URL: z.string().trim().url().optional(),
  DUITKU_RETURN_URL: z.string().trim().url().optional(),
  DUITKU_SUCCESS_URL: z.string().trim().url().optional(),
  DUITKU_PENDING_URL: z.string().trim().url().optional(),
  DUITKU_FAILED_URL: z.string().trim().url().optional(),
  DUITKU_EXPIRY_PERIOD_MINUTES: z.coerce.number().int().positive().default(60),
  DUITKU_DEFAULT_PAYMENT_METHOD: z.string().trim().default('VC'),
  // DOKU Checkout (hosted payment page). Base URLs are configurable because DOKU
  // exposes both api-sandbox.doku.com and legacy sandbox hosts per account.
  DOKU_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  DOKU_CLIENT_ID: z.string().trim().optional(),
  DOKU_SECRET_KEY: z.string().trim().optional(),
  DOKU_SANDBOX_BASE_URL: z.string().trim().url().default('https://api-sandbox.doku.com'),
  DOKU_PRODUCTION_BASE_URL: z.string().trim().url().default('https://api.doku.com'),
  DOKU_CHECKOUT_PATH: z.string().trim().default('/checkout/v1/payment'),
  DOKU_STATUS_PATH_PREFIX: z.string().trim().default('/orders/v1/status'),
  DOKU_NOTIFICATION_PATH: z.string().trim().default('/api/webhooks/doku'),
  DOKU_CALLBACK_URL: z.string().trim().url().optional(),
  DOKU_PAYMENT_DUE_MINUTES: z.coerce.number().int().positive().default(60),
  MIDTRANS_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  MIDTRANS_IS_PRODUCTION: z
    .union([z.literal('true'), z.literal('false')])
    .optional(),
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
    .enum(['auto', 'manual', 'disabled', 'midtrans_sandbox', 'midtrans_production', 'duitku_sandbox', 'duitku_production', 'doku_sandbox', 'doku_production'])
    .default('auto'),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  AUTH_VERIFY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  PAYMENT_CREATE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(12),
  AFFILIATE_REFERRAL_ENABLED: z.union([z.literal('true'), z.literal('false')]).optional().default('false'),
  REFERRAL_ENABLED: z.union([z.literal('true'), z.literal('false')]).optional().default('false'),
  AFFILIATE_ENABLED: z.union([z.literal('true'), z.literal('false')]).optional().default('false'),
  ADMIN_COMMISSION_ENABLED: z.union([z.literal('true'), z.literal('false')]).optional().default('false'),
  REFERRAL_COMMISSION_CREATION_ENABLED: z.union([z.literal('true'), z.literal('false')]).optional().default('false'),
  GEMINI_API_KEY: z.string().trim().optional(),
  CORS_ORIGIN: z.string().trim().optional(),
  ADMIN_EMAILS: z.string().trim().optional(),
  STAGING_REPAIR_TOKEN: z.string().trim().optional(),
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
