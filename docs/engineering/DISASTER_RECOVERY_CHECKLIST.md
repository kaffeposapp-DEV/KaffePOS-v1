# KaffePOS Disaster Recovery Checklist

Date: 2026-05-24

## Targets

Recommended initial production targets:
- RTO: 4 hours
- RPO: 24 hours without PITR, 15 minutes with PITR/WAL backups

## Incident Steps

1. Declare incident owner and timestamp.
2. Freeze deployments unless rollback is required.
3. Identify impact: frontend, backend, database, payment, email, storage, CDN.
4. Preserve logs and request IDs.
5. Disable risky features via flags if needed.
6. Restore previous app version or database backup only after approval.
7. Verify health, auth, POS checkout, payment/webhook, and admin dashboards.
8. Communicate status and postmortem.

## Rollback Options

- Frontend: redeploy previous static build.
- Backend: redeploy previous image/build.
- Feature: disable flags for affiliate/referral/payment paths.
- Database: restore backup to new instance, then switch connection after validation.

## Do Not

- Do not hard-delete financial/payment records during incident response.
- Do not rerun destructive migrations without verified backup.
- Do not expose secrets in incident notes, screenshots, or logs.

## 2026-05-25 Production Candidate Blocker

Do not mark a production candidate ready until staging smoke scripts and at least one non-production restore drill are completed and attached to `STAGING_SMOKE_REPORT.md` or release notes.

## 2026-05-25 Staging Verification Update

Production candidate remains blocked until staging smoke checks and a non-production restore drill are attached to the staging smoke report. Do not run restore against active staging or production databases.

## 2026-05-25 Real Staging Verification Update

Production candidate remains blocked because fresh staging env verification still reports 26 placeholder values. Complete real staging smoke and non-production restore drill before production approval.
