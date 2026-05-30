# KaffePOS Monitoring & Logging Guide

Date: 2026-05-24

## Signals

- `/health`: liveness/readiness signal for backend.
- `/metrics`: operational metrics snapshot / Prometheus-compatible output.
- request ID: correlate frontend, backend, database, webhook, and payment logs.
- Sentry/error tracking: capture backend and frontend exceptions when configured.

## Safe Logging

Allowed:
- event name
- request ID
- user/store IDs where operationally necessary
- status transitions
- safe error code/message
- latency/status code
- masked identifiers

Never log:
- passwords
- access tokens/session tokens/reset tokens
- API keys/secrets
- raw payout/bank account number
- full Midtrans payload
- full customer notes or unnecessary PII
- raw IP unless required and policy-approved

## Required Event Coverage

- server startup/shutdown
- auth failures and rate limits
- admin actions
- webhook received/signature failed/duplicate ignored
- payment success/failure/cancel
- commission created/approved/rejected/paid
- email send failure
- external API failure

## Alert Recommendations

- backend health down
- database connection failure
- webhook signature failure spike
- payment pending backlog
- email delivery failure spike
- 5xx rate spike
- migration failure
