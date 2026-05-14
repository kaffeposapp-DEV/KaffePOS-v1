#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-${API_BASE_URL:-http://127.0.0.1:8787}}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-10}"
DISK_PATH="${DISK_PATH:-.}"
DISK_THRESHOLD_PERCENT="${DISK_THRESHOLD_PERCENT:-90}"
REQUIRE_DB_SSL="${REQUIRE_DB_SSL:-true}"

fail() {
  echo "CRITICAL: $*" >&2
  exit 2
}

warn() {
  echo "WARNING: $*" >&2
}

HEALTH_URL="${BASE_URL%/}${HEALTH_PATH}"
BODY="$(curl -fsS --max-time "$TIMEOUT_SECONDS" "$HEALTH_URL")" || fail "health endpoint failed: ${HEALTH_URL}"

echo "$BODY" | grep -q '"ok"[[:space:]]*:[[:space:]]*true' || fail "health endpoint not ok: ${HEALTH_URL}"

USED_PERCENT="$(df -Pk "$DISK_PATH" | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
if [[ "$USED_PERCENT" =~ ^[0-9]+$ ]] && (( USED_PERCENT >= DISK_THRESHOLD_PERCENT )); then
  fail "disk usage ${USED_PERCENT}% >= ${DISK_THRESHOLD_PERCENT}% on ${DISK_PATH}"
fi

if [[ "$REQUIRE_DB_SSL" == "true" ]]; then
  if [[ -n "${DATABASE_URL:-}" ]]; then
    [[ "$DATABASE_URL" == *"sslmode=require"* || "$DATABASE_URL" == *"sslmode=verify-full"* || "${DB_SSL:-}" == "true" ]] || fail "database SSL/TLS not enforced; set DB_SSL=true or sslmode=require"
  else
    [[ "${DB_SSL:-}" == "true" ]] || fail "database SSL/TLS not enforced; set DB_SSL=true"
  fi
fi

if command -v logrotate >/dev/null 2>&1; then
  echo "logrotate: installed"
else
  warn "logrotate missing; install package and use scripts/logrotate-kaffepos.conf"
fi

echo "OK: ${HEALTH_URL} healthy, disk ${USED_PERCENT}% used, DB SSL check passed"
