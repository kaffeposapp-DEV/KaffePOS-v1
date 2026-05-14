# Authentication & RBAC QA Checklist

Version: 1.0
Date: 2026-05-14
Status: QA Reference

## Purpose

This checklist validates authentication, authorization, RBAC, route protection, and permission safety for production readiness.

---

## 1. Authentication Checklist

### 1.1 Login Flow
- [ ] Login with valid credentials succeeds
- [ ] Login with invalid email returns generic error
- [ ] Login with invalid password returns generic error
- [ ] Login rate limit enforced (10 attempts per 15 min)
- [ ] Login creates session with hashed token
- [ ] Login returns access token and user metadata
- [ ] Login redirects to dashboard
- [ ] Cashier with inactive status cannot login
- [ ] Cashier without active assignment cannot login

### 1.2 Register Flow
- [ ] Register with valid data succeeds
- [ ] Register with duplicate email returns error
- [ ] Register with weak password (< 10 chars) returns error
- [ ] Register with invalid email returns error
- [ ] Register rate limit enforced (5 attempts per 15 min)
- [ ] Register creates profile and store atomically
- [ ] Register activates trial subscription
- [ ] Register requires email verification
- [ ] Register sends verification email

### 1.3 Logout Flow
- [ ] Logout revokes all user sessions
- [ ] Logout clears frontend state
- [ ] Logout redirects to login
- [ ] Logged out user cannot access protected routes
- [ ] Revoked session returns 401 on API calls

### 1.4 Password Reset Flow
- [ ] Password reset request with valid email succeeds
- [ ] Password reset request with invalid email returns generic success (no info leak)
- [ ] Password reset rate limit enforced (5 attempts per 15 min)
- [ ] Password reset token expires after 60 minutes
- [ ] Password reset token is one-time use
- [ ] Password reset with valid token succeeds
- [ ] Password reset with expired token returns error
- [ ] Password reset with used token returns error
- [ ] Password reset revokes all sessions
- [ ] Password reset sends confirmation email

### 1.5 Email Verification
- [ ] Email verification with valid code succeeds
- [ ] Email verification with invalid code returns error
- [ ] Email verification with expired code returns error
- [ ] Email verification rate limit enforced (20 attempts per 15 min)
- [ ] Resend verification rate limit enforced (5 attempts per 15 min)
- [ ] Verified user can access full features
- [ ] Unverified user has limited access

### 1.6 Session Management
- [ ] Session expires after configured TTL (30 days default)
- [ ] Expired session returns 401
- [ ] Revoked session returns 401
- [ ] Session last_seen_at updated on each request
- [ ] Multiple sessions allowed per user
- [ ] Logout revokes all sessions

### 1.7 Token Security
- [ ] Token is opaque (32 bytes base64url)
- [ ] Token hashed (SHA-256) before storage
- [ ] Token not logged
- [ ] Token not returned in error messages
- [ ] Token sent in Authorization header (Bearer)
- [ ] Token validated on every protected request

---

## 2. Authorization Checklist

### 2.1 Role Checks
- [ ] owner_admin has all permissions
- [ ] cashier has limited permissions (POS, kitchen, history)
- [ ] cashier cannot access dashboard
- [ ] cashier cannot access reports
- [ ] cashier cannot manage settings
- [ ] cashier cannot manage inventory
- [ ] cashier cannot manage users
- [ ] cashier cannot void transactions
- [ ] Role normalized correctly (owner/admin → owner_admin)

### 2.2 Permission Checks
- [ ] `can_view_dashboard` - owner_admin only
- [ ] `can_use_pos` - owner_admin and cashier
- [ ] `can_view_reports` - owner_admin only
- [ ] `can_manage_settings` - owner_admin only
- [ ] `can_manage_billing` - owner_admin only
- [ ] `can_manage_products` - owner_admin only
- [ ] `can_manage_inventory` - owner_admin only
- [ ] `can_manage_users` - owner_admin only
- [ ] `can_void_transaction` - owner_admin only
- [ ] `can_view_kitchen` - owner_admin and cashier
- [ ] `can_manage_kitchen_status` - owner_admin and cashier
- [ ] `can_view_transaction_history` - owner_admin and cashier
- [ ] `can_print_receipt` - owner_admin and cashier
- [ ] `can_apply_discount` - owner_admin and cashier

### 2.3 Admin Checks
- [ ] Admin user can access `/api/admin/*` routes
- [ ] Non-admin user cannot access `/api/admin/*` routes
- [ ] Admin check uses email whitelist
- [ ] Admin can view all subscriptions
- [ ] Admin can activate subscription
- [ ] Admin can cancel subscription
- [ ] Admin can view all affiliates
- [ ] Admin can update affiliate status
- [ ] Admin can approve commission
- [ ] Admin can reject commission
- [ ] Admin can mark commission paid
- [ ] Admin actions logged with admin ID

---

## 3. Backend Route Protection Checklist

### 3.1 Authentication Required
- [ ] `/api/auth/session` requires authentication
- [ ] `/api/stores` requires authentication
- [ ] `/api/transactions` requires authentication
- [ ] `/api/menu-items` requires authentication
- [ ] `/api/inventory` requires authentication
- [ ] `/api/subscriptions` requires authentication
- [ ] `/api/affiliate/me` requires authentication
- [ ] `/api/referrals/me` requires authentication
- [ ] Unauthenticated request returns 401

### 3.2 Permission Required
- [ ] `POST /api/transactions/checkout` requires `can_use_pos`
- [ ] `POST /api/transactions/:id/void` requires `can_void_transaction`
- [ ] `GET /api/transactions` requires `can_view_transaction_history`
- [ ] `POST /api/menu-items` requires `can_manage_products`
- [ ] `POST /api/inventory` requires `can_manage_inventory`
- [ ] `POST /api/stores/:id/cashiers` requires `can_manage_users`
- [ ] `PATCH /api/stores/:id` requires `can_manage_settings`
- [ ] Missing permission returns 403

### 3.3 Admin Required
- [ ] `/api/admin/subscriptions/overview` requires admin
- [ ] `/api/admin/subscriptions/activate` requires admin
- [ ] `/api/admin/subscriptions/:id/cancel` requires admin
- [ ] `/api/admin/affiliates` requires admin
- [ ] `/api/admin/affiliates/:id/status` requires admin
- [ ] `/api/admin/commissions/:id/approve` requires admin
- [ ] `/api/admin/commissions/:id/reject` requires admin
- [ ] `/api/admin/commissions/:id/mark-paid` requires admin
- [ ] Non-admin request returns 403

---

## 4. Frontend Route Guards Checklist

### 4.1 Authentication Guards
- [ ] Unauthenticated user redirected to `/login`
- [ ] Authenticated user can access `/` (dashboard)
- [ ] Authenticated user on auth page redirected to dashboard
- [ ] Loading state shown while checking auth

### 4.2 Role Guards (TODO)
- [ ] Cashier accessing `/admin` redirected to 403 page
- [ ] Cashier accessing `/report` redirected to 403 page
- [ ] Cashier accessing `/settings` redirected to 403 page
- [ ] Owner can access all routes
- [ ] 403 Forbidden page exists

### 4.3 Tab Visibility
- [ ] owner_admin sees all tabs
- [ ] cashier sees limited tabs (pos, loyalty, kitchen, history, performance, challenges)
- [ ] cashier does not see dashboard tab
- [ ] cashier does not see report tab
- [ ] cashier does not see settings tab
- [ ] cashier does not see warehouse tab
- [ ] cashier does not see menu tab
- [ ] Referral tab hidden if feature disabled
- [ ] Affiliate tab hidden if feature disabled

---

## 5. Data Scoping Checklist

### 5.1 Store/Outlet Scoping
- [ ] User can only view own stores
- [ ] User cannot view another user's store
- [ ] Cashier can only view assigned stores
- [ ] Cashier cannot view unassigned stores
- [ ] Transactions scoped by store ownership
- [ ] Menu items scoped by store ownership
- [ ] Inventory scoped by store ownership
- [ ] Kitchen orders scoped by store ownership
- [ ] Loyalty data scoped by store ownership
- [ ] Reports scoped by store ownership

### 5.2 User Data Scoping
- [ ] User can only view own profile
- [ ] User cannot view another user's profile
- [ ] User can only view own subscription
- [ ] User cannot view another user's subscription
- [ ] User can only view own payment history
- [ ] User cannot view another user's payment history
- [ ] User can only view own referral data
- [ ] User cannot view another user's referral data
- [ ] User can only view own affiliate data
- [ ] User cannot view another user's affiliate data

### 5.3 Admin Data Access
- [ ] Admin can view all subscriptions
- [ ] Admin can view all affiliates
- [ ] Admin can view all referrals
- [ ] Admin can view all commissions
- [ ] Admin can view all users
- [ ] Non-admin cannot access admin data

---

## 6. IDOR Vulnerability Checklist

### 6.1 Store Endpoints
- [ ] `GET /api/stores/:id` - Cannot access another user's store
- [ ] `PATCH /api/stores/:id` - Cannot update another user's store
- [ ] `GET /api/stores/:id/cashiers` - Cannot view another store's cashiers
- [ ] `POST /api/stores/:id/cashiers` - Cannot create cashier for another store

### 6.2 Transaction Endpoints
- [ ] `GET /api/transactions` - Cannot view another store's transactions
- [ ] `POST /api/transactions/:id/void` - Cannot void another store's transaction

### 6.3 Menu & Inventory Endpoints
- [ ] `GET /api/menu-items` - Cannot view another store's menu
- [ ] `PATCH /api/menu-items/:id` - Cannot update another store's menu item
- [ ] `GET /api/inventory` - Cannot view another store's inventory
- [ ] `PATCH /api/inventory/:id` - Cannot update another store's inventory item

### 6.4 User Data Endpoints
- [ ] `GET /api/subscriptions` - Cannot view another user's subscription
- [ ] `GET /api/affiliate/me` - Cannot view another user's affiliate data
- [ ] `GET /api/referrals/me` - Cannot view another user's referral data

### 6.5 Admin Endpoints
- [ ] `GET /api/admin/affiliates/:id` - Returns 404 for non-existent ID
- [ ] `GET /api/admin/referrals/:id` - Returns 404 for non-existent ID
- [ ] `GET /api/admin/commissions/:id` - Returns 404 for non-existent ID
- [ ] Admin endpoints require admin role

---

## 7. Affiliate & Referral RBAC Checklist

### 7.1 Referral Access
- [ ] User can view own referral dashboard
- [ ] User cannot view another user's referral dashboard
- [ ] User can generate own referral code
- [ ] User cannot generate referral code for another user
- [ ] Public can track referral clicks (rate limited)
- [ ] Referral click rate limit enforced (120 per 15 min)

### 7.2 Affiliate Access
- [ ] User can view own affiliate dashboard
- [ ] User cannot view another user's affiliate dashboard
- [ ] User can apply for affiliate program
- [ ] User can update own payout info
- [ ] User cannot update another user's payout info
- [ ] Payout info returned masked
- [ ] Affiliate apply rate limit enforced (3 per hour)
- [ ] Payout update rate limit enforced (10 per hour)

### 7.3 Admin Affiliate Access
- [ ] Admin can view all affiliates
- [ ] Admin can view affiliate detail
- [ ] Admin can update affiliate status
- [ ] Admin can view all referrals
- [ ] Admin can view referral detail
- [ ] Admin can view all commissions
- [ ] Admin can approve commission
- [ ] Admin can reject commission (requires note)
- [ ] Admin can mark commission paid
- [ ] Admin cannot approve own commission
- [ ] Commission action rate limit enforced (100 per 15 min)

---

## 8. Password Security Checklist

### 8.1 Password Hashing
- [ ] Password hashed with bcrypt
- [ ] Bcrypt cost factor is 12
- [ ] Password never stored in plain text
- [ ] Password never logged
- [ ] Password never returned in API response

### 8.2 Password Requirements
- [ ] Minimum length 10 characters
- [ ] Password validated on frontend
- [ ] Password validated on backend
- [ ] Weak password rejected

### 8.3 Password Reset Security
- [ ] Reset token hashed (SHA-256) before storage
- [ ] Reset token expires after 60 minutes
- [ ] Reset token is one-time use
- [ ] Reset token not logged
- [ ] Reset token not returned in API response
- [ ] Generic error messages (no info leak)
- [ ] All sessions revoked after reset

---

## 9. Token/Session Security Checklist

### 9.1 Token Generation
- [ ] Token is opaque (32 bytes base64url)
- [ ] Token is cryptographically random
- [ ] Token hashed (SHA-256) before storage
- [ ] Token not predictable

### 9.2 Token Storage
- [ ] Backend: Token hash stored in database
- [ ] Backend: Plain token never stored
- [ ] Frontend: Token stored in localStorage (documented risk)
- [ ] Frontend: Token cleared on logout

### 9.3 Token Validation
- [ ] Token validated on every protected request
- [ ] Token hash compared with database
- [ ] Session expiry checked
- [ ] Session revocation checked
- [ ] Invalid token returns 401
- [ ] Expired token returns 401
- [ ] Revoked token returns 401

### 9.4 Session Security
- [ ] Session TTL configurable (default 30 days)
- [ ] Session last_seen_at updated
- [ ] Session IP address logged
- [ ] Session user agent logged
- [ ] Multiple sessions allowed
- [ ] Logout revokes all sessions

---

## 10. Rate Limiting Checklist

### 10.1 Auth Rate Limits
- [ ] Login: 10 attempts per 15 min per email+IP
- [ ] Register: 5 attempts per 15 min per email+IP
- [ ] Email verification: 20 attempts per 15 min per email+IP
- [ ] Password reset request: 5 attempts per 15 min per email+IP
- [ ] Password reset confirm: 5 attempts per 15 min per email+IP
- [ ] Rate limit returns 429 status
- [ ] Rate limit includes Retry-After header

### 10.2 Other Rate Limits
- [ ] Payment create: 12 attempts per 15 min per user+IP
- [ ] Referral click: 120 attempts per 15 min per IP
- [ ] Admin routes: 1000 attempts per hour per admin
- [ ] Affiliate apply: 3 attempts per hour per user+IP
- [ ] Affiliate payout: 10 attempts per hour per user
- [ ] Commission actions: 100 attempts per 15 min per admin

---

## 11. Admin Action Safety Checklist

### 11.1 Admin Authentication
- [ ] Admin routes require authentication
- [ ] Admin routes require admin check
- [ ] Non-admin returns 403
- [ ] Admin check uses email whitelist

### 11.2 Admin Input Validation
- [ ] All admin inputs validated with Zod
- [ ] Invalid input returns 400 with details
- [ ] SQL injection prevented

### 11.3 Admin Action Logging
- [ ] Subscription activation logged
- [ ] Subscription cancellation logged
- [ ] Affiliate status update logged
- [ ] Commission approve logged
- [ ] Commission reject logged
- [ ] Commission mark paid logged
- [ ] Logs include admin ID
- [ ] Logs include target ID
- [ ] Logs include request ID

### 11.4 Admin Action Safety
- [ ] Admin cannot approve own commission
- [ ] Admin cannot update own affiliate status
- [ ] Commission reject requires note
- [ ] Payout info masked in responses
- [ ] Safe error messages

---

## 12. Frontend Security Checklist

### 12.1 Auth State
- [ ] Auth state managed in React Context
- [ ] Auth state persisted in localStorage
- [ ] Auth state cleared on logout
- [ ] Auth state validated on load
- [ ] Expired session redirects to login

### 12.2 Permission Checks
- [ ] `can(permission)` helper used before rendering features
- [ ] `canAccessTab(role, tab)` used for navigation
- [ ] Unauthorized features hidden
- [ ] Backend is source of truth (frontend checks are UX only)

### 12.3 XSS Protection
- [ ] No `dangerouslySetInnerHTML` usage
- [ ] User input sanitized
- [ ] CSP headers recommended (TODO)
- [ ] localStorage XSS risk documented

### 12.4 Error Handling
- [ ] 401 redirects to login
- [ ] 403 shows forbidden message (TODO: dedicated page)
- [ ] Generic error messages shown to user
- [ ] Detailed errors logged to console (dev only)

---

## 13. Testing Scenarios

### 13.1 Authentication Tests
1. **Test**: Login with valid credentials
   - **Expected**: Success, redirected to dashboard

2. **Test**: Login with invalid password
   - **Expected**: Generic error, no info leak

3. **Test**: Login 11 times with same email
   - **Expected**: 10 succeed, 11th returns 429

4. **Test**: Logout and try to access protected route
   - **Expected**: 401, redirected to login

5. **Test**: Password reset with expired token
   - **Expected**: Error, token invalid

### 13.2 Authorization Tests
1. **Test**: Cashier tries to access `/api/admin/subscriptions`
   - **Expected**: 403 Forbidden

2. **Test**: Cashier tries to void transaction
   - **Expected**: 403 Forbidden (missing permission)

3. **Test**: Owner tries to void transaction
   - **Expected**: Success

4. **Test**: Non-admin tries to approve commission
   - **Expected**: 403 Forbidden

5. **Test**: Admin tries to approve commission
   - **Expected**: Success

### 13.3 IDOR Tests
1. **Test**: User A tries to access User B's store
   - **Expected**: 404 or empty result (query scoping)

2. **Test**: User A tries to view User B's transactions
   - **Expected**: Empty result (query scoping)

3. **Test**: User A tries to update User B's menu item
   - **Expected**: 404 (ownership check)

4. **Test**: User A tries to view User B's affiliate data
   - **Expected**: 404 or 403 (user scoping)

5. **Test**: Cashier tries to access unassigned store
   - **Expected**: 404 or empty result (assignment check)

### 13.4 Rate Limiting Tests
1. **Test**: Send 11 login requests in 15 minutes
   - **Expected**: 10 succeed, 11th returns 429

2. **Test**: Send 4 affiliate applications in 1 hour
   - **Expected**: 3 succeed, 4th returns 429

3. **Test**: Send 121 referral clicks in 15 minutes
   - **Expected**: 120 succeed, 121st returns 429

---

## 14. Acceptance Criteria

### Must Have (Production Blocker)
- ✅ Authentication required on all protected routes
- ✅ Permission checks on all feature routes
- ✅ Admin checks on all admin routes
- ✅ Store ownership verified on all store operations
- ✅ User data scoped by user ID
- ✅ Rate limiting on auth endpoints
- ✅ Password hashed with bcrypt
- ✅ Token hashed before storage
- ✅ Session expiry enforced
- ✅ IDOR prevention through query scoping

### Should Have (High Priority)
- ⚠️ Frontend role guards (redirect unauthorized users)
- ⚠️ 403 Forbidden page
- ⚠️ localStorage XSS risk documented
- ⚠️ Admin action logging verified
- ⚠️ IDOR tests added

### Nice to Have (Future)
- ⚠️ Refresh token implementation
- ⚠️ httpOnly cookies for token storage
- ⚠️ CSP headers
- ⚠️ More granular admin permissions

---

## 15. Sign-Off

### Development Team
- [ ] All code changes reviewed
- [ ] All tests passing
- [ ] Documentation updated
- [ ] QA checklist completed

### QA Team
- [ ] Manual testing completed
- [ ] Authentication verified
- [ ] Authorization verified
- [ ] RBAC verified
- [ ] IDOR tests verified
- [ ] Rate limiting verified

### Security Team
- [ ] Password security verified
- [ ] Token security verified
- [ ] Session security verified
- [ ] IDOR prevention verified
- [ ] Admin action safety verified

### Product Team
- [ ] Feature requirements met
- [ ] User experience validated
- [ ] Production readiness confirmed

---

**Last Updated**: 2026-05-14
**Maintained By**: Engineering Team
**Review Frequency**: Before each production deployment

