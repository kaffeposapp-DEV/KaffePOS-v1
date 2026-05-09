#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL wajib diisi untuk backup PostgreSQL." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump tidak ditemukan. Install PostgreSQL client tools terlebih dahulu." >&2
  exit 1
fi

BACKUP_DIR="${KAFFEPOS_BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="${BACKUP_DIR}/kaffepos-${timestamp}.sql.gz"

pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip -c > "$output"

echo "Backup PostgreSQL selesai: $output"
