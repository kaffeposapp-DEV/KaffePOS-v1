#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_SSLMODE="${DB_SSLMODE:-require}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [[ -n "${DATABASE_URL:-}" ]]; then
  TARGET="${DATABASE_URL}"
else
  : "${DB_HOST:?DB_HOST required when DATABASE_URL is unset}"
  : "${DB_NAME:?DB_NAME required when DATABASE_URL is unset}"
  : "${DB_USER:?DB_USER required when DATABASE_URL is unset}"
  export PGPASSWORD="${DB_PASSWORD:-}"
  TARGET="postgresql://${DB_USER}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}?sslmode=${DB_SSLMODE}"
fi

OUT_FILE="${BACKUP_DIR}/kaffepos-${TIMESTAMP}.dump"
SHA_FILE="${OUT_FILE}.sha256"

echo "Starting PostgreSQL backup: ${OUT_FILE}"
pg_dump "$TARGET" --format=custom --no-owner --no-privileges --file="$OUT_FILE"
sha256sum "$OUT_FILE" > "$SHA_FILE"
chmod 600 "$OUT_FILE" "$SHA_FILE"

find "$BACKUP_DIR" -type f \( -name '*.dump' -o -name '*.dump.sha256' \) -mtime "+${RETENTION_DAYS}" -delete

echo "Backup complete: ${OUT_FILE}"
echo "Install daily cron example: 15 17 * * * cd /app && BACKUP_DIR=/secure/backups ./scripts/backup-db.sh >> /var/log/kaffepos/backup.log 2>&1"
