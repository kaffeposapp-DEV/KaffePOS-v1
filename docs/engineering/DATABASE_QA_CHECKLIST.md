# Database QA Checklist

Version: 1.0
Date: 2026-05-14
Status: Manual testing checklist for database integrity

## Overview

This checklist is used to manually verify database schema integrity, constraints, indexes, and data safety. Use this checklist when:
- Deploying new migrations
- Auditing database health
- Troubleshooting data integrity issues
- Preparing for production deployment

---

## 1. Migration System Validation

### Migration Runner
- [ ] Migration script exists: `backend/scripts/run-migrations.mjs`
- [ ] Migration command works: `npm run migrate`
- [ ] Migration folder exists: `backend/migrations/`
- [ ] Migrations follow naming convention: `YYYYMMDD_NNNN_description.sql`

### Migration Tracking
- [ ] `schema_migrations` table exists
- [ ] `schema_migrations` has columns: version, name, checksum, applied_at
- [ ] All applied migrations have checksums
- [ ] No duplicate migration versions

### Migration Safety
- [ ] All migrations use `IF NOT EXISTS` for CREATE statements
- [ ] All migrations use `DROP IF EXISTS` before adding constraints
- [ ] No migrations drop columns without compatibility plan
- [ ] No migrations rename columns without migration strategy
- [ ] All migrations have rollback plan documented

---

## 2. Core Tables Validation

### Authentication Tables
- [ ] `profiles` table exists
- [ ] `app_auth_credentials` table exists
- [ ] `app_auth_sessions` table exists
- [ ] `app_password_reset_tokens` table exists
- [ ] `cashier_outlet_assignments` table exists

### Store & Product Tables
- [ ] `stores` table exists
- [ ] `menu_items` table exists
- [ ] `inventory` table exists
- [ ] `inventory_unit_conversions` table exists

### Transaction Tables
- [ ] `transactions` table exists
- [ ] `transaction_items` table exists
- [ ] `transaction_inventory_audit` table exists

### Payment Tables
- [ ] `payment_orders` table exists
- [ ] `payment_attempt_logs` table exists
- [ ] `payment_webhook_logs` table exists

### Subscription Tables
- [ ] `subscriptions` table exists
- [ ] `subscription_payment_sessions` table exists

---

## 3. Affiliate & Referral Tables Validation

### Referral Tables
- [ ] `referral_codes` table exists
- [ ] `referral_clicks` table exists
- [ ] `referral_registrations` table exists

### Affiliate Tables
- [ ] `affiliate_profiles` table exists
- [ ] `commission_transactions` table exists
- [ ] `commission_payouts` table exists
- [ ] `affiliate_terms_acceptances` table exists

---

## 4. Data Integrity Constraints

### Self-Referral Prevention
- [ ] `referral_registrations` has constraint: `referrer_user_id != referred_user_id`
- [ ] Test: Cannot insert referral where referrer = referred

### Numeric Constraints - Transactions
- [ ] `transactions.total >= 0`
- [ ] `transactions.subtotal >= 0`
- [ ] `transactions.discount >= 0`
- [ ] `transactions.tax >= 0`
- [ ] `transactions.paid >= 0`
- [ ] `transactions.change >= 0`
- [ ] Test: Cannot insert negative transaction amounts

### Numeric Constraints - Transaction Items
- [ ] `transaction_items.qty > 0`
- [ ] `transaction_items.price >= 0`
- [ ] Test: Cannot insert zero or negative quantity
- [ ] Test: Cannot insert negative price

### Numeric Constraints - Menu Items
- [ ] `menu_items.price >= 0`
- [ ] Test: Cannot insert negative menu item price

### Numeric Constraints - Inventory
- [ ] `inventory.cost_per_unit >= 0`
- [ ] Test: Cannot insert negative cost

### Numeric Constraints - Payments
- [ ] `payment_orders.gross_amount > 0`
- [ ] `payment_orders.subtotal >= 0`
- [ ] `payment_orders.discount_amount >= 0`
- [ ] `payment_orders.tax_amount >= 0`
- [ ] Test: Cannot insert zero or negative gross amount

### Numeric Constraints - Commissions
- [ ] `commission_transactions.amount >= 0`
- [ ] `commission_payouts.total_amount >= 0`
- [ ] `affiliate_profiles.commission_rate` BETWEEN 0 AND 100
- [ ] Test: Cannot insert negative commission amounts

### Numeric Constraints - Loyalty
- [ ] `loyalty_passports.points >= 0`
- [ ] `loyalty_passports.stamps >= 0`
- [ ] Test: Cannot insert negative points/stamps

### Numeric Constraints - Challenges
- [ ] `challenges.target_value > 0`
- [ ] `user_challenge_progress.current_value >= 0`
- [ ] Test: Cannot insert zero or negative target

### Numeric Constraints - Unit Conversions
- [ ] `inventory_unit_conversions.conversion_ratio > 0`
- [ ] Test: Cannot insert zero or negative conversion ratio

---

## 5. Date Constraints

### Subscription Dates
- [ ] `subscriptions`: `expires_at >= activated_at` (when both not null)
- [ ] Test: Cannot insert subscription with expires_at before activated_at

### Referral Registration Dates
- [ ] `trial_started_at >= registered_at` (when not null)
- [ ] `first_payment_at >= trial_started_at` (when not null)
- [ ] `eligible_at >= first_payment_at` (when not null)
- [ ] Test: Cannot insert dates out of order

### Commission Transaction Dates
- [ ] `approved_at >= eligible_at` (when not null)
- [ ] `paid_at >= approved_at` (when not null)
- [ ] Test: Cannot insert dates out of order

---

## 6. Status Constraints

### User Status
- [ ] `profiles.role` IN ('owner_admin', 'cashier')
- [ ] `profiles.account_status` IN ('active', 'inactive')
- [ ] Test: Cannot insert invalid role
- [ ] Test: Cannot insert invalid account_status

### Cashier Assignment Status
- [ ] `cashier_outlet_assignments.status` IN ('active', 'inactive')
- [ ] Test: Cannot insert invalid status

### Payment Status
- [ ] `payment_orders.status` IN ('pending', 'paid', 'completed', 'failed', 'cancelled')
- [ ] Test: Cannot insert invalid payment status

### Referral Code Type
- [ ] `referral_codes.type` IN ('customer_referral', 'affiliate')
- [ ] Test: Cannot insert invalid type

### Referral Registration Status
- [ ] `referral_registrations.status` IN ('registered', 'trial_started', 'paid', 'eligible', 'rewarded', 'rejected', 'cancelled')
- [ ] Test: Cannot insert invalid status

### Affiliate Status
- [ ] `affiliate_profiles.status` IN ('pending', 'active', 'suspended', 'rejected')
- [ ] Test: Cannot insert invalid affiliate status

### Commission Status
- [ ] `commission_transactions.status` IN ('pending', 'eligible', 'approved', 'rejected', 'paid', 'cancelled')
- [ ] Test: Cannot insert invalid commission status

### Commission Type
- [ ] `commission_transactions.type` IN ('referral_credit', 'affiliate_cash')
- [ ] Test: Cannot insert invalid commission type

### Payout Status
- [ ] `commission_payouts.status` IN ('pending', 'processing', 'paid', 'failed')
- [ ] Test: Cannot insert invalid payout status

---

## 7. Idempotency Protections

### Commission Idempotency
- [ ] Unique index exists: `commission_transactions_referral_payment_type_unique_idx`
- [ ] Unique index exists: `commission_transactions_referral_type_null_payment_unique_idx`
- [ ] Test: Cannot insert duplicate commission for same referral+payment+type
- [ ] Test: Cannot insert duplicate commission for same referral+type (null payment)

### Referral Registration Idempotency
- [ ] Unique index exists: `referral_registrations_referred_user_unique_idx`
- [ ] Test: Cannot insert duplicate referral registration for same referred_user_id

### Affiliate Profile Idempotency
- [ ] Unique index exists: `affiliate_profiles_user_id_unique_idx`
- [ ] Test: Cannot insert duplicate affiliate profile for same user

### Referral Code Idempotency
- [ ] Unique index exists: `referral_codes_code_unique_idx`
- [ ] Unique index exists: `referral_codes_user_type_unique_idx`
- [ ] Test: Cannot insert duplicate referral code
- [ ] Test: Cannot insert duplicate user+type combination

### Payment Idempotency
- [ ] Unique index exists: `payment_orders_midtrans_order_id_key`
- [ ] Test: Cannot insert duplicate Midtrans order_id

### Email Uniqueness
- [ ] Unique index exists: `app_auth_credentials_email_unique_idx`
- [ ] Test: Cannot insert duplicate email (case-insensitive)

### Session Token Uniqueness
- [ ] Unique index exists: `app_auth_sessions_token_hash_unique_idx`
- [ ] Test: Cannot insert duplicate active session token

### Password Reset Token Uniqueness
- [ ] Unique index exists: `app_password_reset_tokens_token_hash_unique_idx`
- [ ] Test: Cannot insert duplicate unconsumed reset token

---

## 8. Foreign Key Constraints

### Financial Records (RESTRICT)
- [ ] `referral_codes.user_id` → profiles (RESTRICT)
- [ ] `referral_registrations.referral_code_id` → referral_codes (RESTRICT)
- [ ] `referral_registrations.referrer_user_id` → profiles (RESTRICT)
- [ ] `referral_registrations.referred_user_id` → profiles (RESTRICT)
- [ ] `affiliate_profiles.user_id` → profiles (RESTRICT)
- [ ] `commission_transactions.referral_registration_id` → referral_registrations (RESTRICT)
- [ ] `commission_transactions.referrer_user_id` → profiles (RESTRICT)
- [ ] `commission_transactions.referred_user_id` → profiles (RESTRICT)
- [ ] `commission_payouts.affiliate_profile_id` → affiliate_profiles (RESTRICT)
- [ ] Test: Cannot delete user with referral records
- [ ] Test: Cannot delete referral code with registrations

### Operational Data (CASCADE)
- [ ] `cashier_outlet_assignments.owner_id` → profiles (CASCADE)
- [ ] `cashier_outlet_assignments.cashier_id` → profiles (CASCADE)
- [ ] `cashier_outlet_assignments.store_id` → stores (CASCADE)
- [ ] Test: Deleting user cascades to cashier assignments

### Audit Logs (SET NULL)
- [ ] `payment_attempt_logs.user_id` → profiles (SET NULL)
- [ ] `payment_webhook_logs.payment_order_id` → payment_orders (SET NULL)
- [ ] Test: Deleting user sets audit log user_id to NULL

### Risky CASCADE (Review)
- [ ] `referral_clicks.referral_code_id` → referral_codes (CASCADE)
- [ ] Document: Is this intentional? Should it be RESTRICT?

---

## 9. Index Coverage

### Authentication Indexes
- [ ] Index exists: `app_auth_credentials_email_unique_idx`
- [ ] Index exists: `app_auth_sessions_token_hash_unique_idx`
- [ ] Index exists: `app_auth_sessions_user_active` (user_id, expires_at)

### Transaction Indexes
- [ ] Index exists: `idx_transactions_store_date`
- [ ] Index exists: `idx_transactions_store_void_date`
- [ ] Index exists: `idx_transactions_store_method`
- [ ] Index exists: `idx_transactions_valid_only` (partial, is_void = false)

### Inventory Indexes
- [ ] Index exists: `idx_inventory_store_low_stock` (partial)
- [ ] Index exists: `idx_inventory_store_active_updated`

### Menu Item Indexes
- [ ] Index exists: `idx_menu_items_store_available_category`
- [ ] Index exists: `idx_menu_items_store_name`
- [ ] Index exists: `idx_menu_items_active_only` (partial)

### Kitchen Order Indexes
- [ ] Index exists: `idx_kitchen_orders_store_status_updated` (partial)
- [ ] Index exists: `idx_kitchen_orders_transaction`
- [ ] Index exists: `idx_kitchen_orders_active_only` (partial)

### Loyalty Indexes
- [ ] Index exists: `idx_loyalty_passports_phone`
- [ ] Index exists: `idx_loyalty_stamp_events_passport_date`
- [ ] Index exists: `idx_loyalty_redemptions_passport_date`

### Subscription Indexes
- [ ] Index exists: `idx_subscriptions_user_status`
- [ ] Index exists: `idx_subscriptions_expires` (partial, status = 'active')
- [ ] Index exists: `idx_subscriptions_plan_status`

### Payment Indexes
- [ ] Index exists: `payment_orders_user_created_idx`
- [ ] Index exists: `payment_orders_store_status_idx`
- [ ] Index exists: `payment_orders_midtrans_order_id_idx`
- [ ] Index exists: `idx_payment_sessions_user_created`
- [ ] Index exists: `idx_payment_sessions_status_created`

### Notification Indexes
- [ ] Index exists: `idx_notifications_user_unread_created`
- [ ] Index exists: `idx_notifications_user_type_created`

### Referral Indexes
- [ ] Index exists: `referral_codes_code_unique_idx`
- [ ] Index exists: `referral_codes_user_type_unique_idx`
- [ ] Index exists: `referral_codes_user_id_idx`
- [ ] Index exists: `referral_clicks_referral_code_id_idx`
- [ ] Index exists: `referral_clicks_clicked_at_idx`
- [ ] Index exists: `referral_registrations_referred_user_unique_idx`
- [ ] Index exists: `referral_registrations_referrer_user_id_idx`
- [ ] Index exists: `referral_registrations_status_idx`

### Affiliate Indexes
- [ ] Index exists: `affiliate_profiles_user_id_unique_idx`
- [ ] Index exists: `affiliate_profiles_affiliate_code_unique_idx`
- [ ] Index exists: `affiliate_profiles_status_idx`

### Commission Indexes
- [ ] Index exists: `commission_transactions_referral_payment_type_unique_idx`
- [ ] Index exists: `commission_transactions_referral_type_null_payment_unique_idx`
- [ ] Index exists: `commission_transactions_status_idx`
- [ ] Index exists: `commission_transactions_referrer_user_id_idx`
- [ ] Index exists: `commission_payouts_affiliate_profile_id_idx`
- [ ] Index exists: `commission_payouts_status_idx`

---

## 10. Security Validation

### Sensitive Data Encryption
- [ ] `affiliate_profiles.payout_account_number_encrypted` is encrypted
- [ ] Test: Cannot read plaintext payout account number

### Sensitive Data Hashing
- [ ] `referral_clicks.ip_hash` is SHA-256 (64 char hex)
- [ ] `affiliate_terms_acceptances.ip_hash` is SHA-256 (64 char hex)
- [ ] `app_auth_sessions.token_hash` is SHA-256
- [ ] `app_password_reset_tokens.token_hash` is SHA-256
- [ ] Test: Hash format validation works

### Hash Format Validation
- [ ] `referral_clicks.ip_hash` has format check constraint
- [ ] `affiliate_terms_acceptances.ip_hash` has format check constraint
- [ ] Test: Cannot insert invalid hash format

### Password Security
- [ ] Passwords stored as bcrypt hash (cost 12)
- [ ] Passwords never returned in API responses
- [ ] Test: Password hash is not plaintext

---

## 11. Transaction Safety

### Multi-Step Operations
- [ ] Register with referral uses transaction
- [ ] Payment success processing uses transaction
- [ ] Subscription activation uses transaction
- [ ] Commission creation uses transaction
- [ ] Commission approve/reject/paid uses transaction
- [ ] Payout creation uses transaction
- [ ] Product checkout with inventory uses transaction

### Rollback Safety
- [ ] Failed transaction rolls back all changes
- [ ] No partial data left after rollback
- [ ] Test: Simulate transaction failure and verify rollback

---

## 12. Performance Validation

### Query Performance
- [ ] Transaction list query < 500ms
- [ ] Inventory list query < 500ms
- [ ] Menu item list query < 200ms
- [ ] Kitchen order list query < 300ms
- [ ] Loyalty passport lookup < 100ms
- [ ] Subscription lookup < 100ms
- [ ] Payment history query < 500ms
- [ ] Notification list query < 300ms

### Index Usage
- [ ] Check index usage: `SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';`
- [ ] Identify unused indexes: `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;`
- [ ] No indexes with 0 scans (unless recently created)

### Table Sizes
- [ ] Check table sizes: `SELECT pg_size_pretty(pg_total_relation_size('table_name'));`
- [ ] No table > 10GB (consider partitioning)
- [ ] Monitor high-growth tables

---

## 13. Migration Deployment

### Pre-Deployment
- [ ] Database backup completed
- [ ] Migrations tested in staging
- [ ] Migration SQL reviewed
- [ ] Rollback plan documented
- [ ] No long-running queries active
- [ ] Index creation strategy verified (CONCURRENTLY for large tables)

### During Deployment
- [ ] Run migrations: `npm run migrate`
- [ ] Migration completed successfully
- [ ] No migration errors in logs
- [ ] All migrations applied

### Post-Deployment
- [ ] Verify data integrity
- [ ] Check query performance
- [ ] Monitor error logs
- [ ] Test critical paths
- [ ] Documentation updated

---

## 14. Data Integrity Spot Checks

### Referral Data
- [ ] No self-referrals exist: `SELECT * FROM referral_registrations WHERE referrer_user_id = referred_user_id;`
- [ ] No duplicate referred users: `SELECT referred_user_id, COUNT(*) FROM referral_registrations GROUP BY referred_user_id HAVING COUNT(*) > 1;`
- [ ] No orphan referral registrations: `SELECT * FROM referral_registrations WHERE referral_code_id NOT IN (SELECT id FROM referral_codes);`

### Commission Data
- [ ] No duplicate commissions: Check unique index violations
- [ ] No negative commission amounts: `SELECT * FROM commission_transactions WHERE amount < 0;`
- [ ] No orphan commissions: `SELECT * FROM commission_transactions WHERE referral_registration_id NOT IN (SELECT id FROM referral_registrations);`

### Payment Data
- [ ] No duplicate Midtrans order_ids: `SELECT midtrans_order_id, COUNT(*) FROM payment_orders GROUP BY midtrans_order_id HAVING COUNT(*) > 1;`
- [ ] No negative payment amounts: `SELECT * FROM payment_orders WHERE gross_amount <= 0;`

### Transaction Data
- [ ] No negative transaction totals: `SELECT * FROM transactions WHERE total < 0;`
- [ ] No zero quantity items: `SELECT * FROM transaction_items WHERE qty <= 0;`
- [ ] No negative prices: `SELECT * FROM transaction_items WHERE price < 0;`

### Inventory Data
- [ ] No negative costs: `SELECT * FROM inventory WHERE cost_per_unit < 0;`
- [ ] No zero conversion ratios: `SELECT * FROM inventory_unit_conversions WHERE conversion_ratio <= 0;`

---

## 15. Rollback Validation

### Rollback Plan Exists
- [ ] Each migration has documented rollback plan
- [ ] Rollback SQL tested in staging
- [ ] Rollback does not delete financial data

### Rollback Execution
- [ ] Backup restored successfully
- [ ] Rollback SQL executed successfully
- [ ] Data integrity verified after rollback
- [ ] Application works after rollback

---

## 16. Checklist Summary

**Before marking database as production-ready:**

- [ ] All migrations applied successfully
- [ ] All core tables exist
- [ ] All affiliate/referral tables exist
- [ ] All data integrity constraints in place
- [ ] All idempotency protections in place
- [ ] All foreign key constraints correct
- [ ] All indexes created
- [ ] No security issues found
- [ ] Transaction safety verified
- [ ] Performance acceptable
- [ ] Documentation updated
- [ ] Rollback plan documented

**Sign-off:**

- Tested by: _______________
- Date: _______________
- Environment: _______________
- Status: ☐ Pass ☐ Fail ☐ Needs Review

---

**Notes:**

Use this checklist for manual database validation. Automated tests should cover most scenarios, but manual verification ensures database integrity and production readiness.

For production deployment, complete all sections. For development/staging, focus on sections 1-8.
