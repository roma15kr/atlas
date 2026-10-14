# Design

## Context

- `GET /api/v1/team` returns full rows (KPIs, rating, consent, job description, presence) inside `recordScope`.
- The web keeps that list as `useWorkspace().users`, and many screens rely on it being scoped:
  - owner pickers in CRM and Telegram;
  - the dashboard rating chart and presence list;
  - the achievements ranking;
  - funnel and board settings.
- Widening it would leak ratings and put out-of-scope people into pickers whose writes the API then refuses.
- The chat directory (`team-chat`) already lists every active colleague with name, department and job title, so company-wide names are not new.

## Decisions

1. **A separate endpoint, not a wider `/team`.**
   - `GET /api/v1/team/directory` returns, for every ACTIVE user of the caller's company: `id`, `fullName`, `role`, `departmentId`, `departmentName`, `jobTitle`, `specialty`, `avatarUrl`, `phone`, `contactEmail`, `city`, `about`, `birthday` (`MM-DD`, only when shared), and `inTeam`.
   - `inTeam` is true when the row is inside the caller's `recordScope`, the same rule as `/team`.
   - It never returns `birthDate`, KPIs, rating, job description, consent or presence.
   - Same SQL as `profileFieldsSql`/`withoutHiddenProfile` for the birthday rule.
   - *Alternative rejected:* per-row redaction inside `/team`, which would change ~10 consumers.
2. **Access for each role.**
   - DIRECTOR, MANAGER and EMPLOYEE all get the whole company, active users only.
   - Other companies are never included.
   - No audit: it is a directory read, like the chat directory.
3. **Team page.**
   - The list is built from `directory`.
   - Selecting someone with `inTeam` shows the existing full card from `users`; others get `ColleagueCard`, a contact card with no actions.
   - The online/offline tabs keep counting people whose presence the caller can see. Everyone else carries no dot and no "нет данных" badge.
   - The «Отключённые» tab and «Добавить сотрудника» are unchanged.
   - `?user=<id>` deep links work for both.
4. **Demo.** `AppContext.teamDirectory()` maps `demoUsers` with `inTeam` from the same scope the demo already applies.

## Risks / Trade-offs

- **Contacts become visible company-wide.** Work phone, contact email, city and "about" become visible to all colleagues. They are work contact fields that users fill in themselves; the birthday keeps its own opt-in.
- **One extra request** on the Team page, for about 40 rows: negligible.
