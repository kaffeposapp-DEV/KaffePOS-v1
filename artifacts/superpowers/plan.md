# Superpowers Implementation Plan: KaffePOS Hardening

## Goal
Comprehensive cleanup, type hardening, and technical debt removal in KaffePOS.

## Assumptions
- Codebase is React 18 + TS + Capacitor 6.
- Supabase types are accessible or can be generated.
- `any` types can be replaced with more specific types or and `unknown` where needed.

## Plan

### 1. Audit and Clean Python Files
- **Files**: Project root (recursive, excluding node_modules)
- **Change**: Find and delete all `.py` files.
- **Verify**: `find . -name "*.py" -not -path "./node_modules/*"` should return nothing.

### 2. Modernize .gitignore
- **Files**: `.gitignore`
- **Change**: Ensure core patterns (node_modules, dist, .env, android, etc.) are present.
- **Verify**: `grep "android/" .gitignore` and check other patterns.

### 3. Enable Strict TypeScript
- **Files**: `tsconfig.json`
- **Change**: Add `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitReturns: true`, `exactOptionalPropertyTypes: true`.
- **Verify**: `npx tsc --noEmit` (expecting errors initially).

### 4. Remove Console Debugging
- **Files**: `src/**/*`
- **Change**: Remove `console.log/warn/error` not inside `catch` blocks.
- **Verify**: `grep -r "console\." src/` should only show catch blocks.

### 5. Eliminate `any` Types
- **Files**: `src/**/*`
- **Change**: Replace `any` with specific types or interface-based types. Use Supabase generated types if available.
- **Verify**: `grep -r ": any" src/`, `grep -r "as any" src/`, `grep -r "<any>" src/` should return no matches.

### 6. Final Validation
- **Files**: Entire project
- **Change**: Run full checks.
- **Verify**: `npx tsc --noEmit` and `npx eslint src/ --ext .ts,.tsx`.

## Risks & Mitigations
- **Breaking changes from `any` removal**: Fix one file at a time and verify with small-scope `tsc`.
- **Accidental deletion of useful logs**: Only target top-level logs, keep `console.error` in catches.

## Rollback Plan
- Use `git checkout .` to revert changes if something breaks catastrophically.
