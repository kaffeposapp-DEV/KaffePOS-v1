import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('database migration runner readiness', () => {
  it('ships a formal migration runner and initial versioned migration', () => {
    const runner = resolve(process.cwd(), 'backend/scripts/run-migrations.mjs');
    const migration = resolve(process.cwd(), 'backend/migrations/20260430_0001_schema_migrations.sql');

    expect(existsSync(runner)).toBe(true);
    expect(existsSync(migration)).toBe(true);

    const runnerSource = readFileSync(runner, 'utf8');
    expect(runnerSource).toContain('schema_migrations');
    expect(runnerSource).toContain('BEGIN');
    expect(runnerSource).toContain('COMMIT');
    expect(runnerSource).toContain('ROLLBACK');

    const migrationSource = readFileSync(migration, 'utf8');
    expect(migrationSource).toContain('create table if not exists public.schema_migrations');
  });

  it('ships non-destructive Duitku payment provider migration', () => {
    const migration = resolve(process.cwd(), 'backend/migrations/20260530_0001_duitku_payment_provider.sql');
    expect(existsSync(migration)).toBe(true);

    const migrationSource = readFileSync(migration, 'utf8').toLowerCase();
    expect(migrationSource).toContain('add column if not exists provider');
    expect(migrationSource).toContain('create table if not exists public.payment_events');
    expect(migrationSource).toContain('payment_orders_merchant_order_id_key');
    expect(migrationSource).not.toContain('drop table');
    expect(migrationSource).not.toContain('drop column');
  });
});
