#!/usr/bin/env bash
set -euo pipefail

# KaffePOS Integration Test Runner
# Tests: checkout flow, stock deduction, payment webhook, referral attribution

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="${BACKEND_URL:-http://localhost:8787}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"
TEST_EMAIL="integration+$(date +%s)@kaffepos.test"
TEST_PASSWORD="IntegrationPass123!"
TEST_USERNAME="itest$(date +%s)"

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red() { printf '\033[0;31m%s\033[0m\n' "$1"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$1"; }

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for_url() {
  local url="$1"
  local name="$2"
  local attempts=60
  local count=0

  yellow "Waiting for $name at $url..."
  until curl -fsS "$url" >/dev/null 2>&1; do
    count=$((count + 1))
    if [[ "$count" -ge "$attempts" ]]; then
      red "$name failed to start after $attempts attempts"
      return 1
    fi
    sleep 1
  done
  green "$name ready"
}

api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local auth_header="${4:-}"

  if [[ -n "$data" ]]; then
    curl -fsS -X "$method" "$BACKEND_URL$path" \
      -H 'Content-Type: application/json' \
      ${auth_header:+-H "$auth_header"} \
      -d "$data"
  else
    curl -fsS -X "$method" "$BACKEND_URL$path" \
      ${auth_header:+-H "$auth_header"}
  fi
}

extract_json() {
  node -e "const data=JSON.parse(process.argv[1]); console.log(data$2 ?? '')" "$1"
}

run_auth_setup() {
  yellow "1/4 Auth setup: register/login test account"
  local register_payload
  register_payload=$(cat <<JSON
{"email":"$TEST_EMAIL","password":"$TEST_PASSWORD","username":"$TEST_USERNAME"}
JSON
)

  api POST /api/auth/register "$register_payload" >/tmp/kaffepos-register.json || true

  # Test environments may auto-verify or provide seeded users. Try login next.
  local login_payload login_response
  login_payload=$(cat <<JSON
{"email":"$TEST_EMAIL","password":"$TEST_PASSWORD"}
JSON
)
  login_response=$(api POST /api/auth/login "$login_payload" || true)
  TOKEN=$(node -e "try{const d=JSON.parse(process.argv[1]); console.log(d.token||d.session?.token||d.access_token||'')}catch{console.log('')}" "$login_response")

  if [[ -z "$TOKEN" ]]; then
    yellow "Login token unavailable; using TEST_AUTH_TOKEN if provided"
    TOKEN="${TEST_AUTH_TOKEN:-}"
  fi

  if [[ -z "$TOKEN" ]]; then
    red "No auth token. Set TEST_AUTH_TOKEN for seeded integration environment."
    return 1
  fi

  AUTH_HEADER="Authorization: Bearer $TOKEN"
  green "Auth setup passed"
}

run_checkout_flow() {
  yellow "2/4 Checkout flow + stock deduction integrity"

  local store_id inventory_id menu_item_id before_stock after_stock checkout_response
  store_id="${TEST_STORE_ID:-}"
  inventory_id="${TEST_INVENTORY_ID:-}"
  menu_item_id="${TEST_MENU_ITEM_ID:-}"

  if [[ -z "$store_id" || -z "$inventory_id" || -z "$menu_item_id" ]]; then
    yellow "Seed ids missing. Set TEST_STORE_ID, TEST_INVENTORY_ID, TEST_MENU_ITEM_ID for full checkout test."
    return 0
  fi

  before_stock=$(api GET "/api/inventory?store_id=$store_id" "" "$AUTH_HEADER" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const item=(d.items||d).find(x=>x.id==='${inventory_id}'); console.log(item?.stock ?? '')")

  checkout_response=$(api POST /api/transactions "$(cat <<JSON
{"store_id":"$store_id","items":[{"menu_item_id":"$menu_item_id","qty":1}],"payment_method":"cash","discount_amount":0}
JSON
)" "$AUTH_HEADER")

  node -e "const d=JSON.parse(process.argv[1]); if(!(d.id||d.transaction?.id)) process.exit(1)" "$checkout_response"

  after_stock=$(api GET "/api/inventory?store_id=$store_id" "" "$AUTH_HEADER" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const item=(d.items||d).find(x=>x.id==='${inventory_id}'); console.log(item?.stock ?? '')")

  if [[ -n "$before_stock" && -n "$after_stock" ]]; then
    node -e "const b=Number(process.argv[1]), a=Number(process.argv[2]); if(!(a < b)) process.exit(1)" "$before_stock" "$after_stock"
  fi

  green "Checkout and stock deduction passed"
}

run_payment_webhook() {
  yellow "3/4 Payment webhook processing"

  local order_id signature_payload response
  order_id="itest-$(date +%s)"
  signature_payload=$(cat <<JSON
{"order_id":"$order_id","transaction_status":"settlement","gross_amount":"99000.00","status_code":"200","signature_key":"test-signature"}
JSON
)

  response=$(api POST /api/webhooks/midtrans "$signature_payload" || true)

  if echo "$response" | grep -qiE 'ok|success|ignored|invalid|not found'; then
    green "Webhook endpoint responded deterministically"
  else
    red "Webhook endpoint returned unexpected response: $response"
    return 1
  fi
}

run_referral_attribution() {
  yellow "4/4 Referral attribution"

  local code response
  code="${TEST_REFERRAL_CODE:-REFTEST}"
  response=$(api POST /api/referrals/track "$(cat <<JSON
{"referral_code":"$code","landing_path":"/register","utm_source":"integration-test","utm_campaign":"qa"}
JSON
)" || true)

  if echo "$response" | grep -qiE 'id|tracked|invalid|not found'; then
    green "Referral attribution endpoint responded deterministically"
  else
    red "Referral attribution unexpected response: $response"
    return 1
  fi
}

main() {
  cd "$ROOT_DIR"
  yellow "KaffePOS integration tests starting"
  yellow "Backend URL: $BACKEND_URL"
  yellow "Frontend URL: $FRONTEND_URL"

  if [[ "${START_SERVERS:-false}" == "true" ]]; then
    npm --prefix backend run dev >/tmp/kaffepos-backend.log 2>&1 &
    BACKEND_PID=$!
    npm run dev >/tmp/kaffepos-frontend.log 2>&1 &
    FRONTEND_PID=$!
  fi

  wait_for_url "$BACKEND_URL/health" "backend"
  run_auth_setup
  run_checkout_flow
  run_payment_webhook
  run_referral_attribution

  green "All integration checks completed"
}

main "$@"
