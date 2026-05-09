import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('release operation scripts', () => {
  it('ships a PostgreSQL backup script that fails closed without DATABASE_URL', () => {
    const script = resolve(process.cwd(), 'scripts/backup-postgres.sh');
    expect(existsSync(script)).toBe(true);

    const source = readFileSync(script, 'utf8');
    expect(source).toContain('DATABASE_URL');
    expect(source).toContain('pg_dump');
    expect(source).toContain('set -euo pipefail');
    expect(source).not.toContain('echo "$DATABASE_URL"');
  });

  it('keeps stock staging smoke coverage for API version alias and stock opname DB sync', () => {
    const script = resolve(process.cwd(), 'scripts/smoke-stock-flow.mjs');
    expect(existsSync(script)).toBe(true);

    const source = readFileSync(script, 'utf8');
    expect(source).toContain("login(ownerEmail, ownerPassword, '/api/v1/auth/login')");
    expect(source).toContain('/api/v1/transactions?storeId=');
    expect(source).toContain("request('/api/inventory/adjustments'");
    expect(source).toContain('counted_stock');
    expect(source).toContain('stock opname adjustment persists through API');
  });

  it('keeps mobile fresh-login smoke aligned with final HTTPS WebView origin', () => {
    const script = resolve(process.cwd(), 'scripts/smoke-mobile-fresh-login.mjs');
    expect(existsSync(script)).toBe(true);

    const source = readFileSync(script, 'utf8');
    expect(source).toContain("KAFFEPOS_LOGIN_ORIGIN || 'https://localhost'");
    expect(source).toContain('KAFFEPOS_LOGIN_EMAIL');
    expect(source).toContain('KAFFEPOS_LOGIN_PASSWORD');
    expect(source).not.toContain('console.log(password)');
  });
});
