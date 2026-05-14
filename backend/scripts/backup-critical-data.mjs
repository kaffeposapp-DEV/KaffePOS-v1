#!/usr/bin/env node

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { buildPoolConfig } from './db-config.mjs';

const { Pool } = pg;

const criticalTables = [
  'profiles',
  'stores',
  'cashier_outlet_assignments',
  'menu_items',
  'transactions',
  'inventory',
  'inventory_adjustments',
  'transaction_inventory_audit',
  'loyalty_customers',
  'loyalty_stamps',
  'loyalty_stamp_events',
  'loyalty_redemptions',
  'challenges',
  'user_challenge_progress',
  'payment_orders',
];

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = $1
      limit 1
    `,
    [tableName],
  );
  return Boolean(result.rows[0]);
}

async function main() {
  const pool = new Pool(buildPoolConfig());
  const client = await pool.connect();
  const backupId = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(process.cwd(), 'backups', `critical-${backupId}`);
  const manifest = {
    backupId,
    createdAt: new Date().toISOString(),
    database: process.env.DATABASE_URL ? 'DATABASE_URL' : process.env.DB_NAME || 'kaffepos_production',
    tables: [],
  };

  try {
    await mkdir(backupDir, { recursive: true });

    for (const tableName of criticalTables) {
      if (!(await tableExists(client, tableName))) {
        manifest.tables.push({ table: tableName, status: 'missing', rows: 0, file: null });
        continue;
      }

      const tableSql = `${quoteIdent('public')}.${quoteIdent(tableName)}`;
      const result = await client.query(`select to_jsonb(t) as row from ${tableSql} t`);
      const file = `${tableName}.json`;
      await writeFile(
        join(backupDir, file),
        JSON.stringify(result.rows.map((item) => item.row), null, 2),
        'utf8',
      );
      manifest.tables.push({ table: tableName, status: 'backed_up', rows: result.rowCount, file });
    }

    await writeFile(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`Critical data backup completed: ${backupDir}`);
  } catch (error) {
    console.error('Critical data backup failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Critical data backup crashed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
