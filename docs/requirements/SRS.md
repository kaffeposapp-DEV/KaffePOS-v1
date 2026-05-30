# KaffePOS SRS

Version: 1.0
Date: 2026-05-14
Status: Source of truth

## 1. System Overview

KaffePOS is a POS system for coffee shops, small cafes, bakeries, and similar F&B businesses. It runs as a React TypeScript web app and Android app through Capacitor, backed by an Express TypeScript API and PostgreSQL.

Primary system goals:

- Fast cashier checkout for daily operations.
- Store, menu, inventory, recipe, transaction, expense, report, loyalty, gamification, KDS, subscription, affiliate/referral, and admin workflows.
- Backend-owned security, payment verification, data integrity, and entitlement checks.
- Stable white UI with warm orange KaffePOS brand accents.
- Safe web/APK updates without wiping local data or breaking sessions.

## 2. Architecture

### 2.1 Stack

- Frontend: React, TypeScript, Vite, Tailwind-style utility classes, localStorage-assisted cache.
- Backend: Express, TypeScript, Zod validation, PostgreSQL client, server-side integrations.
- Database: PostgreSQL, SQL migrations/bootstrap files in `database/`.
- Mobile: Capacitor Android, same frontend bundle with mobile target behavior.
- Integrations: Midtrans, Resend, Cloudflare CDN/R2/Images, GA4, Microsoft Clarity, Sentry, Gemini AI proxy.

### 2.2 Runtime Components

- Web app: `https://kaffepos.my.id`.
- API: `https://api.kaffepos.my.id`.
- Android app: Capacitor package `com.kaffepos.app`.
- Backend service: Express process on port `8787`.
- Database: PostgreSQL database `kaffepos_production`.

### 2.3 Frontend Boundaries

Frontend may:

- Render UI and hold non-sensitive app state.
- Store auth access token/session metadata according to current implementation.
- Cache operational data for offline-assisted UX.
- Call backend APIs through `src/lib/backendApi.ts`.
- Send analytics events when configured and consent allows.

Frontend must not:

- Store backend secrets.
- Verify payment status as source of truth.
- Activate subscriptions directly.
- Bypass backend authorization or entitlement checks.
- Redesign UI without accepted documentation/RFC.

### 2.4 Backend Boundaries

Backend owns:

- Authentication session creation/revocation.
- Authorization and role/permission checks.
- Store ownership validation.
- Subscription state, payment creation, Midtrans webhook verification, and payment activation.
- Database mutations and transaction integrity.
- Email, AI, analytics-supporting operational logs, admin operations, and sensitive integrations.

### 2.5 Database Boundary

PostgreSQL owns durable business data. Schema changes require:

1. SQL migration in `database/` or backend migration system.
2. Update to this SRS when data contract changes.
3. Update to `docs/FEATURE_REGISTRY.md` for affected feature rows.
4. Update to `docs/CHANGELOG_PRODUCT.md`.

## 3. Functional Requirements

### FR-001 Authentication and Account

- Users can register with email, password, and username.
- Users can log in with email and password.
- Users can verify email using OTP/code flow.
- Users can request and complete password reset.
- Auth sessions expire according to backend configuration.
- Backend rate-limits auth, email, and verification endpoints.
- System creates/maintains profile and initial store state for new owner flow.

### FR-002 Roles and Permissions

- Supported roles: `owner_admin`, `cashier`.
- Owner/admin can manage store, menu, inventory, billing, users, reports, printer, and settings.
- Cashier can use POS, view kitchen, update kitchen status where allowed, print receipt, apply discount, and view transaction history as configured.
- Backend must enforce permissions for write or sensitive endpoints.

### FR-003 Store Management

- Owner has store settings including name, address, WhatsApp, receipt text, tax, logo, paper width, and receipt display options.
- Store ownership must be verified by backend before data access or mutation.
- Current official product model assumes one active store per owner unless RFC expands multi-store.

### FR-004 POS Checkout

- Cashier can add menu items, variants, notes, discounts, tax, payment method, customer name, and cashier identity.
- Checkout persists transaction and items atomically.
- Checkout deducts inventory based on menu recipe where configured.
- Checkout can create kitchen order records for KDS flow.
- Checkout triggers loyalty/challenge progress where active.
- Backend must reject invalid totals, invalid store ownership, and stock/data conflicts where applicable.

### FR-005 Transaction History and Void

- Users can view paginated transaction history.
- Authorized users can void transactions with reason.
- Void must restore stock when stock was deducted.
- Void must preserve auditability through fields such as `is_void`, `void_reason`, `void_at`, `void_by`.

### FR-006 Menu Management

- Owner can create, update, delete, and list menu items.
- Menu item supports category, price, image URL, description, availability, sort order, variants, and recipe.
- Recipe connects menu item sales to inventory deduction.

### FR-007 Inventory Management

- Owner can create, update, list, import, and adjust inventory items.
- Inventory supports SKU, unit, stock, minimum stock, cost per unit, base/purchase units, conversion ratio, and active status.
- Unit conversions must use positive ratios.
- Low stock logic must compare `stock` with `min_stock`.

### FR-008 Expenses and Cash Flow

- Owner can track expenses and cash-related operational entries.
- Reports and dashboard must include expense and profit impact where supported.

### FR-009 Dashboard and Reports

- Owner can view operational summaries: sales, profit, transactions, stock alerts, payment breakdown, and trends.
- Reports can export PDF when entitlement permits.
- Advanced periods and exports are plan-controlled.

### FR-010 AI Insight

- AI insight runs through backend proxy only.
- Frontend must not expose `GEMINI_API_KEY`.
- Backend validates login, store access, entitlement, and usage limits before generating or returning insights.
- Cached insights may be stored in `ai_insights_cache`.

### FR-011 KDS / Order Checker

- POS checkout can create kitchen orders and items.
- Kitchen users can view active orders by store, status, and station.
- Status transitions must follow allowed transition rules.
- SSE/realtime events can notify kitchen clients.

### FR-012 Loyalty / Kopi Passport

- Owner can manage loyalty settings and rewards.
- Customers can have passport records by phone and name.
- Transactions or manual events can grant stamps/points.
- Rewards can redeem points/stamps and create redemption records.
- Idempotency keys must prevent duplicate stamp/redemption processing where used.

### FR-013 Gamification / Challenges

- Owner can manage active challenges.
- Challenge target types include drink sold, average checkout time, transaction count, upsell value, and zero voids.
- Checkout or explicit completion checks can update user progress.
- Completed challenges grant point reward records/summary.

### FR-014 Notifications

- System can create notifications for user/store events.
- Users can list and mark notifications read.
- Notification center access is plan-controlled where applicable.

### FR-015 Subscription and Billing

- Plans include `secangkir`, `kopi_susu`, `signature`, and legacy/founder states where present.
- Trial is 14 days and grants Signature-like access during trial period.
- Paid plan prices and billing cycles must match code/docs before release.
- Backend creates payment quote/session and handles payment result.
- Backend only verifies Midtrans webhook signatures and activates subscription.
- Frontend may show pending/success UI but cannot be source of truth for payment.

### FR-016 Affiliate and Referral

- Public referral link `/ref/:code` tracks click and redirects to web app.
- Referral code can be stored in HTTP-only cookie for registration attribution.
- Referral code must be unique; one user can have one code per referral code type (`customer_referral`, `affiliate`).
- Affiliate code must be unique per affiliate profile.
- One referred user can only have one referral source.
- Referral click IP must be stored as `ip_hash`, not raw IP.
- Authenticated user can view referral stats in the frontend Referral Program dashboard.
- Referral dashboard must show referral code, referral link, click/registration/trial/paid/reward stats, masked referral history, and short rules copy.
- Referral dashboard may generate a referral code through backend API when no code exists and must treat generation as idempotent.
- Referral dashboard may copy or share referral code/link and must not send PII to analytics.
- Affiliate user can apply, view dashboard, see affiliate status/link/stats/commission history, and update payout settings.
- Affiliate dashboard must mask payout account number and referred customer identity; raw bank account numbers must never be displayed after save.
- Admin can approve/manage affiliate states where implemented.
- Admin dashboard can list affiliate profiles, referral registrations, and commission transactions with filters/search and detail modals.
- Admin commission actions can approve pending/eligible commission, reject unpaid commission with required note, and mark approved commission as paid.
- Commission creation must be idempotent by unique referral registration, payment reference, and commission type indexes.
- Commission creation/approval/payout must be auditable and backend-owned.
- Payout account numbers must support encrypted storage; frontend may only show masked account values later.

### FR-017 Admin Internal

- Admin access uses backend/admin authorization, including admin email allowlist where configured.
- Admin can view operational system status and manage internal workflows such as subscriptions/affiliate where implemented.
- Public system status must redact sensitive detail.

### FR-018 App Version and Safe Update

- API exposes app version/update status.
- Web/APK must respect hard-update and soft-update responses.
- Update event logging must not expose secrets.
- Local preserved keys must protect core app state during updates.

### FR-019 Offline-Assisted Behavior

- App can cache menu, inventory, transactions, expenses, cash flow, cash register, and settings.
- Some pending writes may queue and sync after reconnect.
- Offline checkout is intentionally limited unless documented and verified.
- Conflict handling must prefer data integrity over silent overwrite.

### FR-020 Printing

- System supports browser/thermal printing according to entitlement.
- Receipt settings control header/footer/logo/tax/cashier/transaction display.
- Printer code must not break web or Android builds.

## 4. Non-Functional Requirements

### 4.1 Reliability

- Checkout and void must be atomic from business perspective.
- Payment activation must be idempotent.
- App update flow must not wipe user data unexpectedly.
- Backend must return safe user-facing errors.

### 4.2 Performance

- POS flow should remain responsive on mid-range Android devices.
- Critical dashboard/POS data should load within practical cafe operations timing.
- Backend list endpoints should use pagination where data can grow.
- Bundle changes must avoid unnecessary size growth.

### 4.3 Security

- Secrets only live in backend/server environment.
- CORS must allow only approved origins.
- Auth endpoints must be rate-limited.
- Passwords must be hashed with bcrypt or stronger accepted alternative.
- Tokens stored in database must be hashed where applicable.
- Backend must validate all request payloads with schemas or equivalent checks.
- Cross-store access must be rejected.
- Midtrans webhook verification must use server-side signature only.

### 4.4 Maintainability

- Future agents must read `docs/SRS.md`, `docs/PRD.md`, `docs/AI_AGENT_GUIDE.md`, and `docs/FEATURE_REGISTRY.md` before coding.
- Feature changes must update docs and changelog in same work item.
- No undocumented feature is complete.
- Small refactors must preserve API/data contracts unless docs/RFC update explains contract change.

### 4.5 Compatibility

- Web must run in modern Chromium/Safari/Firefox-class browsers.
- Android APK must use Capacitor-safe APIs and HTTPS-only production API.
- Backend must remain TypeScript buildable.
- PostgreSQL migrations must be idempotent where feasible.

## 5. Database Requirements

### 5.1 General Rules

- Use UUID primary keys for business entities where current schema does so.
- Include `created_at` and `updated_at` on mutable business tables where practical.
- Use foreign keys for ownership and cascade behavior intentionally.
- Use indexes for frequent lookup paths: `store_id`, `owner_id`, `user_id`, created dates, status fields, unique business keys.
- JSONB fields are allowed for flexible metadata but not for core searchable state without reason.

### 5.2 Current Core Tables

Core table groups include:

- Identity: `profiles`, `app_auth_credentials`, sessions/reset/verification tables where configured.
- Store: `stores`, `cashier_outlet_assignments`.
- Catalog: `menu_items`, `inventory`, `stock_unit_conversions`.
- Sales: `transactions`, transaction item data, `cash_flow`, `expenses`.
- Kitchen: `kitchen_orders`, `kitchen_order_items`, `kitchen_order_events`.
- Loyalty: `loyalty_settings`, `loyalty_passports`, `loyalty_rewards`, `loyalty_stamp_events`, `loyalty_redemptions`.
- Gamification: `challenges`, `user_challenge_progress`.
- Subscription/payment: subscriptions, payment history/session tables.
- Referral/affiliate: `referral_codes`, `referral_clicks`, `referral_registrations`, `affiliate_profiles`, `commission_transactions`, `commission_payouts`, `affiliate_terms_acceptances`; user references use `profiles(id)` because KaffePOS user records live in `profiles`, and `payment_id` stays nullable until a canonical `payments` table exists.
- Operations: `notifications`, `ops_event_logs`, `app_versions`, `app_update_events`, `ai_insights_cache`.

### 5.3 Migration Requirements

Any database change must:

- Add migration/bootstrap SQL under `database/` or backend migration path.
- Be safe to run in staging before production.
- Preserve existing production data unless destructive change is explicitly approved.
- Include rollback notes or mitigation notes when rollback is hard.
- Update API contracts and docs when fields/tables change.

## 6. API Requirements

### 6.1 API Principles

- All `/api/*` business endpoints require authentication unless explicitly public.
- All writes must validate payloads.
- All store-scoped reads/writes must verify ownership or assigned permission.
- All errors must avoid leaking secrets or internal stack traces.
- All public readiness/status endpoints must redact sensitive configuration.

### 6.2 Main API Areas

- Health: `GET /health`, `GET /health/db`, `GET /system-status`, `GET /api/admin/system-status`.
- App version: `GET /api/app/version`, `POST /api/app/update-events`.
- Auth: register, login, verification resend/confirm, password forgot/reset, session, logout.
- Profile/store: profile me, stores CRUD/settings.
- Catalog: menu items, inventory, unit conversions, bulk import.
- Sales: transactions list, checkout, void.
- Finance: expenses, cash flow, reports where implemented.
- Kitchen: kitchen orders, events/SSE, status updates.
- Loyalty: settings, passports, stamps, rewards, redemptions, overview.
- Challenges: challenges list/manage, progress/completion.
- Subscriptions/payment: subscriptions, quote, create payment, Midtrans webhook, verified affiliate/referral commission sync. Production webhook path is `POST /api/webhooks/midtrans`; legacy aliases may remain for compatibility.
- Notifications: list, mark read.
- AI: `POST /api/ai-insight`.
- Affiliate/referral: `GET /api/ref/:code`, `/api/referrals/*`, `/api/affiliate/*`, `/api/admin/affiliates/*`, `/api/admin/referrals/*`, `/api/admin/commissions/*`; availability depends on rollout flags.
- Frontend referral dashboard uses only `GET /api/referrals/me` and `POST /api/referrals/generate` for normal users.
- Frontend affiliate dashboard uses only `GET /api/affiliate/me`, `POST /api/affiliate/apply`, and `PATCH /api/affiliate/me/payout` for user/partner affiliate flows.

## 7. Business Rules

- Trial: new users get 14 days of full premium access unless policy changes in PRD/RFC.
- Plan gates: free/trial/paid access must use shared subscription definitions and backend checks for sensitive paths.
- POS totals: subtotal, discount, tax, paid, change, and total must be valid non-negative numeric values.
- Inventory deduction: recipe quantities convert to base units using configured conversions.
- Void: only authorized users can void; stock restoration must match original deduction.
- Loyalty: duplicate stamps/redemptions must be prevented by idempotency where client can retry.
- Challenges: completion must be tied to valid store/user/challenge and active validity dates.
- Payment: subscription active state changes only after backend verification or admin-approved manual activation.
- Payment webhook: affiliate/referral commission sync runs only after verified Midtrans success or backend-owned payment status verification.
- Affiliate: commissions require valid referral attribution and approved rules before payout.
- Affiliate: referral codes and affiliate codes must be unique.
- Affiliate: one referred user can only have one referral registration/source.
- Affiliate: click and terms acceptance IP values must be hashed before storage; raw IP addresses are not allowed.
- Affiliate: payout account numbers must be encrypted at rest and exposed only through masked values in future frontend/API work.
- Affiliate: commission idempotency is enforced by unique referral/payment/type indexes, with a null-payment fallback unique index.
- Affiliate: verified first payment marks referral registration paid, preserves existing timestamps, and sets commission `eligible_at` to payment success time plus 30 days.
- Affiliate: customer referrals create `referral_credit` commission for IDR 150,000; active affiliates create `affiliate_cash` at configured commission rate, default 20%.
- Affiliate: failed/cancelled/refund-like payment statuses cancel unpaid related commissions and never hard-delete financial records.
- Affiliate API: public referral route must rate-limit, hash IP before storage, and return safe metadata only.
- Affiliate API: user routes require auth; admin affiliate/referral/commission routes require admin authorization.
- Affiliate API: payout account numbers must never be logged or returned raw.
- Admin affiliate/referral/commission pages must stay admin-email guarded in frontend while backend remains source of authorization.
- Admin commission/affiliate action notes must not be stored in localStorage or sent to analytics.
- Referral frontend: referred user identity must remain masked when displayed in history.
- Referral frontend: only warm orange KaffePOS CTA accents and existing card/table/badge patterns are allowed.
- Affiliate frontend: application and payout forms must validate input client-side, call auth-protected backend APIs, avoid localStorage for payout data, and never send bank/account data to analytics.
- Multi-store: not official general feature until accepted RFC; do not expose broad multi-branch UX without docs.

## 8. Security Rules

- No secrets in frontend, including Midtrans server key, Gemini key, Resend key, database credentials, Sentry auth tokens, or Cloudflare secrets.
- `VITE_*` values are public by design; never put secrets there.
- Payment creation and verification must be backend-only.
- Midtrans webhook signature must be verified before state mutation.
- Auth, payment creation, email sending, and OTP verification must be rate-limited.
- Admin routes must be protected by explicit admin authorization.
- CORS production origins must be narrow.
- SQL must use parameterized queries.
- Logs must not include passwords, full tokens, OTP codes, card/bank secrets, or raw secret env values.
- Android production must not allow mixed content.

## 9. Analytics Events

Canonical analytics events include:

| Event | Trigger | Notes |
| --- | --- | --- |
| `sign_up` | Successful registration | No password or OTP payload. |
| `login` | Successful login | Include safe role/plan fields only. |
| `first_transaction` | First completed checkout | Store/user IDs only if privacy-safe. |
| `transaction_created` | Successful checkout | Include amount buckets/plan if needed. |
| `trial_started` | Trial activation | New account/subscription flow. |
| `trial_ended` | Trial expiry handling | Avoid sensitive billing data. |
| `upgrade_started` | User starts plan upgrade | Frontend event allowed. |
| `upgrade_clicked` | User clicks upgrade CTA | Frontend event allowed. |
| `payment_started` | Backend payment session created or UI starts payment | Payment result still backend-owned. |
| `payment_completed` | Backend-verified success reflected to UI | Do not infer from redirect alone. |
| `payment_success` | Verified success alias/legacy | Keep naming consistent in future. |
| `upgrade_completed` | Subscription becomes active | Backend verified/admin activation. |
| `feature_usage` | User uses gated feature | Include feature key. |
| `gamification_used` | Challenge/gamification interaction | Include safe module metadata. |
| `loyalty_used` | Loyalty stamp/redeem interaction | No raw phone if avoidable. |
| `ai_insights_used` | AI insight generated/viewed | No prompt secrets. |
| `pdf_export` | Report export requested | Entitlement-aware. |
| `pdf_exported` | Report export completed | Legacy/current compatibility. |
| `feedback_submitted` | Beta feedback submitted | No private contact beyond user account context. |
| `referral_code_generated` | User creates referral code from dashboard | No PII; code value should not be sent unless privacy-reviewed. |
| `referral_code_copied` | User copies referral code | No PII. |
| `referral_link_copied` | User copies referral link | No PII. |
| `referral_share_clicked` | User taps referral share action | No PII; use Web Share when available. |
| `affiliate_application_started` | User focuses affiliate application | No PII or payout data. |
| `affiliate_application_submitted` | User submits affiliate application | No PII or payout data. |
| `affiliate_code_copied` | User copies affiliate code | No PII. |
| `affiliate_link_copied` | User copies affiliate link | No PII. |
| `affiliate_share_clicked` | User taps affiliate share action | No PII; use Web Share when available. |
| `affiliate_payout_updated` | User updates payout settings | No bank or account payload. |
| `admin_affiliate_status_updated` | Admin updates affiliate status | No PII, payout, or note payload. |
| `admin_commission_approved` | Admin approves commission | No PII or note payload. |
| `admin_commission_rejected` | Admin rejects commission | No PII or note payload. |
| `admin_commission_marked_paid` | Admin marks commission paid | No PII or payout payload. |
| `admin_referral_detail_viewed` | Admin opens referral detail | No PII payload. |

Operational backend events may also record login/checkout success/failure in `ops_event_logs` or equivalent.

## 10. Affiliate / Referral Monitoring and Operations

- Affiliate/referral operations must follow `docs/SOP_AFFILIATE_REFERRAL_ADMIN.md`.
- Affiliate/referral metrics must follow `docs/METRICS_AFFILIATE_REFERRAL.md`.
- Monitoring must cover referral clicks, registrations, trials, paid conversions, conversion rate, invalid code attempts, suspicious referral activity, affiliate applications/statuses, commission pipeline states, duplicate commission attempts, commission failures, Midtrans webhook outcomes, payout updates, admin actions, and failed admin access attempts.
- Logs must use IDs, statuses, counts, and safe operational context only.
- Logs must not include raw IP, payout account number, secrets, tokens, email/phone/name unless explicitly allowed by current logging policy.
- Financial records must never be hard-deleted during fraud review, dispute handling, refund/cancel, or rollback.

## 11. Acceptance Criteria

A change is accepted only when:

- It follows SRS, PRD, AI agent guide, and feature registry.
- It does not introduce undocumented feature behavior.
- It does not redesign UI unless explicit PRD/RFC approval exists.
- It keeps white + warm orange visual language.
- It keeps secrets out of frontend.
- Payment status changes are verified by backend only.
- DB changes include migration and docs.
- Feature registry row is added or updated.
- Product changelog is updated under Added/Changed/Fixed/Docs.
- Affiliate/referral release requires `docs/RELEASE_CHECKLIST_AFFILIATE_REFERRAL.md` to be reviewed before production cutover.
- Affiliate/referral features must be controlled by backend and frontend feature flags with production-safe default `false`.
- If referral/affiliate/admin commission flags are disabled, backend routes must fail safe and frontend navigation/routes must hide or redirect without deleting existing data.
- If `REFERRAL_COMMISSION_CREATION_ENABLED=false`, verified payment webhooks must still process payment/subscription state but must not create new commission records.
- Relevant tests/build/typecheck are run or skipped with explicit reason.
- README remains aligned with source-of-truth docs.

## 12. Security, Performance & Scalability

### 12.1 Security Hardening

KaffePOS security hardening is documented in `docs/SECURITY_HARDENING.md`.

**Current Security Posture:**
- Strong authentication (bcrypt cost 12, SHA-256 session tokens)
- Role-based access control (owner_admin, cashier)
- Input validation (Zod schemas, parameterized SQL)
- Rate limiting (auth, payment endpoints)
- Payment security (Midtrans webhook verification, idempotency)
- No frontend secrets

**Production Requirements:**
- Database SSL/TLS enabled
- CORS configured for production domain only
- Rate limiting on all public endpoints
- Sentry error tracking enabled
- Database backups configured
- Admin MFA implemented (high priority)
- Security headers configured (HSTS, CSP)

### 12.2 Performance Optimization

KaffePOS performance optimization is documented in `docs/PERFORMANCE_GUIDE.md`.

**Current Performance Baseline:**
- Debouncing: POS search (200ms), history search (250ms)
- Code splitting: Vite build
- CDN: Cloudflare for static assets and images
- Database: Connection pooling configured

**Performance Requirements:**
- Page load: <3s on 3G network
- API response: <500ms (p95)
- Database query: <200ms (p95)
- Bundle size: <500KB total

**Critical Improvements Required:**
- Apply database performance indexes (`database/performance-indexes-migration.sql`)
- Add debouncing to all search inputs (300ms)
- Implement pagination on all list views (20-50 items)
- Optimize API response payloads
- Add React memoization for expensive calculations
- Optimize images (WebP, lazy loading)

### 12.3 Scalability Strategy

**Current Capacity:**
- Concurrent users: ~100-500
- Transactions per day: ~10,000-50,000
- Database size: <10GB

**Target Capacity:**
- Concurrent users: ~1,000-5,000
- Transactions per day: ~100,000-500,000
- Database size: <100GB

**Scalability Improvements:**
- Implement background job queue (BullMQ + Redis) for email, analytics, reports
- Extract business logic to service layer consistently
- Implement distributed rate limiting (Redis)
- Add caching layer (Redis) for stable data
- Add database read replicas for reporting
- Document horizontal scaling strategy

**Scaling Path:**
1. Phase 1 (Current): Single server, single database
2. Phase 2 (100+ stores): Database indexes, caching
3. Phase 3 (500+ stores): Job queue, read replicas
4. Phase 4 (1000+ stores): Horizontal scaling, load balancer
5. Phase 5 (5000+ stores): Database sharding, microservices

### 12.4 Quality Assurance

**QA Checklist:** `docs/QA_SECURITY_PERFORMANCE_CHECKLIST.md`

**Audit Reports:**
- 2026-05-14: Security, Performance & Scalability Audit (`docs/AUDIT_REPORT_2026_05_14.md`)

**Production Readiness Gates:**
1. All critical security issues resolved
2. Database performance indexes applied
3. Database SSL/TLS enabled
4. CORS configured for production
5. Sentry error tracking enabled
6. Database backups configured and tested
7. Monitoring and alerting configured

**Next Audit:** 2026-08-14 (quarterly security review)


## 13. API Contract Standards (Added 2026-05-14)

### 13.1 Response Format Standards

All KaffePOS API endpoints follow standardized response formats for consistency and predictability.

**Success Response Formats:**

1. **Single Object**: `{ success: true, data: {...} }`
2. **Paginated List**: `{ success: true, data: [...], meta: {...} }`
3. **Action**: `{ success: true, message: "..." }`

**Error Response Format:**

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": []
  }
}
```

### 13.2 Standard Error Codes

- `VALIDATION_ERROR` (400): Input validation failed
- `UNAUTHORIZED` (401): Authentication required or failed
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `CONFLICT` (409): Resource conflict (duplicate, concurrent update)
- `RATE_LIMITED` (429): Rate limit exceeded
- `PAYMENT_ERROR` (400): Payment processing failed
- `WEBHOOK_SIGNATURE_INVALID` (401): Webhook signature verification failed
- `FEATURE_DISABLED` (403): Feature is disabled via feature flag
- `INTERNAL_SERVER_ERROR` (500): Unexpected server error

### 13.3 Pagination Standards

All list endpoints support:
- `page` (integer, default: 1): Page number (1-indexed)
- `limit` (integer, default: 20, max: 100): Items per page
- `offset` (integer): Alternative to page (0-indexed)
- `sortBy` (string): Field to sort by
- `sortOrder` (enum: asc/desc, default: desc): Sort direction
- `search` (string, max: 200 chars): Search query

Pagination metadata includes:
- `page`, `limit`, `total`, `totalPages`, `hasMore`, `nextOffset`, `offset`, `returned`

### 13.4 Validation Standards

- All inputs validated with Zod schemas
- Validation errors return structured `details` array with field-level errors
- Email addresses normalized (lowercase, trimmed)
- Search queries sanitized (max 200 characters)
- UUIDs validated for format
- Parameterized SQL queries only (no string concatenation)

### 13.5 Backward Compatibility

API standardization is rolled out gradually:
- **Phase 1**: New infrastructure created (error handler, validation, pagination helpers)
- **Phase 2**: New endpoints use standard format; existing endpoints continue to work
- **Phase 3**: All endpoints migrated to standard format

Frontend API client handles both standard and legacy formats transparently.

### 13.6 Webhook Exception

Third-party webhooks (Midtrans) do NOT follow standard API format. They return provider-expected responses:
- Midtrans webhook: `{ received: true }`
- Signature verification still enforced
- Errors still use standard error codes

### 13.7 Security Requirements

- No stack traces in production responses
- No database error details exposed to clients
- No secrets in error messages
- Safe error messages via `getSafeApiErrorMessage()`
- Rate limiting enforced on sensitive endpoints
- All errors logged server-side with full context

### 13.8 Implementation References

- Response types: `backend/src/lib/apiResponse.ts`
- Error handler: `backend/src/core/errorHandler.ts`
- Validation: `backend/src/lib/validation.ts`
- Pagination: `backend/src/core/paginationEnhanced.ts`
- Frontend client: `src/lib/apiClient.ts`
- Full documentation: `docs/architecture/API.md`
- QA checklist: `docs/engineering/API_CONTRACT_QA_CHECKLIST.md`


## 14. Database Architecture (Added 2026-05-14)

### 14.1 Database System

KaffePOS uses PostgreSQL as the primary database with:
- **Custom migration system**: Node.js-based with checksum validation
- **Transaction safety**: All migrations run in transactions with automatic rollback
- **Schema tracking**: `schema_migrations` table tracks applied migrations
- **~40+ tables**: Authentication, POS, payments, subscriptions, loyalty, affiliate/referral, system

### 14.2 Data Integrity

**Constraints Enforced:**
- Self-referral prevention: Users cannot refer themselves
- Numeric constraints: Amounts >= 0, quantities > 0
- Date constraints: Logical date progression (registered → trial → paid → eligible)
- Status constraints: Valid enum values for all status fields
- Email uniqueness: Case-insensitive unique emails

**Idempotency Protections:**
- Commission: No duplicate commission for same referral+payment+type
- Referral registration: One user can only be referred once
- Affiliate profile: One user can only have one affiliate profile
- Payment: Unique Midtrans order_id for webhook idempotency
- Session tokens: Unique active session tokens
- Reset tokens: Unique unconsumed password reset tokens

### 14.3 Foreign Key Cascade Rules

**Financial Records (RESTRICT):**
- Referral codes, registrations, commissions, payouts protected from cascade delete
- Prevents accidental deletion of financial audit trail

**Operational Data (CASCADE):**
- Cashier assignments, payment orders can cascade delete
- Acceptable for non-financial operational data

**Audit Logs (SET NULL):**
- Payment logs, webhook logs preserve history even if user deleted

### 14.4 Index Strategy

**Performance indexes cover:**
- Transaction queries (store + date)
- Inventory queries (low stock alerts)
- Menu item queries (POS lookups)
- Kitchen order queries (KDS)
- Loyalty queries (passport lookup)
- Subscription queries (expiring subscriptions)
- Payment queries (user history, webhook lookups)
- Notification queries (unread notifications)
- Auth queries (email login, active sessions)
- Referral/affiliate queries (status, dates, users)

**Index types:**
- Unique indexes for business keys
- Composite indexes for common query patterns
- Partial indexes for filtered queries (active items, valid transactions)

### 14.5 Security Measures

**Sensitive Data:**
- Payout account numbers: Encrypted
- IP addresses: SHA-256 hashed (64 char hex)
- Passwords: bcrypt hashed (cost 12)
- Session tokens: SHA-256 hashed
- Reset tokens: SHA-256 hashed

**Format Validation:**
- Hash format constraints prevent invalid data
- Status enum constraints prevent invalid states

### 14.6 Migration Safety

**Safe Migration Practices:**
- All CREATE statements use `IF NOT EXISTS`
- All constraint additions use `DROP IF EXISTS` first
- Nullable columns added first, backfilled, then made NOT NULL
- `CONCURRENTLY` for indexes on large tables in production
- Rollback plan documented in migration comments

**Prohibited Practices:**
- Never edit applied migrations (checksum validation fails)
- Never drop columns without compatibility plan
- Never rename columns without migration strategy
- Never rollback financial data migrations

### 14.7 Performance Considerations

**High-Growth Tables:**
- `referral_clicks`, `commission_transactions`, `transactions`, `transaction_items`
- `loyalty_stamp_events`, `notifications`, `app_update_events`, `payment_webhook_logs`

**Recommendations:**
- Monitor table sizes (alert if > 10GB)
- Implement data retention policies
- Consider partitioning for high-growth tables
- Archive old data to cold storage

### 14.8 Implementation References

- Migration runner: `backend/scripts/run-migrations.mjs`
- Migrations: `backend/migrations/`
- Bootstrap: `database/production-bootstrap.sql`
- Performance indexes: `database/performance-indexes-migration.sql`
- Documentation: `docs/architecture/DATABASE.md`
- QA checklist: `docs/engineering/DATABASE_QA_CHECKLIST.md`


## Duitku Payment Migration

- Payment gateway can run as `duitku`, `midtrans`, or `disabled` via `PAYMENT_GATEWAY_PROVIDER`.
- Duitku callback URL: `https://api.kaffepos.my.id/api/webhooks/duitku`.
- Duitku return URL: `https://kaffepos.my.id/settings?billing=duitku-return`.
- Frontend return URL never marks payment paid; payment success requires verified server callback or verified status check.
- Duitku merchant key stays backend-only and must not be added to `VITE_*` env.
