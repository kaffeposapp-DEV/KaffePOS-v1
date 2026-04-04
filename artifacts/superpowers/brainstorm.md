# Superpowers Brainstorm: KaffePOS Cleanup & Hardening

## Goal
Perform a comprehensive cleanup and modernization of the KaffePOS codebase to ensure type safety, remove technical debt (Python files, debug logs), and enforce strict TypeScript rules.

## Constraints
- React 18 + TypeScript + Capacitor 6 + Supabase + Zustand stack.
- Do not change business logic.
- Target: 0 errors in `tsc` and `eslint`.
- No `any` types unless absolutely unavoidable.

## Known context
- Python files are likely accidentally committed from `.agent/skills/`.
- `.gitignore` needs to be more comprehensive to avoid future issues.
- `tsconfig.json` needs strictness.
- Codebase likely contains `console.log` and `any` types that need addressing.

## Risks
- Removing `any` might reveal hidden bugs or require complex typing for external libraries or Supabase schemas.
- Strict TS might cause a large number of errors that need manual fixing.
- Mass deletion of `console.log` might remove useful debugging information in catch blocks (though the user specified catch blocks are exempt).
- Automated cleanup might accidentally break something if not careful.

## Options (2–4)
1. **Fully Automated**: Use `sed` or `ast-grep` to replace `any` and remove logs. Fastest but riskiest.
2. **Incremental Manual-assisted**: Cleanup Python and gitignore first, then enable strict TS and fix errors one by one. Safest but slowest.
3. **Hybrid (Recommended)**: Automate simple things (Python deletion, gitignore, logs outside catch blocks), then use `tsc` to guide type fixes for `any`.

## Recommendation
Go with the **Hybrid** approach.
1. Start by cleaning up environment files (Python, gitignore, tsconfig).
2. Automate the removal of debug logs (excluding catch blocks).
3. Enable strict mode and use `tsc` to identify and fix `any` types and strictness errors.
4. Verify with `tsc` and `eslint`.

## Acceptance criteria
1. No `.py` files outside `node_modules`.
2. `.gitignore` updated per instructions.
3. `tsconfig.json` set to `strict: true` and other specified flags.
4. Zero remaining `": any"`, `"as any"`, `"<any>"` in `src/`.
5. No `console.log/warn/error` outside of `catch` blocks.
6. `npx tsc --noEmit` returns 0 errors.
7. `npx eslint src/ --ext .ts,.tsx` returns 0 errors.
