#!/bin/bash
# Database Restore Script
# Usage: ./restore-database.sh <backup_file.sql.gz>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh backups/kaffepos_backup_*.sql.gz 2>/dev/null || echo "No backups found"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "⚠️  WARNING: This will REPLACE the current database!"
echo "Backup file: $BACKUP_FILE"
echo ""
read -p "Are you sure? (type 'yes' to continue): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

# Check database connection
if [ -z "$DATABASE_URL" ] && [ -z "$DB_HOST" ]; then
  echo "❌ Error: No database connection configured"
  exit 1
fi

# Construct psql command
if [ -n "$DATABASE_URL" ]; then
  PSQL_CMD="psql $DATABASE_URL"
else
  PSQL_CMD="psql -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${DB_USER:-kaffepos} -d ${DB_NAME:-kaffepos_production}"
fi

echo "🗄️  Restoring database from backup..."

# Decompress and restore
gunzip -c "$BACKUP_FILE" | $PSQL_CMD

echo ""
echo "✅ Database restored successfully!"
echo ""
echo "⚠️  Remember to:"
echo "  1. Restart the backend server"
echo "  2. Verify data integrity"
echo "  3. Test critical functionality"
