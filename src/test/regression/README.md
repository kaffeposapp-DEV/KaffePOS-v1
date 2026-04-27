# Regression Tests

Put bug-specific tests here when the bug spans multiple modules or does not belong cleanly to one existing unit file.

Recommended naming:

- `<area>.<bug-or-behavior>.test.ts`
- `auth.reset-password-token.test.ts`
- `kitchen.realtime-dedupe.test.ts`
- `payment.method-mapping.test.ts`

Each regression test should include the old failure mode in the test title so future changes make the protected behavior obvious.

