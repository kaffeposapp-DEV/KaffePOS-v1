import { createHash, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiError, pool } from '../core';

const ISSUER = 'KaffePOS';
const MFA_WINDOW = 1;

function base32Encode(buffer: Buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  return bits.match(/.{1,5}/g)?.map((chunk) => alphabet[Number.parseInt(chunk.padEnd(5, '0'), 2)]).join('') ?? '';
}

function base32Decode(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = value.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g)?.map((chunk) => Number.parseInt(chunk, 2)) ?? [];
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function getTotpUri(email: string, secret: string) {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function createQrCodeDataUrl(otpauthUrl: string) {
  const escaped = otpauthUrl.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" fill="#fff"/><text x="16" y="32" font-family="monospace" font-size="12" fill="#111">Scan unsupported: enter key manually</text><foreignObject x="16" y="48" width="288" height="240"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:monospace;font-size:10px;word-break:break-all;color:#111">${escaped}</div></foreignObject></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function verifyTotp(secret: string, token: string, now = Date.now()) {
  const clean = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(now / 30_000);
  for (let offset = -MFA_WINDOW; offset <= MFA_WINDOW; offset += 1) {
    if (safeEqual(hotp(secret, counter + offset), clean)) return true;
  }
  return false;
}

export function createBackupCodes() {
  return Array.from({ length: 10 }, () => randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g)!.join('-'));
}

export function hashBackupCode(code: string) {
  return createHash('sha256').update(code.replace(/\s+/g, '').toUpperCase()).digest('hex');
}

export async function ensureMfaTables() {
  await pool.query(`
    create table if not exists public.admin_mfa_settings (
      user_id uuid primary key references public.profiles(id) on delete cascade,
      secret text not null,
      enabled_at timestamptz,
      backup_code_hashes text[] not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

export async function requireAdminMfa(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.authUser?.id) throw new ApiError(401, 'Missing authenticated user.');
    await ensureMfaTables();
    const result = await pool.query('select enabled_at from public.admin_mfa_settings where user_id = $1 limit 1', [req.authUser.id]);
    if (!result.rows[0]?.enabled_at) throw new ApiError(403, 'Admin MFA wajib diaktifkan.');
    next();
  } catch (error) {
    next(error);
  }
}
