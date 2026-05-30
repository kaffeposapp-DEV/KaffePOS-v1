# KaffePOS CI/CD Guide

Date: 2026-05-24

## GitHub Actions

The recommended CI workflow lives at `.github/workflows/ci.yml` and does not deploy automatically.

Stages:
1. checkout
2. setup Node.js 24 with npm cache
3. `npm ci`
4. `npm ci --prefix backend`
5. `npm run typecheck`
6. `npm run lint`
7. `npm run test`
8. `npm run build`
9. `npm --prefix backend run check`
10. `npm run release:verify-config`

## Rules

- CI must not echo secrets.
- CI must not deploy from pull requests.
- Migration execution stays manual or release-pipeline controlled.
- Production deployment requires successful CI plus deployment checklist review.
- React Doctor latest full scan can run locally; pinned diff `0.2.3` remains fallback until latest diff CLI issue is fixed.

## Optional Future Stages

- dependency vulnerability audit with severity threshold
- Docker image build smoke test
- migration dry-run against disposable PostgreSQL
- Playwright smoke tests once e2e coverage exists
