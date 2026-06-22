import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction, ApiError, authenticate, requireAdmin, log } from '../core';
import {
  createTotpSecret,
  getTotpUri,
  createQrCodeDataUrl,
  verifyTotp,
  createBackupCodes,
  hashBackupCode,
  ensureMfaTables,
} from '../middleware/mfa';
import { writeAuditLog, getRequestAuditFields } from '../lib/auditLog';

const router = Router();

const mfaSetupSchema = z.object({
  token: z.string().trim().length(6),
});

const mfaVerifySchema = z.object({
  token: z.string().trim().min(6),
});

router.get('/api/admin/mfa/status', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await ensureMfaTables();
    const result = await pool.query(
      'select enabled_at, array_length(backup_code_hashes, 1) as backup_codes_remaining from public.admin_mfa_settings where user_id = $1 limit 1',
      [req.authUser!.id],
    );
    res.json({
      enabled: !!result.rows[0]?.enabled_at,
      enabledAt: result.rows[0]?.enabled_at ?? null,
      backupCodesRemaining: result.rows[0]?.backup_codes_remaining ?? 0,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/admin/mfa/setup/start', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await ensureMfaTables();
    const secret = createTotpSecret();
    const email = req.authUser!.email ?? 'admin@kaffepos.app';
    const otpauthUrl = getTotpUri(email, secret);
    const qrCodeDataUrl = createQrCodeDataUrl(otpauthUrl);

    await pool.query(
      `
        insert into public.admin_mfa_settings (user_id, secret)
        values ($1, $2)
        on conflict (user_id) do update set secret = excluded.secret, updated_at = now()
      `,
      [req.authUser!.id, secret],
    );

    log('info', 'admin.mfa_setup_started', { userId: req.authUser!.id, email });

    res.json({
      secret,
      qrCodeDataUrl,
      otpauthUrl,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/admin/mfa/setup/verify', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const payload = mfaSetupSchema.parse(req.body);
    await ensureMfaTables();

    const result = await withTransaction(async (client) => {
      const mfaResult = await client.query(
        'select secret, enabled_at from public.admin_mfa_settings where user_id = $1 limit 1',
        [req.authUser!.id],
      );

      if (!mfaResult.rows[0]) throw new ApiError(400, 'MFA setup belum dimulai.');
      if (mfaResult.rows[0].enabled_at) throw new ApiError(400, 'MFA sudah aktif.');

      const secret = mfaResult.rows[0].secret as string;
      if (!verifyTotp(secret, payload.token)) throw new ApiError(400, 'Kode verifikasi salah.');

      const backupCodes = createBackupCodes();
      const backupCodeHashes = backupCodes.map(hashBackupCode);

      await client.query(
        'update public.admin_mfa_settings set enabled_at = now(), backup_code_hashes = $2, updated_at = now() where user_id = $1',
        [req.authUser!.id, backupCodeHashes],
      );

      return { backupCodes };
    });

    await writeAuditLog({
      ...getRequestAuditFields(req),
      action: 'admin.mfa_enabled',
      details: { email: req.authUser!.email },
    });

    log('info', 'admin.mfa_enabled', { userId: req.authUser!.id, email: req.authUser!.email });

    res.json({
      success: true,
      backupCodes: result.backupCodes,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/admin/mfa/verify', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const payload = mfaVerifySchema.parse(req.body);
    await ensureMfaTables();

    const result = await withTransaction(async (client) => {
      const mfaResult = await client.query(
        'select secret, enabled_at, backup_code_hashes from public.admin_mfa_settings where user_id = $1 limit 1',
        [req.authUser!.id],
      );

      if (!mfaResult.rows[0]?.enabled_at) throw new ApiError(403, 'MFA belum diaktifkan.');

      const secret = mfaResult.rows[0].secret as string;
      const backupCodeHashes = (mfaResult.rows[0].backup_code_hashes as string[]) ?? [];

      if (verifyTotp(secret, payload.token)) return { verified: true, usedBackupCode: false };

      const inputHash = hashBackupCode(payload.token);
      const backupIndex = backupCodeHashes.indexOf(inputHash);
      if (backupIndex >= 0) {
        const updatedHashes = backupCodeHashes.filter((_, i) => i !== backupIndex);
        await client.query(
          'update public.admin_mfa_settings set backup_code_hashes = $2, updated_at = now() where user_id = $1',
          [req.authUser!.id, updatedHashes],
        );
        return { verified: true, usedBackupCode: true, backupCodesRemaining: updatedHashes.length };
      }

      throw new ApiError(401, 'Kode MFA atau backup code salah.');
    });

    await writeAuditLog({
      ...getRequestAuditFields(req),
      action: 'admin.mfa_verified',
      details: { usedBackupCode: result.usedBackupCode },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/api/admin/mfa/disable', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const payload = mfaVerifySchema.parse(req.body);
    await ensureMfaTables();

    await withTransaction(async (client) => {
      const mfaResult = await client.query(
        'select secret, enabled_at from public.admin_mfa_settings where user_id = $1 limit 1',
        [req.authUser!.id],
      );

      if (!mfaResult.rows[0]?.enabled_at) throw new ApiError(400, 'MFA belum aktif.');

      const secret = mfaResult.rows[0].secret as string;
      if (!verifyTotp(secret, payload.token)) throw new ApiError(401, 'Kode verifikasi salah.');

      await client.query('delete from public.admin_mfa_settings where user_id = $1', [req.authUser!.id]);
    });

    await writeAuditLog({
      ...getRequestAuditFields(req),
      action: 'admin.mfa_disabled',
      details: { email: req.authUser!.email },
    });

    log('warn', 'admin.mfa_disabled', { userId: req.authUser!.id, email: req.authUser!.email });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/api/admin/mfa/backup-codes/regenerate', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const payload = mfaVerifySchema.parse(req.body);
    await ensureMfaTables();

    const result = await withTransaction(async (client) => {
      const mfaResult = await client.query(
        'select secret, enabled_at from public.admin_mfa_settings where user_id = $1 limit 1',
        [req.authUser!.id],
      );

      if (!mfaResult.rows[0]?.enabled_at) throw new ApiError(403, 'MFA belum aktif.');

      const secret = mfaResult.rows[0].secret as string;
      if (!verifyTotp(secret, payload.token)) throw new ApiError(401, 'Kode verifikasi salah.');

      const backupCodes = createBackupCodes();
      const backupCodeHashes = backupCodes.map(hashBackupCode);

      await client.query(
        'update public.admin_mfa_settings set backup_code_hashes = $2, updated_at = now() where user_id = $1',
        [req.authUser!.id, backupCodeHashes],
      );

      return { backupCodes };
    });

    await writeAuditLog({
      ...getRequestAuditFields(req),
      action: 'admin.mfa_backup_codes_regenerated',
      details: { email: req.authUser!.email },
    });

    res.json({ backupCodes: result.backupCodes });
  } catch (error) {
    next(error);
  }
});

export default router;
