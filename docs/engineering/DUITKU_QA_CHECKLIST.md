# Duitku QA Checklist

- [ ] Set Coolify backend `PAYMENT_GATEWAY_PROVIDER=duitku`.
- [ ] Set `PAYMENT_INTEGRATION_ENABLED=true`.
- [ ] Set sandbox merchant code/key in backend only.
- [ ] Configure Duitku Sandbox Callback URL: `https://api.kaffepos.my.id/api/webhooks/duitku`.
- [ ] Configure Duitku Return URL: `https://kaffepos.my.id/settings?billing=duitku-return`.
- [ ] Start subscription checkout and verify redirect to Duitku payment URL.
- [ ] Return URL shows pending, not paid.
- [ ] Callback with valid signature activates subscription once.
- [ ] Duplicate callback does not create duplicate receipt/payment history.
- [ ] Invalid callback signature does not update payment.
- [ ] `POST /api/payments/:paymentId/check` refreshes status only for owner/admin.

## Generic Start QA

- [ ] `POST /api/payments/start` returns `success=true` and `data.paymentUrl`.
- [ ] `/api/subscriptions/payments/create` still returns legacy payment payload.
- [ ] Frontend checkout does not load or require Midtrans Snap when `VITE_PAYMENT_GATEWAY_PROVIDER=duitku`.
- [ ] `/settings?billing=duitku-return` shows pending/check state and does not mark paid.
