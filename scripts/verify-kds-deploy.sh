#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-https://api.kaffepos.my.id}"
WEB_BASE="${WEB_BASE:-https://kaffepos.my.id}"

echo "== KaffePOS KDS deploy verification =="
echo "API_BASE=$API_BASE"
echo "WEB_BASE=$WEB_BASE"
echo

echo "== Backend health =="
curl -fsS "$API_BASE/health" >/tmp/kaffepos-health.json
cat /tmp/kaffepos-health.json
echo

echo "== Database health =="
curl -fsS "$API_BASE/health/db" >/tmp/kaffepos-health-db.json
cat /tmp/kaffepos-health-db.json
echo

echo "== System status =="
curl -fsS "$API_BASE/system-status" >/tmp/kaffepos-system-status.json
cat /tmp/kaffepos-system-status.json
echo

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "== Kitchen tables =="
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
select
  to_regclass('public.kitchen_orders') as kitchen_orders,
  to_regclass('public.kitchen_order_items') as kitchen_order_items,
  to_regclass('public.kitchen_order_events') as kitchen_order_events;

select
  (select count(*) from public.kitchen_orders) as kitchen_orders_count,
  (select count(*) from public.kitchen_order_items) as kitchen_order_items_count,
  (select count(*) from public.kitchen_order_events) as kitchen_order_events_count;
SQL
else
  echo "DATABASE_URL not set; skipping direct PostgreSQL table checks."
fi
echo

if [[ -n "${ACCESS_TOKEN:-}" && -n "${STORE_ID:-}" ]]; then
  echo "== Authenticated kitchen orders endpoint =="
  curl -fsS \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    "$API_BASE/api/kitchen/orders?storeId=$STORE_ID" \
    >/tmp/kaffepos-kitchen-orders.json
  cat /tmp/kaffepos-kitchen-orders.json
  echo

  echo "== SSE handshake check (5s max) =="
  if command -v timeout >/dev/null 2>&1; then
    timeout 5 curl -fsS -N \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      "$API_BASE/api/kitchen/events?storeId=$STORE_ID" || true
  else
    curl -fsS -N \
      --max-time 5 \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      "$API_BASE/api/kitchen/events?storeId=$STORE_ID" || true
  fi
  echo
else
  echo "ACCESS_TOKEN and STORE_ID not set; skipping authenticated kitchen endpoint/SSE checks."
fi

echo
echo "Verification script completed."
