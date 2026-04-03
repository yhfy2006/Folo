---
name: sr-verify
description: Run full verification suite for simple-reader (typecheck + lint + test)
---

Run the following checks for `apps/simple-reader/` in order. Stop on first failure and report the issue.

## Steps

1. **TypeScript check**:

   ```bash
   cd apps/simple-reader && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json
   ```

2. **Lint**:

   ```bash
   pnpm lint --filter simple-reader
   ```

   If lint errors are auto-fixable, run `pnpm lint:fix --filter simple-reader` and report what was fixed.

3. **Tests**:

   ```bash
   cd apps/simple-reader && npx vitest run
   ```

4. **Video package tests** (if video/ files were changed):
   ```bash
   cd apps/simple-reader/video && npx vitest run
   ```

## Output

Report pass/fail for each step. If any step fails, show the relevant error output and suggest a fix.
