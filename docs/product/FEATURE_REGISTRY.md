# KaffePOS Feature Registry

Version: 1.0
Date: 2026-05-14
Status: Source of truth

Every feature must have a registry row before it is considered complete.

Status values:

- `Planned`: documented, not implemented.
- `In Progress`: implementation started or partially shipped.
- `Implemented`: code exists and feature is usable.
- `Beta`: usable but needs field validation before commercial release.
- `Deprecated`: kept for compatibility, not future direction.

| Feature ID | Name | Status | Module | APIs | Tables | Docs Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-001 | Email/password auth | Implemented | Frontend auth, backend auth | `/api/auth/register`, `/api/auth/login`, `/api/auth/session`, `/api/auth/logout` | `profiles`, `app_auth_credentials`, session tables | SRS, PRD, AI_AGENT_GUIDE | Includes profile/session handling. |
| AUTH-002 | Email verification | Implemented | Backend auth/email | `/api/auth/verification/resend`, `/api/auth/verification/confirm` | verification/code tables, `profiles`, `app_auth_credentials`, `notifications` | SRS, PRD, AI_AGENT_GUIDE | OTP/code flow with rate limits. |
| AUTH-003 | Password reset | Implemented | Backend auth/email | `/api/auth/password/forgot`, `/api/auth/password/reset` | reset token tables, `app_auth_credentials` | SRS, PRD, AI_AGENT_GUIDE | Token/link handled by backend/email. |
| RBAC-001 | Owner/cashier permissions | Implemented | Access control | Multiple protected `/api/*` endpoints | `profiles`, `cashier_outlet_assignments` | SRS, PRD, AI_AGENT_GUIDE | Roles: `owner_admin`, `cashier`. |
| STORE-001 | Store settings | Implemented | Store/settings | `/api/stores`, settings endpoints | `stores` | SRS, PRD | Includes receipt, tax, branding fields. |
| POS-001 | POS checkout | Implemented | POS/transactions | `POST /api/transactions/checkout` | `transactions`, `inventory`, `menu_items`, kitchen/loyalty/challenge tables as applicable | SRS, PRD | Atomic checkout expected; stock deduction via recipe. |
| POS-002 | Transaction history | Implemented | Transactions | `GET /api/transactions` | `transactions` | SRS, PRD | Paginated/history behavior where backend supports it. |
| POS-003 | Void transaction | Implemented | Transactions/inventory | Void transaction endpoint | `transactions`, `inventory` | SRS, PRD | Authorized users only; restores stock. |
| MENU-001 | Menu management | Implemented | Menu | `/api/menu-items` | `menu_items` | SRS, PRD | Supports recipe and variants. |
| INV-001 | Inventory management | Implemented | Inventory | `/api/inventory` | `inventory` | SRS, PRD | Stock, cost, min stock, units. |
| INV-002 | Unit conversions | Implemented | Inventory/stock engine | Unit conversion endpoints | `stock_unit_conversions` | SRS, PRD | Positive ratios required. |
| INV-003 | Bulk stock import | Implemented | Inventory import | Bulk import endpoint | `inventory`, `stock_unit_conversions`, `menu_items` | SRS, PRD | Validated import rows. |
| FIN-001 | Expenses/cash flow | Implemented | Finance | Finance/expense endpoints | `expenses`, `cash_flow` | SRS, PRD | Feeds reports/dashboard. |
| DASH-001 | Dashboard summaries | Implemented | Dashboard | Store/report/dashboard APIs | sales/inventory/expense tables | SRS, PRD | Owner operational overview. |
| REPORT-001 | PDF report export | Implemented | Reports/frontend | Report APIs where used | transactions/expenses/inventory | SRS, PRD | Plan-gated export. |
| AI-001 | AI business insight | Implemented | AI insight | `POST /api/ai-insight` | `ai_insight_logs`, `ai_insights_cache` | SRS, PRD, AI_AGENT_GUIDE | Gemini key backend-only. |
| KDS-001 | Kitchen order checker | Implemented | Kitchen/KDS | `/api/kitchen/orders`, kitchen status/event endpoints | `kitchen_orders`, `kitchen_order_items`, `kitchen_order_events` | SRS, PRD | SSE/realtime support where configured. |
| LOY-001 | Kopi Passport loyalty | Implemented | Loyalty | Loyalty settings/passport/stamp/reward/redemption endpoints | `loyalty_settings`, `loyalty_passports`, `loyalty_rewards`, `loyalty_stamp_events`, `loyalty_redemptions` | SRS, PRD | Points/stamps/rewards. |
| GAME-001 | Daily challenges | Implemented | Gamification | Challenge endpoints | `challenges`, `user_challenge_progress` | SRS, PRD | Target types documented in SRS/PRD. |
| NOTIF-001 | Notification center | Implemented | Notifications | `/api/notifications`, `/api/notifications/mark-read` | `notifications` | SRS, PRD | Plan-gated where applicable. |
| SUB-001 | Trial and plans | Implemented | Subscription | `/api/subscriptions` | subscriptions/profile payment fields | SRS, PRD | 14-day trial; plan drift must be avoided. |
| PAY-001 | Midtrans subscription payment | Beta | Backend payment | `/api/subscriptions/payments/quote`, `/api/subscriptions/payments/create`, `/api/payments/midtrans/webhook` | payment session/history/subscription tables | SRS, PRD, AI_AGENT_GUIDE | Backend-only verification required. |
| ADMIN-001 | Internal admin panel | Beta | Admin | `/api/admin/*` | multiple operational tables | SRS, PRD | Admin email/permission protected. |
| OPS-001 | Health and readiness | Implemented | Operations | `/health`, `/health/db`, `/system-status`, `/api/admin/system-status` | operational tables/views | SRS, PRD | Public status redacted. |
| UPDATE-001 | App version/safe update | Implemented | Release/update | `/api/app/version`, `/api/app/update-events` | `app_versions`, `app_update_events` | SRS, PRD | Web/APK update safety. |
| ANALYTICS-001 | Analytics events | Implemented | Analytics | frontend analytics service, ops event endpoints | `ops_event_logs`, analytics providers | SRS, PRD | GA4/Clarity plus backend ops metrics. |
| FEEDBACK-001 | Closed beta feedback | Implemented | Feedback | `/api/beta-feedback` | feedback/notifications tables where implemented | SRS, PRD | Supports beta iteration. |
| AFF-001 | Referral click tracking | In Progress | Referral | `GET /api/ref/:code` | `referral_codes`, `referral_clicks` | SRS, PRD, AI_AGENT_GUIDE, CHANGELOG_PRODUCT | Backend route added with rate limit, safe response, and `ip_hash` storage only. |
| AFF-002 | User referral dashboard | Beta | Referral | `GET /api/referrals/me`, `POST /api/referrals/generate`, `POST /api/referrals/register-attribution` | `referral_codes`, `referral_registrations`, `commission_transactions` | SRS, PRD, AI_AGENT_GUIDE, CHANGELOG_PRODUCT | Frontend dashboard mounted in app navigation with code generation, copy/share actions, stats, masked history, analytics events, and existing white/orange UI. |
| AFF-003 | Affiliate application/dashboard | Beta | Affiliate | `GET /api/affiliate/me`, `POST /api/affiliate/apply`, `PATCH /api/affiliate/me/payout`, `/api/admin/affiliates/*`, `/api/admin/referrals/*`, `/api/admin/commissions/*` | `affiliate_profiles`, `commission_transactions`, `commission_payouts`, `affiliate_terms_acceptances` | SRS, PRD, AI_AGENT_GUIDE, CHANGELOG_PRODUCT | Frontend affiliate dashboard and admin affiliate/referral/commission management pages mounted with masked payout data, guarded admin routes, filters/search, detail modals, commission/status actions, and production release checklist pending external checks; safe rollout flags added with default-off behavior; admin SOP and metrics docs added for operations. |
| MOBILE-001 | Capacitor Android app | Implemented | Mobile | App uses backend APIs | local storage plus backend tables | SRS, PRD, AI_AGENT_GUIDE | HTTPS-only production, no landing in mobile build. |
| PRINT-001 | Browser/thermal printing | Implemented | Printer | Frontend printer utilities | store receipt settings | SRS, PRD | Entitlement-aware. |
| DOC-001 | Documentation source of truth | Implemented | Docs | N/A | N/A | SRS, PRD, AI_AGENT_GUIDE, FEATURE_REGISTRY, CHANGELOG_PRODUCT, README | Future agents must read docs before coding. |
| API-001 | API Contract Standardization | Implemented | Backend API | All API endpoints | N/A | SRS, API.md, API_CONTRACT_QA_CHECKLIST.md, CHANGELOG_PRODUCT | Standardized response format, error codes, validation, pagination for all APIs. Backward compatible with gradual migration strategy. |
| DB-001 | Database Schema & Integrity | Implemented | Database | All tables | ~40+ tables | SRS, DATABASE.md, DATABASE_QA_CHECKLIST.md, CHANGELOG_PRODUCT | PostgreSQL schema with data integrity constraints, idempotency protections, performance indexes, and migration system. Custom Node.js migration runner with checksum validation and transaction safety. |
| OBS-001 | Backend Observability & Reliability | Implemented | Backend observability | Rate limiting, request ID, logging, error handling, webhook reliability | N/A (infrastructure) | PERFORMANCE_GUIDE.md, SECURITY_HARDENING.md, BACKEND_OBSERVABILITY_QA_CHECKLIST.md, CHANGELOG_PRODUCT.md | Comprehensive backend observability with rate limiting (auth, payment, admin, affiliate), request ID middleware for distributed tracing, enhanced structured logging with secrets safety, centralized error handler with safe messages, webhook reliability patterns, and QA checklist for production validation. |
| AUTH-001 | Authentication & RBAC System | Implemented | Backend auth, Frontend auth, RBAC | All auth endpoints, permission checks, role guards | `profiles`, `app_auth_sessions`, `app_auth_credentials`, `app_password_reset_tokens`, `cashier_outlet_assignments` | RBAC_PERMISSION_MATRIX.md, AUTH_RBAC_QA_CHECKLIST.md, SECURITY_HARDENING.md, CHANGELOG_PRODUCT.md | Comprehensive auth system with Bearer token authentication, session management, bcrypt password hashing, SHA-256 token hashing, rate limiting, 2-role model (owner_admin, cashier), 16 permissions, email-based admin whitelist, permission-based access control, store ownership verification, cashier assignment validation, IDOR prevention through query scoping, and complete documentation. Production ready at 85% (frontend role guards and 403 page recommended). |

## 2026-05-24 Engineering Operations Registry

| Area | Status | Source of Truth |
|------|--------|-----------------|
| CI quality gate | Active | `.github/workflows/ci.yml`, `docs/engineering/CI_CD_GUIDE.md` |
| Deployment readiness | Documented | `docs/engineering/DEPLOYMENT_CHECKLIST.md` |
| Environment security | Documented | `docs/engineering/ENVIRONMENT_SECURITY_CHECKLIST.md` |
| Containers | Documented | `frontend.Dockerfile`, `backend/Dockerfile`, `docs/engineering/CONTAINER_GUIDE.md` |
| CDN/static assets | Documented | `docs/engineering/CDN_ASSET_GUIDE.md` |
| Monitoring/logging | Documented | `docs/engineering/MONITORING_LOGGING_GUIDE.md` |
| Backup/recovery | Documented | `docs/engineering/BACKUP_RECOVERY_GUIDE.md`, `docs/engineering/DISASTER_RECOVERY_CHECKLIST.md` |

## Duitku Payment Migration

- Payment gateway can run as `duitku`, `midtrans`, or `disabled` via `PAYMENT_GATEWAY_PROVIDER`.
- Duitku callback URL: `https://api.kaffepos.my.id/api/webhooks/duitku`.
- Duitku return URL: `https://kaffepos.my.id/settings?billing=duitku-return`.
- Frontend return URL never marks payment paid; payment success requires verified server callback or verified status check.
- Duitku merchant key stays backend-only and must not be added to `VITE_*` env.
