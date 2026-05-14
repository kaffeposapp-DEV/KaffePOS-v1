import { createHash } from 'node:crypto';
import { encryptBankAccountNumber } from '../lib/encryption';

function normalize(value: string) {
  return value.trim();
}

export class FraudGuardService {
  static hashIp(ip: string | null | undefined) {
    const value = normalize(ip ?? '');
    if (!value) return null;
    return createHash('sha256').update(value).digest('hex');
  }

  static maskEmail(email: string | null | undefined) {
    const value = normalize(email ?? '').toLowerCase();
    if (!value || !value.includes('@')) return null;
    const [name, domain] = value.split('@');
    const head = name.slice(0, 2);
    return `${head}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
  }

  static maskName(name: string | null | undefined) {
    const value = normalize(name ?? '');
    if (!value) return null;
    return value.length <= 2 ? `${value[0] ?? '*'}*` : `${value.slice(0, 2)}${'*'.repeat(Math.min(6, value.length - 2))}`;
  }

  static maskAccountNumber(accountNumber: string | null | undefined) {
    const digits = normalize(accountNumber ?? '').replace(/\D/g, '');
    if (!digits) return null;
    return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
  }

  static protectPayoutAccountNumber(accountNumber: string) {
    return encryptBankAccountNumber(normalize(accountNumber));
  }
}
