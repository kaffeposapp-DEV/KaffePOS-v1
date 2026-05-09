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
});
