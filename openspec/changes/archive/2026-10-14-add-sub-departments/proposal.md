# Proposal

## Why

**Problem.** "Максим Семенець runs the DIY team and its 16 promoters, but he reports to Наталія Денисюк, head of sales. In Atlas the two departments are unrelated, so Наталія can't see DIY's clients, deals, tasks or Telegram chats, and can't help with Максим's account."

**Evidence.** The director asked for it on 2026-10-13, right after the real staff structure was loaded: «Семенець is a head of DIY, but he must be a subordinate of Денисюк».

**Success metric.** Денисюк can open every DIY client, deal, task and Telegram conversation that the DIY head can, with no director involved: 0 support requests from the sales head about missing DIY data in the first month. Checked in the live check, then by asking her after a month.

## What Changes

- A director can make a department a **sub-department** of another department, or detach it again.
- The head of the parent department sees and works with everything in its sub-departments, as if it were their own department:
  - clients, deals, tasks and boards, Telegram, documents, reports, KPIs, alerts and the audit log;
  - the team directory, including the sub-department's head.
- The head of the parent department can manage the sub-department's people, **including its head**: edit their card, reset their password, disable or enable them. Changing anyone's role stays with directors.
- The head of a sub-department keeps exactly what they have today: their own department only.
- One level only: a sub-department cannot have sub-departments of its own.
- A new «Отделы» dialog on the Team screen, for directors, shows the structure and sets the parent.

## Announcement

Departments can now sit inside each other. A director opens «Команда → Отделы» and places «Отдел DIY» under «Отдел продаж»: from then on the head of sales sees DIY's clients, deals, tasks and chats and can help its people, including the DIY head, while the DIY head keeps working with his own team as before. One level is enough for how we're organised today.

## Non-goals

- Deeper trees (a sub-department of a sub-department).
- People in a sub-department seeing the parent department's records.
- Changing funnel or board access rules: a funnel or board opened to «Отдел продаж» is not automatically opened to «Отдел DIY».
- Org-chart drawing or reporting lines between individual people.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `identity-access`: role and record scope, and owner assignment, include a head's sub-departments.
- `team-management`: departments can have a parent; parent heads manage sub-department people; the «Отделы» dialog.

## Impact

- **Data:** one new nullable reference from a department to its parent department.
- **Behavior:** only heads of parent departments see more. Directors, employees and heads of departments without sub-departments see exactly what they see today.
