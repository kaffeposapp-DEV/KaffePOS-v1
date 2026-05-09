#!/usr/bin/env node

import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'kaffepos_production',
    user: process.env.DB_USER || 'kaffepos',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      name text not null,
      checksum text,
      applied_at timestamptz not null default now()
    )
  `);
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
      const applied = await client.query(
        'select version from public.schema_migrations where version = $1 limit 1',
        [version],
      );

      if (applied.rows[0]) {
        console.log(`Skipping ${version}, already applied.`);
        continue;
      }

      const sql = await readFile(join(migrationsDir, file), 'utf8');
      console.log(`Applying ${version}...`);
      await client.query(sql);
      await client.query(
        'insert into public.schema_migrations (version, name) values ($1, $2)',
        [version, file],
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
