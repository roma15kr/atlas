# Proposal

## Why

**Problem.** An employee opening «Команда» sees only themselves; a department head sees only their own team. People can't find who works in another department, what their job is or how to reach them, though Atlas is meant to be the company's one virtual office.

**Evidence.** The director asked for it on 2026-10-14, after cross-department task assignment went to `dev`: «I need user to see all the employees from the company and separately heads of departments can add/edit only their teams».

**Success metric.** Every user finds any active colleague's job title, department and contacts in «Команда» without asking a director: no "who is …/how do I reach …" support requests in the first month. Checked in the live check as an employee, then by asking the director after a month.

## What Changes

- «Команда» lists **every active employee of the company** for everyone, with search and the department of each person.
- For people **outside your own team**, the card is a contact card only:
  - shown: name, photo, job title, department, role (head or employee), specialty, work phone, contact email, city, "about", and the birthday when the person shares it;
  - not shown: KPIs, rating, job description, monitoring consent, presence and its history, AI analysis, and every edit or admin button.
- Your **own team** keeps the full card exactly as today:
  - a director: everyone;
  - a head: their department and its sub-departments;
  - an employee: only themselves.
- **Adding and editing stay as they are.** A head adds people only to their own department, and edits, resets passwords, disables and sets KPIs only for their own team. A director manages everyone.

## Announcement

«Команда» now shows the whole company. Open any colleague to see their position, department and how to reach them. Performance data, KPIs and job descriptions stay visible only to the person, their head and the director. Heads still add and edit only their own teams.

## Non-goals

- **Online status company-wide.** Presence is monitoring data and is scoped on purpose (`presence` spec). Showing a green dot for everyone is a separate decision.
- Disabled colleagues outside your team (the «Отключённые» tab stays scoped).
- Changing the other places that use the scoped team list: the owner pickers, the dashboard, achievements and funnel settings.
- An org chart.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-management`: a company-wide contact directory and a contact card on the Team screen. The scoped full directory (`GET /api/v1/team`) and all management rules are unchanged.

## Impact

- **API:** one new read-only endpoint, `GET /api/v1/team/directory`. Nothing existing changes.
- **Web:** the Team page list comes from the directory, and a new contact-card view.
- **Data:** none. No migration.
