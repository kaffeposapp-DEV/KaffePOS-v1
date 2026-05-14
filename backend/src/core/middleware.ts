/**
 * Authentication middleware + RBAC + rate limiting.
 * Extracted from monolith index.ts — exact same logic.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env, adminEmails } from './env';
import { pool } from './db';
import { ApiError, log, serializeError } from './errors';
import { writeAuditLog } from '../lib/auditLog';
import {
  getPermissionsForRole,
  hasPermission,
  normalizeUserRole,
  type Permission,
  type UserRole,
} from '../lib/accessControl';
import { canCashierLogin, normalizeCashierStatus } from '../lib/cashierManagement';

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  email_verified_at?: string | null;
  created_at?: string | null;
  role: UserRole;
  permissions: Permission[];
  account_status?: string | null;
};

export type AuthenticatedSession = {
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

export function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function isAdminUser(user: AuthenticatedUser | undefined) {
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;
  return adminEmails.has(email);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
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

function isAdminMfaExemptPath(path: string) {
  return path.startsWith('/api/admin/mfa/');
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isAdminUser(req.authUser)) {
      await writeAuditLog({
        userId: req.authUser?.id ?? null,
        action: 'admin.access_denied',
        ip: req.ip,
        details: { method: req.method, path: req.originalUrl },
      });
      next(new ApiError(403, 'Akses admin ditolak.'));
      return;
    }

    if (!isAdminMfaExemptPath(req.path)) {
      const mfaResult = await pool.query(
        'select enabled_at from public.admin_mfa_settings where user_id = $1 limit 1',
        [req.authUser!.id],
      ).catch((error) => {
        log('warn', 'admin.mfa_check_failed', { error: serializeError(error), userId: req.authUser?.id ?? null });
        return { rows: [] };
      });

      if (!mfaResult.rows[0]?.enabled_at) {
        await writeAuditLog({
          userId: req.authUser!.id,
          action: 'admin.mfa_required',
          ip: req.ip,
          details: { method: req.method, path: req.originalUrl },
        });
        next(new ApiError(403, 'Admin MFA wajib diaktifkan.'));
        return;
      }
    }

    res.on('finish', () => {
      if (res.statusCode < 400) {
        void writeAuditLog({
          userId: req.authUser?.id ?? null,
          action: `admin.${req.method.toLowerCase()}.${req.path}`,
          ip: req.ip,
          details: { method: req.method, path: req.originalUrl, params: req.params, statusCode: res.statusCode },
        });
      }
    });

    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission: Permission): RequestHandler {
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

// ── Rate Limiting ──────────────────────────────────────────────

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

export const paymentCreateRateLimiter = createRateLimiter({
  name: 'payment-create',
  max: env.PAYMENT_CREATE_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  key: (req) => `${req.authUser?.id ?? getRateLimitIp(req)}:${getRateLimitIp(req)}`,
  message: 'Terlalu banyak percobaan membuat pembayaran. Tunggu sebentar lalu coba lagi.',
});

// Cleanup expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, Math.min(env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000)).unref();
