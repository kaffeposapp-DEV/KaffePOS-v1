import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(join(process.cwd(), 'backend/src/routes/loyalty.ts'), 'utf8');
const bootstrapSource = readFileSync(join(process.cwd(), 'backend/src/index.ts'), 'utf8');

describe('Kopi Passport loyalty contract', () => {
  it('exposes the requested public loyalty endpoints', () => {
    expect(routeSource).toContain("router.get('/api/loyalty/customers'");
    expect(routeSource).toContain("router.post('/api/loyalty/stamp'");
    expect(routeSource).toContain("router.post('/api/loyalty/redeem'");
    expect(routeSource).toContain("router.get('/api/loyalty/settings'");
    expect(routeSource).toContain("router.put('/api/loyalty/settings'");
  });

  it('bootstraps the requested loyalty tables', () => {
    expect(bootstrapSource).toContain('create table if not exists public.loyalty_customers');
    expect(bootstrapSource).toContain('create table if not exists public.loyalty_stamps');
    expect(bootstrapSource).toContain('create table if not exists public.loyalty_rewards');
    expect(bootstrapSource).toContain('create table if not exists public.loyalty_tiers');
  });
});
