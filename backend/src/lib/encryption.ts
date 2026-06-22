import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../core/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT = 'kaffepos-pii-encryption-v1';

function getEncryptionKey(): Buffer {
  const secret = env.PII_ENCRYPTION_KEY || env.DATABASE_URL || 'development-only-key';
  return scryptSync(secret, SALT, 32);
}

export function encryptPii(plaintext: string): string {
  if (!plaintext) return plaintext;

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptPii(encryptedData: string): string {
  if (!encryptedData) return encryptedData;

  try {
    const data = Buffer.from(encryptedData, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    
    const key = getEncryptionKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    // Return original if not encrypted (backward compatibility)
    return encryptedData;
  }
}

export function maskPii(value: string | null | undefined, visibleChars = 4): string | null {
  if (!value) return null;
  if (value.length <= visibleChars) return '*'.repeat(value.length);
  return '*'.repeat(Math.max(0, value.length - visibleChars)) + value.slice(-visibleChars);
}

export function hashPii(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const encryptBankAccountNumber = encryptPii;
export const decryptBankAccountNumber = decryptPii;
export const encryptPayoutDetails = encryptPii;
export const decryptPayoutDetails = decryptPii;
