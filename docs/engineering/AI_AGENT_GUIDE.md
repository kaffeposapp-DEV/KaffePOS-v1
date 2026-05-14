# KaffePOS AI Agent Guide

Version: 1.0
Date: 2026-05-13
Status: Mandatory source of truth

## 1. Golden Rules

1. Before coding, read `docs/requirements/SRS.md`, `docs/product/PRD.md`, `docs/engineering/AI_AGENT_GUIDE.md`, and `docs/product/FEATURE_REGISTRY.md`.
2. After coding, update relevant docs and `docs/product/CHANGELOG_PRODUCT.md`.
3. No undocumented feature is complete.
4. Do not implement a new feature unless it exists in SRS/PRD/registry or user explicitly asks to document it first.
5. Do not change UI design language unless accepted docs/RFC says so.
6. Keep clean white UI with warm orange KaffePOS accents.
7. No secrets in frontend.
8. Payment is verified by backend only.
9. Database changes require migration and documentation.
10. Prefer small focused changes over broad rewrites.

## 2. Required Pre-Coding Checklist

Before any code change:

- Read source-of-truth docs listed above.
- Identify affected feature ID in `docs/product/FEATURE_REGISTRY.md`.
- If no feature row exists, add one before or with implementation.
- Check whether change needs RFC: major user journey, data model, API contract, payment, subscription, offline sync, auth, printer, release gate, architecture.
- Inspect existing code style and nearby tests.
- Confirm frontend/backend boundary.

## 3. UI Rules

- Preserve current KaffePOS visual identity: white base, warm orange accent, coffee brand feel.
- Do not redesign navigation, layout system, cards, modals, auth, POS, dashboard, or settings without explicit approval.
- Keep mobile-first POS usability.
- Do not add visual noise or new color system.
- Do not replace existing components if a small patch works.
- Loading, empty, and error states must be clear.
- Android mobile target must not expose desktop/landing-only surfaces.

## 4. Architecture Rules

### Frontend

- Use React TypeScript patterns already present in `src/`.
- API access belongs in `src/lib/backendApi.ts` or adjacent module with same style.
- Auth state comes from `src/contexts/AuthContext.tsx` and `src/lib/authSession.ts`.
- Do not add backend secrets to `VITE_*`; Vite env is public.
- Use shared subscription/permission helpers instead of duplicating plan checks.
- Preserve safe update storage keys.

### Backend

- Use Express TypeScript route style under `backend/src/routes/`.
- Validate inputs with Zod or existing schema pattern.
- Use parameterized SQL only.
- Enforce auth, permission, and store ownership in backend.
- Keep sensitive integrations behind backend: Midtrans, Resend, Gemini, database, Cloudflare secrets.
- Return safe user-facing error messages.
- Log operational context without secrets.

### Database

- Add migrations in `database/` or backend migration path.
- Keep migrations idempotent where possible.
- Add indexes for new lookup paths.
- Use constraints for business invariants where practical.
- Document new tables/columns in `docs/requirements/SRS.md` and `docs/product/FEATURE_REGISTRY.md`.

### Mobile / Capacitor

- Build mobile with `npm run build:mobile`.
- Keep production API HTTPS-only.
- Do not enable mixed content.
- Avoid web APIs that break Android WebView without guard.

## 5. Documentation Update Rules

For every feature or behavior change:

- Update `docs/requirements/SRS.md` when requirements, API, database, business rules, security, analytics, or acceptance criteria change.
- Update `docs/product/PRD.md` when user value, scope, goals, UX, risk, affiliate/referral, or MVP scope changes.
- Update `docs/product/FEATURE_REGISTRY.md` for status, module, APIs, tables, docs updated, and notes.
- Update `docs/product/CHANGELOG_PRODUCT.md` under Added, Changed, Fixed, or Docs.
- Update `README.md` when setup, source-of-truth paths, commands, or architecture pointers change.
- If large architectural/product decision: create/update RFC under `docs/rfc/`.

## 6. Definition of Done

A task is done only when:

- Code compiles or validation command result is reported.
- Tests/build/typecheck relevant to changed area pass, or skipped reason is explicit.
- UI remains within no-redesign rule.
- Backend authorization and validation are not weakened.
- Payment/security/database rules are followed.
- Docs and changelog are updated.
- Feature registry reflects current state.
- No secrets are introduced.
- User-facing behavior is documented.

## 7. Payment Rules

- Midtrans server key must exist only in backend env.
- Frontend must not verify final payment state from redirect, query string, or Snap client result.
- Backend must create payment sessions/quotes.
- Backend must verify Midtrans webhook signature before updating payment/subscription state.
- Payment activation must be idempotent.
- Manual activation requires admin-only path and audit trail.
- Subscription UI must show backend state, not assumed state.

## 8. Affiliate / Referral Rules

- Referral attribution is backend-owned.
- `/ref/:code` tracking must not leak private affiliate data.
- Referral cookies must be HTTP-only where possible.
- Affiliate application, approval, commission, and payout state must be auditable.
- Do not change commission formulas, payout thresholds, or approval rules without docs/RFC.
- Do not expose payout details unnecessarily in frontend.
- Fraud-prone events need backend validation and logs.

## 9. Security Rules

- Never commit secrets or real credentials.
- Never put secrets in `VITE_*` env vars.
- Validate all write payloads.
- Use backend permission checks for every sensitive action.
- Verify store ownership for store-scoped data.
- Use parameterized SQL.
- Do not log passwords, tokens, OTPs, raw payment signatures, or secret env values.
- Keep CORS strict for production.
- Keep Android production on HTTPS.
- Preserve rate limits on auth, OTP/email, and payment creation.

## 10. Common Validation Commands

Use relevant commands only:

```bash
npm run typecheck
npm run lint
npm run test:frontend
npm run test:backend
npm run build
npm run build:mobile
cd backend && npm run check
cd backend && npm run migrate
```

For documentation-only changes, validation may be limited to markdown review unless user requests full checks.


## Affiliate / Referral Feature Flags

- Default rollout flags must be `false` in examples and production until explicitly enabled.
- Backend flags: `AFFILIATE_REFERRAL_ENABLED`, `REFERRAL_ENABLED`, `AFFILIATE_ENABLED`, `ADMIN_COMMISSION_ENABLED`, `REFERRAL_COMMISSION_CREATION_ENABLED`.
- Frontend flags: `VITE_AFFILIATE_REFERRAL_ENABLED`, `VITE_REFERRAL_ENABLED`, `VITE_AFFILIATE_ENABLED`, `VITE_ADMIN_COMMISSION_ENABLED`.
- Do not create commission from payment webhook when `REFERRAL_COMMISSION_CREATION_ENABLED=false`.
- Do not delete existing affiliate/referral/commission data when disabling flags.
- Hide disabled frontend navigation and block direct admin/user route access safely.


## Operational Docs Rules

- Affiliate/referral admin operations live in `docs/SOP_AFFILIATE_REFERRAL_ADMIN.md`.
- Affiliate/referral metrics live in `docs/METRICS_AFFILIATE_REFERRAL.md`.
- Any feature affecting payout, fraud, admin action, or commission state must update SOP/metrics docs when behavior changes.
- Logs must not include raw IP, payout account numbers, secrets, or unnecessary PII.

## Documentation Maintenance

**MANDATORY:** Follow the documentation maintenance checklist.

**Before coding, AI agents MUST read:**

1. `README.md` - Project structure and entry point
2. `docs/requirements/SRS.md` - System requirements and architecture
3. `docs/product/PRD.md` - Product vision and business rules
4. `docs/product/FEATURE_REGISTRY.md` - Feature status and ownership
5. `docs/engineering/AI_AGENT_GUIDE.md` - This guide (coding rules)

**After coding, AI agents MUST update:**

1. `docs/product/CHANGELOG_PRODUCT.md` - ALWAYS (every change)
2. Relevant docs per change type (see DOCS_MAINTENANCE_CHECKLIST.md)
3. `docs/product/FEATURE_REGISTRY.md` - If feature status changed
4. `docs/engineering/AI_AGENT_GUIDE.md` - If new rules/patterns added

**Documentation Update Matrix:**

| Change Type | Update Required |
|-------------|-----------------|
| API change | SRS.md, FEATURE_REGISTRY.md, CHANGELOG_PRODUCT.md |
| Database change | SRS.md, FEATURE_REGISTRY.md, CHANGELOG_PRODUCT.md, migration |
| Product behavior | PRD.md, SRS.md, FEATURE_REGISTRY.md, CHANGELOG_PRODUCT.md |
| UI/UX change | PRD.md, SRS.md, CHANGELOG_PRODUCT.md (requires approval) |
| Security change | SRS.md, SECURITY_HARDENING.md, AI_AGENT_GUIDE.md, CHANGELOG_PRODUCT.md |
| Affiliate/referral | PRD.md, SRS.md, affiliate-referral/, FEATURE_REGISTRY.md, CHANGELOG_PRODUCT.md |
| Payment change | SRS.md, SECURITY_HARDENING.md, AI_AGENT_GUIDE.md, CHANGELOG_PRODUCT.md |

**Full checklist:** `docs/DOCS_MAINTENANCE_CHECKLIST.md`

## Critical Rules (NEVER Violate)

### NEVER
1. ❌ Change UI/UX without explicit approval and PRD/RFC update
2. ❌ Expose secrets in frontend (VITE_* env vars are public)
3. ❌ Trust frontend payment callbacks (backend verification ONLY)
4. ❌ Skip database migrations when schema changes
5. ❌ Create undocumented features
6. ❌ Duplicate business logic across files
7. ❌ Leave conflicting rules across documents
8. ❌ Break internal documentation links
9. ❌ Bypass security rules (auth, RBAC, rate limiting)
10. ❌ Hard-delete financial records (soft delete only)

### ALWAYS
1. ✅ Read required docs before coding (README, SRS, PRD, FEATURE_REGISTRY, AI_AGENT_GUIDE)
2. ✅ Update CHANGELOG_PRODUCT.md after every change
3. ✅ Keep one source of truth per topic
4. ✅ Verify payments on backend only (webhook signature verification)
5. ✅ Create database migrations for schema changes
6. ✅ Update FEATURE_REGISTRY.md for feature changes
7. ✅ Resolve documentation conflicts immediately
8. ✅ Test all documentation links
9. ✅ Follow security best practices (see SECURITY_HARDENING.md)
10. ✅ Preserve audit trails for financial operations

## Documentation Hierarchy

```
README.md (entry point)
├── docs/requirements/SRS.md (system source of truth)
├── docs/product/PRD.md (product source of truth)
├── docs/product/FEATURE_REGISTRY.md (feature status)
├── docs/product/CHANGELOG_PRODUCT.md (history)
├── docs/engineering/AI_AGENT_GUIDE.md (this file - rules)
├── docs/engineering/SECURITY_HARDENING.md (security practices)
├── docs/engineering/PERFORMANCE_GUIDE.md (performance practices)
├── docs/architecture/ (architecture docs)
├── docs/affiliate-referral/ (affiliate/referral system)
├── docs/launch/ (deployment and launch)
├── docs/operations/ (operations and support)
├── docs/testing/ (testing and QA)
├── docs/legal/ (legal documents)
└── docs/DOCS_MAINTENANCE_CHECKLIST.md (maintenance guide)
```

## Quick Reference

**Before coding:**
```bash
# Read these 5 docs (mandatory)
1. README.md
2. docs/requirements/SRS.md
3. docs/product/PRD.md
4. docs/product/FEATURE_REGISTRY.md
5. docs/engineering/AI_AGENT_GUIDE.md
```

**After coding:**
```bash
# Update these (based on change type)
1. docs/product/CHANGELOG_PRODUCT.md (always)
2. Relevant docs per DOCS_MAINTENANCE_CHECKLIST.md
3. docs/product/FEATURE_REGISTRY.md (if feature changed)
```

**Documentation help:**
- Full checklist: `docs/DOCS_MAINTENANCE_CHECKLIST.md`
- Update matrix: See table above or DOCS_MAINTENANCE_CHECKLIST.md
- Source of truth map: DOCS_MAINTENANCE_CHECKLIST.md


## API Contract Standards (Added 2026-05-14)

### Response Format Rules

All new API endpoints MUST follow standardized response format:

**Success Responses:**
- Single object: `{ success: true, data: {...} }`
- Paginated list: `{ success: true, data: [...], meta: {...} }`
- Action: `{ success: true, message: "..." }`

**Error Responses:**
- Standard format: `{ success: false, error: { code, message, details? } }`
- Use specific error codes (VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, etc.)
- Include validation details for VALIDATION_ERROR

**Pagination:**
- Support `page`, `limit`, `offset`, `sortBy`, `sortOrder`, `search` query params
- Return `meta` with: page, limit, total, totalPages, hasMore, nextOffset
- Default limit: 20, max limit: 100

**Validation:**
- Use Zod schemas for all inputs (body, query, params)
- Use validation middleware: `validate({ body: schema })`
- Use common schemas from `backend/src/lib/validation.ts`

**Error Handling:**
- Use `ApiErrorWithCode` for new code with error codes
- Use `throwApiError` helpers for common errors
- Legacy `ApiError` still supported for backward compatibility

### Implementation Checklist

When creating new API endpoints:

1. ✅ Use standard response format
2. ✅ Use specific error codes
3. ✅ Validate all inputs with Zod
4. ✅ Use pagination helpers for list endpoints
5. ✅ Include total count in pagination
6. ✅ Document endpoint in `docs/architecture/API.md`
7. ✅ Update `CHANGELOG_PRODUCT.md`

### References

- Full API contract: `docs/architecture/API.md`
- Response helpers: `backend/src/lib/apiResponse.ts`
- Error handler: `backend/src/core/errorHandler.ts`
- Validation: `backend/src/lib/validation.ts`
- Pagination: `backend/src/core/paginationEnhanced.ts`
- QA checklist: `docs/engineering/API_CONTRACT_QA_CHECKLIST.md`


## Database Rules (Added 2026-05-14)

### Migration Safety

**When creating migrations:**
1. ✅ Use `IF NOT EXISTS` for all CREATE statements
2. ✅ Use `DROP IF EXISTS` before adding constraints
3. ✅ Add nullable columns first, backfill, then add NOT NULL
4. ✅ Use `CONCURRENTLY` for indexes on large tables in production
5. ✅ Document rollback plan in migration comments
6. ❌ Never edit applied migrations (checksum validation will fail)
7. ❌ Never drop columns without compatibility plan
8. ❌ Never rename columns without migration strategy

**Migration naming:** `YYYYMMDD_NNNN_description.sql`

**Migration command:** `npm run migrate`

### Data Integrity Rules

**Always enforce:**
- Self-referral prevention: `referrer_user_id != referred_user_id`
- Numeric constraints: Amounts >= 0, quantities > 0
- Date constraints: Logical progression (registered → trial → paid)
- Status constraints: Valid enum values
- Email uniqueness: Case-insensitive unique emails

**Idempotency required for:**
- Commission creation (referral + payment + type)
- Referral registration (one per referred user)
- Affiliate profile (one per user)
- Payment orders (unique Midtrans order_id)
- Session tokens (unique active tokens)
- Reset tokens (unique unconsumed tokens)

### Foreign Key Rules

**Financial records:** Use `ON DELETE RESTRICT`
- Referral codes, registrations, commissions, payouts
- Prevents accidental deletion of audit trail

**Operational data:** Use `ON DELETE CASCADE` (acceptable)
- Cashier assignments, payment orders
- Non-financial operational data

**Audit logs:** Use `ON DELETE SET NULL`
- Payment logs, webhook logs
- Preserves history even if user deleted

### Index Strategy

**Always index:**
- Foreign key columns (user_id, store_id, etc.)
- Status columns for filtering
- Date columns for sorting/filtering
- Unique business keys (email, code, order_id)

**Use composite indexes for:**
- Common query patterns: `(store_id, date DESC)`
- Filtered queries: `(store_id, status, date DESC)`

**Use partial indexes for:**
- Active items: `WHERE is_active = true`
- Valid transactions: `WHERE is_void = false`
- Active sessions: `WHERE revoked_at IS NULL`

### Performance Monitoring

**Monitor these high-growth tables:**
- `referral_clicks`, `commission_transactions`, `transactions`
- `loyalty_stamp_events`, `notifications`, `payment_webhook_logs`

**Alert thresholds:**
- Table size > 10GB (consider partitioning)
- Query time > 1s (optimize query)
- Unused indexes (idx_scan = 0)

### References

- Database architecture: `docs/architecture/DATABASE.md`
- QA checklist: `docs/engineering/DATABASE_QA_CHECKLIST.md`
- Migration runner: `backend/scripts/run-migrations.mjs`
- Migrations: `backend/migrations/`

