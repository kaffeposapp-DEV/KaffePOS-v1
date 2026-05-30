# KaffePOS Staging Secret Fill Checklist

Use this checklist to replace the remaining placeholder values in ignored local env files. Do not write real values in this document, chat, tickets, pull requests, screenshots, or commit history.

## Rules

- Never commit `.env.staging.local` or `backend/.env.staging.local`.
- Never paste real secrets into docs or AI chat.
- `VITE_*` keys must be public-safe because they are browser-visible.
- Backend secrets must only go in `backend/.env.staging.local`.
- Smoke credentials must be dedicated staging test users only.
- Production credentials must not be used for staging.
- After filling values, run `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local`.

## A. App URLs

| Key | Source/provider | Where to get it | File to fill | Classification | Safe example format |
|---|---|---|---|---|---|
| `VITE_API_BASE_URL` | Staging backend deploy | API service public HTTPS URL | `.env.staging.local` | Public | `https://staging-api.yourdomain.com` |
| `VITE_PUBLIC_ASSET_BASE_URL` | CDN/static asset host | Cloudflare/CDN public asset domain | `.env.staging.local` | Public | `https://assets-staging.yourdomain.com` |
| `WEB_BASE_URL` | Staging frontend deploy | Frontend public HTTPS URL | `backend/.env.staging.local` | Backend config, non-secret | `https://staging.yourdomain.com` |
| `API_BASE_URL` | Staging backend deploy | API service public HTTPS URL | `backend/.env.staging.local` | Backend config, non-secret | `https://staging-api.yourdomain.com` |
| `KAFFEPOS_STAGING_API_URL` | Staging backend deploy | API service public HTTPS URL | `.env.staging.local` | Smoke config, non-secret | `https://staging-api.yourdomain.com` |
| `KAFFEPOS_STAGING_FRONTEND_URL` | Staging frontend deploy | Frontend public HTTPS URL | `.env.staging.local` | Smoke config, non-secret | `https://staging.yourdomain.com` |

## B. Database

| Key | Source/provider | Where to get it | File to fill | Classification | Safe example format |
|---|---|---|---|---|---|
| `DATABASE_URL` | Staging PostgreSQL provider | Database console or secret manager | `backend/.env.staging.local` | Backend secret | `postgresql://user:password@host:5432/database` |

## C. Midtrans Sandbox

| Key | Source/provider | Where to get it | File to fill | Classification | Safe example format |
|---|---|---|---|---|---|
| `VITE_MIDTRANS_CLIENT_KEY` | Midtrans sandbox dashboard | Sandbox client key | `.env.staging.local` | Public sandbox key | `SB-Mid-client-...` |
| `MIDTRANS_CLIENT_KEY` | Midtrans sandbox dashboard | Sandbox client key | `backend/.env.staging.local` | Backend config, public-equivalent | `SB-Mid-client-...` |
| `MIDTRANS_SERVER_KEY` | Midtrans sandbox dashboard | Sandbox server key | `backend/.env.staging.local` | Backend secret | `SB-Mid-server-...` |

## D. Resend

| Key | Source/provider | Where to get it | File to fill | Classification | Safe example format |
|---|---|---|---|---|---|
| `RESEND_API_KEY` | Resend dashboard | Staging API key or secret manager | `backend/.env.staging.local` | Backend secret | `re_...` |
| `RESEND_FROM_EMAIL` | Resend/domain config | Verified staging sender | `backend/.env.staging.local` | Backend config | `KaffePOS Staging <noreply@yourdomain.com>` |
| `EMAIL_REPLY_TO` | Support/mailbox config | Staging support mailbox | `backend/.env.staging.local` | Backend config | `support@yourdomain.com` |

## E. Cloudflare / R2

| Key | Source/provider | Where to get it | File to fill | Classification | Safe example format |
|---|---|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard | Account overview or secret manager | `backend/.env.staging.local` | Backend config | Cloudflare account identifier |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Cloudflare R2 dashboard | Staging R2 access key | `backend/.env.staging.local` | Backend secret | R2 access key ID |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Cloudflare R2 dashboard | Staging R2 secret key | `backend/.env.staging.local` | Backend secret | R2 secret access key |
| `CLOUDFLARE_R2_PUBLIC_URL` | Cloudflare/CDN config | Public asset URL for staging bucket | `backend/.env.staging.local` | Backend config, non-secret | `https://assets-staging.yourdomain.com` |

## F. Analytics

| Key | Source/provider | Where to get it | File to fill | Classification | Safe example format |
|---|---|---|---|---|---|
| `VITE_GA4_MEASUREMENT_ID` | GA4 dashboard | Staging web stream | `.env.staging.local` | Public | `G-XXXXXXXXXX` with real staging ID |
| `VITE_CLARITY_PROJECT_ID` | Microsoft Clarity dashboard | Staging project settings | `.env.staging.local` | Public | Clarity project identifier |
| `GA4_MEASUREMENT_ID` | GA4 dashboard | Staging web stream | `backend/.env.staging.local` | Backend config, public-equivalent | `G-XXXXXXXXXX` with real staging ID |
| `GA4_API_SECRET` | GA4 dashboard | Measurement Protocol API secret | `backend/.env.staging.local` | Backend secret | GA4 API secret |

## G. Smoke Test Users

| Key | Source/provider | Where to get it | File to fill | Classification | Safe example format |
|---|---|---|---|---|---|
| `KAFFEPOS_OWNER_EMAIL` | Staging admin/user management | Dedicated staging owner account | `.env.staging.local` | Smoke credential | `owner-staging@yourdomain.com` |
| `KAFFEPOS_OWNER_PASSWORD` | Secret manager | Dedicated staging owner password | `.env.staging.local` | Smoke secret | Strong staging-only password |
| `KAFFEPOS_TEST_CASHIER_EMAIL` | Staging admin/user management | Dedicated staging cashier account | `.env.staging.local` | Smoke credential | `cashier-staging@yourdomain.com` |
| `KAFFEPOS_TEST_CASHIER_PASSWORD` | Secret manager | Dedicated staging cashier password | `.env.staging.local` | Smoke secret | Strong staging-only password |
| `KAFFEPOS_TEST_EMAIL_TO` | QA mailbox | Test recipient mailbox | `.env.staging.local` | Smoke config | `qa-staging@yourdomain.com` |

## Verification Gate

Live staging smoke may start only when verifier reports:

- missing keys: `0`
- placeholder keys: `0`
- forbidden frontend secret-like `VITE_*` keys: `0`
- invalid staging values: `0`
