# KaffePOS RBAC Permission Matrix

Version: 1.0
Date: 2026-05-14
Status: Source of Truth for Authorization

## 1. Overview

This document defines the Role-Based Access Control (RBAC) permission matrix for KaffePOS, mapping roles to permissions and features.

## 2. Role Definitions

### 2.1 Current Roles

| Role | Code | Description | Access Level |
|------|------|-------------|--------------|
| **Owner/Admin** | `owner_admin` | Business owner or admin with full access | Full access to all features |
| **Cashier** | `cashier` | POS operator with limited access | POS, kitchen, limited reports |

### 2.2 Admin Access

**Admin** is not a role but an **email whitelist** defined in `ADMIN_EMAILS` environment variable.

**Admin users have**:
- All `owner_admin` permissions
- Access to `/api/admin/*` routes
- Access to internal admin panel
- Ability to manage all users, subscriptions, affiliates, commissions

**Admin check**: `isAdminUser(user)` checks if user email is in admin whitelist.

### 2.3 Affiliate Access

**Affiliate** is not a role but a **status** in `affiliate_profiles` table.

**Affiliate users have**:
- All permissions of their base role (owner_admin or cashier)
- Access to affiliate dashboard if `affiliate_profiles.status = 'active'`
- Access to own affiliate data only
- Cannot access other affiliate data

### 2.4 Future Roles (Not Implemented)

| Role | Purpose | Priority |
|------|---------|----------|
| `manager` | Multi-outlet manager | Medium |
| `super_admin` | Platform administrator | Low |
| `support_admin` | Customer support | Low |
| `finance_admin` | Financial operations | Low |

---

## 3. Permission Definitions

### 3.1 All Permissions

| Permission | Code | Description |
|------------|------|-------------|
| **Dashboard** | `can_view_dashboard` | View business dashboard |
| **POS** | `can_use_pos` | Access POS and create transactions |
| **Reports** | `can_view_reports` | View sales and business reports |
| **Settings** | `can_manage_settings` | Manage store settings |
| **Billing** | `can_manage_billing` | Manage subscription and billing |
| **Products** | `can_manage_products` | Create, update, delete menu items |
| **Inventory** | `can_manage_inventory` | Manage inventory and stock |
| **Users** | `can_manage_users` | Manage cashiers and staff |
| **Theme** | `can_manage_theme` | Customize app theme |
| **Printer** | `can_manage_printer` | Configure printer settings |
| **Kitchen View** | `can_view_kitchen` | View kitchen orders |
| **Kitchen Status** | `can_manage_kitchen_status` | Update kitchen order status |
| **Transaction History** | `can_view_transaction_history` | View past transactions |
| **Print Receipt** | `can_print_receipt` | Print transaction receipts |
| **Apply Discount** | `can_apply_discount` | Apply discounts to transactions |
| **Void Transaction** | `can_void_transaction` | Void/cancel transactions |

---

## 4. Role-Permission Matrix

### 4.1 Permission Assignment

| Permission | owner_admin | cashier | Notes |
|------------|-------------|---------|-------|
| `can_view_dashboard` | ✅ | ❌ | Dashboard shows business metrics |
| `can_use_pos` | ✅ | ✅ | Core POS functionality |
| `can_view_reports` | ✅ | ❌ | Sales, profit, inventory reports |
| `can_manage_settings` | ✅ | ❌ | Store settings, tax, receipt |
| `can_manage_billing` | ✅ | ❌ | Subscription, payment |
| `can_manage_products` | ✅ | ❌ | Menu items, categories |
| `can_manage_inventory` | ✅ | ❌ | Stock, adjustments, imports |
| `can_manage_users` | ✅ | ❌ | Cashier management |
| `can_manage_theme` | ✅ | ❌ | App theme customization |
| `can_manage_printer` | ✅ | ❌ | Printer configuration |
| `can_view_kitchen` | ✅ | ✅ | Kitchen display system |
| `can_manage_kitchen_status` | ✅ | ✅ | Update order status |
| `can_view_transaction_history` | ✅ | ✅ | View past transactions |
| `can_print_receipt` | ✅ | ✅ | Print receipts |
| `can_apply_discount` | ✅ | ✅ | Apply discounts |
| `can_void_transaction` | ✅ | ❌ | Void transactions |

---

## 5. Feature-Permission Matrix

### 5.1 Authentication & Profile

| Feature | API Endpoint | owner_admin | cashier | Admin | Notes |
|---------|--------------|-------------|---------|-------|-------|
| Login | `POST /api/auth/login` | ✅ | ✅ | ✅ | Public |
| Register | `POST /api/auth/register` | ✅ | ❌ | ✅ | Public |
| Logout | `POST /api/auth/logout` | ✅ | ✅ | ✅ | Authenticated |
| Password Reset | `POST /api/auth/password/forgot` | ✅ | ✅ | ✅ | Public |
| Email Verification | `POST /api/auth/verification/confirm` | ✅ | ✅ | ✅ | Public |
| View Own Profile | `GET /api/auth/session` | ✅ | ✅ | ✅ | Authenticated |
| Update Own Profile | `PATCH /api/profile/me` | ✅ | ✅ | ✅ | Authenticated |

### 5.2 POS & Transactions

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View POS | Frontend `/pos` | ✅ | ✅ | ✅ | `can_use_pos` |
| Create Transaction | `POST /api/transactions/checkout` | ✅ | ✅ | ✅ | `can_use_pos` |
| View Transaction History | `GET /api/transactions` | ✅ | ✅ | ✅ | `can_view_transaction_history` |
| Void Transaction | `POST /api/transactions/:id/void` | ✅ | ❌ | ✅ | `can_void_transaction` |
| Print Receipt | Frontend action | ✅ | ✅ | ✅ | `can_print_receipt` |
| Apply Discount | Frontend action | ✅ | ✅ | ✅ | `can_apply_discount` |

**Scoping**: All transactions scoped by `store_id` and ownership/assignment.

### 5.3 Products & Menu

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Menu Items | `GET /api/menu-items` | ✅ | ✅ | ✅ | None (store-scoped) |
| Create Menu Item | `POST /api/menu-items` | ✅ | ❌ | ✅ | `can_manage_products` |
| Update Menu Item | `PATCH /api/menu-items/:id` | ✅ | ❌ | ✅ | `can_manage_products` |
| Delete Menu Item | `DELETE /api/menu-items/:id` | ✅ | ❌ | ✅ | `can_manage_products` |

**Scoping**: All menu items scoped by `store_id` and ownership.

### 5.4 Inventory

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Inventory | `GET /api/inventory` | ✅ | ✅ | ✅ | None (store-scoped) |
| Create Inventory Item | `POST /api/inventory` | ✅ | ❌ | ✅ | `can_manage_inventory` |
| Update Inventory Item | `PATCH /api/inventory/:id` | ✅ | ❌ | ✅ | `can_manage_inventory` |
| Delete Inventory Item | `DELETE /api/inventory/:id` | ✅ | ❌ | ✅ | `can_manage_inventory` |
| Bulk Import | `POST /api/inventory/bulk-import` | ✅ | ❌ | ✅ | `can_manage_inventory` |
| Stock Adjustment | `POST /api/inventory/:id/adjust` | ✅ | ❌ | ✅ | `can_manage_inventory` |

**Scoping**: All inventory scoped by `store_id` and ownership.

### 5.5 Store & Settings

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Store | `GET /api/stores` | ✅ | ✅ | ✅ | None (ownership-scoped) |
| Create Store | `POST /api/stores` | ✅ | ❌ | ✅ | `can_manage_settings` |
| Update Store | `PATCH /api/stores/:id` | ✅ | ❌ | ✅ | `can_manage_settings` |
| View Cashiers | `GET /api/stores/:id/cashiers` | ✅ | ❌ | ✅ | `can_manage_users` |
| Create Cashier | `POST /api/stores/:id/cashiers` | ✅ | ❌ | ✅ | `can_manage_users` |
| Update Cashier | `PATCH /api/stores/:id/cashiers/:cashierId` | ✅ | ❌ | ✅ | `can_manage_users` |
| Delete Cashier | `DELETE /api/stores/:id/cashiers/:cashierId` | ✅ | ❌ | ✅ | `can_manage_users` |

**Scoping**: Stores scoped by `owner_id` or cashier assignment.

### 5.6 Kitchen Orders

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Kitchen Orders | `GET /api/kitchen/orders` | ✅ | ✅ | ✅ | `can_view_kitchen` |
| Update Order Status | `PATCH /api/kitchen/orders/:id/status` | ✅ | ✅ | ✅ | `can_manage_kitchen_status` |
| Update Item Status | `PATCH /api/kitchen/orders/:id/items/:itemId/status` | ✅ | ✅ | ✅ | `can_manage_kitchen_status` |

**Scoping**: Kitchen orders scoped by `store_id` and ownership/assignment.

### 5.7 Reports & Analytics

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Dashboard | Frontend `/dashboard` | ✅ | ❌ | ✅ | `can_view_dashboard` |
| View Reports | Frontend `/report` | ✅ | ❌ | ✅ | `can_view_reports` |
| Export PDF | Frontend action | ✅ | ❌ | ✅ | `can_view_reports` + subscription |
| Export CSV | Frontend action | ✅ | ❌ | ✅ | `can_view_reports` + subscription |

**Scoping**: Reports scoped by `store_id` and ownership.

### 5.8 Subscription & Billing

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Subscription | `GET /api/subscriptions` | ✅ | ❌ | ✅ | `can_manage_billing` |
| Create Payment | `POST /api/subscriptions/payments/create` | ✅ | ❌ | ✅ | `can_manage_billing` |
| View Payment History | `GET /api/subscriptions/payments` | ✅ | ❌ | ✅ | `can_manage_billing` |

**Scoping**: Subscriptions scoped by `user_id`.

### 5.9 Loyalty Program

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Loyalty Settings | `GET /api/loyalty/settings` | ✅ | ✅ | ✅ | None (store-scoped) |
| Update Loyalty Settings | `PATCH /api/loyalty/settings` | ✅ | ❌ | ✅ | `can_manage_settings` |
| View Customers | `GET /api/loyalty/customers` | ✅ | ✅ | ✅ | None (store-scoped) |
| Create Customer | `POST /api/loyalty/customers` | ✅ | ✅ | ✅ | `can_use_pos` |
| Add Stamps | `POST /api/loyalty/stamps` | ✅ | ✅ | ✅ | `can_use_pos` |
| Redeem Reward | `POST /api/loyalty/redemptions` | ✅ | ✅ | ✅ | `can_use_pos` |

**Scoping**: Loyalty data scoped by `store_id` and ownership/assignment.

### 5.10 Challenges & Gamification

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Challenges | `GET /api/challenges` | ✅ | ✅ | ✅ | None (store-scoped) |
| View Own Progress | `GET /api/challenges/progress` | ✅ | ✅ | ✅ | None (user-scoped) |
| Update Progress | System automatic | ✅ | ✅ | ✅ | Triggered by transactions |

**Scoping**: Challenges scoped by `store_id`, progress scoped by `user_id`.

### 5.11 Referral Program

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Own Referral Dashboard | `GET /api/referrals/me` | ✅ | ✅ | ✅ | None (user-scoped) |
| Generate Referral Code | `POST /api/referrals/generate` | ✅ | ✅ | ✅ | None (user-scoped) |
| Track Referral Click | `GET /api/ref/:code` | Public | Public | Public | Rate limited |

**Scoping**: Referral data scoped by `user_id`.

### 5.12 Affiliate Program

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Own Affiliate Dashboard | `GET /api/affiliate/me` | ✅ | ✅ | ✅ | None (user-scoped) |
| Apply for Affiliate | `POST /api/affiliate/apply` | ✅ | ✅ | ✅ | None (user-scoped) |
| Update Own Payout Info | `PATCH /api/affiliate/me/payout` | ✅ | ✅ | ✅ | None (user-scoped) |

**Scoping**: Affiliate data scoped by `user_id`.

### 5.13 Admin Operations

| Feature | API Endpoint | owner_admin | cashier | Admin | Permission |
|---------|--------------|-------------|---------|-------|------------|
| View Admin Dashboard | Frontend `/admin` | ❌ | ❌ | ✅ | Admin only |
| View All Subscriptions | `GET /api/admin/subscriptions/overview` | ❌ | ❌ | ✅ | Admin only |
| Activate Subscription | `POST /api/admin/subscriptions/activate` | ❌ | ❌ | ✅ | Admin only |
| Cancel Subscription | `POST /api/admin/subscriptions/:id/cancel` | ❌ | ❌ | ✅ | Admin only |
| View All Affiliates | `GET /api/admin/affiliates` | ❌ | ❌ | ✅ | Admin only |
| View Affiliate Detail | `GET /api/admin/affiliates/:id` | ❌ | ❌ | ✅ | Admin only |
| Update Affiliate Status | `PATCH /api/admin/affiliates/:id/status` | ❌ | ❌ | ✅ | Admin only |
| View All Referrals | `GET /api/admin/referrals` | ❌ | ❌ | ✅ | Admin only |
| View Referral Detail | `GET /api/admin/referrals/:id` | ❌ | ❌ | ✅ | Admin only |
| View All Commissions | `GET /api/admin/commissions` | ❌ | ❌ | ✅ | Admin only |
| View Commission Detail | `GET /api/admin/commissions/:id` | ❌ | ❌ | ✅ | Admin only |
| Approve Commission | `PATCH /api/admin/commissions/:id/approve` | ❌ | ❌ | ✅ | Admin only |
| Reject Commission | `PATCH /api/admin/commissions/:id/reject` | ❌ | ❌ | ✅ | Admin only |
| Mark Commission Paid | `PATCH /api/admin/commissions/:id/mark-paid` | ❌ | ❌ | ✅ | Admin only |

**Scoping**: Admin routes have no scoping (access all data).

---

## 6. Frontend Tab Access

### 6.1 Tab Visibility by Role

| Tab | owner_admin | cashier | Notes |
|-----|-------------|---------|-------|
| Dashboard | ✅ | ❌ | Business metrics |
| Performance | ✅ | ✅ | Personal performance |
| Challenges | ✅ | ✅ | Gamification |
| Referrals | ✅ | ❌ | Referral program (feature flag) |
| Affiliate | ✅ | ❌ | Affiliate program (feature flag) |
| POS | ✅ | ✅ | Point of sale |
| Loyalty | ✅ | ✅ | Kopi Passport |
| Kitchen | ✅ | ✅ | Kitchen display |
| Warehouse | ✅ | ❌ | Inventory management |
| Menu | ✅ | ❌ | Menu management |
| History | ✅ | ✅ | Transaction history |
| Report | ✅ | ❌ | Sales reports |
| Settings | ✅ | ❌ | Store settings |

**Implementation**: `getVisibleTabs(role)` in `src/lib/accessControl.ts`

---

## 7. Data Scoping Rules

### 7.1 Store/Outlet Scoping

**Rule**: Users can only access data for stores they own or are assigned to.

**Implementation**:
- `assertStoreOwned(client, storeId, userId)` - Verifies ownership or assignment
- Queries filtered by: `where store_id = $1 and (owner_id = $2 or exists (cashier assignment))`

**Applies to**:
- Transactions
- Menu items
- Inventory
- Kitchen orders
- Loyalty data
- Challenges
- Reports

### 7.2 User Data Scoping

**Rule**: Users can only access their own user data.

**Implementation**:
- Queries filtered by: `where user_id = $1`
- Profile updates: `where id = $1` (authenticated user ID)

**Applies to**:
- Profile
- Subscription
- Payment history
- Referral data
- Affiliate data
- Challenge progress

### 7.3 Admin Data Access

**Rule**: Admin users can access all data (no scoping).

**Implementation**:
- Admin routes: `/api/admin/*`
- No scoping filters applied
- Admin check: `requireAdmin` middleware

**Applies to**:
- All subscriptions
- All affiliates
- All referrals
- All commissions
- All users

---

## 8. IDOR Prevention

### 8.1 Strategy

**Primary Defense**: Query scoping by ownership/assignment

**Secondary Defense**: Explicit ownership checks

**Implementation**:
1. All queries filtered by `store_id` + `owner_id` or cashier assignment
2. `assertStoreOwned()` verifies ownership before operations
3. User data queries filtered by `user_id` (authenticated user)
4. Admin routes have no scoping (admin can access all)

### 8.2 Protected Endpoints

| Endpoint Pattern | Protection | Implementation |
|------------------|------------|----------------|
| `/api/stores/:id` | Ownership check | `assertStoreOwned()` |
| `/api/transactions` | Query scoping | `where store_id = $1 and owner_id = $2` |
| `/api/menu-items` | Query scoping | `where store_id = $1 and owner_id = $2` |
| `/api/inventory` | Query scoping | `where store_id = $1 and owner_id = $2` |
| `/api/subscriptions` | Query scoping | `where user_id = $1` |
| `/api/affiliate/me` | Query scoping | `where user_id = $1` |
| `/api/referrals/me` | Query scoping | `where user_id = $1` |
| `/api/admin/*` | Admin only | `requireAdmin` middleware |

### 8.3 Testing

See `docs/engineering/AUTH_RBAC_QA_CHECKLIST.md` for IDOR test scenarios.

---

## 9. Rate Limiting

### 9.1 Auth Endpoints

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| Login | 10 | 15 min | email + IP |
| Register | 5 | 15 min | email + IP |
| Email Verification | 20 | 15 min | email + IP |
| Password Reset Request | 5 | 15 min | email + IP |
| Password Reset Confirm | 5 | 15 min | email + IP |

### 9.2 Other Endpoints

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| Payment Create | 12 | 15 min | user + IP |
| Referral Click | 120 | 15 min | IP |
| Admin Routes | 1000 | 60 min | admin user |
| Affiliate Apply | 3 | 60 min | user + IP |
| Affiliate Payout Update | 10 | 60 min | user |
| Commission Actions | 100 | 15 min | admin user |

---

## 10. Security Best Practices

### 10.1 Backend

1. ✅ **Always authenticate**: Use `authenticate` middleware on protected routes
2. ✅ **Check permissions**: Use `requirePermission(permission)` for feature access
3. ✅ **Verify ownership**: Use `assertStoreOwned()` for store-scoped operations
4. ✅ **Scope queries**: Filter by `store_id` + `owner_id` or `user_id`
5. ✅ **Validate input**: Use Zod schemas for all inputs
6. ✅ **Log admin actions**: Include admin ID, target ID, request ID
7. ✅ **Rate limit**: Apply rate limiting to sensitive endpoints
8. ✅ **Safe errors**: Return generic error messages, log details server-side

### 10.2 Frontend

1. ✅ **Check authentication**: Redirect unauthenticated users to login
2. ⚠️ **Check role**: Redirect unauthorized users to 403 page (TODO)
3. ✅ **Check permissions**: Use `can(permission)` before rendering features
4. ✅ **Check tab access**: Use `canAccessTab(role, tab)` for navigation
5. ✅ **Trust backend**: Frontend checks are UX only, backend is source of truth
6. ⚠️ **Handle 403**: Show user-friendly forbidden page (TODO)

---

## 11. Implementation References

### 11.1 Backend

- **Access Control**: `backend/src/lib/accessControl.ts`
- **Auth Middleware**: `backend/src/core/middleware.ts`
- **Session Management**: `backend/src/core/session.ts`
- **Store Ownership**: `backend/src/core/helpers.ts` (`assertStoreOwned`)
- **Cashier Management**: `backend/src/lib/cashierManagement.ts`

### 11.2 Frontend

- **Access Control**: `src/lib/accessControl.ts`
- **Auth Context**: `src/contexts/AuthContext.tsx`
- **Auth Session**: `src/lib/authSession.ts`
- **Route Guards**: `src/App.tsx`

---

## 12. Changelog

### 2026-05-14 - v1.0
- Initial RBAC permission matrix
- Documented all roles, permissions, features
- Mapped permissions to API endpoints
- Documented data scoping rules
- Documented IDOR prevention strategy
- Documented rate limiting rules

---

**Last Updated**: 2026-05-14
**Maintained By**: Engineering Team
**Review Frequency**: After each role/permission change

