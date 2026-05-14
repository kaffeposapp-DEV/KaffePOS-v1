/**
 * Centralized rate limiter configurations for all endpoints.
 * Extracted from index.ts for better organization.
 */
import type { Request, RequestHandler } from 'express';
import { env } from '../core/env';

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

export function getRateLimitIp(req: Request) {
  return req.ip || req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${options.name}:${options.key(req)}`;
    const entry = rateLimitStore.get(key);

    // Cleanup expired entries periodically
    if (Math.random() < 0.01) {
      for (const [k, v] of rateLimitStore.entries()) {
        if (v.resetAt < now) {
          rateLimitStore.delete(k);
        }
      }
    }

    if (!entry || entry.resetAt < now) {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      next();
      return;
    }

    if (entry.count >= options.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: options.message,
        },
      });
      return;
    }

    entry.count += 1;
    next();
  };
}

// Auth rate limit key generators
function authEmailRateKey(req: Request) {
  const email = normalizeRateLimitPart(
    (req.body as Record<string, unknown> | undefined)?.email,
  );
  const ip = getRateLimitIp(req);
  return `${email}:${ip}`;
}

// Rate limiters for authentication
export const authLoginRateLimiter = createRateLimiter({
  name: 'auth-login',
  max: env.AUTH_LOGIN_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  key: authEmailRateKey,
  message: 'Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.',
});

export const authEmailRateLimiter = createRateLimiter({
  name: 'auth-email',
  max: env.AUTH_EMAIL_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  key: authEmailRateKey,
  message: 'Terlalu banyak permintaan email. Tunggu sebentar sebelum mencoba lagi.',
});

export const authVerifyRateLimiter = createRateLimiter({
  name: 'auth-verify',
  max: env.AUTH_VERIFY_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  key: authEmailRateKey,
  message: 'Terlalu banyak percobaan verifikasi. Tunggu sebentar lalu coba lagi.',
});

// Rate limiter for payment creation
export const paymentCreateRateLimiter = createRateLimiter({
  name: 'payment-create',
  max: env.PAYMENT_CREATE_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  key: (req) => `${req.authUser?.id ?? getRateLimitIp(req)}:${getRateLimitIp(req)}`,
  message: 'Terlalu banyak permintaan pembayaran. Tunggu sebentar lalu coba lagi.',
});

// Rate limiter for public referral tracking
export const publicReferralRateLimiter = createRateLimiter({
  name: 'public-referral',
  max: 120,
  windowMs: 15 * 60 * 1000,
  key: (req) => getRateLimitIp(req),
  message: 'Terlalu banyak request referral. Coba lagi nanti.',
});

// Rate limiter for admin routes
export const adminRateLimiter = createRateLimiter({
  name: 'admin',
  max: 1000,
  windowMs: 60 * 60 * 1000, // 1 hour
  key: (req) => req.authUser?.id ?? getRateLimitIp(req),
  message: 'Terlalu banyak permintaan admin. Tunggu sebentar lalu coba lagi.',
});

// Rate limiter for affiliate application
export const affiliateApplyRateLimiter = createRateLimiter({
  name: 'affiliate-apply',
  max: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
  key: (req) => `${req.authUser?.id ?? getRateLimitIp(req)}:${getRateLimitIp(req)}`,
  message: 'Terlalu banyak percobaan aplikasi affiliate. Tunggu sebentar lalu coba lagi.',
});

// Rate limiter for affiliate payout update
export const affiliatePayoutRateLimiter = createRateLimiter({
  name: 'affiliate-payout',
  max: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  key: (req) => req.authUser?.id ?? getRateLimitIp(req),
  message: 'Terlalu banyak update payout. Tunggu sebentar lalu coba lagi.',
});

// Rate limiter for commission admin actions
export const commissionActionRateLimiter = createRateLimiter({
  name: 'commission-action',
  max: 100,
  windowMs: 15 * 60 * 1000, // 15 minutes
  key: (req) => req.authUser?.id ?? getRateLimitIp(req),
  message: 'Terlalu banyak aksi commission. Tunggu sebentar lalu coba lagi.',
});
