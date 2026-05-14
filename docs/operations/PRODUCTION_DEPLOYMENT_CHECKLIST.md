# Production Deployment Checklist

**Version:** 2.0  
**Date:** 2026-05-14  
**Status:** Complete Guide

This checklist ensures safe production deployment with all critical systems operational.

---

## Pre-Deployment (1 Week Before)

### 1. Database Preparation

- [ ] **Apply performance indexes** (CRITICAL)
  ```bash
  bash scripts/apply-performance-indexes.sh
  ```
  Expected: 50+ indexes added, 10-100x query performance improvement

- [ ] **Enable database SSL/TLS**
  ```bash
  # In backend/.env
  DB_SSL=true
  DB_SSL_REJECT_UNAUTHORIZED=true
  ```

- [ ] **Set up automated backups**
  ```bash
  # Add to crontab
  0 2 * * * /path/to/scripts/backup-database.sh
  ```

- [ ] **Test backup restoration**
  ```bash
  bash scripts/restore-database.sh backups/kaffepos_backup_YYYYMMDD_HHMMSS.sql.gz
  ```

- [ ] **Run all migrations**
  ```bash
  cd backend && npm run migrate
  ```

### 2. Environment Configuration

- [ ] **Backend environment variables** (backend/.env)
  ```bash
  NODE_ENV=production
  DATABASE_URL=postgresql://user:pass@host:5432/kaffepos_production
  DB_SSL=true
  
  RESEND_API_KEY=re_xxxxx
  RESEND_FROM_EMAIL=noreply@kaffepos.my.id
  
  MIDTRANS_ENVIRONMENT=production
  MIDTRANS_SERVER_KEY=xxxxx
  MIDTRANS_CLIENT_KEY=xxxxx
  
  CORS_ORIGIN=https://kaffepos.my.id
  WEB_BASE_URL=https://kaffepos.my.id
  API_BASE_URL=https://api.kaffepos.my.id
  
  SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
  SENTRY_ENVIRONMENT=production
  
  ADMIN_EMAILS=admin@kaffepos.my.id
  ```

- [ ] **Frontend environment variables** (.env)
  ```bash
  VITE_API_BASE_URL=https://api.kaffepos.my.id
  VITE_GA_MEASUREMENT_ID=G-VNQJ3XPCGG
  VITE_CLARITY_PROJECT_ID=wf7x39iiqr
  VITE_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
  ```

- [ ] **Verify no secrets in frontend**
  ```bash
  # These should NOT exist in .env
  grep -i "MIDTRANS_SERVER_KEY" .env
  grep -i "DATABASE_URL" .env
  grep -i "RESEND_API_KEY" .env
  ```

### 3. Build & Test

- [ ] **Backend build**
  ```bash
  cd backend
  npm run typecheck
  npm run build
  ```

- [ ] **Frontend build**
  ```bash
  npm run typecheck
  npm run build:web
  ```

- [ ] **Run production readiness check**
  ```bash
  bash scripts/production-readiness-check.sh
  ```
  Expected: All checks pass, 0 critical errors

### 4. Security Hardening

- [ ] **Review security checklist** (docs/engineering/SECURITY_HARDENING.md)
- [ ] **Enable rate limiting** (already configured in code)
- [ ] **Configure CORS** (set CORS_ORIGIN)
- [ ] **Enable audit logging** (migration applied)
- [ ] **Review admin access** (set ADMIN_EMAILS)

### 5. Monitoring Setup

- [ ] **Configure Sentry error tracking**
  - Create project at sentry.io
  - Set SENTRY_DSN in backend and frontend
  - Test error reporting

- [ ] **Set up uptime monitoring**
  - Use UptimeRobot, Pingdom, or similar
  - Monitor: https://api.kaffepos.my.id/health
  - Alert on downtime

- [ ] **Configure health checks**
  ```bash
  # Add to cron for monitoring
  */5 * * * * /path/to/scripts/health-check.sh
  ```

---

## Deployment Day

### 1. Final Verification

- [ ] **Run production readiness check**
  ```bash
  bash scripts/production-readiness-check.sh
  ```

- [ ] **Backup current database**
  ```bash
  bash scripts/backup-database.sh
  ```

- [ ] **Verify all environment variables**
  ```bash
  cd backend && node -e "require('dotenv').config(); console.log('✅ Env loaded')"
  ```

### 2. Deploy Backend

- [ ] **Deploy to production server** (Coolify/Docker/VPS)
  ```bash
  cd backend
  npm run build
  npm run start
  ```

- [ ] **Verify backend health**
  ```bash
  curl https://api.kaffepos.my.id/health
  curl https://api.kaffepos.my.id/health/db
  ```

### 3. Deploy Frontend

- [ ] **Build production assets**
  ```bash
  npm run build:web
  ```

- [ ] **Deploy to CDN/hosting**
  - Upload dist/ to Cloudflare Pages, Vercel, or Netlify
  - Configure custom domain: kaffepos.my.id

- [ ] **Verify frontend loads**
  ```bash
  curl -I https://kaffepos.my.id
  ```

### 4. Smoke Testing

- [ ] **Test authentication flow**
  - Register new account
  - Verify email
  - Login
  - Logout

- [ ] **Test POS checkout**
  - Add items to cart
  - Complete transaction
  - Verify stock deduction
  - Print receipt

- [ ] **Test payment flow**
  - Create subscription payment
  - Verify Midtrans webhook
  - Check subscription status

- [ ] **Test admin panel**
  - Login as admin
  - View system status
  - Check metrics

---

## Post-Deployment (First 24 Hours)

### 1. Monitoring

- [ ] **Watch error logs**
  ```bash
  # Coolify logs or
  tail -f /var/log/kaffepos/backend.log
  ```

- [ ] **Check Sentry dashboard**
  - Monitor error rate
  - Check for new issues

- [ ] **Monitor health checks**
  ```bash
  bash scripts/health-check.sh
  ```

### 2. Performance Validation

- [ ] **Check API response times**
  - Target: <500ms p95
  - Use: Sentry Performance, New Relic, or custom monitoring

- [ ] **Check database query times**
  - Target: <200ms p95
  - Review slow query logs

- [ ] **Monitor memory usage**
  - Backend should be stable <512MB

### 3. User Validation

- [ ] **Test with real users** (beta testers)
- [ ] **Monitor feedback** (beta feedback form)
- [ ] **Check for critical bugs**

---

## Rollback Plan

If critical issues occur:

### 1. Immediate Rollback

```bash
# Stop current deployment
pm2 stop kaffepos-backend

# Restore previous version
git checkout <previous-commit>
cd backend && npm run build && npm run start

# Or restore database if needed
bash scripts/restore-database.sh backups/kaffepos_backup_YYYYMMDD_HHMMSS.sql.gz
```

### 2. Incident Response

- [ ] **Follow incident playbook** (docs/operations/INCIDENT_PLAYBOOK.md)
- [ ] **Notify users** (if downtime >5 minutes)
- [ ] **Document issue** (for post-mortem)

---

## Success Criteria

✅ **Deployment is successful when:**

1. All health checks pass
2. Error rate <1%
3. API response time <500ms (p95)
4. No critical bugs reported
5. Users can complete core flows (auth, checkout, payment)
6. Monitoring and alerting operational

---

## Maintenance Schedule

### Daily
- Check error logs
- Monitor uptime
- Review user feedback

### Weekly
- Review performance metrics
- Check backup integrity
- Update dependencies (security patches)

### Monthly
- Full security audit
- Performance optimization review
- Capacity planning review

---

## Support Contacts

- **Technical Issues:** See docs/operations/SUPPORT_SOP.md
- **Incidents:** See docs/operations/INCIDENT_PLAYBOOK.md
- **Admin Email:** admin@kaffepos.my.id

---

**Last Updated:** 2026-05-14  
**Next Review:** 2026-06-14
