#!/bin/bash
# Automated Database Backup Script
# Run daily via cron: 0 2 * * * /path/to/backup-database.sh

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/kaffepos_backup_$TIMESTAMP.sql"

echo "🗄️  KaffePOS Database Backup"
echo "============================"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Check database connection
if [ -z "$DATABASE_URL" ] && [ -z "$DB_HOST" ]; then
  echo "❌ Error: No database connection configured"
  exit 1
fi

# Construct pg_dump command
if [ -n "$DATABASE_URL" ]; then
  PG_DUMP_CMD="pg_dump $DATABASE_URL"
else
  PG_DUMP_CMD="pg_dump -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${DB_USER:-kaffepos} -d ${DB_NAME:-kaffepos_production}"
fi

echo "📦 Creating backup: $BACKUP_FILE"
$PG_DUMP_CMD --format=plain --no-owner --no-acl > "$BACKUP_FILE"

# Compress backup
echo "🗜️  Compressing backup..."
gzip "$BACKUP_FILE"
BACKUP_FILE="$BACKUP_FILE.gz"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Clean old backups
echo "🧹 Cleaning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "kaffepos_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

REMAINING=$(find "$BACKUP_DIR" -name "kaffepos_backup_*.sql.gz" | wc -l)
echo "📊 Total backups: $REMAINING"

echo ""
echo "✅ Backup complete!"
