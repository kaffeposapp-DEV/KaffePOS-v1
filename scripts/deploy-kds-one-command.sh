#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-https://api.kaffepos.my.id}"
WEB_BASE="${WEB_BASE:-https://kaffepos.my.id}"
GIT_BRANCH="${GIT_BRANCH:-main}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-feat: add realtime kitchen order checker}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

KDS_FILES=(
  "backend/src/index.ts"
  "database/production-bootstrap.sql"
  "database/kitchen-order-checker-migration.sql"
  "scripts/verify-kds-deploy.sh"
  "scripts/deploy-kds-one-command.sh"
  "DEPLOY_KITCHEN_CHECKER.md"
  "PRODUCTION_DEPLOYMENT_GUIDE.md"
  "src/components/AppShell.tsx"
  "src/components/auth/AuthPage.tsx"
  "src/components/kitchen/KitchenTab.tsx"
  "src/components/pos/POSTab.tsx"
  "src/components/settings/SubscriptionCheckoutFlow.tsx"
  "src/hooks/useStore.ts"
  "src/lib/backendApi.ts"
  "src/main.tsx"
  "src/pages/LandingPage.tsx"
  "src/test/transaction.test.ts"
  "src/types/index.ts"
  "package.json"
)

run_step() {
  echo
  echo "== $1 =="
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

run_step "KaffePOS KDS one-command deploy"
echo "ROOT_DIR=$ROOT_DIR"
echo "API_BASE=$API_BASE"
echo "WEB_BASE=$WEB_BASE"
echo "GIT_BRANCH=$GIT_BRANCH"
echo "DEPLOY_GIT=${DEPLOY_GIT:-0}"
echo "DEPLOY_MIGRATION=${DEPLOY_MIGRATION:-auto}"
echo "RUN_VERIFY=${RUN_VERIFY:-1}"
echo

require_command npm
require_command git
require_command curl

run_step "Local frontend typecheck"
npm run typecheck

run_step "Local frontend build"
npm run build:web

run_step "Local test suite"
npm test

run_step "Backend check"
(cd backend && npm run check)

run_step "Patch hygiene"
git diff --check -- "${KDS_FILES[@]}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  if [[ "${DEPLOY_MIGRATION:-auto}" != "0" ]]; then
    require_command psql
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/kaffepos-before-kds-$(date +%Y%m%d-%H%M%S).sql"

    run_step "Database backup"
    if command -v pg_dump >/dev/null 2>&1; then
      pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
      echo "Backup saved: $BACKUP_FILE"
    else
      echo "pg_dump not found; skipping backup. Install PostgreSQL client tools for DB backup." >&2
    fi

    run_step "Kitchen migration"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/kitchen-order-checker-migration.sql
  else
    echo "DEPLOY_MIGRATION=0, skipping database migration."
  fi
else
  echo
  echo "DATABASE_URL is empty; skipping database backup and migration."
  echo "Set DATABASE_URL if you want this command to run production migration."
fi

if [[ "${DEPLOY_GIT:-0}" == "1" ]]; then
  run_step "Git stage KDS files"
  git add "${KDS_FILES[@]}"

  if git diff --cached --quiet; then
    echo "No staged changes to commit."
  else
    run_step "Git commit"
    git commit -m "$COMMIT_MESSAGE"
  fi

  run_step "Git push"
  git push origin "$GIT_BRANCH"
else
  echo
  echo "DEPLOY_GIT is not 1; skipping git commit and push."
  echo "Set DEPLOY_GIT=1 to stage KDS files, commit, and push origin $GIT_BRANCH."
fi

if [[ -n "${COOLIFY_BACKEND_WEBHOOK:-}" ]]; then
  run_step "Trigger Coolify backend deploy"
  curl -fsS -X POST "$COOLIFY_BACKEND_WEBHOOK"
  echo
else
  echo
  echo "COOLIFY_BACKEND_WEBHOOK is empty; skipping backend webhook trigger."
fi

if [[ -n "${COOLIFY_FRONTEND_WEBHOOK:-}" ]]; then
  run_step "Trigger Coolify frontend deploy"
  curl -fsS -X POST "$COOLIFY_FRONTEND_WEBHOOK"
  echo
else
  echo
  echo "COOLIFY_FRONTEND_WEBHOOK is empty; skipping frontend webhook trigger."
fi

if [[ "${RUN_VERIFY:-1}" == "1" ]]; then
  run_step "Production verification"
  API_BASE="$API_BASE" WEB_BASE="$WEB_BASE" bash scripts/verify-kds-deploy.sh
else
  echo
  echo "RUN_VERIFY=0, skipping production verification."
fi

run_step "Done"
echo "KDS deploy command finished."
