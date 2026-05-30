#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PAIRS = [
  { source: '.env.staging.example', target: '.env.staging.local' },
  { source: 'backend/.env.staging.example', target: 'backend/.env.staging.local' },
];

const force = process.argv.includes('--force');

function copyTemplate({ source, target }) {
  const sourcePath = path.resolve(process.cwd(), source);
  const targetPath = path.resolve(process.cwd(), target);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing template: ${source}`);
  }

  if (fs.existsSync(targetPath) && !force) {
    console.log(`- ${target}: exists, not overwritten`);
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`- ${target}: ${force ? 'recreated' : 'created'} from ${source}`);
}

function main() {
  console.log('KaffePOS staging env local file init');
  console.log('No secret values are requested or printed by this script.');

  for (const pair of PAIRS) copyTemplate(pair);

  console.log('\nNext steps:');
  console.log('1. Fill .env.staging.local and backend/.env.staging.local manually from secure secret storage.');
  console.log('2. Use staging/sandbox credentials only; never use production keys for staging.');
  console.log('3. Never commit .env.staging.local or backend/.env.staging.local.');
  console.log('4. Run: npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
