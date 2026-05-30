#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const ENV_FILES = ['.env.staging.local', 'backend/.env.staging.local'];
const REPORT_PATH = 'docs/engineering/FINAL_STAGING_EXECUTION_REPORT.md';
const STAGING_SMOKE_REPORT = 'docs/engineering/STAGING_SMOKE_REPORT.md';
const PRODUCTION_CHECKLIST = 'docs/engineering/PRODUCTION_READINESS_CHECKLIST.md';
const CHANGELOG = 'docs/product/CHANGELOG_PRODUCT.md';

const qualityCommands = [
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'lint']],
  ['npm', ['run', 'test']],
  ['npm', ['run', 'build']],
  ['npm', ['--prefix', 'backend', 'run', 'check']],
  ['npm', ['run', 'release:verify-config']],
  ['npx', ['-y', 'react-doctor@latest', '--verbose', '--full']],
  ['npx', ['-y', 'react-doctor@0.2.3', '--verbose', '--diff']],
];

const smokeCommands = [
  ['npm', ['run', 'smoke:staging:cashier']],
  ['npm', ['run', 'smoke:staging:offline-sync']],
  ['npm', ['run', 'smoke:staging:stock'], { KAFFEPOS_STOCK_SMOKE_CONFIRM: '1' }],
];

const externalChecks = [
  { name: 'Midtrans sandbox', candidates: ['scripts/smoke-midtrans-staging.mjs', 'scripts/smoke-staging-midtrans.mjs'] },
  { name: 'Resend staging', candidates: ['scripts/smoke-resend-staging.mjs', 'scripts/smoke-staging-resend.mjs'] },
  { name: 'Cloudflare/R2 staging', candidates: ['scripts/smoke-r2-staging.mjs', 'scripts/smoke-staging-r2.mjs'] },
  { name: 'GA4/Clarity staging', candidates: ['scripts/smoke-analytics-staging.mjs', 'scripts/smoke-staging-analytics.mjs'] },
  { name: 'Backup/restore drill', candidates: ['scripts/smoke-backup-restore-staging.mjs', 'scripts/smoke-staging-backup-restore.mjs'] },
];

const runLog = [];
const now = new Date().toISOString();

function run(command, args, options = {}) {
  const label = [command, ...args].join(' ');
  console.log(`RUN ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  runLog.push({ command: label, status: result.status === 0 ? 'PASS' : 'FAIL' });
  return result;
}

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const parsed = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    parsed[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return parsed;
}

function loadStagingEnv() {
  return Object.assign({}, ...ENV_FILES.map(parseEnvFile));
}

function gitCheck() {
  const results = [];
  for (const file of ENV_FILES) {
    const ignored = spawnSync('git', ['check-ignore', '-q', file], { cwd: process.cwd() }).status === 0;
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', file], { cwd: process.cwd(), stdio: 'ignore' }).status === 0;
    results.push({ file, ignored, tracked });
  }
  runLog.push({ command: 'git env safety check', status: results.every((item) => item.ignored && !item.tracked) ? 'PASS' : 'FAIL' });
  return results;
}

function parseVerifierOutput(text) {
  const failed = text.match(/Staging env verification failed: missing=(\d+), placeholders=(\d+), forbiddenFrontend=(\d+), invalid=(\d+)/);
  const profile = text.match(/Staging profile:\s*(\w+)/)?.[1] || 'full';
  const placeholderBlock = text.match(/Placeholder values detected:\n([\s\S]*?)(?:\n\n|$)/);
  const skippedBlock = text.match(/Optional provider keys skipped in minimal staging:\n([\s\S]*?)(?:\n\n|$)/);
  const invalidBlock = text.match(/Invalid staging values:\n([\s\S]*?)(?:\n\n|$)/);
  const forbiddenBlock = text.match(/Forbidden frontend env keys detected:\n([\s\S]*?)(?:\n\n|$)/);
  const toKeys = (block) => (block ? block[1].split('\n').map((line) => line.replace(/^-\s*/, '').trim()).filter(Boolean).filter((line) => line !== 'none') : []);
  return {
    passed: /Staging env verification passed\./.test(text),
    missing: failed ? Number(failed[1]) : 0,
    placeholders: failed ? Number(failed[2]) : 0,
    forbiddenFrontend: failed ? Number(failed[3]) : 0,
    invalid: failed ? Number(failed[4]) : 0,
    profile,
    placeholderKeys: toKeys(placeholderBlock),
    skippedKeys: toKeys(skippedBlock),
    invalidItems: toKeys(invalidBlock),
    forbiddenFrontendKeys: toKeys(forbiddenBlock),
  };
}

function verifyStagingEnv() {
  const result = run('npm', ['run', 'verify:staging-env', '--', '--env-file=.env.staging.local', '--env-file=backend/.env.staging.local']);
  const parsed = parseVerifierOutput(`${result.stdout || ''}\n${result.stderr || ''}`);
  runLog[runLog.length - 1].status = parsed.passed ? 'PASS' : 'FAIL';
  return parsed;
}

function replaceSection(file, marker, content) {
  const start = `<!-- ${marker}:START -->`;
  const end = `<!-- ${marker}:END -->`;
  const block = `${start}\n${content.trim()}\n${end}`;
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.includes(start) && current.includes(end)) {
    const pattern = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    fs.writeFileSync(file, `${current.replace(pattern, block).trim()}\n`);
    return;
  }
  fs.writeFileSync(file, `${current.trim()}\n\n${block}\n`.trimStart());
}

function writeReport(status, details) {
  const commands = runLog.map((entry) => `- \`${entry.command}\`: ${entry.status}`).join('\n') || '- none';
  const placeholders = (details.verifier?.placeholderKeys || []).map((key) => `- \`${key}\``).join('\n') || '- none';
  const manualChecks = (details.manualChecks || []).map((item) => `- ${item}`).join('\n') || '- none';
  const envSafety = (details.envSafety || []).map((item) => `- \`${item.file}\`: ${item.ignored ? 'ignored' : 'not ignored'}, ${item.tracked ? 'tracked' : 'untracked'}`).join('\n') || '- not checked';
  const skippedKeys = (details.verifier?.skippedKeys || []).map((key) => `- \`${key}\``).join('\n') || '- none';

  const report = `# KaffePOS Final Staging Execution Report

Generated: ${now}

## Status
${status}

## Env File Safety
${envSafety}

## Verifier Result
- profile: ${details.verifier?.profile ?? 'not run'}
- missing: ${details.verifier?.missing ?? 'not run'}
- placeholders: ${details.verifier?.placeholders ?? 'not run'}
- forbidden frontend secrets: ${details.verifier?.forbiddenFrontend ?? 'not run'}
- invalid: ${details.verifier?.invalid ?? 'not run'}

## Commands Run
${commands}

## Remaining Placeholder Keys
${placeholders}

## Manual Checks Required
${manualChecks}

## Provider Keys Skipped
${skippedKeys}

## Current Blocker
${details.blocker || 'none'}

## Final Recommendation
${details.recommendation}
`;
  fs.writeFileSync(REPORT_PATH, report);

  const summary = `## Final Staging Execution Update

Generated: ${now}

Status: ${status}.

Verifier summary: profile ${details.verifier?.profile ?? 'not run'}, missing ${details.verifier?.missing ?? 'not run'}, placeholders ${details.verifier?.placeholders ?? 'not run'}, forbidden frontend secrets ${details.verifier?.forbiddenFrontend ?? 'not run'}, invalid ${details.verifier?.invalid ?? 'not run'}.

Current blocker: ${details.blocker || 'none'}.

See \`${REPORT_PATH}\` for latest command results.`;
  replaceSection(STAGING_SMOKE_REPORT, 'FINAL_STAGING_EXECUTION', summary);
  replaceSection(PRODUCTION_CHECKLIST, 'FINAL_STAGING_EXECUTION', summary);

  const changelogEntry = `## 2026-05-25 Final Staging Runner

### Added
- Added \`npm run staging:final\` release runner for env safety, staging env verification, quality gate, health checks, smoke commands, external-check discovery, and docs reporting.

### Docs
- Updated final staging execution report, staging smoke report, and production readiness checklist with latest runner status.

### Status
- ${status}: ${details.blocker || 'no blocker'}.`;
  replaceSection(CHANGELOG, 'FINAL_STAGING_RUNNER', changelogEntry);
}

async function checkHealth(env) {
  const checks = [];
  const targets = [
    ['frontend', env.KAFFEPOS_STAGING_FRONTEND_URL],
    ['api_health', env.KAFFEPOS_STAGING_API_URL ? `${env.KAFFEPOS_STAGING_API_URL.replace(/\/+$/, '')}/health` : ''],
    ['api_db_health', env.KAFFEPOS_STAGING_API_URL ? `${env.KAFFEPOS_STAGING_API_URL.replace(/\/+$/, '')}/health/db` : ''],
  ];
  for (const [name, url] of targets) {
    if (!url) {
      checks.push(`${name}: missing url`);
      runLog.push({ command: `health ${name}`, status: 'FAIL' });
      continue;
    }
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const ok = response.status >= 200 && response.status < 400;
      checks.push(`${name}: ${ok ? 'PASS' : `FAIL status ${response.status}`}`);
      runLog.push({ command: `health ${name}`, status: ok ? 'PASS' : 'FAIL' });
    } catch (error) {
      checks.push(`${name}: FAIL ${error instanceof Error ? error.message : String(error)}`);
      runLog.push({ command: `health ${name}`, status: 'FAIL' });
    }
  }
  return checks;
}

function runExternalChecks() {
  const manual = [];
  for (const check of externalChecks) {
    const script = check.candidates.find((candidate) => fs.existsSync(candidate));
    if (!script) {
      manual.push(`${check.name}: MANUAL_CHECK_REQUIRED`);
      runLog.push({ command: `${check.name} external check discovery`, status: 'MANUAL_CHECK_REQUIRED' });
      continue;
    }
    const result = run('node', [script]);
    if (result.status !== 0) manual.push(`${check.name}: script failed`);
  }
  return manual;
}

async function main() {
  let status = 'UNKNOWN';
  const envSafety = gitCheck();
  if (!envSafety.every((item) => item.ignored && !item.tracked)) {
    status = 'BLOCKED_BY_ENV_FILE_GIT_SAFETY';
    writeReport(status, { envSafety, blocker: status, recommendation: 'Fix git ignore/tracking for local staging env files before continuing.' });
    console.log(status);
    process.exit(2);
  }

  const verifier = verifyStagingEnv();
  if (!verifier.passed) {
    status = 'BLOCKED_BY_STAGING_SECRETS';
    writeReport(status, {
      envSafety,
      verifier,
      blocker: status,
      recommendation: 'Fill real staging values from secure sources, then rerun npm run staging:final.',
    });
    console.log(JSON.stringify({ status, verifier }, null, 2));
    process.exit(2);
  }

  for (const [command, args, extraEnv] of qualityCommands) {
    const result = run(command, args, extraEnv ? { env: extraEnv } : {});
    if (result.status !== 0) {
      status = 'BLOCKED_BY_QUALITY_GATE';
      writeReport(status, { envSafety, verifier, blocker: `${command} ${args.join(' ')}`, recommendation: 'Fix quality gate failure before staging smoke.' });
      console.log(status);
      process.exit(2);
    }
  }

  const health = await checkHealth(loadStagingEnv());
  if (health.some((item) => item.includes('FAIL') || item.includes('missing'))) {
    status = 'BLOCKED_BY_STAGING_HEALTH';
    writeReport(status, { envSafety, verifier, manualChecks: health, blocker: status, recommendation: 'Fix staging frontend/API/DB health before smoke.' });
    console.log(status);
    process.exit(2);
  }

  for (const [command, args, extraEnv] of smokeCommands) {
    const result = run(command, args, extraEnv ? { env: extraEnv } : {});
    if (result.status !== 0) {
      status = 'BLOCKED_BY_STAGING_SMOKE';
      writeReport(status, { envSafety, verifier, blocker: `${command} ${args.join(' ')}`, recommendation: 'Fix staging smoke failure before production candidate.' });
      console.log(status);
      process.exit(2);
    }
  }

  if (verifier.profile === 'minimal') {
    const manualChecks = (verifier.skippedKeys || []).map((key) => `${key}: SKIPPED_BY_MINIMAL_STAGING`);
    status = 'READY_FOR_MINIMAL_STAGING';
    writeReport(status, { envSafety, verifier, manualChecks, blocker: 'FULL_STAGING_REQUIRED_FOR_PRODUCTION_CANDIDATE', recommendation: 'Minimal staging can validate core app only. Run full staging before production candidate.' });
    console.log(status);
    return;
  }

  const manualChecks = runExternalChecks();
  status = manualChecks.length > 0 ? 'MANUAL_CHECK_REQUIRED' : 'READY_FOR_PRODUCTION_CANDIDATE_REVIEW';
  writeReport(status, { envSafety, verifier, manualChecks, blocker: manualChecks.length > 0 ? 'External checks require manual verification.' : 'none', recommendation: manualChecks.length > 0 ? 'Complete manual external service checks.' : 'Proceed to production candidate review.' });
  console.log(status);
}

main().catch((error) => {
  const status = 'STAGING_FINAL_RUNNER_ERROR';
  writeReport(status, { blocker: error instanceof Error ? error.message : String(error), recommendation: 'Fix runner error and rerun.' });
  console.error(status);
  process.exit(1);
});
