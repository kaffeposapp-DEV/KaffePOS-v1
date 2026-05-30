# KaffePOS Database Architecture

Version: 1.0
Date: 2026-05-14
Status: Source of truth for database schema

## 1. Overview

KaffePOS uses PostgreSQL as the primary database for all application data. The schema is designed for:
- **Data integrity**: Constraints prevent invalid data
- **Performance**: Indexes optimize common queries
- **Scalability**: Schema supports growth to 1000+ stores
- **Safety**: Financial records protected from accidental deletion
- **Auditability**: Event logs track critical operations

## 2. Migration System

### Migration Tool
- **Tool**: Custom Node.js migration runner
- **Script**: `backend/scripts/run-migrations.mjs`
- **Command**: `npm run migrate`
- **Folder**: `backend/migrations/`
- **Naming**: `YYYYMMDD_NNNN_description.sql`

### Migration Features
✅ **Checksum validation**: SHA-256 hash prevents editing applied migrations
✅ **Transaction safety**: Migrations run in BEGIN/COMMIT transaction
✅ **Automatic rollback**: ROLLBACK on migration failure
✅ **Migration tracking**: `schema_migrations` table tracks applied migrations
✅ **Idempotent**: Skips already-applied migrations
✅ **Ordered execution**: Migrations sorted alphabetically

### Migration Tracking Table
```sql
create table public.schema_migrations (
  version text primary key,
  name text not null,
  checksum text,
  applied_at timestamptz not null default now()
);
```

### Bootstrap Files
- `database/production-bootstrap.sql` - Main schema bootstrap
- `database/performance-indexes-migration.sql` - Performance indexes
- `database/affiliate-referral-migration.sql` - Affiliate/referral schema
- `database/loyalty-migration.sql` - Loyalty program schema
- `database/challenges-migration.sql` - Gamification schema
- `database/kitchen-order-checker-migration.sql` - Kitchen orders

### Migration Safety Rules
1. ✅ Use `IF NOT EXISTS` for all CREATE statements
2. ✅ Use `DROP IF EXISTS` before adding constraints
3. ✅ Add nullable columns first, backfill, then add NOT NULL
4. ✅ Use `CONCURRENTLY` for indexes on large tables (production)
5. ✅ Document rollback plan in migration comments
6. ❌ Never edit applied migrations (checksum validation will fail)
7. ❌ Never drop columns without compatibility plan
8. ❌ Never rename columns without migration strategy

## 3. Schema Overview

### Total Tables: ~40+ tables

#### Authentication & Users (5 tables)
- `profiles` - User profiles
- `app_auth_credentials` - Email/password credentials
- `app_auth_sessions` - Active sessions
- `app_password_reset_tokens` - Password reset tokens
- `cashier_outlet_assignments` - Cashier-outlet assignments

#### Store & Products (4 tables)
- `stores` - Store/outlet information
- `menu_items` - Menu/product catalog
- `inventory` - Inventory items
- `inventory_unit_conversions` - Unit conversion rules

#### Transactions & Payments (6 tables)
- `transactions` - POS transactions
- `transaction_items` - Transaction line items
- `transaction_inventory_audit` - Inventory audit trail
- `payment_orders` - Payment order tracking
- `payment_attempt_logs` - Payment attempt logs
- `payment_webhook_logs` - Webhook event logs

#### Subscriptions (3 tables)
- `subscriptions` - Subscription records
- `subscription_payment_sessions` - Payment session tracking
- `subscription_upgrade_prompt_events` - Upgrade prompt tracking

#### Kitchen & Orders (3 tables)
- `kitchen_orders` - Kitchen order tracking
- `kitchen_order_items` - Kitchen order items
- `kitchen_order_events` - Kitchen order event log

#### Loyalty Program (8 tables)
- `loyalty_settings` - Loyalty program settings
- `loyalty_rewards` - Reward definitions
- `loyalty_customers` - Customer loyalty profiles
- `loyalty_tiers` - Loyalty tier definitions
- `loyalty_passports` - Customer passports
- `loyalty_stamp_events` - Stamp event log
- `loyalty_stamps` - Stamp records
- `loyalty_redemptions` - Reward redemptions

#### Gamification (2 tables)
- `challenges` - Challenge definitions
- `user_challenge_progress` - User progress tracking

#### Affiliate & Referral (6 tables)
- `referral_codes` - Referral codes
- `referral_clicks` - Click tracking
- `referral_registrations` - Registration tracking
- `affiliate_profiles` - Affiliate profiles
- `commission_transactions` - Commission records
- `commission_payouts` - Payout records
- `affiliate_terms_acceptances` - Terms acceptance log

#### System & Notifications (6 tables)
- `notifications` - Notification center
- `beta_feedback` - Beta feedback
- `ai_insights_cache` - AI insights cache
- `ai_insight_logs` - AI insight logs
- `app_versions` - App version tracking
- `app_update_events` - Update event tracking

## 4. Key Relationships

### User → Store → Transactions
```
profiles (user)
  ↓ (owner_id)
stores (outlet)
  ↓ (store_id)
transactions (sales)
  ↓ (transaction_id)
transaction_items (line items)
```

### User → Subscription → Payment
```
profiles (user)
  ↓ (user_id)
subscriptions (plan)
  ↓ (user_id)
payment_orders (payment)
  ↓ (order_id)
payment_webhook_logs (webhook events)
```

### Referrer → Referral → Commission
```
profiles (referrer)
  ↓ (user_id)
referral_codes (code)
  ↓ (referral_code_id)
referral_registrations (referred user)
  ↓ (referral_registration_id)
commission_transactions (commission)
  ↓ (affiliate_profile_id)
commission_payouts (payout)
```

### Store → Menu → Inventory
```
stores (outlet)
  ↓ (store_id)
menu_items (products)
  ↓ (menu_item_id, recipe)
inventory (stock)
  ↓ (inventory_id)
transaction_inventory_audit (audit trail)
```

## 5. Data Integrity Constraints

### Self-Referral Prevention
```sql
-- Users cannot refer themselves
ALTER TABLE referral_registrations
  ADD CONSTRAINT referral_registrations_no_self_referral_check
  CHECK (referrer_user_id != referred_user_id);
```

### Numeric Constraints
```sql
-- Transaction amounts must be non-negative
CHECK (total >= 0)
CHECK (subtotal >= 0)
CHECK (discount >= 0)
CHECK (tax >= 0)

-- Transaction items
CHECK (qty > 0)
CHECK (price >= 0)

-- Commission amounts
CHECK (amount >= 0)

-- Inventory costs
CHECK (cost_per_unit >= 0)

-- Loyalty points/stamps
CHECK (points >= 0)
CHECK (stamps >= 0)
```

### Date Constraints
```sql
-- Subscription dates
CHECK (expires_at >= activated_at)

-- Referral registration progression
CHECK (trial_started_at >= registered_at)
CHECK (first_payment_at >= trial_started_at)
CHECK (eligible_at >= first_payment_at)

-- Commission progression
CHECK (approved_at >= eligible_at)
CHECK (paid_at >= approved_at)
```

### Status Constraints
```sql
-- User roles
CHECK (role IN ('owner_admin', 'cashier'))

-- Account status
CHECK (account_status IN ('active', 'inactive'))

-- Payment status
CHECK (status IN ('pending', 'paid', 'completed', 'failed', 'cancelled'))

-- Referral registration status
CHECK (status IN ('registered', 'trial_started', 'paid', 'eligible', 'rewarded', 'rejected', 'cancelled'))

-- Affiliate status
CHECK (status IN ('pending', 'active', 'suspended', 'rejected'))

-- Commission status
CHECK (status IN ('pending', 'eligible', 'approved', 'rejected', 'paid', 'cancelled'))
```

## 6. Idempotency Protections

### Commission Idempotency
```sql
-- Prevent duplicate commission for same referral+payment+type
CREATE UNIQUE INDEX commission_transactions_referral_payment_type_unique_idx
  ON commission_transactions (referral_registration_id, payment_id, type)
  WHERE payment_id IS NOT NULL;

CREATE UNIQUE INDEX commission_transactions_referral_type_null_payment_unique_idx
  ON commission_transactions (referral_registration_id, type)
  WHERE payment_id IS NULL;
```

### Referral Registration Idempotency
```sql
-- One user can only be referred once
CREATE UNIQUE INDEX referral_registrations_referred_user_unique_idx
  ON referral_registrations (referred_user_id);
```

### Payment Idempotency
```sql
-- Midtrans order_id must be unique
CREATE UNIQUE INDEX payment_orders_midtrans_order_id_key
  ON payment_orders (midtrans_order_id);
```

### Email Uniqueness
```sql
-- Email must be unique (case-insensitive)
CREATE UNIQUE INDEX app_auth_credentials_email_unique_idx
  ON app_auth_credentials (LOWER(email));
```

### Session Token Uniqueness
```sql
-- Active session tokens must be unique
CREATE UNIQUE INDEX app_auth_sessions_token_hash_unique_idx
  ON app_auth_sessions (token_hash)
  WHERE revoked_at IS NULL;
```

### Password Reset Token Uniqueness
```sql
-- Unconsumed reset tokens must be unique
CREATE UNIQUE INDEX app_password_reset_tokens_token_hash_unique_idx
  ON app_password_reset_tokens (token_hash)
  WHERE consumed_at IS NULL;
```

## 7. Foreign Key Cascade Rules

### Financial Records: RESTRICT (Safe)
```sql
-- Financial records cannot be deleted if referenced
referral_codes.user_id → profiles (RESTRICT)
referral_registrations.referral_code_id → referral_codes (RESTRICT)
referral_registrations.referrer_user_id → profiles (RESTRICT)
referral_registrations.referred_user_id → profiles (RESTRICT)
affiliate_profiles.user_id → profiles (RESTRICT)
commission_transactions.referral_registration_id → referral_registrations (RESTRICT)
commission_transactions.referrer_user_id → profiles (RESTRICT)
commission_transactions.referred_user_id → profiles (RESTRICT)
commission_payouts.affiliate_profile_id → affiliate_profiles (RESTRICT)
```

### Operational Data: CASCADE (Acceptable)
```sql
-- Operational data can cascade delete
cashier_outlet_assignments.owner_id → profiles (CASCADE)
cashier_outlet_assignments.cashier_id → profiles (CASCADE)
cashier_outlet_assignments.store_id → stores (CASCADE)
payment_orders.user_id → profiles (CASCADE)
payment_orders.store_id → stores (CASCADE)
```

### Audit Logs: SET NULL (Preserve History)
```sql
-- Audit logs preserve history even if user deleted
payment_attempt_logs.user_id → profiles (SET NULL)
payment_webhook_logs.payment_order_id → payment_orders (SET NULL)
```

### Risky CASCADE (Review Needed)
```sql
-- ⚠️ Deleting referral code deletes all click history
referral_clicks.referral_code_id → referral_codes (CASCADE)
```
**Recommendation**: Consider changing to RESTRICT to preserve click history

## 8. Index Strategy

### Primary Indexes (Unique)
- All tables have UUID primary key
- Unique indexes on business keys (email, code, order_id)
- Composite unique indexes for idempotency

### Lookup Indexes
- Foreign key columns (user_id, store_id, etc.)
- Status columns for filtering
- Date columns for sorting/filtering

### Composite Indexes
- `(store_id, date DESC)` - Store-scoped date queries
- `(store_id, status, date DESC)` - Filtered queries
- `(user_id, created_at DESC)` - User history queries

### Partial Indexes
- `WHERE is_active = true` - Active items only
- `WHERE is_void = false` - Valid transactions only
- `WHERE revoked_at IS NULL` - Active sessions only
- `WHERE status IN (...)` - Specific statuses only

### Performance Indexes
See `database/performance-indexes-migration.sql` for complete list:
- Transaction queries (store + date)
- Inventory queries (low stock alerts)
- Menu item queries (POS lookups)
- Kitchen order queries (KDS)
- Loyalty queries (passport lookup)
- Subscription queries (expiring subscriptions)
- Payment queries (user history)
- Notification queries (unread notifications)
- Auth queries (email login, active sessions)

## 9. Security Measures

### Sensitive Data Encryption
```sql
-- Encrypted fields
affiliate_profiles.payout_account_number_encrypted (encrypted)
```

### Sensitive Data Hashing
```sql
-- SHA-256 hashed fields
referral_clicks.ip_hash (64 char hex)
affiliate_terms_acceptances.ip_hash (64 char hex)
app_auth_sessions.token_hash (SHA-256)
app_password_reset_tokens.token_hash (SHA-256)
```

### Hash Format Validation
```sql
-- Ensure hash format is correct
CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$')
```

### Password Security
- Passwords hashed with bcrypt (cost 12)
- Stored in `app_auth_credentials.password_hash`
- Never returned in API responses

## 10. Performance Considerations

### High-Growth Tables
⚠️ **Monitor these tables for size**:
- `referral_clicks` - Grows with every click
- `commission_transactions` - Grows with every payment
- `transactions` - Grows with every sale
- `transaction_items` - Grows faster than transactions
- `loyalty_stamp_events` - Grows with every stamp
- `notifications` - Grows with every notification
- `app_update_events` - Grows with every app update
- `payment_webhook_logs` - Grows with every webhook

### Recommendations
1. **Partitioning**: Consider table partitioning for high-growth tables
2. **Archival**: Implement data archival strategy for old data
3. **Retention**: Define data retention policies
4. **Monitoring**: Monitor table sizes and query performance

### Index Maintenance
```sql
-- Check index usage
SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';

-- Check index size
SELECT pg_size_pretty(pg_relation_size('index_name'));

-- Identify unused indexes
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;

-- Update statistics
ANALYZE table_name;
```

## 11. Transaction Safety

### Code Paths Requiring Transactions
✅ **Must use database transactions**:
- Register with referral attribution
- Payment success processing
- Subscription activation
- Commission creation
- Commission approve/reject/paid
- Payout creation
- Refund/cancel handling
- Product checkout with inventory deduction

### Transaction Pattern
```typescript
await withTransaction(async (client) => {
  // Multiple related operations
  await client.query('INSERT INTO ...');
  await client.query('UPDATE ...');
  await client.query('INSERT INTO ...');
  // All succeed or all rollback
});
```

## 12. Rollback Strategy

### Migration Rollback
❌ **No automatic rollback**: Migrations are forward-only
⚠️ **Manual rollback required**: Write reverse SQL manually

### Rollback Plan Template
```sql
-- Migration: 20260514_0002_data_integrity_constraints.sql
-- Rollback plan:

-- 1. Drop self-referral constraint
ALTER TABLE referral_registrations 
  DROP CONSTRAINT referral_registrations_no_self_referral_check;

-- 2. Drop numeric constraints
ALTER TABLE transactions 
  DROP CONSTRAINT transactions_total_nonnegative_check;

-- 3. Drop date constraints
ALTER TABLE referral_registrations 
  DROP CONSTRAINT referral_registrations_dates_valid_check;

-- etc.
```

### Production Rollback Safety
1. ✅ Test rollback in staging first
2. ✅ Backup database before rollback
3. ✅ Document rollback steps
4. ✅ Verify data integrity after rollback
5. ❌ Never rollback financial data migrations

## 13. Backup & Recovery

### Critical Data Tables
🔴 **Must backup before any migration**:
- `profiles` - User accounts
- `stores` - Store data
- `transactions` - Sales history
- `payment_orders` - Payment records
- `subscriptions` - Subscription data
- `commission_transactions` - Commission records
- `commission_payouts` - Payout records
- `referral_registrations` - Referral data

### Backup Command
```bash
npm run backup:critical
```

### Backup Script
See `backend/scripts/backup-critical-data.mjs`

## 14. Data Retention Policy

### Recommended Retention
- **Transactions**: Permanent (legal requirement)
- **Payments**: Permanent (legal requirement)
- **Commissions**: Permanent (financial audit)
- **Referral clicks**: 2 years (analytics)
- **Notifications**: 90 days (operational)
- **App update events**: 1 year (analytics)
- **Webhook logs**: 1 year (debugging)
- **Session logs**: 30 days (security)

### Archival Strategy
1. Move old data to archive tables
2. Partition tables by date
3. Export to cold storage
4. Maintain indexes on active data only

## 15. Monitoring & Alerts

### Database Metrics to Monitor
- Table sizes (growth rate)
- Index usage (unused indexes)
- Query performance (slow queries)
- Connection pool usage
- Lock contention
- Replication lag (if applicable)

### Alert Thresholds
- Table size > 10GB (consider partitioning)
- Query time > 1s (optimize query)
- Connection pool > 80% (scale up)
- Disk space < 20% (add storage)

## 16. Production Deployment Checklist

### Before Deployment
- [ ] Backup database
- [ ] Test migrations in staging
- [ ] Review migration SQL
- [ ] Document rollback plan
- [ ] Check for long-running queries
- [ ] Verify index creation strategy (CONCURRENTLY)

### During Deployment
- [ ] Run migrations: `npm run migrate`
- [ ] Verify migration success
- [ ] Check application logs
- [ ] Test critical paths
- [ ] Monitor error rates

### After Deployment
- [ ] Verify data integrity
- [ ] Check query performance
- [ ] Monitor error logs
- [ ] Update documentation
- [ ] Notify team

## 17. Common Issues & Solutions

### Issue: Migration Checksum Mismatch
**Cause**: Applied migration file was edited
**Solution**: Create new migration, never edit applied migrations

### Issue: Constraint Violation
**Cause**: Existing data violates new constraint
**Solution**: Clean data first, then add constraint

### Issue: Slow Index Creation
**Cause**: Large table, blocking writes
**Solution**: Use `CREATE INDEX CONCURRENTLY`

### Issue: Foreign Key Violation
**Cause**: Referenced record doesn't exist
**Solution**: Check data integrity, add missing records

### Issue: Deadlock
**Cause**: Concurrent transactions locking same rows
**Solution**: Retry transaction, optimize lock order

## 18. Schema Evolution Guidelines

### Adding Columns
1. ✅ Add as nullable first
2. ✅ Backfill data if needed
3. ✅ Add NOT NULL constraint after backfill
4. ✅ Add default value if appropriate

### Removing Columns
1. ⚠️ Mark as deprecated first
2. ⚠️ Stop using in application code
3. ⚠️ Wait for deployment cycle
4. ⚠️ Drop column in next migration

### Renaming Columns
1. ⚠️ Add new column
2. ⚠️ Dual-write to both columns
3. ⚠️ Backfill old → new
4. ⚠️ Switch reads to new column
5. ⚠️ Drop old column

### Changing Types
1. ⚠️ Add new column with new type
2. ⚠️ Backfill with conversion
3. ⚠️ Switch application to new column
4. ⚠️ Drop old column

## 19. References

### Migration Files
- `backend/migrations/` - Versioned migrations
- `database/` - Bootstrap and feature migrations

### Scripts
- `backend/scripts/run-migrations.mjs` - Migration runner
- `backend/scripts/backup-critical-data.mjs` - Backup script
- `backend/scripts/db-config.mjs` - Database configuration

### Documentation
- `docs/architecture/DATABASE.md` - This document
- `docs/engineering/DATABASE_QA_CHECKLIST.md` - QA checklist
- `docs/requirements/SRS.md` - System requirements
- `docs/product/FEATURE_REGISTRY.md` - Feature registry

---

**Last Updated**: 2026-05-14
**Maintained By**: Engineering Team
**Review Frequency**: Quarterly or after major schema changes

## 2026-05-24 Production Audit Notes

The migration set was reviewed for production readiness. Existing migrations include primary keys, foreign keys, check constraints, payment order uniqueness, webhook logs, referral/affiliate/commission tables, and practical indexes for transaction date reporting, payment order lookup, referral registration lookup, affiliate/commission status lookup, and subscription status filtering.

Operational rules:
- Do not hard-delete financial records, payment sessions, commission transactions, or payout records.
- Add indexes only for observed query patterns: foreign keys, status filters, created-at reporting, payment order IDs, referral/affiliate codes, commission status, and transaction store/date reports.
- Run a fresh backup before migrations and validate restore on non-production for major releases.

## Duitku Payment Migration

- Payment gateway can run as `duitku`, `midtrans`, or `disabled` via `PAYMENT_GATEWAY_PROVIDER`.
- Duitku callback URL: `https://api.kaffepos.my.id/api/webhooks/duitku`.
- Duitku return URL: `https://kaffepos.my.id/settings?billing=duitku-return`.
- Frontend return URL never marks payment paid; payment success requires verified server callback or verified status check.
- Duitku merchant key stays backend-only and must not be added to `VITE_*` env.
