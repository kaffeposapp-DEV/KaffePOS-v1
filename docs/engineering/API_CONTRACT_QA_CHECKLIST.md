# API Contract QA Checklist

Version: 1.0
Date: 2026-05-14
Status: Manual testing checklist for API standardization

## Overview

This checklist is used to manually verify that API endpoints follow the standardized contract defined in `/docs/architecture/API.md`.

Use this checklist when:
- Adding new API endpoints
- Migrating existing endpoints to standard format
- Performing API contract validation before release

## 1. Response Format Validation

### 1.1 Success Responses

- [ ] Single object responses return `{ success: true, data: {...} }`
- [ ] List responses return `{ success: true, data: [...], meta: {...} }`
- [ ] Action responses return `{ success: true, message: "..." }`
- [ ] No raw objects returned without `success` wrapper (except legacy endpoints)
- [ ] Optional `message` field is used appropriately

### 1.2 Error Responses

- [ ] All errors return `{ success: false, error: { code, message, details? } }`
- [ ] Error codes match HTTP status codes appropriately
- [ ] Error messages are safe for client display (no stack traces, secrets)
- [ ] Validation errors include `details` array with field-level errors
- [ ] Error codes are from the standard list (VALIDATION_ERROR, UNAUTHORIZED, etc.)

### 1.3 Pagination Format

- [ ] Paginated responses include `meta` object
- [ ] `meta` includes: page, limit, total, totalPages, hasMore, nextOffset
- [ ] `total` count is accurate
- [ ] `hasMore` boolean is correct
- [ ] Empty results return `{ data: [], meta: { total: 0, ... } }`

## 2. Error Code Validation

Test each error scenario and verify correct error code:

### 2.1 VALIDATION_ERROR (400)

- [ ] Invalid email format returns VALIDATION_ERROR
- [ ] Missing required fields returns VALIDATION_ERROR
- [ ] Invalid UUID format returns VALIDATION_ERROR
- [ ] Out-of-range values return VALIDATION_ERROR
- [ ] Validation errors include `details` array

### 2.2 UNAUTHORIZED (401)

- [ ] Missing Bearer token returns UNAUTHORIZED
- [ ] Invalid/expired token returns UNAUTHORIZED
- [ ] Webhook signature failure returns WEBHOOK_SIGNATURE_INVALID (401)

### 2.3 FORBIDDEN (403)

- [ ] Insufficient role permissions return FORBIDDEN
- [ ] Admin-only endpoints return FORBIDDEN for non-admin
- [ ] Cashier accessing owner-only features returns FORBIDDEN
- [ ] Feature flag disabled returns FEATURE_DISABLED (403)

### 2.4 NOT_FOUND (404)

- [ ] Invalid resource ID returns NOT_FOUND
- [ ] Deleted resource returns NOT_FOUND
- [ ] Non-existent endpoint returns NOT_FOUND

### 2.5 CONFLICT (409)

- [ ] Duplicate email registration returns CONFLICT
- [ ] Concurrent update conflicts return CONFLICT

### 2.6 RATE_LIMITED (429)

- [ ] Exceeding auth login limit returns RATE_LIMITED
- [ ] Exceeding email OTP limit returns RATE_LIMITED
- [ ] Exceeding payment creation limit returns RATE_LIMITED
- [ ] Response includes `Retry-After` header

### 2.7 INTERNAL_SERVER_ERROR (500)

- [ ] Unhandled exceptions return INTERNAL_SERVER_ERROR
- [ ] Database errors return INTERNAL_SERVER_ERROR
- [ ] Error message is generic (no internal details leaked)

## 3. Validation Testing

### 3.1 Body Validation

- [ ] Invalid JSON returns 400 BAD_REQUEST
- [ ] Missing required fields returns VALIDATION_ERROR
- [ ] Invalid field types return VALIDATION_ERROR
- [ ] Field constraints enforced (min/max length, range, format)

### 3.2 Query Parameter Validation

- [ ] Invalid `page` value handled gracefully (defaults to 1)
- [ ] Invalid `limit` value capped at maximum (100)
- [ ] Invalid `sortOrder` defaults to 'desc'
- [ ] Invalid `sortBy` field defaults to safe field
- [ ] `search` query sanitized (max 200 chars)

### 3.3 Path Parameter Validation

- [ ] Invalid UUID in path returns VALIDATION_ERROR or NOT_FOUND
- [ ] Missing path parameters return 404

## 4. Pagination Testing

### 4.1 Query Parameters

- [ ] `page=1&limit=20` works correctly
- [ ] `offset=0&limit=20` works correctly
- [ ] `page` and `offset` both provided: `offset` takes precedence
- [ ] `limit` exceeding 100 is capped at 100
- [ ] `limit` below 1 defaults to 1
- [ ] `page` below 1 defaults to 1

### 4.2 Pagination Metadata

- [ ] `total` count matches actual database count
- [ ] `totalPages` calculated correctly: `ceil(total / limit)`
- [ ] `hasMore` is true when more items exist
- [ ] `hasMore` is false on last page
- [ ] `nextOffset` is null on last page
- [ ] `nextOffset` is correct when more items exist
- [ ] `returned` matches actual items returned

### 4.3 Sorting

- [ ] `sortBy` with valid field works
- [ ] `sortBy` with invalid field defaults to safe field
- [ ] `sortOrder=asc` works
- [ ] `sortOrder=desc` works
- [ ] Invalid `sortOrder` defaults to 'desc'

### 4.4 Search

- [ ] `search` parameter filters results correctly
- [ ] `search` with special characters handled safely
- [ ] `search` exceeding 200 chars is truncated
- [ ] Empty `search` returns all results

## 5. Authentication & Authorization

### 5.1 Authentication

- [ ] Protected endpoints require Bearer token
- [ ] Missing token returns UNAUTHORIZED
- [ ] Invalid token returns UNAUTHORIZED
- [ ] Expired token returns UNAUTHORIZED
- [ ] Valid token allows access

### 5.2 Authorization (RBAC)

- [ ] Owner/admin can access owner-only endpoints
- [ ] Cashier cannot access owner-only endpoints
- [ ] Cashier can access cashier-allowed endpoints
- [ ] Inactive cashier cannot login
- [ ] Cashier without outlet assignment cannot login

### 5.3 Admin Access

- [ ] Admin endpoints require admin email whitelist
- [ ] Non-admin users get FORBIDDEN
- [ ] Admin users can access admin endpoints

### 5.4 Store Ownership

- [ ] Users can only access their own store data
- [ ] Accessing another store's data returns FORBIDDEN or NOT_FOUND
- [ ] Store ownership verified before mutations

## 6. Rate Limiting

### 6.1 Auth Endpoints

- [ ] Login: 10 attempts per 15 min enforced
- [ ] Email OTP: 5 attempts per 15 min enforced
- [ ] Verification: 20 attempts per 15 min enforced
- [ ] Rate limit returns RATE_LIMITED (429)
- [ ] `Retry-After` header included in response

### 6.2 Payment Endpoints

- [ ] Payment creation: 12 attempts per 15 min enforced
- [ ] Rate limit returns RATE_LIMITED (429)

## 7. Security Validation

### 7.1 Error Messages

- [ ] No stack traces in production responses
- [ ] No database error details exposed
- [ ] No secrets in error messages
- [ ] No internal system paths exposed
- [ ] Error messages are user-friendly

### 7.2 Input Sanitization

- [ ] Email normalized (lowercase, trimmed)
- [ ] Search queries sanitized
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (no HTML in responses)

### 7.3 Sensitive Data

- [ ] Passwords never returned in responses
- [ ] Session tokens hashed before storage
- [ ] Payment details masked appropriately
- [ ] PII handled according to policy

## 8. Webhook Testing

### 8.1 Midtrans Webhook

- [ ] Webhook returns `{ received: true }` (not standard format)
- [ ] Invalid signature returns 401 WEBHOOK_SIGNATURE_INVALID
- [ ] Valid signature processes payment
- [ ] Webhook events logged to `payment_webhook_logs`
- [ ] Idempotency enforced (duplicate webhooks handled)

## 9. Frontend Compatibility

### 9.1 Response Handling

- [ ] Frontend handles standard format: `{ success: true, data: {...} }`
- [ ] Frontend handles legacy format: `{ id, name, ... }`
- [ ] Frontend unwraps `data` field automatically
- [ ] Frontend displays error messages correctly

### 9.2 Error Handling

- [ ] Frontend checks `error.code` for error type
- [ ] Frontend displays validation errors per field
- [ ] Frontend handles UNAUTHORIZED (redirects to login)
- [ ] Frontend handles FORBIDDEN (shows permission error)
- [ ] Frontend handles RATE_LIMITED (shows retry message)

### 9.3 Pagination

- [ ] Frontend displays pagination controls correctly
- [ ] Frontend handles `meta.total` for total count
- [ ] Frontend handles `meta.hasMore` for next page button
- [ ] Frontend handles empty results gracefully

## 10. Performance

### 10.1 Query Performance

- [ ] Paginated queries use LIMIT and OFFSET
- [ ] Count queries optimized (no unnecessary joins)
- [ ] Indexes exist for sortBy fields
- [ ] Search queries use appropriate indexes

### 10.2 Response Size

- [ ] Large lists are paginated (not returned all at once)
- [ ] Response payloads are reasonable size
- [ ] Unnecessary fields excluded from responses

## 11. Backward Compatibility

### 11.1 Legacy Endpoints

- [ ] Existing endpoints continue to work
- [ ] Frontend handles both standard and legacy formats
- [ ] No breaking changes introduced without migration plan

### 11.2 Migration Path

- [ ] New endpoints use standard format
- [ ] Legacy endpoints documented for migration
- [ ] Frontend compatibility layer in place

## 12. Documentation

### 12.1 API Documentation

- [ ] Endpoint documented in `/docs/architecture/API.md`
- [ ] Request/response examples provided
- [ ] Error codes documented
- [ ] Pagination parameters documented

### 12.2 Code Documentation

- [ ] Route handlers have clear comments
- [ ] Validation schemas documented
- [ ] Error handling documented

## 13. Logging & Monitoring

### 13.1 Request Logging

- [ ] Successful requests logged with `request.completed`
- [ ] Validation errors logged with `request.validation_error`
- [ ] API errors logged with `request.api_error`
- [ ] Unhandled errors logged with `request.unhandled_error`

### 13.2 Error Tracking

- [ ] 500 errors sent to Sentry
- [ ] Error context includes requestId, userId, path
- [ ] No sensitive data in logs

## 14. Edge Cases

### 14.1 Empty Results

- [ ] Empty list returns `{ data: [], meta: { total: 0, ... } }`
- [ ] Empty search results handled correctly
- [ ] No errors on empty results

### 14.2 Large Datasets

- [ ] Pagination enforced (no unbounded queries)
- [ ] Large page numbers handled gracefully
- [ ] Offset beyond total returns empty results (not error)

### 14.3 Concurrent Requests

- [ ] Concurrent updates handled safely
- [ ] Race conditions prevented
- [ ] Optimistic locking where needed

## 15. Checklist Summary

**Before marking endpoint as complete:**

- [ ] All success responses follow standard format
- [ ] All error responses follow standard format
- [ ] Error codes are correct and consistent
- [ ] Validation works correctly
- [ ] Pagination works correctly (if applicable)
- [ ] Authentication enforced correctly
- [ ] Authorization enforced correctly
- [ ] Rate limiting works (if applicable)
- [ ] Security best practices followed
- [ ] Frontend compatibility verified
- [ ] Documentation updated
- [ ] Logging implemented
- [ ] Edge cases handled

**Sign-off:**

- Tested by: _______________
- Date: _______________
- Endpoint: _______________
- Status: ☐ Pass ☐ Fail ☐ Needs Review

---

**Notes:**

Use this checklist for manual testing. Automated tests should cover most of these scenarios, but manual verification ensures the API contract is properly implemented and user-facing behavior is correct.
