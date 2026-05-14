#!/usr/bin/env node

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildPoolConfig } from './db-config.mjs';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      name text not null,
      checksum text,
      applied_at timestamptz not null default now()
    )
  `);
  await client.query('alter table public.schema_migrations add column if not exists checksum text');
}

function checksumSql(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

async function main() {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  const pool = new Pool(buildPoolConfig());
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await ensureMigrationTable(client);

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      const checksum = checksumSql(sql);
      const applied = await client.query(
        'select version, checksum from public.schema_migrations where version = $1 limit 1',
        [version],
      );

      if (applied.rows[0]) {
        const existingChecksum = applied.rows[0].checksum;
        if (existingChecksum && existingChecksum !== checksum) {
          throw new Error(`Checksum mismatch for applied migration ${version}. Create a new migration instead of editing applied SQL.`);
        }
        console.log(`Skipping ${version}, already applied.`);
        continue;
      }

      console.log(`Applying ${version}...`);
      await client.query(sql);
      await client.query(
        'insert into public.schema_migrations (version, name, checksum) values ($1, $2, $3)',
        [version, file, checksum],
      );
    }

    await client.query('COMMIT');
    console.log('Database migrations completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database migrations failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration runner crashed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
