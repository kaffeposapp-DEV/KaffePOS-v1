# Security

## ⚠️ Action required: rotate leaked staging secrets

The file `coolify.backend.minimal.env` was committed to git with **real secret
values**. It has now been removed from tracking and added to `.gitignore`, but
**the values still exist in git history and must be treated as compromised.**

Rotate every secret below, then redeploy. Removing the file does *not* undo the
exposure.

| Secret | Action |
| --- | --- |
| `DB_PASSWORD` | Change the Postgres role password; update `DATABASE_URL`. |
| `JWT_SECRET` | Regenerate (`openssl rand -base64 48`). Invalidates existing JWTs (users re-login). |
| `SESSION_SECRET` | Regenerate (`openssl rand -base64 48`). Invalidates existing sessions. |
| `ENCRYPTION_KEY` | Regenerate (`openssl rand -hex 32`). ⚠️ Re-encrypt or migrate any data encrypted with the old key first. |
| `STAGING_REPAIR_TOKEN` | Regenerate (`openssl rand -hex 32`). |
| `DUITKU_MERCHANT_KEY` | The committed value was a placeholder — confirm no real key was ever committed. |

### Optional: purge from history

Rotation is the real fix. If you also want to scrub the values from history
(e.g. before open-sourcing), rewrite history with
[`git filter-repo`](https://github.com/newren/git-filter-repo):

```bash
git filter-repo --invert-paths --path coolify.backend.minimal.env --path coolify.frontend.minimal.env
git push --force-with-lease   # coordinate with all collaborators first
```

## Secret handling going forward

- Only `*.example` templates are committed. `.gitignore` now blocks
  `*.minimal.env`, `.env`, `.env.*`, `*.bak`, `*.patch.ts`, `*.orig`.
- Generate secrets with `openssl rand` — never hand-pick or reuse across envs.
- Real values live in the deploy platform (Coolify) env config, not in the repo.

## Reporting a vulnerability

Email **kaffeposapp@gmail.com**. Please do not open public issues for security
reports.
