# Proposal

## Why

**Problem.**
- The bell in the top bar only jumps to the dashboard. On the dashboard, clicking it does nothing at all.
- Atlas has no way to tell someone that something needs them: a task assigned to them, a comment, a direct message, a customer writing in Telegram, an overdue deadline, an AI alert.
- People find out only by opening the right screen, or not at all. Наталія Денисюк's team runs on Atlas now, so missed events cost real orders.

**Evidence.**
- The director, 2026-10-16: «It's time for notifications: when I click on the bell nothing happens; we need … desktop browser notifications».
- Today the bell's badge counts open AI alerts only, for example «Сделка не закрыта в срок» for Трубило.

**Success metric.** Every staff member gets a notification for each of the events below within seconds, in Atlas and as a desktop pop-up when Atlas is closed. Checked live:
- a task assigned to a colleague shows up on their bell and as a Windows pop-up while their Atlas tab is closed;
- after two weeks, no "I didn't know" complaints from the heads.

## What Changes

- **A notification centre behind the bell.** A panel lists your notifications, newest first, with unread ones marked. A click opens the task, chat, client or deal and marks the notification read, and «Прочитать все» marks everything read. The badge counts unread notifications and updates live.
- **Events that notify the people they concern** (never the person who caused them):
  - **Tasks:** a task assigned to me; a comment on a task I'm an author or assignee of; my open task is due today, or became overdue (once each, in the morning, Kyiv time).
  - **Chat:** a direct message to me; an @mention of me (by today's mention rules). Muted conversations notify only for mentions.
  - **Telegram:** a new message from a customer I'm responsible for. Several messages in a row from one customer collapse into one unread notification.
  - **Alerts and CRM:** a new AI alert for the people who can see it; a deal or client handed over to me by someone else.
- **Desktop pop-ups (Web Push).**
  - In «Профиль → Уведомления» each person turns on desktop notifications for this browser (Chrome asks «Разрешить» once), chooses which groups pop up (tasks, chat, Telegram, alerts and CRM), and can send a test.
  - Pop-ups arrive while Chrome is running, even with no Atlas tab open. While Atlas is focused, the bell updates and no pop-up is shown.
- **Respecting visibility.** Nobody is notified about something they can't open: personal tasks, chats they're not in, other people's customers. A pop-up shows a title and a short plain-text preview.
- **Housekeeping.** Notifications older than 90 days are deleted.

## Announcement

Atlas now tells you what needs you. The bell at the top lists new tasks, comments, messages, customer messages from Telegram, deadlines and alerts; click one to go straight there. Turn on desktop notifications in «Профиль → Уведомления», and Windows will show them even when Atlas is closed.

## Non-goals

- Notifying customers (dealers); that would be a Telegram feature.
- Email or Telegram copies of staff notifications.
- Mobile push (the UI targets desktop Chrome).
- Notifications for every channel message.

## Needs your OK

- **A new dependency, `web-push`** (npm, MIT, the standard Node implementation of Web Push encryption and VAPID signing). Writing that crypto by hand is error-prone. An ADR records the choice.
- **Three new server settings, set in Coolify for prod and dev:**
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (a key pair I generate);
  - `VAPID_SUBJECT` (`mailto:` of the admin).
  - Without them desktop pop-ups report "disabled", and the bell still works.

## Capabilities

### New Capabilities

- `notifications`: the notification centre, the events that create notifications, desktop push subscriptions and preferences.

### Modified Capabilities

None. Tasks, chat, Telegram, alerts and CRM keep their behavior; they only emit notifications.

## Impact

- **Data:** migration `020_notifications.sql`, with three tables: `notifications`, `push_subscriptions` and `notification_preferences`.
- **API:** `/api/v1/notifications` (list, read, read-all, preferences, push config and subscriptions), the socket event `notification:new`, and hooks in tasks, chat, Telegram inbound, alerts and owner changes. Plus a scheduler step for due and overdue tasks and 90-day cleanup.
- **Web:** the bell panel, «Профиль → Уведомления», and a service worker `/sw.js` served by Nginx with no-cache.
- **Privacy:** push payloads are end-to-end encrypted (Web Push, RFC 8291) and pass through Google's push service, which cannot read them. They hold a title and a preview of at most 120 characters. The audit log keeps ids only.
