# KaffePOS Backup & Recovery Guide

Date: 2026-05-24

## PostgreSQL Backup

Recommended production cadence:
- full logical backup daily
- point-in-time recovery if provider supports WAL/PITR
- retention: 7 daily, 4 weekly, 3 monthly minimum for production

Safe command pattern:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="backup-$(date +%Y%m%d-%H%M%S).dump"
```

Restore drill pattern on non-production database:

```bash
createdb kaffepos_restore_test
pg_restore --clean --if-exists --dbname="$RESTORE_TEST_DATABASE_URL" backup.dump
```

## Assets & Uploads

- Back up R2 buckets or private upload volumes if invoices/exports/uploads are enabled.
- Keep private artifacts private during recovery.
- Verify signed URL/access-policy behavior after restore.

## Before Migrations

- Take a fresh backup.
- Confirm migration is non-destructive.
- Run migrations in staging first.
- Keep rollback notes for application version and feature flags.

## Restore Drill Checklist

- [ ] Restore database to isolated environment.
- [ ] Run backend health check.
- [ ] Validate owner login.
- [ ] Validate transactions, inventory, subscriptions, referrals, affiliate commissions.
- [ ] Validate webhook idempotency tables remain consistent.

## 2026-05-25 Staging Restore Drill Gate

The 2026-05-25 local validation did not run a restore drill because no disposable staging restore target was available. Before production cutover:

- provision an isolated restore database;
- restore the latest staging backup into that target;
- run health/auth/POS/stock/payment-readiness checks against the restored target;
- destroy or lock down the restored target after the drill.

## 2026-05-25 Staging Verification Update

No restore drill was run in the local staging verification attempt because a disposable staging restore target was not provided. Keep restore drill as a production-candidate blocker until a fresh backup is restored into an isolated database and app read checks pass.

## 2026-05-25 Real Staging Verification Update

Restore drill remains blocked. Fresh staging env verification reports missing keys `0`, placeholder keys `26`, forbidden frontend secret-like `VITE_*` keys `0`, invalid staging values `0`. Do not run restore commands until all placeholders are replaced and a non-production restore target is explicitly provisioned.
