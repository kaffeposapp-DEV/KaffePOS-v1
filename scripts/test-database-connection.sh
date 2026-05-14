#!/bin/bash
# Test Database Connection Script
# Gunakan script ini untuk troubleshoot masalah koneksi database

echo "🔍 Testing Database Connection"
echo "=============================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set"
  echo "Set DATABASE_URL environment variable"
  exit 1
fi

echo "✅ DATABASE_URL is set"
echo ""

# Test basic connection
echo "Testing basic connection..."
if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
  echo "✅ Database connection successful"
else
  echo "❌ Database connection failed"
  echo ""
  echo "Possible issues:"
  echo "1. Database server is down"
  echo "2. Wrong credentials in DATABASE_URL"
  echo "3. Firewall blocking connection"
  echo "4. SSL/TLS configuration issue"
  echo ""
  echo "Try connecting manually:"
  echo "psql \$DATABASE_URL"
  exit 1
fi

# Test SSL connection
echo ""
echo "Testing SSL connection..."
if psql "$DATABASE_URL?sslmode=require" -c "SELECT 1;" > /dev/null 2>&1; then
  echo "✅ SSL connection successful"
else
  echo "⚠️  SSL connection failed (may not be required)"
fi

# Check tables exist
echo ""
echo "Checking critical tables..."
TABLES=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "Found $TABLES tables"

if [ "$TABLES" -lt 30 ]; then
  echo "⚠️  Expected 30+ tables, found $TABLES"
  echo "Run migrations: npm run migrate"
else
  echo "✅ Database schema looks good"
fi

# Check indexes
echo ""
echo "Checking performance indexes..."
INDEXES=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';")
echo "Found $INDEXES indexes"

if [ "$INDEXES" -lt 50 ]; then
  echo "⚠️  Performance indexes missing"
  echo "Run: bash scripts/apply-performance-indexes.sh"
else
  echo "✅ Performance indexes applied"
fi

# Test auth tables
echo ""
echo "Checking auth tables..."
if psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM app_auth_credentials;" > /dev/null 2>&1; then
  echo "✅ Auth tables exist"
else
  echo "❌ Auth tables missing"
  echo "Run migrations: npm run migrate"
fi

echo ""
echo "=============================="
echo "✅ Database connection test complete"
