# Proposal

## Why

**Problem.** «Команда» lists the whole company, but the green dot, «В сети» and the «В сети / Не в сети» tabs cover only your own team. A head of Маркетинг sees 3 colleagues' status and nothing for the other 33, so they can't tell whether a colleague in sales is around before writing or calling.

**Evidence.** Роман Пономаренко (head of Маркетинг) on 2026-10-14, right after the company directory went live: «I don't see online or offline indicators … "в сети" / "не в сети" tab displays my department, not the entire team. I don't see, like the director, these statuses.»

**Success metric.** Every user sees who is online across the company in «Команда», updated live: the «В сети» tab shows the same people for a head and for the director. Checked live as a head and as the director.

## What Changes

- **Everyone sees whether each active colleague is online,** in every department: the green dot, «В сети» or «Не в сети», and the «В сети / Не в сети» tabs over the whole company. The status updates live.
- **For people outside your team, the online state is all you see.** No "last seen" time, no presence history, no attendance. Those stay with the person, their head and the director, as today.
- **The header counts the company:** «36 сотрудников · в сети 5».
- **Fix:** a selected person who drops out of the current tab or search no longer stays on the right while the list shows someone else.

## Announcement

In «Команда» you now see who is online across the whole company, not only in your department. You'll see a green dot and «В сети» for anyone who is working in Atlas right now. When colleagues were last active stays visible only to their head and the director.

## Non-goals

- Showing "last seen" times or presence history outside the team.
- Online dots in other screens (chat, task assignees): a later step if wanted.
- Manual statuses («На встрече»).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `presence`: a company-wide online/offline signal (no times) for every user.
- `team-management`: the directory carries `online`; the Team screen shows status and online filters for the whole company.

## Impact

- **API:** `online` in `GET /team/directory`; a new socket event `presence:online { userId, online }` to everyone in the company on each change. The scoped `presence:changed` and `presence:snapshot` are unchanged.
- **Web:** the Team page only.
- **Privacy:** colleagues learn when someone is in Atlas right now. Users already accept the monitoring policy, which lists «статус "в сети" / "не в сети"» as recorded; that it is now visible company-wide goes into the release note.
