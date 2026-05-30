# KaffePOS API Contract Documentation

Version: 2.0
Date: 2026-05-14
Status: Source of truth for API standards

## 1. Overview

This document defines the standardized API contract for all KaffePOS backend endpoints. All new endpoints MUST follow these standards. Existing endpoints will be gradually migrated to this standard format.

## 2. API Response Standards

### 2.1 Success Response Format

All successful API responses follow one of these formats:

#### Single Object Response

Used when returning a single resource (user, transaction, menu item, etc.)

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Example",
    "createdAt": "2026-05-14T00:00:00Z"
  }
}
```

#### List Response (Paginated)

Used when returning a list of resources with pagination.

```json
{
  "success": true,
  "data": [
    { "id": "uuid-1", "name": "Item 1" },
    { "id": "uuid-2", "name": "Item 2" }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasMore": true,
    "nextOffset": 20
  }
}
```

#### Action Response (No Data)

Used for actions that don't return data (logout, delete, etc.)

```json
{
  "success": true,
  "message": "Action completed successfully"
}
```

#### Success Response with Message

Used when returning data with an additional success message.

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "active"
  },
  "message": "Subscription activated successfully"
}
```

### 2.2 Error Response Format

All error responses follow this standardized format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "invalid_string"
      }
    ]
  }
}
```

**Error Response Fields:**
- `success`: Always `false` for errors
- `error.code`: Machine-readable error code (see Error Codes section)
- `error.message`: Human-readable error message (safe for display)
- `error.details`: Optional array of validation error details (only for VALIDATION_ERROR)

### 2.3 Error Codes

Standard error codes used across all endpoints:

| Code | HTTP Status | Description | Use Case |
|------|-------------|-------------|----------|
| `VALIDATION_ERROR` | 400 | Request validation failed | Invalid input, missing required fields |
| `BAD_REQUEST` | 400 | Malformed request | Invalid JSON, unsupported content type |
| `UNAUTHORIZED` | 401 | Authentication required or failed | Missing token, expired session |
| `FORBIDDEN` | 403 | Insufficient permissions | Role/permission check failed |
| `NOT_FOUND` | 404 | Resource not found | Invalid ID, deleted resource |
| `CONFLICT` | 409 | Resource conflict | Duplicate email, concurrent update |
| `RATE_LIMITED` | 429 | Too many requests | Rate limit exceeded |
| `PAYMENT_ERROR` | 400 | Payment processing failed | Invalid payment data, payment declined |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | Webhook signature verification failed | Invalid Midtrans signature |
| `FEATURE_DISABLED` | 403 | Feature is disabled | Feature flag off, plan restriction |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error | Unhandled exception, database error |

### 2.4 Validation Error Details

When `error.code` is `VALIDATION_ERROR`, the `error.details` array contains field-level validation errors:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "invalid_string"
      },
      {
        "field": "password",
        "message": "String must contain at least 10 character(s)",
        "code": "too_small"
      }
    ]
  }
}
```

## 3. Pagination Standards

### 3.1 Query Parameters

All list endpoints support these pagination query parameters:

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | integer | 1 | - | Page number (1-indexed) |
| `limit` | integer | 20 | 100 | Items per page |
| `offset` | integer | - | - | Alternative to page (0-indexed) |
| `sortBy` | string | varies | - | Field to sort by |
| `sortOrder` | enum | `desc` | - | Sort direction: `asc` or `desc` |
| `search` | string | - | 200 chars | Search query |

**Examples:**
```
GET /api/transactions?page=1&limit=20&sortBy=created_at&sortOrder=desc
GET /api/transactions?offset=0&limit=20&search=coffee
```

### 3.2 Pagination Metadata

Paginated responses include a `meta` object with pagination information:

```json
{
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasMore": true,
    "nextOffset": 20,
    "offset": 0,
    "returned": 20
  }
}
```

**Metadata Fields:**
- `page`: Current page number (1-indexed)
- `limit`: Items per page
- `total`: Total number of items across all pages
- `totalPages`: Total number of pages
- `hasMore`: Boolean indicating if more items exist
- `nextOffset`: Offset for next page (null if no more items)
- `offset`: Current offset (0-indexed)
- `returned`: Number of items returned in current response

### 3.3 Pagination Rules

1. Default `limit` is 20, maximum is 100
2. `page` is 1-indexed (first page is 1)
3. `offset` is 0-indexed (first item is 0)
4. If both `page` and `offset` are provided, `offset` takes precedence
5. `total` count is always included for proper pagination UI
6. Empty results return `{ data: [], meta: { total: 0, ... } }`

## 4. Authentication & Authorization

### 4.1 Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

**Unauthenticated Request:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Sesi tidak valid atau sudah kedaluwarsa."
  }
}
```

### 4.2 Authorization

Endpoints enforce role-based access control (RBAC):

**Roles:**
- `owner_admin`: Full access to store management
- `cashier`: Limited access to POS operations

**Insufficient Permission:**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Akses tidak diizinkan untuk role akun ini."
  }
}
```

### 4.3 Admin Access

Internal admin endpoints require admin email whitelist:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Akses admin ditolak."
  }
}
```

## 5. Rate Limiting

### 5.1 Rate Limits

| Endpoint Type | Limit | Window | Key |
|--------------|-------|--------|-----|
| Auth Login | 10 attempts | 15 min | email + IP |
| Auth Email (OTP/Reset) | 5 attempts | 15 min | email + IP |
| Auth Verify | 20 attempts | 15 min | email + IP |
| Payment Creation | 12 attempts | 15 min | user + IP |

### 5.2 Rate Limit Response

When rate limit is exceeded:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi."
  }
}
```

**Response Headers:**
```
Retry-After: 300
```

## 6. Validation Standards

### 6.1 Input Validation

All request inputs are validated using Zod schemas:

- **Body**: JSON payload validation
- **Query**: URL query parameter validation
- **Params**: URL path parameter validation

### 6.2 Common Validation Rules

| Field Type | Validation |
|------------|------------|
| UUID | Valid UUID v4 format |
| Email | Valid email format, normalized (lowercase, trimmed) |
| Password | Minimum 10 characters |
| Phone | Optional, format varies by region |
| Amount | Non-negative number |
| Date | ISO 8601 datetime string |
| Search | Maximum 200 characters, trimmed |

### 6.3 Validation Error Example

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "invalid_string"
      }
    ]
  }
}
```

## 7. Webhook Responses

### 7.1 Webhook Exception

Third-party webhooks (e.g., Midtrans) do NOT follow the standard API format. They return simple acknowledgment responses expected by the provider:

```json
{
  "received": true
}
```

**Rationale:** Webhook providers expect specific response formats. Forcing standard format may break integrations.

### 7.2 Webhook Security

- Signature verification required before processing
- Invalid signature returns 401 with `WEBHOOK_SIGNATURE_INVALID` code
- All webhook events logged to `payment_webhook_logs` table
- Idempotency enforced via webhook logs

## 8. API Endpoint Groups

Backend startup keeps route registration modular: `backend/src/index.ts` mounts route modules with `app.use(...)`, while individual endpoint definitions live under `backend/src/routes/*`. This keeps route ownership predictable and avoids duplicate direct bootstrap definitions.

### 8.0 Operational Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | Backend health check |
| `/metrics` | GET | No | Backend metrics snapshot / Prometheus-compatible metrics |

### 8.1 Authentication

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/register` | POST | No | Register new user |
| `/api/auth/login` | POST | No | Login with email/password |
| `/api/auth/session` | GET | Yes | Get current session |
| `/api/auth/logout` | POST | Yes | Logout current session |
| `/api/auth/verification/resend` | POST | No | Resend verification OTP |
| `/api/auth/verification/confirm` | POST | No | Confirm email verification |
| `/api/auth/password/forgot` | POST | No | Request password reset |
| `/api/auth/password/reset` | POST | No | Reset password with token |

### 8.2 POS & Transactions

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/transactions` | GET | Yes | List transactions (paginated) |
| `/api/transactions/checkout` | POST | Yes | Create new transaction |
| `/api/transactions/:id/void` | POST | Yes | Void transaction |

### 8.3 Menu & Inventory

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/menu-items` | GET | Yes | List menu items |
| `/api/menu-items` | POST | Yes | Create menu item |
| `/api/menu-items/:id` | PATCH | Yes | Update menu item |
| `/api/menu-items/:id` | DELETE | Yes | Delete menu item |
| `/api/inventory` | GET | Yes | List inventory items (paginated) |
| `/api/inventory` | POST | Yes | Create inventory item |
| `/api/inventory/:id` | PATCH | Yes | Update inventory item |

### 8.4 Payment & Subscription

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/subscriptions` | GET | Yes | Get user subscription |
| `/api/subscriptions/payments/quote` | POST | Yes | Get payment quote |
| `/api/subscriptions/payments/create` | POST | Yes | Create payment session |
| `/api/payments/midtrans/webhook` | POST | No | Midtrans webhook (special format) |

### 8.5 Admin

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/subscriptions/overview` | GET | Admin | List all subscriptions |
| `/api/admin/subscriptions/activate` | POST | Admin | Manually activate subscription |
| `/api/admin/subscriptions/:id/cancel` | POST | Admin | Cancel subscription |

### 8.6 Affiliate & Referral

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/referrals/me` | GET | Yes | Get user referral dashboard |
| `/api/referrals/generate` | POST | Yes | Generate referral code |
| `/api/affiliate/me` | GET | Yes | Get affiliate profile |
| `/api/affiliate/apply` | POST | Yes | Apply for affiliate program |
| `/api/admin/affiliates` | GET | Admin | List affiliate profiles |
| `/api/admin/commissions` | GET | Admin | List commission transactions |

## 9. Backward Compatibility

### 9.1 Migration Strategy

The API standardization is being rolled out gradually:

**Phase 1: New Infrastructure (Current)**
- ✅ Standard response types defined
- ✅ Error handler with error codes
- ✅ Validation middleware
- ✅ Enhanced pagination helpers
- ✅ Frontend API client utilities

**Phase 2: Gradual Migration**
- Existing endpoints continue to work
- New endpoints use standard format
- Frontend handles both formats transparently

**Phase 3: Full Migration**
- All endpoints migrated to standard format
- Legacy format support removed
- Documentation updated

### 9.2 Frontend Compatibility

The frontend API client (`src/lib/backendApi.ts` and `src/lib/apiClient.ts`) handles both formats:

```typescript
// Automatically unwraps standard format
const data = await apiFetch<User>('/api/profile/me');

// Works with both:
// Standard: { success: true, data: { id, name, ... } }
// Legacy: { id, name, ... }
```

### 9.3 Breaking Change Policy

**No breaking changes without:**
1. Documentation update in this file
2. Frontend compatibility layer
3. Migration guide for affected endpoints
4. Update to `CHANGELOG_PRODUCT.md`

## 10. Security Best Practices

### 10.1 Response Security

✅ **DO:**
- Return safe error messages to clients
- Log detailed errors server-side only
- Use specific error codes for client handling
- Include `Retry-After` header for rate limits

❌ **DON'T:**
- Expose stack traces in production
- Return raw database errors
- Include sensitive data in error messages
- Leak internal system information

### 10.2 Input Security

✅ **DO:**
- Validate all inputs with Zod schemas
- Sanitize search queries (max 200 chars)
- Use parameterized SQL queries only
- Normalize emails (lowercase, trim)
- Enforce rate limits on sensitive endpoints

❌ **DON'T:**
- Trust client input without validation
- Use string concatenation for SQL
- Allow unbounded list queries
- Skip validation on "internal" endpoints

## 11. Testing & QA

### 11.1 API Contract Tests

All endpoints should be tested for:
- ✅ Success response format matches standard
- ✅ Error response format matches standard
- ✅ Validation errors return proper details
- ✅ Pagination metadata is correct
- ✅ Error codes are appropriate for status
- ✅ Rate limits are enforced
- ✅ Authentication is required where needed
- ✅ Authorization is enforced correctly

### 11.2 Manual QA Checklist

See `/docs/engineering/API_CONTRACT_QA_CHECKLIST.md` for detailed manual testing checklist.

## 12. Examples

### 12.1 Successful List Request

**Request:**
```
GET /api/transactions?page=1&limit=20&sortBy=created_at&sortOrder=desc&search=coffee
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "total": 50000,
      "items": [...],
      "createdAt": "2026-05-14T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasMore": true,
    "nextOffset": 20,
    "offset": 0,
    "returned": 20
  }
}
```

### 12.2 Validation Error

**Request:**
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "invalid-email",
  "password": "short",
  "username": "ab"
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "invalid_string"
      },
      {
        "field": "password",
        "message": "String must contain at least 10 character(s)",
        "code": "too_small"
      },
      {
        "field": "username",
        "message": "String must contain at least 3 character(s)",
        "code": "too_small"
      }
    ]
  }
}
```

### 12.3 Unauthorized Error

**Request:**
```
GET /api/profile/me
```

**Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Sesi tidak valid atau sudah kedaluwarsa."
  }
}
```

### 12.4 Rate Limit Error

**Request:**
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "wrong-password"
}
```

**Response (429 Too Many Requests):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi."
  }
}
```

**Headers:**
```
Retry-After: 300
```

## 13. Changelog

### 2026-05-14 - v2.0
- Initial API contract documentation
- Standardized response format defined
- Error codes standardized
- Pagination format enhanced with total count
- Validation error details structure defined
- Backward compatibility strategy documented

---

**For implementation details, see:**
- Backend: `backend/src/lib/apiResponse.ts`
- Backend: `backend/src/core/errorHandler.ts`
- Backend: `backend/src/lib/validation.ts`
- Backend: `backend/src/core/paginationEnhanced.ts`
- Frontend: `src/lib/apiClient.ts`

## Duitku Payment Migration

- Payment gateway can run as `duitku`, `midtrans`, or `disabled` via `PAYMENT_GATEWAY_PROVIDER`.
- Duitku callback URL: `https://api.kaffepos.my.id/api/webhooks/duitku`.
- Duitku return URL: `https://kaffepos.my.id/settings?billing=duitku-return`.
- Frontend return URL never marks payment paid; payment success requires verified server callback or verified status check.
- Duitku merchant key stays backend-only and must not be added to `VITE_*` env.

## Generic Payment Start

`POST /api/payments/start` starts a subscription payment with the active provider from `PAYMENT_GATEWAY_PROVIDER`.

Request body matches subscription checkout:

```json
{
  "plan": "kopi_susu",
  "billingCycle": "monthly",
  "paymentMethod": "qris",
  "voucherCode": null
}
```

Response:

```json
{
  "success": true,
  "data": {
    "paymentId": "uuid",
    "provider": "duitku",
    "merchantOrderId": "DUITKU-SUB-...",
    "paymentUrl": "https://sandbox.duitku.com/...",
    "status": "pending"
  }
}
```

`/api/subscriptions/payments/create` remains available for backward compatibility.
