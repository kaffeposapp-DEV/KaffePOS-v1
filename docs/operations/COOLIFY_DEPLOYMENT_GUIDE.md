# Coolify Deployment Guide - KaffePOS v2

**Version:** 2.0  
**Date:** 2026-05-14  
**Status:** Production Ready

---

## ✅ Coolify Readiness Status

**Backend:** ✅ Ready (Dockerfile + health check configured)  
**Frontend:** ✅ Ready (Dockerfile configured)  
**Database:** ✅ Ready (PostgreSQL with SSL support)  
**Monitoring:** ✅ Optional (Docker Compose stack available)

---

## 🚀 Quick Deployment

### Backend Service

**Repository:** `https://github.com/kaffeposapp-DEV/KaffePOS-v1.git`  
**Branch:** `main`  
**Dockerfile:** `backend/Dockerfile`  
**Port:** `8787`  
**Health Check:** `/health`

### Frontend Service

**Repository:** `https://github.com/kaffeposapp-DEV/KaffePOS-v1.git`  
**Branch:** `main`  
**Dockerfile:** `frontend.Dockerfile`  
**Port:** `4173`

---

## 📋 Environment Variables

### Backend (.env)

```bash
NODE_ENV=production
PORT=8787

# Database
DATABASE_URL=postgresql://user:pass@host:5432/kaffepos_production
DB_SSL=true

# Email
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=noreply@kaffepos.my.id

# Payment
MIDTRANS_ENVIRONMENT=production
MIDTRANS_SERVER_KEY=xxxxx
MIDTRANS_CLIENT_KEY=xxxxx

# URLs
WEB_BASE_URL=https://kaffepos.my.id
API_BASE_URL=https://api.kaffepos.my.id
CORS_ORIGIN=https://kaffepos.my.id

# Monitoring
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

# Admin
ADMIN_EMAILS=admin@kaffepos.my.id
```

### Frontend (.env)

```bash
VITE_API_BASE_URL=https://api.kaffepos.my.id
VITE_APP_NAME=KaffePOS
VITE_APP_VERSION=2.0.0
VITE_GA_MEASUREMENT_ID=G-VNQJ3XPCGG
VITE_CLARITY_PROJECT_ID=wf7x39iiqr
```

---

## 🔧 Deployment Steps

### 1. Create Backend Service in Coolify

1. New Resource → Application
2. Public Repository: `https://github.com/kaffeposapp-DEV/KaffePOS-v1.git`
3. Branch: `main`
4. Build Pack: Dockerfile
5. Dockerfile: `backend/Dockerfile`
6. Port: `8787`
7. Add environment variables
8. Configure health check: `/health`
9. Deploy

### 2. Create Frontend Service in Coolify

1. New Resource → Application
2. Same repository
3. Dockerfile: `frontend.Dockerfile`
4. Port: `4173`
5. Add environment variables
6. Deploy

### 3. Apply Database Indexes (CRITICAL)

```bash
# SSH to backend container or database
psql $DATABASE_URL -f database/performance-indexes-migration.sql
```

### 4. Run Migrations

```bash
# In backend container
npm run migrate
```

### 5. Configure Domains

- Backend: `api.kaffepos.my.id`
- Frontend: `kaffepos.my.id`
- Enable HTTPS (Let's Encrypt)

---

## ✅ Post-Deployment Verification

```bash
# Backend health
curl https://api.kaffepos.my.id/health

# Database health
curl https://api.kaffepos.my.id/health/db

# Frontend
curl -I https://kaffepos.my.id
```

---

## 🚨 Troubleshooting

### Build Fails
- Check Dockerfile syntax
- Verify dependencies in package.json
- Check Coolify logs

### Health Check Fails
- Verify DATABASE_URL
- Check DB_SSL=true
- Verify database connection

### CORS Errors
- Verify CORS_ORIGIN matches frontend domain
- Redeploy backend after changes

---

## 📊 Monitoring

- Coolify built-in logs and metrics
- Sentry error tracking
- Optional: Prometheus + Grafana

---

## ✅ Production Checklist

- [ ] Performance indexes applied
- [ ] Database SSL/TLS enabled
- [ ] Automated backups configured
- [ ] Custom domains configured
- [ ] HTTPS enabled
- [ ] CORS configured
- [ ] Health checks passing
- [ ] Monitoring active

---

**Status:** ✅ Ready for Coolify Deployment

**Deployment Time:** ~15-30 minutes
