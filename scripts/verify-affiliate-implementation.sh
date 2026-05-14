#!/bin/bash
# Affiliate & Referral Implementation Verification Script

echo "🔍 Verifying Affiliate & Referral Implementation..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $1 - MISSING"
    ((FAIL++))
  fi
}

echo "📁 Checking Database Files..."
check_file "database/affiliate-referral-migration.sql"
echo ""

echo "📁 Checking Backend Files..."
check_file "backend/src/types/affiliate.ts"
check_file "backend/src/services/AffiliateService.ts"
check_file "backend/src/routes/referrals.ts"
check_file "backend/src/routes/affiliate.ts"
check_file "backend/src/lib/affiliateWebhookHelper.ts"
echo ""

echo "📁 Checking Frontend Files..."
check_file "src/types/affiliate.ts"
check_file "src/components/ReferralCard.tsx"
check_file "src/components/AffiliateDashboard.tsx"
check_file "src/components/AffiliateApplyForm.tsx"
check_file "src/components/AdminCommissionTable.tsx"
echo ""

echo "📁 Checking Documentation..."
check_file "docs/affiliate-referral-system.md"
check_file "AFFILIATE_IMPLEMENTATION_SUMMARY.md"
echo ""

echo "🔧 Checking Backend Integration..."
if grep -q "import referralsRouter" backend/src/index.ts; then
  echo -e "${GREEN}✓${NC} referralsRouter imported"
  ((PASS++))
else
  echo -e "${RED}✗${NC} referralsRouter not imported"
  ((FAIL++))
fi

if grep -q "import affiliateRouter" backend/src/index.ts; then
  echo -e "${GREEN}✓${NC} affiliateRouter imported"
  ((PASS++))
else
  echo -e "${RED}✗${NC} affiliateRouter not imported"
  ((FAIL++))
fi

if grep -q "app.use(referralsRouter)" backend/src/index.ts; then
  echo -e "${GREEN}✓${NC} referralsRouter registered"
  ((PASS++))
else
  echo -e "${RED}✗${NC} referralsRouter not registered"
  ((FAIL++))
fi

if grep -q "app.use(affiliateRouter)" backend/src/index.ts; then
  echo -e "${GREEN}✓${NC} affiliateRouter registered"
  ((PASS++))
else
  echo -e "${RED}✗${NC} affiliateRouter not registered"
  ((FAIL++))
fi

if grep -q "handleAffiliateCommissionOnPayment" backend/src/routes/webhooks.ts; then
  echo -e "${GREEN}✓${NC} Webhook integration added"
  ((PASS++))
else
  echo -e "${RED}✗${NC} Webhook integration missing"
  ((FAIL++))
fi

if grep -q "handleReferralRegistration" backend/src/routes/auth.ts; then
  echo -e "${GREEN}✓${NC} Auth registration integration added"
  ((PASS++))
else
  echo -e "${RED}✗${NC} Auth registration integration missing"
  ((FAIL++))
fi
echo ""

echo "🔧 Checking Frontend Integration..."
if grep -q "generateReferralCode" src/lib/backendApi.ts; then
  echo -e "${GREEN}✓${NC} Affiliate API methods added"
  ((PASS++))
else
  echo -e "${RED}✗${NC} Affiliate API methods missing"
  ((FAIL++))
fi
echo ""

echo "📊 Summary:"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed! Implementation is complete.${NC}"
  exit 0
else
  echo -e "${RED}❌ Some checks failed. Please review the implementation.${NC}"
  exit 1
fi
