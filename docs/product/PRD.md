# KaffePOS PRD

Version: 1.0
Date: 2026-05-13
Status: Source of truth

## 1. Product Vision

KaffePOS helps small and medium F&B businesses run daily cafe operations from one simple POS: cashier, menu, stock, recipe, reports, loyalty, staff motivation, kitchen flow, and subscription billing. Product must feel fast, trustworthy, and easy on mobile devices.

KaffePOS is not an ERP. It is a focused cafe POS with practical business insight.

## 2. Product Goals

### Business Goals

- Convert trial users into paid KaffePOS subscribers.
- Keep operational cost low through one React/Capacitor client and one Express/PostgreSQL backend.
- Build trust through safe updates, stable checkout, reliable payments, and clean receipts.
- Support affiliate/referral growth without compromising attribution or payout integrity.
- Prepare closed beta/commercial release with clear documentation and release gates.

### User Goals

- Complete checkout quickly during busy cafe hours.
- Know stock position and low-stock risks before operations break.
- Understand sales, profit, expenses, and product performance without spreadsheets.
- Print or share reliable receipts/reports.
- Manage subscription/payment safely.
- Reward loyal customers and motivate staff with lightweight gamification.

## 3. Users

### Owner / Admin

Needs:

- Manage store profile, menu, stock, staff, reports, subscription, printer, and settings.
- Monitor sales, profit, inventory, loyalty, and staff performance.
- Make decisions from dashboard and AI insight.

### Cashier

Needs:

- Open POS quickly.
- Add products, notes, discounts, payment method, and customer info.
- Complete transaction and print receipt.
- See kitchen/order status when relevant.

### Kitchen / Order Checker

Needs:

- See active orders by station/status.
- Update order/item status clearly.
- Avoid missed or duplicate orders.

### Customer of Merchant

Needs:

- Receive correct receipt.
- Earn loyalty stamps/points when merchant uses Kopi Passport.

### Internal KaffePOS Admin

Needs:

- Monitor readiness/status.
- Support users, billing, subscriptions, feedback, and affiliate/referral workflows.

### Affiliate / Referrer

Needs:

- Apply or participate in affiliate/referral program.
- Share referral link/code.
- Track clicks, conversions, and commission state.
- Receive payout by approved process.

## 4. Core Features

### 4.1 Auth and Onboarding

- Register, login, email verification, password reset.
- Automatic profile/store setup for owner flow.
- Role-aware app access.

### 4.2 POS Checkout

- Mobile-friendly checkout.
- Cart items, variants, notes, discount, tax, payment method, paid/change.
- Transaction persistence and receipt printing.
- Inventory deduction from recipes.
- Kitchen order creation when station/order data exists.

### 4.3 Menu and Inventory

- Menu items, categories, availability, price, image, variants, recipe.
- Inventory stock, units, conversions, cost, minimum stock, bulk import, adjustments.
- Recipe-driven COGS/stock logic.

### 4.4 Reports and Dashboard

- Sales, profit, expense, stock, and transaction summaries.
- PDF export according to entitlement.
- Operational metrics and readiness indicators for internal use.

### 4.5 Subscription and Billing

- Trial 14 days with full premium access.
- Active plans: `secangkir`, `kopi_susu`, `signature`; `founder` may exist as legacy/internal state.
- Midtrans payment for subscription through backend only.
- Manual/admin fallback where production payment is not ready.
- Upgrade prompts and trial countdown.

### 4.6 AI Insight

- Backend-proxied AI insight for business recommendations.
- Plan-controlled access and safe prompt/response handling.

### 4.7 Loyalty / Kopi Passport

- Customer passport by phone/name.
- Points/stamps rules and rewards.
- Redemption tracking.
- Basic/advanced access by plan.

### 4.8 Gamification

- Daily challenges/missions.
- Staff progress and reward points.
- Target types: sell drink, checkout speed, transactions count, upsell value, zero voids.

### 4.9 KDS / Order Checker

- Active kitchen orders.
- Station-aware items.
- Valid status transitions.
- Realtime/SSE updates where available.

### 4.10 Notifications and Feedback

- Notification center for operational and product events.
- Closed beta feedback flow.
- Admin notification path for user feedback/support.

### 4.11 App Update Safety

- Version endpoint.
- Soft/hard update modes.
- Update event tracking.
- Preserved storage keys for safe app updates.

### 4.12 Android Packaging

- Capacitor Android app from same codebase.
- Mobile target hides web-only landing surfaces.
- HTTPS-only production API.

## 5. Affiliate / Referral Requirements

### 5.1 Referral Tracking

- Public referral link format: `/ref/:code`.
- Backend tracks click metadata safely.
- Backend sets HTTP-only referral cookie when valid.
- Redirect goes to web base URL with referral context.

### 5.2 Attribution

- Registration may attach referral code to new user when valid.
- Attribution must be backend-side and auditable.
- Fraud-sensitive matching must not trust only frontend query params.

### 5.3 Affiliate Profile

- User can apply to affiliate program with terms version and payout preference.
- Affiliate profile has status lifecycle such as pending/approved/rejected/suspended where implemented.
- Admin approval required before paid commissions become payable.

### 5.4 Commission

- Commission generation must be tied to valid paid conversion or approved business event.
- Commission states must be auditable: pending, approved, paid, rejected/void where implemented.
- Payout details are sensitive and must stay backend/database controlled.
- No commission calculation rules may change without docs/RFC update.

### 5.5 User Referral Journey

- Normal user opens Referral Program from dashboard navigation.
- User sees referral code/link, copies or shares link, and can generate code if none exists.
- User sees clicks, registrations, trials, paid referrals, reward totals, and masked referral history.
- Empty, loading, and error states must stay friendly and non-blocking.
- Referral rules explain 20% first-month discount, Rp150.000 reward, 30-day eligibility, fraud/refund rejection, and no self-referral.

### 5.6 UX

- User-facing affiliate/referral UI must be clear about pending vs approved vs paid.
- Referral dashboard must use existing white card layout, warm orange CTA, existing badges/tables where practical, and no new theme.
- Do not promise instant payout unless backend process supports it.


### 5.7 Affiliate User Journey

- User opens Affiliate Program from dashboard navigation.
- If no profile exists, user sees affiliate application form with payout fields and terms checkbox.
- If profile exists, user sees status, affiliate code/link, clicks, registrations, paid conversions, commission totals, commission history, payout settings, and rules.
- Payout account number must be shown masked only after save.
- Copy/share actions should use Web Share when available and fallback to copying the affiliate link.
- Affiliate analytics must not include name, email, phone, bank, account number, or referred customer PII.


### 5.8 Admin Affiliate / Referral Journey

- Admin opens internal affiliate, referral, or commission management pages from Admin KaffePOS.
- Admin can filter/search affiliate profiles, referral registrations, and commission transactions.
- Admin can view detail modals for profile, referral, commission, payout masked fields, and related records.
- Admin can activate/suspend/reject affiliate profiles with confirmation; reject requires note.
- Admin can approve eligible/pending commission, reject unpaid commission with note, and mark approved commission as paid.
- Admin analytics must not include PII, payout data, or admin notes.

## 6. Admin Operations Requirements

- Admin team must use the Affiliate & Referral Admin SOP for affiliate approval, commission approval/rejection, payout, fraud review, dispute handling, refund/cancel, and emergency disable.
- Weekly KPI review must include referral conversion rate, affiliate conversion rate, commission payout ratio, fraud rate, refund rate, referred user LTV, and affiliate CAC.
- Fraud and payout decisions must preserve auditability with admin notes and financial records.

## 7. UX Rules

- Keep clean white UI with warm orange KaffePOS accent.
- Do not redesign global visual language without accepted PRD/RFC change.
- Preserve mobile-first cashier speed.
- Prioritize readable typography, large tap targets, low cognitive load.
- Empty/error/loading states must be clear and friendly.
- Avoid complex enterprise UI patterns unless needed for owner workflow.
- Auth, checkout, payment, and update flows must be stable and predictable.
- Android build must not show web-only landing page.

## 8. MVP Scope

### In Scope

- Email/password auth, email verification, password reset.
- Owner/cashier roles and permissions.
- Store setup/settings.
- POS checkout and transaction history.
- Void transaction with stock restoration.
- Menu and inventory with recipe-based deduction.
- Expenses/cash flow baseline.
- Dashboard and reports with PDF export.
- Subscription/trial/payment backend flow.
- KDS/order checker.
- Loyalty/Kopi Passport.
- Gamification/challenges.
- Notifications and beta feedback.
- AI insight through backend.
- Safe app update/version flow.
- Affiliate/referral baseline.
- Android APK via Capacitor.

### Out of Scope Without RFC

- Full multi-store/multi-branch product.
- Customer-facing ordering/delivery marketplace.
- Accounting system integrations.
- Payment provider besides Midtrans.
- HR/payroll system.
- Complex warehouse/multi-location inventory.
- Custom merchant-specific POS workflows.
- UI redesign or rebrand.

## 8. Success Metrics

### Product Metrics

- Trial-to-paid conversion rate.
- Day 1, Day 7, Day 30 retention.
- Checkout completion count per active store.
- First transaction completion rate after signup.
- Paid plan upgrade rate.
- Feature usage: reports, printer, loyalty, gamification, AI insight.

### Reliability Metrics

- Checkout success rate.
- Login success rate.
- OTP/email verification success rate.
- Payment webhook success/activation rate.
- API error rate.
- Crash-free sessions for APK.
- App update success rate.

### Affiliate Metrics

- Referral clicks.
- Referred signups.
- Referred paid conversions.
- Pending/approved/paid commission totals.
- Fraud/reversal rate.

## 9. Risks

- Payment production readiness depends on Midtrans configuration and webhook correctness.
- Offline-assisted behavior can create user expectations beyond current conflict handling.
- Subscription model has legacy fields that can drift from new plan definitions.
- Multi-store-ready schema may be mistaken as official full multi-branch feature.
- Affiliate payouts create financial liability if attribution/approval is weak.
- Android device/printer variations can break real-world cashier flow.
- AI insight can leak sensitive prompts if frontend/server boundaries are weakened.
- Documentation can drift unless every change updates docs and changelog.

## 10. Open Questions

- Final commercial pricing and billing-cycle copy across landing, app, backend, and docs.
- Exact affiliate commission rate, lock period, payout threshold, and tax/admin process.
- Full policy for trial auto-conversion vs manual upgrade messaging.
- Official offline checkout scope and conflict resolution target.
- Commercial launch gate date and required tester/device matrix.
- Whether `founder` remains internal/legacy or becomes public plan.
- Long-term multi-store strategy and package entitlement.
- Data retention policy for analytics, logs, referral clicks, and affiliate payout records.
