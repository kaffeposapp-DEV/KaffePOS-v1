# Payment Provider Migration Report

KaffePOS payment gateway now uses provider abstraction with `duitku`, `midtrans`, and `disabled` modes selected by `PAYMENT_GATEWAY_PROVIDER`.

## Routes

- `POST /api/webhooks/duitku` public callback, HMAC SHA256 verified server-side.
- `GET /api/payments/:paymentId/status` authenticated safe status read.
- `POST /api/payments/:paymentId/check` authenticated Duitku status refresh.

## Safety

- Duitku merchant key remains backend-only.
- Return URL only refreshes UI status; it never marks payment paid.
- Subscription activation runs only after verified callback or verified status check.
- Duplicate activation guarded by `subscription_payment_sessions.subscription_id` and existing payment history checks.

## Finalization Update

- `POST /api/payments/start` is the generic payment start route for subscription checkout.
- Frontend checkout now calls `POST /api/payments/start` and redirects to returned `paymentUrl`.
- Legacy `/api/subscriptions/payments/create` remains available.
- Migration command for staging/production: `npm --prefix backend run migrate`.
