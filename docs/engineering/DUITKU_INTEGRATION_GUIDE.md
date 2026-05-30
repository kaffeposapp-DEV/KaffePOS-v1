# Duitku Integration Guide

## Duitku Sandbox Dashboard

Callback URL:
https://api.kaffepos.my.id/api/webhooks/duitku

Return URL:
https://kaffepos.my.id/settings?billing=duitku-return

Webhook / callback method:
POST

## Server Requirements

- Public HTTPS URL
- Port 443
- Callback endpoint returns HTTP 200 on success
- Do not require browser session/cookie
- Do not require user auth
- Verify HMAC SHA256 signature
- Do not update payment from returnUrl

## KaffePOS Internal Routes

- `POST /api/webhooks/duitku`
- `GET /api/payments/:paymentId/status`
- `POST /api/payments/:paymentId/check`
- Frontend return page: `/settings?billing=duitku-return`

## Sandbox Env

```env
DUITKU_ENVIRONMENT=sandbox
DUITKU_CALLBACK_URL=https://api.kaffepos.my.id/api/webhooks/duitku
DUITKU_RETURN_URL=https://kaffepos.my.id/settings?billing=duitku-return
```

## Production Env Later

```env
DUITKU_ENVIRONMENT=production
DUITKU_CALLBACK_URL=https://api.kaffepos.my.id/api/webhooks/duitku
DUITKU_RETURN_URL=https://kaffepos.my.id/settings?billing=duitku-return
```

## Final Route Contract

Payment starts through `POST /api/payments/start`. Existing `POST /api/subscriptions/payments/create` stays available for rollback/backward compatibility.

Duitku return URL query parameters are treated as informational only. KaffePOS confirms payment through verified callback or authenticated server-side status check.

## Registered Website Review Page

Registered website: https://kaffepos.my.id/welcome

The `/welcome` page must show:

- Duitku payment gateway explanation for KaffePOS POS client subscription payments.
- Checkout flow from account creation/login through package selection, checkout, Duitku Sandbox redirect, and backend callback/check transaction confirmation.
- Support contact: help@kaffepos.my.id, 0851-8607-6224, and business address in Medan.
- CTA to register/login and continue to subscription checkout.

Reviewer account credentials must be shared only through private verification response/manual email, not public docs.

## Payment Staging Profile

Run verifier:

```bash
npm run verify:payment-staging
```

Run optional sandbox transaction smoke after credentials are present:

```bash
npm run smoke:staging:duitku
```

If credentials are missing, smoke exits with `DUITKU_SANDBOX_CREDENTIALS_REQUIRED` and does not fake success.
