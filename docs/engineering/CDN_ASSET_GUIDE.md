# KaffePOS CDN & Static Asset Guide

Date: 2026-05-24

## Public Assets

- Hashed Vite assets may use long cache TTL (`Cache-Control: public, max-age=31536000, immutable`).
- `index.html` should use no-cache or short cache so new deployments activate quickly.
- Public logos and marketing images can be served through Cloudflare CDN.

## Private Files

- Invoices, payout evidence, admin exports, and customer/payment artifacts must not be placed in public buckets unless explicitly intended.
- R2/private object storage should use signed URLs or backend-mediated access for sensitive files.
- Never expose R2 access keys or Cloudflare API tokens to frontend code.

## Failure Behavior

- App must still render core UI when CDN image optimization is unavailable.
- Use local public assets as fallback for critical brand/logo assets.
- Document CDN purge steps in release runbook when replacing non-hashed assets.
