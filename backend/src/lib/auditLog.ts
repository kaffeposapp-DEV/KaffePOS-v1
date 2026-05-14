import { createHash } from 'node:crypto';
import { pool } from '../core/db';
import { log, serializeError } from '../core/errors';

type AuditAction =
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.logout'
  | 'auth.password_changed'
  | 'admin.user_updated'
  | 'admin.subscription_updated'
  | 'admin.commission_approved'
  | 'admin.commission_rejected'
  | 'payment.webhook_processed'
  | 'payment.webhook_failed'
  | 'data.exported'
  | 'settings.updated'
  | 'transaction.voided'
  | 'affiliate.approved'
  | 'affiliate.rejected';

type AuditLogInput = {
  userId?: string | null;
  action: AuditAction | string;
  ip?: string | null;
  userAgent?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  success?: boolean;
};

function hashIp(ip?: string | null): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex');
}

function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | null {
  if (!details) return null;
  const sanitized = { ...details };
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization', 'cookie', 'bank_account'];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}


export async function ensureAuditLogTable(): Promise<void> {
  await pool.query(`
    create table if not exists public.audit_logs (
      id bigserial primary key,
      user_id uuid,
      action text not null,
      ip_hash text,
      user_agent text,
      resource_type text,
      resource_id text,
      details jsonb,
      success boolean not null default true,
      created_at timestamptz not null default now()
    )
  `);
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await ensureAuditLogTable();
    await pool.query(
      `
      INSERT INTO audit_logs (
        user_id,
        action,
        ip_hash,
        user_agent,
        resource_type,
        resource_id,
        details,
        success,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `,
      [
        input.userId ?? null,
        input.action,
        hashIp(input.ip),
        input.userAgent?.slice(0, 500) ?? null,
        input.resourceType ?? null,
        input.resourceId ?? null,
        sanitizeDetails(input.details),
        input.success ?? true,
      ],
    );
  } catch (error) {
    // Audit logging must not break business flows
    log('error', 'audit_log.write_failed', {
      action: input.action,
      userId: input.userId,
      error: serializeError(error),
    });
  }
}

export function getRequestAuditContext(req: any) {
  return {
    userId: req.authUser?.id ?? null,
    ip: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: req.header?.('user-agent') ?? null,
  };
}

export const getRequestAuditFields = getRequestAuditContext;
