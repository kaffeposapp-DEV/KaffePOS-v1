# KaffePOS Performance Optimization Guide

Version: 1.0
Date: 2026-05-14
Status: Performance Best Practices

## 1. Overview

This document outlines performance optimization strategies for KaffePOS to ensure fast, responsive user experience and efficient resource utilization.

## 2. Frontend Performance

### 2.1 Debouncing & Throttling

#### Current Implementation

**Debounced:**
- POS search input: 200ms delay
- History search input: 250ms delay

**Status:** ✅ Implemented

#### Recommendations

**Add Debouncing:**
- Inventory search/filter: 300ms
- Menu search/filter: 300ms
- Customer search (loyalty): 300ms
- Admin search fields: 300ms
- Report filter changes: 500ms

**Add Throttling:**
- Scroll events (if infinite scroll added): 100-200ms
- Window resize events (if responsive charts): 200ms
- Real-time updates (kitchen SSE): 500ms

**Implementation Pattern:**
```typescript
// Debounce hook
const debounceRef = useRef<ReturnType<typeof setTimeout>>();

const handleSearch = useCallback((value: string) => {
  setSearch(value);
  clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    setDebouncedSearch(value);
  }, 300);
}, []);

// Cleanup on unmount
useEffect(() => {
  return () => clearTimeout(debounceRef.current);
}, []);
```

### 2.2 React Optimization

#### useMemo Candidates

**High Priority:**
- Filtered menu items (POS, menu management)
- Filtered inventory items
- Filtered transactions (history)
- Calculated totals (cart, reports)
- Sorted lists (by date, amount, name)
- Grouped data (transactions by date, items by category)

**Example:**
```typescript
const filteredMenu = useMemo(() => 
  menu.filter(item => 
    item.is_available &&
    (category === 'All' || item.category === category) &&
    item.name.toLowerCase().includes(search.toLowerCase())
  ),
  [menu, category, search]
);
```

#### useCallback Candidates

**High Priority:**
- Event handlers passed to child components
- API call functions
- Form submit handlers
- Modal open/close handlers

**Example:**
```typescript
const handleAddToCart = useCallback((item: MenuItem) => {
  setCart(prev => [...prev, item]);
}, []);
```

#### Component Optimization

**Recommendations:**
- Lazy load admin pages (React.lazy + Suspense)
- Code split by route
- Virtualize long lists (react-window or react-virtuoso)
- Memoize expensive child components (React.memo)
- Avoid inline object/array creation in render

### 2.3 Data Loading & Caching

#### Pagination

**Current Status:**
- Backend supports pagination
- Frontend needs consistent pagination UI

**Recommendations:**
- Implement pagination for all list views
- Default page size: 20-50 items
- Add "Load More" or infinite scroll for mobile
- Cache paginated results
- Prefetch next page on scroll

#### Loading States

**Implemented:**
- Loading spinners in various components

**Recommendations:**
- Add skeleton screens for better perceived performance
- Show stale data while revalidating
- Implement optimistic updates for mutations
- Add progress indicators for long operations

#### Caching Strategy

**Recommendations:**
- Cache stable data (menu, inventory) in memory
- Invalidate cache on mutations
- Use SWR or React Query for data fetching (future)
- Implement cache expiry (5-15 minutes for stable data)
- Cache API responses in service worker (PWA future)

### 2.4 Asset Optimization

#### Images

**Current:**
- Cloudflare Images for user uploads
- Cloudflare CDN for static assets

**Recommendations:**
- Use WebP/AVIF format with fallback
- Implement responsive images (srcset)
- Add lazy loading (`loading="lazy"`)
- Optimize image dimensions (don't load 4K for thumbnails)
- Implement blur-up placeholder technique

**Example:**
```tsx
<img
  src={`${cdnUrl}/image.webp`}
  srcSet={`${cdnUrl}/image-320.webp 320w, ${cdnUrl}/image-640.webp 640w`}
  sizes="(max-width: 640px) 320px, 640px"
  loading="lazy"
  alt="Product"
/>
```

#### Bundle Size

**Current Status:**
- Vite build with code splitting

**Recommendations:**
- Analyze bundle size (vite-bundle-visualizer)
- Remove unused dependencies
- Use dynamic imports for large libraries
- Tree-shake unused code
- Minimize vendor bundle size

**Target Metrics:**
- Initial bundle: <200KB gzipped
- Total bundle: <500KB gzipped
- Lazy chunks: <50KB each

### 2.5 Network Optimization

#### API Calls

**Recommendations:**
- Batch related API calls
- Implement request deduplication
- Use HTTP/2 multiplexing
- Add request cancellation (AbortController)
- Implement retry logic with exponential backoff

**Example:**
```typescript
const abortController = new AbortController();

fetch(url, { signal: abortController.signal })
  .then(res => res.json())
  .catch(err => {
    if (err.name === 'AbortError') {
      console.log('Request cancelled');
    }
  });

// Cleanup
return () => abortController.abort();
```

#### Compression

**Recommendations:**
- Enable gzip/brotli compression on server
- Compress API responses
- Use compression for large payloads

---

## 3. Backend Performance

### 3.1 Database Query Optimization

#### Indexing Strategy

**Current Indexes:**
- Foreign keys indexed
- Referral/affiliate codes indexed
- Some status columns indexed

**Missing Indexes (High Priority):**
```sql
-- Transactions
CREATE INDEX idx_transactions_store_date ON transactions(store_id, date DESC);
CREATE INDEX idx_transactions_store_status ON transactions(store_id, is_void, date DESC);

-- Inventory
CREATE INDEX idx_inventory_store_stock ON inventory(store_id, stock) WHERE stock <= min_stock;

-- Menu Items
CREATE INDEX idx_menu_items_store_available ON menu_items(store_id, is_available);

-- Kitchen Orders
CREATE INDEX idx_kitchen_orders_store_status_created ON kitchen_orders(store_id, overall_status, created_at DESC);

-- Loyalty
CREATE INDEX idx_loyalty_passports_phone ON loyalty_passports(phone_number);
CREATE INDEX idx_loyalty_stamp_events_passport ON loyalty_stamp_events(passport_id, created_at DESC);

-- Subscriptions
CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);
CREATE INDEX idx_subscriptions_expires ON subscriptions(expires_at) WHERE status = 'active';

-- Payment Sessions
CREATE INDEX idx_payment_sessions_user_created ON subscription_payment_sessions(user_id, created_at DESC);
CREATE INDEX idx_payment_sessions_status ON subscription_payment_sessions(transaction_status, created_at DESC);

-- Notifications
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
```

#### Query Optimization

**Recommendations:**
- Use EXPLAIN ANALYZE for slow queries
- Avoid SELECT * (select only needed columns)
- Use LIMIT on all list queries
- Avoid N+1 queries (use JOINs or batch queries)
- Use EXISTS instead of COUNT when checking existence
- Use partial indexes for filtered queries

**Example - Avoid N+1:**
```typescript
// Bad: N+1 query
const transactions = await getTransactions();
for (const tx of transactions) {
  tx.items = await getTransactionItems(tx.id); // N queries
}

// Good: Single query with JOIN
const transactions = await pool.query(`
  SELECT 
    t.*,
    json_agg(ti.*) as items
  FROM transactions t
  LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
  WHERE t.store_id = $1
  GROUP BY t.id
  ORDER BY t.date DESC
  LIMIT 50
`, [storeId]);
```

### 3.2 API Response Optimization

#### Pagination

**Current Status:**
- Pagination helper exists
- Not consistently applied

**Recommendations:**
- Apply pagination to all list endpoints
- Default limit: 20-50
- Max limit: 100-200
- Return pagination metadata (total, page, hasMore)

**Example:**
```typescript
{
  items: [...],
  pagination: {
    page: 1,
    limit: 20,
    total: 150,
    totalPages: 8,
    hasMore: true
  }
}
```

#### Response Payload

**Recommendations:**
- Exclude unnecessary fields
- Use field selection (e.g., `?fields=id,name,price`)
- Paginate nested arrays
- Use summary endpoints for dashboards
- Compress large responses

**Example:**
```typescript
// Bad: Return everything
SELECT * FROM transactions;

// Good: Return only needed fields
SELECT id, date, total, customer_name, method 
FROM transactions 
WHERE store_id = $1 
ORDER BY date DESC 
LIMIT 20;
```

### 3.3 Caching Strategy

#### Application-Level Caching

**Recommendations:**
- Cache stable data (menu, inventory) in memory
- Use Redis for distributed caching (future)
- Implement cache invalidation on mutations
- Add cache headers for static data

**Example:**
```typescript
// In-memory cache with TTL
const cache = new Map<string, { data: any; expires: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T, ttlMs: number) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}
```

#### HTTP Caching

**Recommendations:**
- Add Cache-Control headers for static assets
- Use ETag for conditional requests
- Implement Last-Modified headers
- Cache CDN assets aggressively (1 year)

**Example:**
```typescript
// Static assets
res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

// API responses (stable data)
res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes

// API responses (dynamic data)
res.setHeader('Cache-Control', 'no-cache, must-revalidate');
```

### 3.4 Connection Pooling

**Current Status:**
- PostgreSQL connection pool configured

**Recommendations:**
- Monitor pool utilization
- Adjust pool size based on load (default: 10-20)
- Set connection timeout (30s)
- Set idle timeout (10s)
- Monitor connection leaks

**Configuration:**
```typescript
const pool = new Pool({
  max: 20, // max connections
  idleTimeoutMillis: 10000, // close idle connections after 10s
  connectionTimeoutMillis: 30000, // timeout after 30s
});
```

### 3.5 Background Jobs

**Current Status:**
- No job queue implemented
- Email/analytics sync in request lifecycle

**Recommendations (Future):**
- Implement job queue (BullMQ + Redis)
- Move email sending to queue
- Move analytics sync to queue
- Move report generation to queue
- Move payout processing to queue

**Priority Jobs:**
1. Email sending (high priority)
2. Analytics sync (low priority)
3. Report generation (medium priority)
4. Scheduled reminders (low priority)

---

## 4. Database Performance

### 4.1 Connection Management

**Recommendations:**
- Use connection pooling (implemented)
- Monitor active connections
- Set connection limits
- Implement connection retry logic
- Add connection health checks

### 4.2 Query Performance

**Monitoring:**
- Enable slow query log (queries >1s)
- Monitor query execution time
- Track most frequent queries
- Identify missing indexes

**Tools:**
```sql
-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Find missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.1;
```

### 4.3 Database Maintenance

**Recommendations:**
- Run VACUUM regularly (weekly)
- Run ANALYZE after bulk changes
- Monitor table bloat
- Reindex periodically (monthly)
- Monitor disk space

**Maintenance Script:**
```sql
-- Vacuum and analyze
VACUUM ANALYZE;

-- Reindex (during maintenance window)
REINDEX DATABASE kaffepos_production;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 5. Mobile Performance

### 5.1 Capacitor Optimization

**Recommendations:**
- Use native storage (Preferences API) - implemented
- Minimize bridge calls
- Batch native operations
- Optimize WebView performance
- Reduce JavaScript bundle size

### 5.2 Offline Performance

**Recommendations:**
- Cache critical data locally
- Implement offline queue for mutations
- Show offline indicator
- Sync when online
- Handle conflicts gracefully

### 5.3 Startup Performance

**Recommendations:**
- Minimize initial bundle size
- Lazy load non-critical features
- Optimize splash screen duration
- Preload critical data
- Use skeleton screens

---

## 6. Monitoring & Metrics

### 6.1 Frontend Metrics

**Key Metrics:**
- First Contentful Paint (FCP): <1.8s
- Largest Contentful Paint (LCP): <2.5s
- Time to Interactive (TTI): <3.8s
- First Input Delay (FID): <100ms
- Cumulative Layout Shift (CLS): <0.1

**Tools:**
- Lighthouse (Chrome DevTools)
- Web Vitals library
- Google Analytics (Core Web Vitals)
- Real User Monitoring (RUM)

### 6.2 Backend Metrics

**Key Metrics:**
- API response time (p50, p95, p99)
- Database query time
- Error rate
- Request rate
- Active connections

**Tools:**
- Application Performance Monitoring (APM)
- Database monitoring
- Log aggregation
- Custom metrics (Prometheus/Grafana)

### 6.3 Performance Budgets

**Frontend:**
- Initial load: <3s on 3G
- API response: <500ms (p95)
- Bundle size: <500KB total
- Images: <100KB each

**Backend:**
- API response: <200ms (p50), <500ms (p95)
- Database query: <50ms (p50), <200ms (p95)
- Error rate: <1%
- Uptime: >99.9%

---

## 7. Performance Testing

### 7.1 Load Testing

**Recommendations:**
- Test with 10x expected load
- Identify bottlenecks
- Test database under load
- Test API rate limits
- Test concurrent users

**Tools:**
- Apache JMeter
- k6
- Artillery
- Locust

### 7.2 Stress Testing

**Recommendations:**
- Test system limits
- Identify breaking points
- Test recovery after failure
- Test database connection exhaustion
- Test memory leaks

### 7.3 Performance Regression Testing

**Recommendations:**
- Benchmark critical paths
- Track performance over time
- Alert on regressions
- Automate performance tests
- Include in CI/CD pipeline

---

## 8. Quick Wins (Immediate Impact)

### High Impact, Low Effort

1. **Add missing database indexes** (30 min)
   - Transactions by store + date
   - Inventory low stock
   - Notifications unread

2. **Implement debouncing for all search inputs** (1 hour)
   - Inventory search
   - Menu search
   - Customer search

3. **Add pagination to list views** (2 hours)
   - Inventory list
   - Menu list
   - Reports list

4. **Optimize API responses** (1 hour)
   - Remove unnecessary fields
   - Add field selection

5. **Add loading skeletons** (2 hours)
   - Replace spinners with skeletons
   - Better perceived performance

### Medium Impact, Medium Effort

6. **Implement React.memo for expensive components** (3 hours)
7. **Add lazy loading for admin pages** (2 hours)
8. **Optimize images (WebP, lazy loading)** (3 hours)
9. **Implement request caching** (4 hours)
10. **Add query optimization (EXPLAIN ANALYZE)** (4 hours)

### High Impact, High Effort

11. **Implement job queue for background tasks** (2-3 days)
12. **Add Redis caching layer** (2-3 days)
13. **Implement service worker for PWA** (3-5 days)
14. **Add comprehensive monitoring** (3-5 days)
15. **Optimize database schema** (1 week)

---

## 9. Performance Checklist

### Frontend
- [ ] All search inputs debounced (300ms)
- [ ] Expensive calculations memoized
- [ ] Large lists paginated or virtualized
- [ ] Images lazy loaded and optimized
- [ ] Admin pages code-split
- [ ] Bundle size <500KB
- [ ] Loading states implemented
- [ ] Error boundaries added

### Backend
- [ ] All list endpoints paginated
- [ ] Database indexes optimized
- [ ] Slow queries identified and fixed
- [ ] Connection pooling configured
- [ ] Response payloads minimized
- [ ] Caching implemented where beneficial
- [ ] API response time <500ms (p95)

### Database
- [ ] Indexes on foreign keys
- [ ] Indexes on filtered columns
- [ ] Indexes on sorted columns
- [ ] VACUUM scheduled
- [ ] ANALYZE scheduled
- [ ] Slow query log enabled
- [ ] Connection limits configured

### Mobile
- [ ] Native storage used
- [ ] Bundle size optimized
- [ ] Offline support implemented
- [ ] Startup time <3s
- [ ] Smooth scrolling

### Monitoring
- [ ] Performance metrics tracked
- [ ] Alerts configured
- [ ] Performance budgets defined
- [ ] Regular performance reviews
- [ ] Load testing performed

---

## 10. Conclusion

Performance optimization is an ongoing process. Focus on high-impact improvements first, measure results, and iterate.

**Next Steps:**
1. Implement quick wins (database indexes, debouncing)
2. Add performance monitoring
3. Establish performance budgets
4. Schedule regular performance reviews
5. Automate performance testing

**Performance Goals:**
- Page load: <3s on 3G
- API response: <500ms (p95)
- Database query: <200ms (p95)
- Zero performance regressions

## Backend Observability & Performance Improvements (Added 2026-05-14)

### Rate Limiting Implementation ✅

**Centralized Rate Limiters**: `backend/src/lib/rateLimiters.ts`

| Endpoint Type | Limit | Window | Status |
|--------------|-------|--------|--------|
| Auth Login | 10 | 15 min | ✅ Implemented |
| Auth Email (OTP/Reset) | 5 | 15 min | ✅ Implemented |
| Auth Verify | 20 | 15 min | ✅ Implemented |
| Payment Create | 12 | 15 min | ✅ Implemented |
| Public Referral | 120 | 15 min | ✅ Implemented |
| Admin Routes | 1000 | 60 min | ✅ Implemented |
| Affiliate Apply | 3 | 60 min | ✅ Implemented |
| Affiliate Payout | 10 | 60 min | ✅ Implemented |
| Commission Actions | 100 | 15 min | ✅ Implemented |

**Features**:
- In-memory rate limit store with automatic cleanup
- Configurable via environment variables
- Returns 429 with `Retry-After` header
- Logs rate limit hits
- Safe error messages

### Request ID Middleware ✅

**Implementation**: `backend/src/index.ts`

**Features**:
- Generates UUID for each request
- Accepts `X-Request-Id` header from client
- Returns `X-Request-Id` in response header
- Available in `req.requestId` throughout middleware chain
- Included in all logs for request tracing
- Included in error responses (development mode)

**Usage**:
```typescript
// Client sends request with custom ID
fetch('/api/endpoint', {
  headers: { 'X-Request-Id': 'custom-trace-id' }
});

// Server logs include request ID
log('info', 'event.name', {
  requestId: req.requestId,
  // ... other fields
});
```

### Enhanced Logging ✅

**Structured JSON Logging**: `backend/src/core/errors.ts`

**Log Format**:
```json
{
  "ts": "2026-05-14T00:00:00.000Z",
  "level": "info",
  "service": "kaffepos-backend",
  "version": "1.0.0",
  "msg": "event.name",
  "requestId": "uuid",
  "userId": "uuid",
  "...": "additional context"
}
```

**Log Coverage**:
- Server lifecycle (startup, shutdown, errors)
- Request completion (method, path, status, duration, IP, userId)
- Authentication events (login, verify, reset)
- Admin actions (subscription activate/cancel, affiliate status, commission actions)
- Payment webhooks (received, signature validation, processing)
- External service failures (email, payment API)
- Rate limit hits
- All errors with full context

**Secrets Safety**:
- Passwords NEVER logged
- Tokens NEVER logged
- API keys NEVER logged
- Bank accounts NEVER logged
- Raw sensitive data NEVER logged

### Error Observability ✅

**Centralized Error Handler**: `backend/src/core/errorHandler.ts`

**Features**:
- Standardized error response format
- Specific error codes (VALIDATION_ERROR, UNAUTHORIZED, etc.)
- Safe error messages (no stack traces in production)
- Request ID included in logs
- Sentry integration for unhandled errors
- Validation error details for client debugging

**Error Response Format**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
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

### Performance Monitoring Recommendations

**Quick Wins Implemented**:
1. ✅ Rate limiting on all sensitive endpoints
2. ✅ Request ID for distributed tracing
3. ✅ Structured logging for observability
4. ✅ Error handler with safe messages

**Next Steps**:
1. ⚠️ Add timeout configuration for external services (Midtrans, Resend)
2. ⚠️ Implement retry logic for email sending
3. ⚠️ Add database query performance logging (>1s queries)
4. ⚠️ Verify performance indexes are applied
5. ⚠️ Add APM (Application Performance Monitoring)

### Observability Best Practices

**Request Tracing**:
- Use request ID for end-to-end tracing
- Include request ID in all logs
- Pass request ID to external services (where supported)
- Use request ID for debugging production issues

**Log Analysis**:
- Search logs by request ID for full request lifecycle
- Search logs by user ID for user-specific issues
- Search logs by event name for specific operations
- Monitor error rates by error code

**Performance Monitoring**:
- Monitor request duration (p50, p95, p99)
- Monitor rate limit hits
- Monitor external service failures
- Monitor database query performance
- Set up alerts for anomalies

**Production Readiness**:
- ✅ Rate limiting prevents abuse
- ✅ Request ID enables debugging
- ✅ Logging provides visibility
- ✅ Error handling is safe
- ✅ Webhook reliability is ensured
- ⚠️ External service timeouts needed
- ⚠️ Performance indexes verification needed

### QA Checklist

See `docs/engineering/BACKEND_OBSERVABILITY_QA_CHECKLIST.md` for comprehensive testing checklist covering:
- Rate limiting validation
- Request ID verification
- Logging coverage
- Error handling safety
- Webhook reliability
- External service reliability
- Health check validation
- Performance testing
- Security validation


## 2026-05-24 Performance Audit Addendum

Current local production build passes. Observed large chunks include dashboard/report/pdf-related assets; keep heavy reporting and PDF flows lazily loaded and avoid moving them into the initial shell. Large operational lists should remain paginated/debounced, and new reporting queries should use store/date/status indexes documented in the database guide.

Operational recommendations:
- Keep hashed static assets on long CDN cache and `index.html` on short/no-cache.
- Monitor `/metrics` for latency and error-rate trends.
- Add e2e smoke coverage before expanding expensive admin/report workflows.
