# Security

## ⚠️ Action required: rotate leaked staging secrets

The file `coolify.backend.minimal.env` was committed to git with **real secret
values**. It has now been removed from tracking and added to `.gitignore`, but
**the values still exist in git history and must be treated as compromised.**

Rotate the **live** secrets below, then redeploy. Removing the file does *not*
undo the exposure.

| Leaked value | Used by code? | Action |
| --- | --- | --- |
| `DB_PASSWORD` | ✅ yes | Change the Postgres role password; update `DATABASE_URL`. **See the ⚠️ note below first.** |
| `STAGING_REPAIR_TOKEN` | ✅ yes (`routes/staging.ts`) | Regenerate: `openssl rand -hex 32`. |
| `JWT_SECRET` | ❌ no refs | Dead config — auth uses opaque DB sessions, not JWT. No rotation needed; just stop setting it. |
| `SESSION_SECRET` | ❌ no refs | Dead config. No rotation needed. |
| `ENCRYPTION_KEY` | ❌ no refs | Dead — the code reads `PII_ENCRYPTION_KEY`, not `ENCRYPTION_KEY`. No rotation needed. |
| `DUITKU_MERCHANT_KEY` | n/a | The committed value was a placeholder — confirm no real key was ever committed. |

> ⚠️ **DB password ↔ PII key coupling.** `lib/encryption.ts` derives the
> affiliate payout/bank-account (PII) encryption key from `PII_ENCRYPTION_KEY`,
> falling back to `DATABASE_URL` when unset. In the current config `PII_ENCRYPTION_KEY`
> is unset, so **rotating `DB_PASSWORD` changes the PII key and makes existing
> encrypted PII undecryptable.** Before rotating DB creds: set
> `PII_ENCRYPTION_KEY` to the *current* `DATABASE_URL` value (pinning the key),
> deploy, then rotate the DB password.

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
