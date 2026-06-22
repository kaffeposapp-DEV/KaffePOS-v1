# Tech debt & next improvements

Prioritized backlog of known debt. Each item is scoped so it can be done as an
isolated, test-backed PR.

## 1. Split the `backend/src/index.ts` god module (~2,950 lines)

The Express route modules are already extracted and mounted, but `index.ts`
still holds a large in-file library of shared code. Extract in this order
(lowest-risk first), running `npm run check` after each step:

1. **Pure utilities** → `lib/util.ts`: `toNumber`, `addMinutes`, `addDays`,
   `normalizeEmail`, `hashToken`, `createOpaqueToken`, `generateOtpCode`,
   `pickDefined`, `buildUpdateClause`. No closure deps — safest first move.
2. **DB row normalizers** → `lib/serializers.ts`: `normalizeStore`,
   `serializeCashier`, `normalizeInventory`, `normalizeTransaction`,
   `normalizeSubscription`, `serializeProfile`, …
3. **Email service** → `services/EmailService.ts`: `sendEmail`,
   `buildEmailTemplate`, and all `send*Email` helpers.
4. **Midtrans helpers** → `payments/midtrans.ts`: `getMidtransBaseUrl`,
   `isMidtransConfigured`, `createMidtransSignature`, `createMidtransOrderId`.
5. **Auth middleware** → `middleware/auth.ts`: `authenticate`, `requireAdmin`,
   `requirePermission`. Do this LAST and with the auth/contract tests watching —
   it touches every protected route.

Target: `index.ts` becomes bootstrap + middleware wiring + route mounting only
(< ~300 lines).

## 2. Remove `any` escape hatches (~59 occurrences)

Notably the file-level `/* eslint-disable @typescript-eslint/no-explicit-any */`
in `src/components/pos/POSTab.tsx`. Replace with precise types or `unknown` +
narrowing. The strict tsconfig already supports this; the disables are the only
thing hiding gaps.

## 3. Watch bundle size

`Dashboard` (~440 kB) and `pdf` (~442 kB) are the heaviest chunks. They are
already lazy-loaded, but consider deferring `jspdf`/`html2canvas` behind the
export action so they never load on first paint.
