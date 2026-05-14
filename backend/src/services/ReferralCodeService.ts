import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ApiError, env } from '../core';

export type ReferralCodeType = 'customer_referral' | 'affiliate';

type Db = Pool | PoolClient;

function buildCode(prefix: string, userId: string) {
  const token = createHash('sha256').update(`${prefix}:${userId}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 7).toUpperCase();
  return `${prefix}${token}`;
}

export class ReferralCodeService {
  constructor(private db: Db) {}

  async findByCode(code: string) {
    const result = await this.db.query(
      `
        select id, user_id, code, type, is_active, created_at, updated_at
        from public.referral_codes
        where code = $1
        limit 1
      `,
      [code.trim().toUpperCase()],
    );
    return result.rows[0] ?? null;
  }

  async findActiveByUser(userId: string, type: ReferralCodeType) {
    const result = await this.db.query(
      `
        select id, user_id, code, type, is_active, created_at, updated_at
        from public.referral_codes
        where user_id = $1 and type = $2 and is_active = true
        limit 1
      `,
      [userId, type],
    );
    return result.rows[0] ?? null;
  }

  async getOrCreateForUser(userId: string, type: ReferralCodeType) {
    const existing = await this.findActiveByUser(userId, type);
    if (existing) return existing;

    const prefix = type === 'affiliate' ? 'AFF' : 'KP';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = buildCode(prefix, userId);
      try {
        const result = await this.db.query(
          `
            insert into public.referral_codes (user_id, code, type)
            values ($1, $2, $3)
            returning id, user_id, code, type, is_active, created_at, updated_at
          `,
          [userId, code, type],
        );
        return result.rows[0];
      } catch (error) {
        if (String((error as { code?: string }).code) !== '23505') throw error;
      }
    }

    throw new ApiError(500, 'Gagal membuat kode referral unik.');
  }

  buildReferralLink(code: string) {
    return `${env.API_BASE_URL.replace(/\/$/, '')}/api/ref/${encodeURIComponent(code)}`;
  }
}
