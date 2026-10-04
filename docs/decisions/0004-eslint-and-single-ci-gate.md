# 0004. ESLint as the lint step and one CI gate
Date: 2026-10-04
Status: accepted

## Context
The AI project template makes `make check` (typecheck + lint + test) the gate for people, agents and CI. Atlas had no linter, so the gate failed. The template also ships a GitHub "Check" workflow that would repeat the typecheck and tests that `ci.yml` already runs.

## Decision
- ESLint 9 checks both workspaces with:
  - the recommended JavaScript and TypeScript sets;
  - the React-hooks `rules-of-hooks` and `exhaustive-deps` rules.

  `npm run lint` uses `--max-warnings=0`, so warnings fail the gate too.
- A leading underscore marks a value that is unused on purpose: Express's four-argument error handler, or destructuring that drops a field. `no-unused-vars` ignores those names.
- `ci.yml` runs `make check` and stays the only CI gate. The template's `check.yml` is not used.

## Consequences
- New code can't add unused imports or variables, broken hook rules or missing hook dependencies.
- Stricter rule sets, such as type-aware typescript-eslint or the newer React Compiler rules, can be adopted later as their own change, with the code fixed first.
- Developers run the same `make check` locally as CI does.
