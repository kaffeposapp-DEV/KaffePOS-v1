# KaffePOS Staging Smoke Report

Date: 2026-05-25
Timezone: Asia/Jakarta

## Summary

Status: NOT READY for production candidate because live staging credentials/API URL were not available in the local execution environment. Local quality gates passed, staging env templates and safe verifier were added, but authenticated staging smoke, Midtrans sandbox, Resend staging, Cloudflare/R2, analytics, Docker builds, GitHub Actions runner execution, and restore drill remain unverified against real services.

## Local Quality Gate

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run test`: passed
  - frontend: 54 files, 190 tests passed
  - backend: 34 files, 131 passed, 2 skipped
- `npm run build`: passed
- `npm --prefix backend run check`: passed
- `npm run release:verify-config`: passed
- `npx -y react-doctor@latest --verbose --full`: passed, 100/100
- `npx -y react-doctor@0.2.3 --verbose --diff`: passed/skipped because no changed source files

## Docker / CI

- Docker CLI: not available locally (`docker: command not found`), so image build was not executed.
- CI workflow file exists and parses as YAML.
- CI is non-deploying and uses `npm ci`, typecheck, lint, tests, frontend build, backend check, and release config verification.
- GitHub-hosted workflow execution still needs verification after push.

## Staging Env Verifier

- Added `.env.staging.example` and `backend/.env.staging.example` with placeholders only.
- Created ignored local `.env.staging.local` and `backend/.env.staging.local` from templates when real files were absent; values remain placeholders and are not production/staging secrets.
- Added `npm run verify:staging-env` using `scripts/verify-staging-env.mjs`.
- Verifier now masks sensitive values and rejects placeholder/example values so smoke tests cannot accidentally run against fake staging configuration.
- Verifier fails against current local staging files with 26 placeholder keys and zero missing keys; real provider, URL, analytics, and smoke user values still need to be provided through local secret storage or CI environment secrets.

## Staging Environment Check

Local staging files exist but contain placeholder values. Safe env verification reported 26 placeholder keys, zero missing keys, and no forbidden frontend `VITE_*` secret keys after local-only app secrets were generated for `JWT_SECRET`, `SESSION_SECRET`, and `ENCRYPTION_KEY` without printing values.

Frontend `.env*` files did not expose forbidden backend secret names through `VITE_*` keys during local static check.

## Smoke Command Results

- `npm run smoke:staging:cashier`: not executed because env verifier failed on placeholder staging values.
- `npm run smoke:staging:offline-sync`: not executed because env verifier failed on placeholder staging values.
- `npm run smoke:staging:stock`: not executed because env verifier failed on placeholder staging values.

## Staging Health

Not executed. No staging API URL was available. Safe unauthenticated health checks require `KAFFEPOS_STAGING_API_URL` or `KAFFEPOS_API_BASE_URL`.

## External Services

Not live-verified in this run:
- Midtrans sandbox: pending dashboard/webhook/sandbox transaction verification.
- Resend staging: pending test-recipient email verification.
- Cloudflare/R2: pending asset/cache/private-object verification.
- GA4/Clarity: pending staging event/PII verification or explicit disabled-state confirmation.

## Backup / Restore

Restore drill not executed. Backup/restore commands and DR process are documented, but a non-production restore target must be provisioned before running a drill.

## Required Follow-Up

1. Provision staging smoke runner env variables listed in `STAGING_SMOKE_QA_CHECKLIST.md`.
2. Run all three staging smoke scripts against staging services.
3. Verify Midtrans sandbox webhook, Resend staging sender, Cloudflare/R2 asset/private-file behavior, analytics no-PII behavior, and backup restore drill.
4. Run Docker image builds on a machine/CI runner with Docker.
5. Verify `.github/workflows/ci.yml` in GitHub Actions after push.

## 2026-05-25 Real Staging Secret Source Check

Status: NOT READY.

The local secret files exist and are ignored by git, but they still contain provider, URL, analytics, and smoke user placeholder values copied from the staging templates. Local-only `JWT_SECRET`, `SESSION_SECRET`, and `ENCRYPTION_KEY` were generated safely without printing values; no secure provider secret source was available to replace the remaining placeholders in this run.

Secret provisioning workflow is now prepared:

- `npm run staging:env:init` creates ignored local staging env files from templates without asking for or printing secrets.
- `docs/engineering/STAGING_SECRET_SETUP_GUIDE.md` documents safe secret handling and fill steps.
- `docs/engineering/STAGING_VALUE_COLLECTION_CHECKLIST.md` lists required values to collect from secure sources.
- `.gitignore` keeps local secret files ignored while allowing staging examples to remain committable.

Verification result:
- missing required keys: 0
- placeholder keys: 26
- forbidden frontend secret-like `VITE_*` keys: 0
- `.env.staging.local`: ignored and untracked
- `backend/.env.staging.local`: ignored and untracked

Per release policy, staging health checks, smoke scripts, Midtrans, Resend, Cloudflare/R2, analytics checks, Docker build, GitHub Actions runner verification, and restore drill remain blocked until real staging values are supplied.

## 2026-05-25 Real Staging Smoke Attempt

Status: NOT READY.

Fresh verification before live smoke execution still reports placeholder values in ignored local staging env files:

- missing keys: 0
- placeholder keys: 26
- forbidden frontend secret-like `VITE_*` keys: 0
- invalid staging values: 0

Staging health checks, smoke scripts, Midtrans sandbox, Resend, Cloudflare/R2, GA4/Clarity, Docker image build, GitHub Actions runner verification, and backup restore drill were not executed because env readiness is still blocked. Replace the remaining placeholder values from secure staging secret source, then rerun `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local` before any live smoke command.

Use `docs/engineering/STAGING_SECRET_FILL_CHECKLIST.md` to fill the remaining key names from provider dashboards and secure storage without writing real values into docs or chat.

Use `docs/engineering/ENV_CONTRACT.md`, `docs/engineering/STAGING_INFRASTRUCTURE_PROVISIONING_GUIDE.md`, and `docs/engineering/STAGING_INFRASTRUCTURE_CHECKLIST.md` to create real staging domains, services, database, provider integrations, smoke users, and disposable restore DB before filling final env values.

The staging env contract now validates canonical backend runtime names: `WEB_BASE_URL`, `RESEND_FROM_EMAIL`, and `CLOUDFLARE_R2_PUBLIC_URL`. Deprecated aliases are documented but should not be used for new Coolify staging services.

Minimal staging mode is available for core smoke only. It skips Midtrans, Resend, Cloudflare/R2, GA4, and Clarity and can only reach `READY_FOR_MINIMAL_STAGING`; full staging remains required for production-candidate readiness.

`docs/engineering/MINIMAL_STAGING_COOLIFY_ENV.md` maps the observed frontend Coolify keys to the exact minimal frontend Coolify, backend Coolify, and local Mac smoke env keys. Coolify frontend env alone is not enough for local smoke; `.env.staging.local` and `backend/.env.staging.local` must also contain non-placeholder minimal values.

<!-- FINAL_STAGING_EXECUTION:START -->
## Final Staging Execution Update

Generated: 2026-05-30T17:37:37.384Z

Status: READY_FOR_MINIMAL_STAGING.

Verifier summary: profile minimal, missing 0, placeholders 0, forbidden frontend secrets 0, invalid 0.

Current blocker: FULL_STAGING_REQUIRED_FOR_PRODUCTION_CANDIDATE.

See `docs/engineering/FINAL_STAGING_EXECUTION_REPORT.md` for latest command results.
<!-- FINAL_STAGING_EXECUTION:END -->

<!-- COOLIFY_STAGING_AUTOMATION:START -->
## Coolify Staging Automation Update

Generated: 2026-05-31T09:41:53.376Z

Status: BLOCKED_BY_COOLIFY_API.

Verifier summary: profile payment, missing 0, placeholders 0, forbidden frontend secrets 0, invalid 0.

Coolify connection: checked /version: HTTP 200.

See `docs/engineering/COOLIFY_STAGING_AUTOMATION_REPORT.md` for full automation details.
<!-- COOLIFY_STAGING_AUTOMATION:END -->

## 2026-05-25 Coolify Env Sync Retry

- Frontend minimal env sync: updated existing keys successfully through Coolify bulk env endpoint.
- Backend minimal env sync: blocked by HTTP 404 on configured backend resource env endpoints.
- Manual health probe: frontend, API health, and API DB health returned HTTP 200.
- Smoke tests: not rerun in this retry because deployment did not complete through automation.

## 2026-05-25 Parallel Cashier Smoke Investigation

- Agent A / log diagnosis: `npm run smoke:staging:cashier` first failed before API call because direct smoke command did not load ignored local staging env files.
- Agent B / script audit: `smoke:staging:cashier` uses auth, stores, and cashiers APIs; no POS checkout. Script now reads `KAFFEPOS_TEST_CASHIER_EMAIL` and `KAFFEPOS_TEST_CASHIER_PASSWORD` and uses `KAFFEPOS_STAGING_API_URL`.
- Agent C / staging data audit: owner account exists or was registered but is not verified for login; direct DB repair from Mac is blocked by internal Coolify database host.
- Agent D / backend/API audit: minimal staging flags do not disable auth/store/cashier APIs; owner must be `owner_admin`, cashier must be `cashier` with active outlet assignment.
- Safe repair path added: `npm run staging:repair-smoke-data` calls a staging-only minimal repair API when deployed, then falls back to direct DB only if reachable.
- Current blocker: staging backend running remotely does not yet include the new repair endpoint; cashier smoke fails at owner login with `email_not_confirmed`.

## 2026-05-25 Smoke Env Loader Verification

Direct cashier smoke now loads `.env.staging.local` and `backend/.env.staging.local` before reading env. Missing-env failure is resolved. Current cashier smoke blocker is owner login `email_not_confirmed`, so staging smoke remains NOT READY until owner smoke account is verified or repaired through the staging-only repair path.
