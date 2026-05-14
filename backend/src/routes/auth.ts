/**
 * Auth routes — register, login, verification, password reset, session, logout.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  pool,
  withTransaction,
  ApiError,
  authenticate,
  hashToken,
  authLoginRateLimiter,
  authEmailRateLimiter,
  authVerifyRateLimiter,
  requirePermission,
  normalizeEmail,
  ensureProfile,
  insertNotification,
  log,
  serializeError,
  resolveUniqueUsername,
  addMinutes,
  profileColumns,
  serializeProfileWithAssignment,
  getCashierAssignment,
  syncProfileSubscriptionState,
  activateSecangkirTrial,
  pickDefined,
  buildUpdateClause,
  env,
} from '../core';
import { createOpaqueToken } from '../core/middleware';
import { createSession, revokeUserSessions } from '../core/session';
import {
  createEmailCode,
  getResetLink,
  sendSignupOtpEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendEmail,
  buildEmailTemplate,
} from '../core/email';
import { handleReferralRegistration } from '../lib/affiliateWebhookHelper';
import { writeAuditLog } from '../lib/auditLog';
import {
  getPermissionsForRole,
  normalizeUserRole,
} from '../lib/accessControl';
import {
  canCashierLogin,
  normalizeCashierStatus,
} from '../lib/cashierManagement';

const router = Router();

// ── Schemas ────────────────────────────────────────────────────

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


async function ensureAccountLockoutTable(client = pool) {
  await client.query(`
    create table if not exists public.auth_account_lockouts (
      email text primary key,
      user_id uuid,
      failed_attempts integer not null default 0,
      locked_until timestamptz,
      last_failed_at timestamptz,
      notified_at timestamptz
    )
  `);
}

async function sendAccountLockoutEmail(email: string, lockedUntil: Date) {
  const subject = 'Akun KaffePOS terkunci sementara';
  const text = `Akun kamu terkunci sampai ${lockedUntil.toISOString()} karena 5 percobaan login gagal.`;
  const html = buildEmailTemplate(subject, 'Akun terkunci sementara.', `
    <p style="margin:0 0 12px;color:#334155;">Akun kamu terkunci sementara karena 5 percobaan login gagal.</p>
    <p style="margin:0;color:#334155;">Coba lagi setelah <strong>${lockedUntil.toISOString()}</strong>. Jika ini bukan kamu, segera ganti password.</p>
  `);
  await sendEmail({ to: email, subject, text, html });
}

async function assertLoginNotLocked(email: string) {
  await ensureAccountLockoutTable();
  const result = await pool.query(
    'select locked_until from public.auth_account_lockouts where email = $1 and locked_until > now() limit 1',
    [email],
  );
  if (result.rows[0]?.locked_until) {
    throw new ApiError(423, 'Akun terkunci sementara. Coba lagi dalam 15 menit.');
  }
}

async function recordFailedLogin(email: string, userId: string | null, req: Request) {
  await ensureAccountLockoutTable();
  const result = await pool.query(
    `
      insert into public.auth_account_lockouts (email, user_id, failed_attempts, last_failed_at)
      values ($1, $2, 1, now())
      on conflict (email) do update set
        user_id = coalesce(public.auth_account_lockouts.user_id, excluded.user_id),
        failed_attempts = case
          when public.auth_account_lockouts.locked_until is not null and public.auth_account_lockouts.locked_until > now() then public.auth_account_lockouts.failed_attempts
          when public.auth_account_lockouts.last_failed_at < now() - interval '15 minutes' then 1
          else public.auth_account_lockouts.failed_attempts + 1
        end,
        last_failed_at = now(),
        locked_until = case
          when public.auth_account_lockouts.locked_until is not null and public.auth_account_lockouts.locked_until > now() then public.auth_account_lockouts.locked_until
          when public.auth_account_lockouts.last_failed_at >= now() - interval '15 minutes' and public.auth_account_lockouts.failed_attempts + 1 >= 5 then now() + interval '15 minutes'
          else null
        end,
        notified_at = case
          when public.auth_account_lockouts.last_failed_at >= now() - interval '15 minutes' and public.auth_account_lockouts.failed_attempts + 1 >= 5 then public.auth_account_lockouts.notified_at
          else null
        end
      returning failed_attempts, locked_until, notified_at
    `,
    [email, userId],
  );

  await writeAuditLog({ userId, action: 'auth.failed_login', ip: req.ip, details: { email, failedAttempts: result.rows[0]?.failed_attempts ?? 1 } });

  const lockedUntil = result.rows[0]?.locked_until ? new Date(result.rows[0].locked_until) : null;
  if (lockedUntil && !result.rows[0]?.notified_at) {
    await pool.query('update public.auth_account_lockouts set notified_at = now() where email = $1', [email]);
    await writeAuditLog({ userId, action: 'auth.account_lockout', ip: req.ip, details: { email, lockedUntil: lockedUntil.toISOString() } });
    await sendAccountLockoutEmail(email, lockedUntil).catch((error) => {
      log('warn', 'auth.lockout_email_failed', { email, error: serializeError(error) });
    });
  }
}

async function clearFailedLogin(email: string) {
  await ensureAccountLockoutTable();
  await pool.query('delete from public.auth_account_lockouts where email = $1', [email]);
}

async function insertAuthNotification(
  client: Parameters<typeof insertNotification>[0],
  userId: string,
  title: string,
  message: string,
  type: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await insertNotification(client, userId, title, message, type, metadata);
  } catch (error) {
    log('warn', 'auth.notification_insert_failed', {
      userId,
      title,
      type,
      error: serializeError(error),
    });
  }
}

// ── Public auth routes (no authenticate middleware) ────────────

router.post('/api/auth/register', authEmailRateLimiter, async (req, res, next) => {
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

      let createdStoreId: string | null = null;

      if (!existingCredential.rows[0]) {
        await client.query(
          `
            insert into public.profiles (id, username, display_name, email, role, account_status)
            values ($1, $2, $3, $4, 'owner_admin', 'active')
          `,
          [userId, resolvedUsername, displayName, email],
        );

        const storeResult = await client.query(
          `
            insert into public.stores (owner_id, store_name)
            values ($1, $2)
            returning id
          `,
          [userId, `Kedai ${displayName}`],
        );
        createdStoreId = (storeResult.rows[0]?.id as string | null) ?? null;
      } else {
        await client.query(
          `
            update public.profiles
            set username = coalesce(username, $2),
                display_name = coalesce(display_name, $3),
                email = $4,
                role = coalesce(role, 'owner_admin'),
                account_status = coalesce(account_status, 'active'),
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

      if (!existingCredential.rows[0]) {
        await activateSecangkirTrial(client, {
          userId,
          storeId: createdStoreId,
        });
      }

      const code = await createEmailCode(client, email, 'signup');
      const profileResult = await client.query(
        `select display_name from public.profiles where id = $1 limit 1`,
        [userId],
      );

      return {
        userId,
        email,
        code: code.code,
        storeName: (profileResult.rows[0]?.display_name as string | null) ?? displayName,
      };
    });

    await sendSignupOtpEmail(result.email, result.code, result.storeName);

    // Track referral registration if referral code exists
    const referralCode = req.cookies?.kpos_ref || req.query?.ref as string;
    if (referralCode) {
      await handleReferralRegistration(pool, result.userId, referralCode);
    }

    res.status(201).json({
      success: true,
      needsVerification: true,
      message: 'Akun berhasil dibuat. Cek email untuk kode verifikasi.',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/auth/verification/resend', authEmailRateLimiter, async (req, res, next) => {
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

router.post('/api/auth/verification/confirm', authVerifyRateLimiter, async (req, res, next) => {
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

      await insertAuthNotification(
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

router.post('/api/auth/login', authLoginRateLimiter, async (req, res, next) => {
  try {
    const payload = authLoginSchema.parse(req.body);
    const email = normalizeEmail(payload.email);

    await assertLoginNotLocked(email);

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
            p.role,
            p.account_status,
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
      if (!credential) {
        throw new ApiError(401, 'Email atau password salah.');
      }

      if (!credential?.password_hash) {
        throw new ApiError(401, 'Akun belum punya password aktif. Gunakan menu lupa password.');
      }

      const passwordOk = await bcrypt.compare(payload.password, credential.password_hash as string);
      if (!passwordOk) {
        await recordFailedLogin(email, credential.user_id as string, req);
        throw new ApiError(401, 'Email atau password salah.');
      }

      if (!credential.email_verified_at) {
        throw new ApiError(403, 'email_not_confirmed');
      }

      await clearFailedLogin(email);
      await revokeUserSessions(client, credential.user_id as string);
      const session = await createSession(client, {
        id: credential.user_id as string,
      }, req);

      await client.query(
        `
          update public.app_auth_credentials
          set last_login_at = now(), updated_at = now()
          where user_id = $1
        `,
        [credential.user_id],
      );

      await insertAuthNotification(
        client,
        credential.user_id as string,
        'Login berhasil',
        'Sesi baru KaffePOS berhasil dibuat di perangkat kamu.',
        'info',
        { ip: req.ip },
      );

      await syncProfileSubscriptionState(client, credential.user_id as string);
      const refreshedProfileResult = await client.query(
        `
          select
            username,
            display_name,
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
          from public.profiles
          where id = $1
          limit 1
        `,
        [credential.user_id],
      );
      const profileState = refreshedProfileResult.rows[0] ?? credential;

      const role = normalizeUserRole(profileState.role);
      const accountStatus = normalizeCashierStatus(profileState.account_status);
      if (role === 'cashier' && !canCashierLogin(accountStatus)) {
        throw new ApiError(403, 'Akun kasir nonaktif. Hubungi Owner/Admin.');
      }
      const permissions = getPermissionsForRole(role);
      const assignment = role === 'cashier' ? await getCashierAssignment(client, credential.user_id as string) : {};
      if (role === 'cashier' && (!assignment.assigned_store_id || assignment.assignment_status !== 'active')) {
        throw new ApiError(403, 'Akun kasir belum terhubung ke outlet aktif.');
      }

      return {
        session,
        user: {
          id: credential.user_id as string,
          email: (credential.email as string | null) ?? null,
          email_verified_at: (credential.email_verified_at as string | null) ?? null,
          user_metadata: {
            display_name: profileState.display_name ?? null,
            username: profileState.username ?? null,
            role,
          },
        },
        profile: {
          id: credential.user_id,
          username: profileState.username,
          display_name: profileState.display_name,
          email: credential.email,
          avatar_url: profileState.avatar_url,
          tier: profileState.tier,
          tier_expires_at: profileState.tier_expires_at,
          is_pro: profileState.is_pro,
          pro_plan: profileState.pro_plan,
          pro_order_id: profileState.pro_order_id,
          pro_activated_at: profileState.pro_activated_at,
          pro_expires_at: profileState.pro_expires_at,
          role,
          account_status: accountStatus,
          permissions,
          ...assignment,
          created_at: profileState.created_at,
          updated_at: profileState.updated_at,
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

router.post('/api/auth/password/forgot', authEmailRateLimiter, async (req, res, next) => {
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

router.post('/api/auth/password/reset', authEmailRateLimiter, async (req, res, next) => {
  try {
    const payload = resetPasswordSchema.parse(req.body);
    const email = normalizeEmail(payload.email);
    const passwordHash = await bcrypt.hash(payload.password, 12);

    const resetResult = await withTransaction(async (client) => {
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

      await insertAuthNotification(
        client,
        tokenRow.user_id as string,
        'Password diperbarui',
        'Password akun KaffePOS kamu baru saja diganti.',
        'warning',
      );

      return { userId: tokenRow.user_id as string };
    });

    await writeAuditLog({ userId: resetResult.userId, action: 'auth.password_change', ip: req.ip, details: { email } });

    res.json({
      success: true,
      message: 'Password berhasil diperbarui. Silakan login kembali.',
    });
  } catch (error) {
    next(error);
  }
});

// ── Authenticated auth routes ──────────────────────────────────

router.get('/api/auth/session', authenticate, async (req, res, next) => {
  try {
    const profile = await withTransaction(async (client) => {
      const ensured = await ensureProfile(client, req.authUser!);
      await syncProfileSubscriptionState(client, req.authUser!.id);
      const refreshed = await client.query(`select ${profileColumns} from public.profiles where id = $1 limit 1`, [req.authUser!.id]);
      return serializeProfileWithAssignment(client, refreshed.rows[0] ?? ensured);
    });
    const profileRecord = profile as Record<string, unknown>;
    res.json({
      user: {
        ...req.authUser,
        user_metadata: {
          display_name: profileRecord.display_name ?? null,
          username: profileRecord.username ?? null,
          role: profileRecord.role ?? req.authUser?.role ?? null,
        },
      },
      profile,
      sessionExpiresAt: req.authSession?.expiresAt ?? null,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/auth/logout', authenticate, async (req, res, next) => {
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

// ── Profile routes ─────────────────────────────────────────────

router.get('/api/profile/me', async (req, res, next) => {
  try {
    const profile = await withTransaction(async (client) => {
      const ensured = await ensureProfile(client, req.authUser!);
      await syncProfileSubscriptionState(client, req.authUser!.id);
      const refreshed = await client.query(`select ${profileColumns} from public.profiles where id = $1 limit 1`, [req.authUser!.id]);
      return serializeProfileWithAssignment(client, refreshed.rows[0] ?? ensured);
    });
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.patch('/api/profile/me', requirePermission('can_manage_settings'), async (req, res, next) => {
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

export default router;
