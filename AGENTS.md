# AGENTS.md — instructions for ALL AI coding agents
# (Claude Code, Codex CLI, Gemini CLI and OpenCode read this file. Keep it short: < 100 lines.)

## Before you start any task
1. Read `STATUS.md` (current focus, next steps, known problems).
2. Read `docs/ARCHITECTURE.md` if the task touches more than one module. Its "Code map" says where things live.
3. Check `docs/decisions/` before changing an established approach, and follow `docs/learnings.md`.
4. Run `openspec list` to see active changes; read `openspec/specs/<area>/spec.md` for the area you change.

## Project
- Name: Atlas
- Purpose: a self-hosted virtual office for a ~20-person team. It covers CRM with sales funnels, task boards, documents, chat, email, a Telegram inbox, presence, KPIs, alerts, reports and AI analysis.
- Stack: an npm-workspaces monolith on Node.js 22:
  - `apps/api`: Express, zod and pg, with Socket.IO and Redis;
  - `apps/web`: React and Vite, served by Nginx;
  - `database/`: SQL migrations for PostgreSQL 16.
- Deployed with Docker Compose on Coolify; a push to `main` deploys automatically.
- The UI is in Russian and targets desktop Chrome. The only currency is UAH.

## Verification (how every change is checked)
- **Main gate: `make check`** (typecheck + lint + test). It must pass before you say a task is done.
  CI runs the same command. Other targets: `make install`, `make fmt`, `make help`.
  `npm run build` must also pass; CI runs it in `ci.yml`.
- While working, run only the tests you touched (fast feedback), then `make check` at the end:
  - `cd apps/api && npx vitest run src/routes/team.test.ts -t "test name"`, or the same under `apps/web`.
- Never skip, weaken or delete a test, and never loosen lint or type settings to make the gate pass.
- Run the app locally:
  - `npm run dev` runs the full stack in Docker at http://localhost:8080, with the accounts `director`, `manager` and `employee` (password `AtlasDemo2026!`).
  - Or run `apps/web` `npm run dev`, which uses demo data or proxies to the API on port 3000.

### Testing traps (add one whenever a test-related mistake happens twice)
- Web typecheck: use `npm run typecheck` (`tsc -b`). `npx tsc --noEmit -p .` in `apps/web` checks nothing.
- API database tests use `src/test/dbHarness.ts`, an in-process PGlite running the real migrations.
  - Import the app *after* `startDbHarness()`: `app = (await import("../app")).app`.
  - PGlite advisory locks don't block each other, so never test lock exclusion.
- Socket tests: call `setPresenceStore(memoryPresenceStore())`; otherwise every call retries Redis.
- Web tests:
  - mock `socket.io-client`;
  - `Field` puts its hint and error inside the `<label>`, so match those fields by regex (`getByLabelText(/Телефон/)`);
  - for demo mode, put `demoSessions.<username>` into localStorage under `atlas.session`;
  - jsdom `Blob` can't be a `Response` body, so pass a string.
- `Button` has no default `type`, so inside a `<form>` it submits. Use `type="button"` for other actions.

## Tools in this environment
- Search code with `rg` (ripgrep): fast, respects .gitignore. Prefer it over `grep -r` and `find | xargs grep`.
- Read and transform JSON with `jq` instead of ad-hoc scripts.
- Do not install system packages with apt/sudo; ask the human to add them to the workspace image.
- `pkill -f <pattern>` can kill your own shell. Find the process id with `ps` or `ss` first.

## Rules
- Plan before coding for anything bigger than a small fix; show the plan first.
- Write or update tests for every behavior change. Run `make check` before saying "done".
- Keep changes small and focused. One task = one commit.
- Follow existing code style and patterns; do not introduce new libraries without asking.
- Never commit secrets. Never edit `.env` files.
- Do not reverse a decision recorded in `docs/decisions/` without asking.
- If something is unclear, ask instead of guessing.

## Spec-driven workflow (OpenSpec)
- `openspec/specs/` = source of truth for how the system BEHAVES. Trust it; keep it true.
- New feature / behavior change / big refactor → OpenSpec change:
  propose → (I review) → apply → archive. Never start `apply` before I approve the proposal.
- Small bug fix, typo, internal cleanup with no behavior change → no change folder needed.
- Specs describe behavior (requirements + scenarios), not implementation details.
- A requirement lives in the spec of its feature, including that feature's screens. `web-workspace` covers only the shared shell.
- A MODIFIED requirement replaces the whole block. If several changes modify the same one, each must carry the earlier additions.
- While applying, tick tasks in `tasks.md`; if the plan turns out wrong, update the change first.
- Validate with `npx openspec validate --all --strict` before archiving.

## Review and roles
- Never merge, push or archive yourself; the human does that.
- When asked to review, do not edit code; report BLOCKING/SUGGESTION findings.
- (Optional) If a prompt starts with "# Role: ...", act strictly within that role (`docs/ai/roles/`).

## Architecture boundaries
- Record scope is enforced in SQL with `recordScope()`, not only by route role checks.
  - A record outside the caller's scope answers 404, never 403.
  - New data or endpoints must state the access rule for each role (DIRECTOR, MANAGER, EMPLOYEE).
- Sensitive actions, both successful and denied, are audited with `writeAudit`. Audit metadata holds field names and ids, never message text, personal values or credentials.
- Migrations in `database/` are checksummed: never edit an applied one; add a new numbered file.
- The web app calls the API only through `lib/api.ts`, never `fetch` directly. The access token stays in memory, never in storage.
- Integrations are adapters that report "disabled" without server-side credentials. Secrets never reach the web bundle.
- UI follows the `ui-design-system` spec. Every `AppContext` action keeps a working demo-mode branch.

## When you finish a task
1. Run `make check`; fix failures.
2. Update `STATUS.md` (done, next steps, open questions, gotchas).
3. If an OpenSpec change is fully done and tested: archive it (specs get updated).
   Update `docs/ARCHITECTURE.md` if structure changed.
4. Add an ADR in `docs/decisions/` if an important decision was made.
5. Suggest a commit message (Conventional Commits: `feat:`, `fix:`, `refactor:`...).
