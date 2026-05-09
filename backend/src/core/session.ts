/**
 * Session management — create, revoke, token helpers.
 * Extracted from monolith index.ts — exact same logic.
 */
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { env } from './env';
import { createOpaqueToken, hashToken, type AuthenticatedUser } from './middleware';
import { addDays } from './helpers';

export async function revokeUserSessions(client: PoolClient, userId: string) {
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

export async function createSession(client: PoolClient, user: Pick<AuthenticatedUser, 'id'>, req: Request) {
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
