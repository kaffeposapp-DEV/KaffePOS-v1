#!/bin/bash
# Production Readiness Check Script
# Validates all critical production requirements

set -e

echo "🔍 KaffePOS Production Readiness Check"
echo "======================================"
echo ""

ERRORS=0
WARNINGS=0

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

check_pass() {
  echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
  echo -e "${RED}❌ $1${NC}"
  ((ERRORS++))
}

check_warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
  ((WARNINGS++))
}

echo "1️⃣  Environment Variables"
echo "------------------------"

# Critical backend env vars
[ -n "$DATABASE_URL" ] || [ -n "$DB_HOST" ] && check_pass "Database connection configured" || check_fail "DATABASE_URL or DB_HOST not set"
[ -n "$RESEND_API_KEY" ] && check_pass "Email service configured" || check_warn "RESEND_API_KEY not set"
[ -n "$MIDTRANS_SERVER_KEY" ] && check_pass "Payment service configured" || check_warn "MIDTRANS_SERVER_KEY not set"
[ "$DB_SSL" = "true" ] && check_pass "Database SSL enabled" || check_warn "Database SSL not enabled (DB_SSL=true recommended)"
[ -n "$CORS_ORIGIN" ] && check_pass "CORS origin configured" || check_warn "CORS_ORIGIN not set"
[ -n "$SENTRY_DSN" ] && check_pass "Error tracking configured" || check_warn "SENTRY_DSN not set"

echo ""
echo "2️⃣  Database Connection"
echo "----------------------"

if [ -n "$DATABASE_URL" ] || [ -n "$DB_HOST" ]; then
  if [ -n "$DATABASE_URL" ]; then
    PSQL_CMD="psql $DATABASE_URL -t -c"
  else
    PSQL_CMD="psql -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${DB_USER:-kaffepos} -d ${DB_NAME:-kaffepos_production} -t -c"
  fi
  
  # Test connection
  if $PSQL_CMD "SELECT 1;" > /dev/null 2>&1; then
    check_pass "Database connection successful"
    
    # Check indexes
    INDEX_COUNT=$($PSQL_CMD "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';" | xargs)
    if [ "$INDEX_COUNT" -gt 50 ]; then
      check_pass "Performance indexes applied ($INDEX_COUNT indexes)"
    else
      check_fail "Performance indexes missing (only $INDEX_COUNT indexes, need 50+)"
      echo "         Run: bash scripts/apply-performance-indexes.sh"
    fi
    
    # Check critical tables
    TABLES=$($PSQL_CMD "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
    if [ "$TABLES" -gt 30 ]; then
      check_pass "Database schema complete ($TABLES tables)"
    else
      check_warn "Database schema incomplete (only $TABLES tables)"
    fi
    
  else
    check_fail "Database connection failed"
  fi
else
  check_fail "Database not configured"
fi

echo ""
echo "3️⃣  Backend Build"
echo "----------------"

cd backend
if npm run typecheck > /dev/null 2>&1; then
  check_pass "Backend TypeScript check passed"
else
  check_fail "Backend TypeScript check failed"
fi

if [ -d "dist" ]; then
  check_pass "Backend build exists"
else
  check_warn "Backend not built (run: npm run build)"
fi
cd ..

echo ""
echo "4️⃣  Frontend Build"
echo "-----------------"

if npm run typecheck > /dev/null 2>&1; then
  check_pass "Frontend TypeScript check passed"
else
  check_fail "Frontend TypeScript check failed"
fi

if [ -d "dist" ]; then
  check_pass "Frontend build exists"
else
  check_warn "Frontend not built (run: npm run build)"
fi

echo ""
echo "5️⃣  Security"
echo "-----------"

# Check for secrets in frontend env
if grep -q "MIDTRANS_SERVER_KEY" .env 2>/dev/null; then
  check_fail "MIDTRANS_SERVER_KEY found in root .env (should be backend only)"
fi

if grep -q "VITE_MIDTRANS_SERVER_KEY" .env 2>/dev/null; then
  check_fail "VITE_MIDTRANS_SERVER_KEY found (NEVER expose server key to frontend)"
fi

if [ ! -f ".env" ] || ! grep -q ".env" .gitignore; then
  check_warn ".env not in .gitignore"
else
  check_pass "Secrets properly ignored in git"
fi

echo ""
echo "6️⃣  Documentation"
echo "----------------"

[ -f "docs/launch/GO_LIVE_CHECKLIST.md" ] && check_pass "Go-live checklist exists" || check_warn "Go-live checklist missing"
[ -f "docs/engineering/SECURITY_HARDENING.md" ] && check_pass "Security guide exists" || check_warn "Security guide missing"
[ -f "docs/operations/INCIDENT_PLAYBOOK.md" ] && check_pass "Incident playbook exists" || check_warn "Incident playbook missing"

echo ""
echo "======================================"
echo "📊 Summary"
echo "======================================"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}🎉 All checks passed! Production ready.${NC}"
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}⚠️  $WARNINGS warnings found. Review recommended.${NC}"
  exit 0
else
  echo -e "${RED}❌ $ERRORS critical errors found. NOT production ready.${NC}"
  echo -e "${YELLOW}⚠️  $WARNINGS warnings found.${NC}"
  echo ""
  echo "Fix critical errors before deploying to production."
  exit 1
fi
