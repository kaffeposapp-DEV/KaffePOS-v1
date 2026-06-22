# Tech debt & next improvements

Prioritized backlog of known debt. Each item is scoped so it can be done as an
isolated, test-backed PR.

## 1. De-duplicate the `backend/src/index.ts` god module (~2,680 lines)

`index.ts` is the live entry point (`node dist/index.js`, `app.listen`), but it
is **almost entirely a duplicate** of canonical modules that a prior, unfinished
refactor already created:

- `core/helpers.ts` — `toNumber`, row normalizers, `pickDefined`,
  `buildUpdateClause`, `serializeProfile`, `ensureProfile`, SQL column constants…
- `core/middleware.ts` — `getBearerToken`, `hashToken`, `createOpaqueToken`,
  `isAdminUser`, `authenticate`, `requireAdmin`, `requirePermission`, rate limiters.
- `core/email.ts` — `sendEmail`, templates, all `send*Email` senders.

`routes/*` already import from `core/*`; only `index.ts` still carries its own
inline copies. The task is to make `index.ts` import from `core/*` and delete the
inline duplicates, leaving just bootstrap + middleware wiring + route mounting
(target < ~300 lines).

**Two hazards — this is why it must be done carefully, not in one big-bang:**

1. **Drift.** The inline copies are NOT guaranteed identical to `core/*`. Confirmed
   example: `index.ts`'s `insertNotification` is 6-arg (default `type='info'`)
   while `core/helpers.ts`'s is 7-arg (default `type='system'`, extra `storeId`).
   Diff every function before swapping; don't assume "exact same logic".
2. **Coverage.** `index.ts`'s `authenticate` / RBAC / rate-limit middleware gate
   `/api` in production but are thin in unit tests. Verify each swap with
   `npm run check` **and** the staging smoke scripts (`smoke:staging:*`), ideally
   against a running server, before merging.

Done so far: removed the dead email block and pointed the pure utils/serializers
at `core/helpers.ts`. Remaining: middleware, profile/subscription helpers, column
constants, Midtrans/subscription config.

Once the duplication is gone, enable `noUnusedLocals`/`noUnusedParameters` in
`backend/tsconfig.json` (currently off — which is how this dead code accumulated
unnoticed) to prevent regressions.

## 2. Remove `any` escape hatches (~59 occurrences)

Notably the file-level `/* eslint-disable @typescript-eslint/no-explicit-any */`
in `src/components/pos/POSTab.tsx`. Replace with precise types or `unknown` +
narrowing. The strict tsconfig already supports this; the disables are the only
thing hiding gaps.

## 3. Watch bundle size

`Dashboard` (~440 kB) and `pdf` (~442 kB) are the heaviest chunks. They are
already lazy-loaded, but consider deferring `jspdf`/`html2canvas` behind the
export action so they never load on first paint.
