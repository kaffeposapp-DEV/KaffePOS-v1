# Backend Observability QA Checklist

Version: 1.0
Date: 2026-05-14
Status: QA Reference

## Purpose

This checklist validates backend observability, rate limiting, logging, error handling, and reliability improvements for production readiness.

---

## 1. Rate Limiting Checklist

### Auth Endpoints ✅
- [ ] Login endpoint rate limited (10 per 15 min per email+IP)
- [ ] Email verification rate limited (20 per 15 min per email+IP)
- [ ] Password reset request rate limited (5 per 15 min per email+IP)
- [ ] OTP resend rate limited (5 per 15 min per email+IP)
- [ ] Rate limit returns 429 status code
- [ ] Rate limit includes `Retry-After` header
- [ ] Rate limit returns safe error message
- [ ] Rate limit logs hit events

### Payment Endpoints ✅
- [ ] Payment creation rate limited (12 per 15 min per user+IP)
- [ ] Rate limit prevents payment spam
- [ ] Rate limit does not block legitimate retries
- [ ] Rate limit logs payment attempts

### Public Endpoints ✅
- [ ] Referral tracking rate limited (120 per 15 min per IP)
- [ ] Public health check NOT rate limited
- [ ] Webhook endpoints NOT rate limited (signature verification instead)

### Admin Endpoints ⚠️
- [ ] Admin routes rate limited (1000 per hour per admin)
- [ ] Admin rate limit allows normal operations
- [ ] Admin rate limit prevents abuse
- [ ] Admin rate limit logs excessive usage

### Affiliate/Referral Endpoints ⚠️
- [ ] Affiliate application rate limited (3 per hour per user+IP)
- [ ] Payout update rate limited (10 per hour per user)
- [ ] Commission admin actions rate limited (100 per 15 min per admin)
- [ ] Rate limits prevent duplicate applications
- [ ] Rate limits allow legitimate updates

### Rate Limit Testing
- [ ] Rate limit resets after window expires
- [ ] Rate limit key includes IP for anonymous requests
- [ ] Rate limit key includes user ID for authenticated requests
- [ ] Rate limit cleanup removes expired entries
- [ ] Rate limit survives server restart (in-memory acceptable for MVP)

---

## 2. Request ID Checklist

### Request ID Middleware ✅
- [ ] Every request gets unique request ID (UUID)
- [ ] Request ID accepted from `X-Request-Id` header if provided
- [ ] Request ID returned in `X-Request-Id` response header
- [ ] Request ID available in `req.requestId`
- [ ] Request ID included in all logs
- [ ] Request ID included in error responses (development only)

### Request ID Usage
- [ ] Auth logs include request ID
- [ ] Payment logs include request ID
- [ ] Webhook logs include request ID
- [ ] Admin action logs include request ID
- [ ] Error logs include request ID
- [ ] Request completion logs include request ID

### Request ID Testing
- [ ] Client can provide request ID for tracing
- [ ] Server generates request ID if not provided
- [ ] Request ID persists through middleware chain
- [ ] Request ID visible in error responses (dev mode)
- [ ] Request ID searchable in logs

---

## 3. Logging Standard Checklist

### Log Format ✅
- [ ] Structured JSON logs
- [ ] Timestamp in ISO 8601 format
- [ ] Log level (debug, info, warn, error)
- [ ] Service name included
- [ ] App version included
- [ ] Request ID included where applicable
- [ ] User ID included where applicable (no PII)

### Log Coverage - Server Lifecycle
- [ ] Server startup logged
- [ ] Server shutdown logged
- [ ] Database connection status logged
- [ ] External service status logged (Midtrans, Resend)
- [ ] Graceful shutdown events logged
- [ ] Unhandled rejection logged
- [ ] Uncaught exception logged

### Log Coverage - Authentication
- [ ] Login success logged
- [ ] Login failure logged (no password)
- [ ] Email verification success logged
- [ ] Email verification failure logged
- [ ] Password reset request logged
- [ ] Password reset completion logged
- [ ] Session creation logged
- [ ] Session revocation logged

### Log Coverage - Admin Actions ⚠️
- [ ] Subscription activation logged (admin, target user, plan)
- [ ] Subscription cancellation logged (admin, target user)
- [ ] Affiliate status change logged (admin, target user, status)
- [ ] Commission approval logged (admin, commission ID)
- [ ] Commission rejection logged (admin, commission ID, reason)
- [ ] Commission mark paid logged (admin, commission ID)
- [ ] Admin actions include admin user ID (no email in production)

### Log Coverage - Payment & Webhook
- [ ] Payment webhook received logged
- [ ] Webhook signature verification logged (success/failure)
- [ ] Duplicate webhook ignored logged
- [ ] Payment activation logged
- [ ] Payment failure logged
- [ ] Commission creation logged
- [ ] Commission duplicate skipped logged

### Log Coverage - External Services ⚠️
- [ ] Email send failure logged (no recipient PII)
- [ ] Midtrans API failure logged (no secrets)
- [ ] Resend API failure logged (no API key)
- [ ] External API timeout logged
- [ ] External API retry logged

### Log Coverage - Errors
- [ ] API errors logged with status code
- [ ] Validation errors logged with field details
- [ ] Database errors logged (no SQL in production)
- [ ] Unhandled errors logged with stack trace
- [ ] Rate limit hits logged

### Secrets Safety ✅
- [ ] Passwords NEVER logged
- [ ] Tokens NEVER logged
- [ ] API keys NEVER logged (Midtrans, Resend)
- [ ] Database URL NEVER logged
- [ ] Session tokens NEVER logged
- [ ] Reset tokens NEVER logged
- [ ] Bank account numbers NEVER logged
- [ ] Raw IP addresses hashed before storage (logging IP is OK)

---

## 4. Error Handling Checklist

### Error Handler ✅
- [ ] Centralized error handler exists
- [ ] Error handler is last middleware
- [ ] Error handler catches all errors
- [ ] Error handler logs errors with context
- [ ] Error handler returns safe messages
- [ ] Error handler includes request ID in logs

### Error Response Format ✅
- [ ] Standard error format: `{ success: false, error: { code, message, details? } }`
- [ ] Error codes are specific (VALIDATION_ERROR, UNAUTHORIZED, etc.)
- [ ] Error messages are safe for clients
- [ ] Validation errors include field details
- [ ] Error responses include appropriate HTTP status

### Production Safety ✅
- [ ] No stack traces in production responses
- [ ] No SQL details in production responses
- [ ] No secrets in error messages
- [ ] No internal file paths in production responses
- [ ] Database errors return generic message
- [ ] Unhandled errors return generic message

### Error Logging ✅
- [ ] All errors logged server-side
- [ ] Error logs include request ID
- [ ] Error logs include user ID (if authenticated)
- [ ] Error logs include method and path
- [ ] Error logs include error code
- [ ] Error logs include stack trace (server-side only)
- [ ] Critical errors sent to Sentry

---

## 5. Webhook Reliability Checklist

### Midtrans Webhook ✅
- [ ] Signature verification enforced
- [ ] Invalid signature returns 401
- [ ] Invalid signature logged
- [ ] Webhook processing is idempotent
- [ ] Duplicate webhooks handled safely
- [ ] Webhook response is fast (<1s)
- [ ] Webhook logs event to database
- [ ] Webhook handles settlement status
- [ ] Webhook handles pending status
- [ ] Webhook handles deny/cancel/expire status

### Webhook Idempotency ✅
- [ ] Duplicate webhook does not create duplicate commission
- [ ] Duplicate webhook does not activate subscription twice
- [ ] Duplicate webhook returns success response
- [ ] Webhook checks existing payment order status
- [ ] Webhook uses database transaction

### Webhook Logging ✅
- [ ] Webhook received logged
- [ ] Webhook signature validation logged
- [ ] Webhook processing result logged
- [ ] Webhook stored in `payment_webhook_logs` table
- [ ] Webhook logs include order ID
- [ ] Webhook logs include transaction status
- [ ] Webhook logs do NOT include full sensitive payload

### Webhook Error Handling
- [ ] Webhook errors logged
- [ ] Webhook errors do not expose secrets
- [ ] Webhook returns appropriate response to Midtrans
- [ ] Failed webhooks can be retried manually if needed

---

## 6. External Service Reliability Checklist

### Midtrans (Payment) ⚠️
- [ ] Timeout configured (recommended: 30s)
- [ ] Connection timeout configured (recommended: 10s)
- [ ] Retry logic for transient failures (optional)
- [ ] Failure logged with context
- [ ] Failure does not block critical flow
- [ ] API key never logged

### Resend (Email) ⚠️
- [ ] Timeout configured (recommended: 30s)
- [ ] Email send is non-blocking (async)
- [ ] Email failure logged
- [ ] Email failure does not block payment success
- [ ] Email failure does not block subscription activation
- [ ] API key never logged
- [ ] Retry logic for failed emails (optional, queue recommended)

### Cloudflare (CDN/Images) ✅
- [ ] Used for static assets only
- [ ] Failure does not block requests
- [ ] No secrets required

### Analytics (GA4, Clarity) ✅
- [ ] Analytics failures are silent
- [ ] Analytics does not block requests
- [ ] Analytics failures logged (optional)

### External Service Testing
- [ ] Test with network timeout
- [ ] Test with service unavailable (503)
- [ ] Test with invalid credentials (401)
- [ ] Test with rate limit (429)
- [ ] Verify graceful degradation

---

## 7. Health Check Checklist

### Health Endpoints ✅
- [ ] `GET /health` returns basic health status
- [ ] `GET /health/db` returns database health status
- [ ] `GET /api/admin/system-status` returns detailed status (admin only)
- [ ] Health endpoints return JSON
- [ ] Health endpoints include timestamp
- [ ] Health endpoints do NOT expose secrets
- [ ] Health endpoints do NOT expose env variables
- [ ] Health endpoints respond quickly (<1s)

### Health Response Format ✅
- [ ] Success: `{ success: true, status: "ok", timestamp }`
- [ ] Failure: `{ success: false, status: "error", timestamp, error? }`
- [ ] Database health includes connectivity check
- [ ] System status includes service versions (admin only)

### Health Monitoring
- [ ] Health endpoint used by load balancer
- [ ] Health endpoint used by monitoring service
- [ ] Health endpoint alerts on failure
- [ ] Database health check does not overload database

---

## 8. Performance Checklist

### Query Performance ⚠️
- [ ] All list endpoints have pagination
- [ ] Default page size is reasonable (20-50)
- [ ] Max page size is enforced (100)
- [ ] No unbounded queries
- [ ] Performance indexes applied
- [ ] N+1 queries identified and fixed
- [ ] Slow queries logged (>1s)

### Response Size
- [ ] Large responses paginated
- [ ] Unnecessary fields excluded
- [ ] Field selection supported (optional)
- [ ] Response compression enabled (gzip/brotli)

### Database Connection
- [ ] Connection pooling configured
- [ ] Pool size appropriate for load
- [ ] Connection timeout configured
- [ ] Idle connection cleanup enabled
- [ ] Connection leaks prevented

---

## 9. Security Checklist

### Input Validation ✅
- [ ] All inputs validated with Zod
- [ ] Email normalized (lowercase, trim)
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (no raw HTML rendering)
- [ ] CSRF protection (SameSite cookies, CORS)

### Authentication & Authorization ✅
- [ ] Bearer token required for protected routes
- [ ] Session expiry enforced
- [ ] Revoked sessions rejected
- [ ] Admin routes require admin middleware
- [ ] Permission checks enforced

### Secrets Management ✅
- [ ] Secrets in environment variables only
- [ ] Secrets never logged
- [ ] Secrets never in error messages
- [ ] Secrets never in frontend
- [ ] Database credentials secure

---

## 10. Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Type checking passing
- [ ] Linting passing
- [ ] Environment variables documented
- [ ] Database migrations ready
- [ ] Performance indexes applied

### Deployment
- [ ] Database backup created
- [ ] Migrations applied successfully
- [ ] Health check passing
- [ ] Rate limiting working
- [ ] Logging working
- [ ] Error tracking working (Sentry)

### Post-Deployment
- [ ] Monitor error rates
- [ ] Monitor response times
- [ ] Monitor rate limit hits
- [ ] Monitor external service failures
- [ ] Verify critical flows (auth, payment, webhook)

---

## 11. Testing Scenarios

### Rate Limiting
1. **Test**: Send 11 login requests with same email in 15 minutes
   - **Expected**: 10 succeed, 11th returns 429 with `Retry-After` header

2. **Test**: Send 4 affiliate applications in 1 hour
   - **Expected**: 3 succeed, 4th returns 429

3. **Test**: Send 1001 admin requests in 1 hour
   - **Expected**: 1000 succeed, 1001st returns 429

### Request ID
1. **Test**: Send request without `X-Request-Id` header
   - **Expected**: Response includes generated `X-Request-Id`

2. **Test**: Send request with custom `X-Request-Id` header
   - **Expected**: Response includes same `X-Request-Id`

3. **Test**: Check logs for request ID
   - **Expected**: All logs include request ID

### Logging
1. **Test**: Trigger login failure
   - **Expected**: Log includes `auth.login_failed` with request ID, email (hashed), no password

2. **Test**: Trigger webhook with invalid signature
   - **Expected**: Log includes `payment_webhook_signature_failed` with order ID, no signature value

3. **Test**: Trigger admin subscription activation
   - **Expected**: Log includes `admin.subscription_activated` with admin ID, target user ID, plan

### Error Handling
1. **Test**: Send invalid JSON
   - **Expected**: 400 with `BAD_REQUEST` error code

2. **Test**: Send request with missing required field
   - **Expected**: 400 with `VALIDATION_ERROR` and field details

3. **Test**: Trigger database error
   - **Expected**: 500 with generic message, detailed error logged server-side

### Webhook Reliability
1. **Test**: Send duplicate webhook
   - **Expected**: Idempotent processing, no duplicate commission

2. **Test**: Send webhook with invalid signature
   - **Expected**: 401 response, logged

3. **Test**: Send webhook with settlement status
   - **Expected**: Subscription activated, commission created

### External Service Reliability
1. **Test**: Simulate email service timeout
   - **Expected**: Payment succeeds, email failure logged, no user-facing error

2. **Test**: Simulate Midtrans API failure
   - **Expected**: Error logged, safe error message returned

---

## 12. Acceptance Criteria

### Must Have (Production Blocker)
- ✅ Request ID middleware implemented
- ✅ Rate limiting on auth endpoints
- ✅ Rate limiting on payment endpoints
- ✅ Webhook signature verification
- ✅ Webhook idempotency
- ✅ Error handler with safe messages
- ✅ Structured logging
- ✅ Health check endpoints
- ✅ No secrets in logs
- ✅ No secrets in error messages

### Should Have (High Priority)
- ⚠️ Rate limiting on admin endpoints
- ⚠️ Rate limiting on affiliate endpoints
- ⚠️ Enhanced admin action logging
- ⚠️ External service timeout configuration
- ⚠️ External service failure logging
- ⚠️ Performance indexes verified

### Nice to Have (Future)
- ⚠️ Distributed rate limiting (Redis)
- ⚠️ Email retry queue
- ⚠️ Request/response compression
- ⚠️ Advanced monitoring (APM)
- ⚠️ Automated performance testing

---

## 13. Sign-Off

### Development Team
- [ ] All code changes reviewed
- [ ] All tests passing
- [ ] Documentation updated
- [ ] QA checklist completed

### QA Team
- [ ] Manual testing completed
- [ ] Rate limiting verified
- [ ] Logging verified
- [ ] Error handling verified
- [ ] Webhook reliability verified

### DevOps Team
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Performance indexes applied
- [ ] Monitoring configured
- [ ] Alerts configured

### Product Team
- [ ] Feature requirements met
- [ ] User experience validated
- [ ] Production readiness confirmed

---

**Last Updated**: 2026-05-14
**Maintained By**: Engineering Team
**Review Frequency**: Before each production deployment
