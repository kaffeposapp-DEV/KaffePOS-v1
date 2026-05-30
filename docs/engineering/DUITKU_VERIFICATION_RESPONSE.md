# Duitku Verification Response

Registered website: https://kaffepos.my.id/welcome

## Payment Gateway Usage

Payment gateway Duitku digunakan untuk pembayaran paket/langganan KaffePOS oleh client atau pemilik usaha yang menggunakan sistem POS KaffePOS. Pengguna dapat membuat akun, login, memilih paket, melakukan checkout, dan diarahkan ke halaman pembayaran Duitku Sandbox. Status pembayaran dikonfirmasi melalui callback/check transaction di sisi server.

## Website Support Contact

- Email: help@kaffepos.my.id
- Phone: 0851-8607-6224
- Business Address: Jl. Bhayangkara, Indra Kasih, Kec. Medan Tembung, Kota Medan, Sumatera Utara 20221

## Checkout Flow for Reviewer

1. Open https://kaffepos.my.id/welcome.
2. Select pricing/checkout CTA or login/register.
3. Login using reviewer test account supplied through private channel.
4. Open subscription/billing checkout.
5. Select package and payment method.
6. Backend creates Duitku Sandbox transaction.
7. Browser is redirected to Duitku Sandbox `paymentUrl`.
8. Return URL opens `https://kaffepos.my.id/settings?billing=duitku-return`.
9. KaffePOS does not mark payment successful from return URL alone.
10. Paid status requires verified Duitku callback or authenticated server-side transaction status check.

## Duitku Sandbox Configuration to Verify

- `PAYMENT_GATEWAY_PROVIDER=duitku`
- `PAYMENT_INTEGRATION_ENABLED=true`
- `DUITKU_ENVIRONMENT=sandbox`
- `DUITKU_MERCHANT_CODE=DS31214`
- `DUITKU_CALLBACK_URL=https://api.kaffepos.my.id/api/webhooks/duitku`
- `DUITKU_RETURN_URL=https://kaffepos.my.id/settings?billing=duitku-return`
- `SUBSCRIPTION_PAYMENT_MODE=duitku_sandbox`
- `MIDTRANS_SNAP_ENABLED=false`

## Reviewer Test Account

- Email: duitku-tester@kaffepos.my.id
- Password: provided only via private verification message/manual email draft; not stored in public docs.
- Required state: confirmed email, active owner account, billing access, checkout access.

## Security Notes

- Duitku merchant key is backend-only and must never be exposed as `VITE_*`.
- `.env` files must remain ignored.
- Return URL is informational only.
- Payment success source of truth: verified callback/check transaction on backend.
