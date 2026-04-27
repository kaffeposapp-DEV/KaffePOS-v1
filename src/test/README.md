# KaffePOS Test Structure

This folder is the default home for frontend-facing Vitest tests.

- `*.test.ts(x)`: small unit tests that sit near the current legacy test suite.
- `contracts/`: frontend-backend request/response contract tests for risky API flows.
- `integration/`: integration scaffolding for browser APIs, storage, network, and realtime flows.
- `helpers/`: reusable factories, browser storage helpers, and API/mock utilities.
- `regression/`: location for bug-specific tests named after the behavior that must never return.

TDD flow:

1. Add or update the smallest test that describes the product behavior.
2. Run the focused test file.
3. Implement the change.
4. Run the focused test again, then a broader suite when the change touches shared contracts.

Prefer behavior names in Bahasa Indonesia or English consistently inside one file, for example:

- `it('keeps reset-password token in the backend payload')`
- `it('mencegah duplikasi order dapur saat event realtime terkirim ulang')`

