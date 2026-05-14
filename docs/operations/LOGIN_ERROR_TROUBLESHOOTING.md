# Login Error Troubleshooting Guide

**Error:** "Login belum bisa diproses. Coba lagi beberapa saat."

**Date:** 2026-05-14  
**Status:** Quick Fix Guide

---

## 🔍 Common Causes

### 1. Database Connection Issue (Most Common)

**Symptoms:**
- Login error message
- Backend logs show connection errors
- Health check fails

**Quick Fix:**
```bash
# Test database connection
bash scripts/test-database-connection.sh

# Check backend logs in Coolify
# Look for: ECONNREFUSED, connection timeout, pool timeout
```

**Solutions:**

**A. Database Not Running**
```bash
# In Coolify: Check PostgreSQL service status
# Restart if needed
```

**B. Wrong DATABASE_URL**
```bash
# Verify format:
# postgresql://user:password@host:5432/database

# In Coolify backend env:
# Check DATABASE_URL is correct
# Check DB_SSL=true if database requires SSL
```

**C. Firewall/Network Issue**
```bash
# Ensure backend can reach database
# Check firewall rules
# Verify database accepts connections from backend IP
```

### 2. Missing Database Tables

**Symptoms:**
- Login error
- Backend logs show "relation does not exist"

**Quick Fix:**
```bash
# SSH to backend container
npm run migrate

# Or manually:
psql $DATABASE_URL -f backend/migrations/*.sql
```

### 3. Rate Limiting

**Symptoms:**
- Error after multiple login attempts
- "Terlalu banyak percobaan" message

**Quick Fix:**
```bash
# Wait 15 minutes
# Or clear rate limit in database:
psql $DATABASE_URL -c "DELETE FROM auth_account_lockouts WHERE email = 'user@example.com';"
```

### 4. CORS Configuration

**Symptoms:**
- Login works in backend but fails in frontend
- Browser console shows CORS error

**Quick Fix:**
```bash
# In Coolify backend env:
CORS_ORIGIN=https://kaffepos.my.id

# Must match frontend domain exactly
# Redeploy backend after change
```

### 5. SSL/TLS Issue

**Symptoms:**
- Connection refused
- SSL handshake failed

**Quick Fix:**
```bash
# Try without SSL first:
DB_SSL=false

# If works, then configure SSL properly:
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false  # For self-signed certs
```

---

## 🚀 Quick Diagnostic Steps

### Step 1: Check Backend Health

```bash
curl https://api.kaffepos.my.id/health
# Expected: {"status":"ok"}

curl https://api.kaffepos.my.id/health/db
# Expected: {"status":"ok","database":"connected"}
```

If health check fails → Database connection issue

### Step 2: Check Backend Logs

In Coolify:
1. Go to backend service
2. Click "Logs"
3. Look for errors when login is attempted

Common error patterns:
- `ECONNREFUSED` → Database not reachable
- `relation "app_auth_credentials" does not exist` → Missing tables
- `too many connections` → Database pool exhausted
- `SSL connection` → SSL configuration issue

### Step 3: Test Database Connection

```bash
# From backend container:
psql $DATABASE_URL -c "SELECT 1;"

# Should return:
#  ?column? 
# ----------
#         1
```

### Step 4: Check Environment Variables

In Coolify backend:
- `DATABASE_URL` → Must be correct
- `DB_SSL` → Set to `true` if database requires SSL
- `CORS_ORIGIN` → Must match frontend domain
- `NODE_ENV` → Should be `production`

---

## 🔧 Immediate Fixes

### Fix 1: Restart Services

```bash
# In Coolify:
1. Restart PostgreSQL service
2. Restart backend service
3. Test login again
```

### Fix 2: Apply Migrations

```bash
# SSH to backend container:
npm run migrate

# Verify:
psql $DATABASE_URL -c "SELECT COUNT(*) FROM app_auth_credentials;"
```

### Fix 3: Check Database Credentials

```bash
# Test connection manually:
psql postgresql://user:pass@host:5432/dbname

# If fails, update DATABASE_URL in Coolify
```

### Fix 4: Clear Rate Limits

```bash
# If user is locked out:
psql $DATABASE_URL -c "DELETE FROM auth_account_lockouts WHERE email = 'user@example.com';"
```

---

## 📊 Monitoring

### Enable Debug Logging

In Coolify backend env:
```bash
LOG_LEVEL=debug
```

Redeploy and check logs for detailed error information.

### Check Metrics

```bash
# API metrics:
curl https://api.kaffepos.my.id/metrics

# Look for:
# - api_errors_5xx (should be 0)
# - db_query_errors (should be 0)
```

---

## ✅ Verification After Fix

1. **Health Check**
   ```bash
   curl https://api.kaffepos.my.id/health/db
   ```

2. **Test Login**
   - Go to https://kaffepos.my.id
   - Try login with test account
   - Should succeed

3. **Check Logs**
   - No errors in backend logs
   - Login success message appears

---

## 🆘 Still Not Working?

### Collect Debug Information

```bash
# 1. Backend health
curl https://api.kaffepos.my.id/health
curl https://api.kaffepos.my.id/health/db

# 2. Database connection
psql $DATABASE_URL -c "SELECT version();"

# 3. Backend logs (last 50 lines)
# From Coolify logs

# 4. Browser console errors
# Open browser DevTools → Console
# Try login and copy errors
```

### Contact Support

Provide:
1. Error message from user
2. Backend logs (last 50 lines)
3. Health check results
4. Database connection test results
5. Environment (Coolify, database type, etc.)

---

## 📝 Prevention

### Regular Checks

```bash
# Daily health check:
bash scripts/health-check.sh

# Weekly database check:
bash scripts/test-database-connection.sh
```

### Monitoring Setup

- Enable Sentry error tracking
- Set up uptime monitoring
- Configure database connection alerts

---

**Last Updated:** 2026-05-14  
**Next Review:** When issue is resolved
