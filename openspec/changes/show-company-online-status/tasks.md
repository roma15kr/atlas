# Tasks

## 1. The online state reaches everyone

- [ ] 1.1 Add `online` to `GET /team/directory`, and emit `presence:online { userId, online }` to a company room on each transition. Verify `companyDirectory.integration.test.ts` (online from presence; still no `lastSeenAt`) and a socket test (an employee of another department receives `presence:online` without times when a colleague connects); commit.

## 2. Team page

- [ ] 2.1 Show the dot and «В сети»/«Не в сети» for every row, filter the tabs over the whole company, count the company in the header, update live from `presence:online`, and keep the selection on a visible row. Verify the `TeamAdmin.test.tsx` cases (a head sees another department's colleague under «В сети», with no last-seen time; a live `presence:online` moves them to «Не в сети»; the detail follows the filtered list); commit.

## 3. Integration checks

- [ ] 3.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 3.2 Run `npx openspec validate show-company-online-status --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`, check as a head; `dev` → `main`, live check as a head and the director, archive.
