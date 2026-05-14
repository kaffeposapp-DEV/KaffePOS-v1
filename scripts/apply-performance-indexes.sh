#!/bin/bash
# Apply performance indexes to production database
# This is CRITICAL for production performance

set -e

echo "🔍 KaffePOS Performance Indexes Migration"
echo "=========================================="
echo ""

# Check if database connection is available
if [ -z "$DATABASE_URL" ] && [ -z "$DB_HOST" ]; then
  echo "❌ Error: No database connection configured"
  echo "Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD"
  exit 1
fi

# Construct psql command
if [ -n "$DATABASE_URL" ]; then
  PSQL_CMD="psql $DATABASE_URL"
else
  PSQL_CMD="psql -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${DB_USER:-kaffepos} -d ${DB_NAME:-kaffepos_production}"
fi

echo "📊 Checking current index count..."
CURRENT_INDEXES=$($PSQL_CMD -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';")
echo "Current indexes: $CURRENT_INDEXES"
echo ""

echo "🚀 Applying performance indexes..."
echo "This will add ~40+ indexes for query optimization"
echo ""

# Apply the migration
$PSQL_CMD -f database/performance-indexes-migration.sql

echo ""
echo "✅ Performance indexes applied successfully!"
echo ""

NEW_INDEXES=$($PSQL_CMD -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';")
echo "New index count: $NEW_INDEXES"
echo "Indexes added: $((NEW_INDEXES - CURRENT_INDEXES))"
echo ""
echo "🎉 Database performance should be 10-100x faster for common queries!"
