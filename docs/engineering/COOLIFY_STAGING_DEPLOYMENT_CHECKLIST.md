# KaffePOS Coolify Staging Deployment Checklist

Use this checklist while creating real staging deployment in Coolify or VPS. Do not write real secrets in this file.

## A. VPS/Coolify

- [ ] Coolify dashboard reachable.
- [ ] Git repo connected.
- [ ] Staging or release-candidate branch selected.
- [ ] Build logs accessible.
- [ ] Runtime logs accessible.
- [ ] No deploy-to-production automation enabled for staging branch.

## B. PostgreSQL

- [ ] Staging DB created.
- [ ] Staging DB user created.
- [ ] Staging DB user scoped to staging DB only.
- [ ] `DATABASE_URL` stored only in backend service.
- [ ] Migration run from backend context with staging `DATABASE_URL`.
- [ ] Disposable restore DB created.
- [ ] Production DB not referenced by staging env.

## C. Backend

- [ ] Backend service created.
- [ ] Dockerfile path set to `backend/Dockerfile`.
- [ ] Build context set to `backend` or equivalent safe Coolify config.
- [ ] Backend env filled from `docs/engineering/COOLIFY_ENV_MAPPING.md`.
- [ ] Backend build passes.
- [ ] Backend starts with `node dist/index.js`.
- [ ] `GET /health` works.
- [ ] `GET /health/db` works.
- [ ] CORS allows staging frontend URL.
- [ ] Logs do not print secrets.

## D. Frontend

- [ ] Frontend service created.
- [ ] Dockerfile path set to `frontend.Dockerfile`.
- [ ] Build context set to repository root.
- [ ] Frontend env filled with public-safe `VITE_*` keys only.
- [ ] Frontend build passes.
- [ ] Frontend starts with `serve -s dist -l 4173`.
- [ ] Frontend loads over HTTPS.
- [ ] Frontend can call staging API.

## E. Domains/HTTPS

- [ ] Frontend domain connected.
- [ ] API domain connected.
- [ ] Asset domain connected.
- [ ] HTTPS active for frontend.
- [ ] HTTPS active for API.
- [ ] HTTPS active for assets.
- [ ] No mixed content issue.

## F. External Services

- [ ] Midtrans sandbox Client Key configured.
- [ ] Midtrans sandbox Server Key configured backend-only.
- [ ] Midtrans sandbox webhook URL configured.
- [ ] Resend API key configured backend-only.
- [ ] Resend sender/domain configured.
- [ ] Cloudflare/R2 staging bucket configured.
- [ ] Cloudflare/R2 restricted token configured backend-only.
- [ ] GA4 staging stream configured or analytics disabled.
- [ ] Clarity staging project configured or analytics disabled.
- [ ] No production provider credentials used.

## G. Smoke Users

- [ ] Owner user exists.
- [ ] Cashier user exists.
- [ ] Cashier assigned to staging outlet.
- [ ] Sample outlet exists.
- [ ] Sample product/menu item exists.
- [ ] Sample stock record exists if stock smoke requires it.
- [ ] Test recipient mailbox exists and is safe for smoke email.

## H. Final Verification

- [ ] `npm run verify:staging-env -- --env-file=.env.staging.local --env-file=backend/.env.staging.local` passes.
- [ ] `GET https://staging-api.kaffepos.com/health` passes.
- [ ] `GET https://staging-api.kaffepos.com/health/db` passes.
- [ ] `GET https://staging.kaffepos.com/` passes.
- [ ] `npm run smoke:staging:cashier` passes.
- [ ] `npm run smoke:staging:offline-sync` passes.
- [ ] `KAFFEPOS_STOCK_SMOKE_CONFIRM=1 npm run smoke:staging:stock` passes.
- [ ] Midtrans sandbox payment and webhook verified.
- [ ] Resend test email verified.
- [ ] Cloudflare/R2 public/private behavior verified.
- [ ] GA4/Clarity no-PII behavior verified or intentionally disabled.
- [ ] Docker image build verified on Docker-capable runner.
- [ ] GitHub Actions runner verified after push.
- [ ] Backup/restore drill passes on disposable restore DB.
