## ADDED Requirements

### Requirement: Notification centre
The system SHALL keep notifications per user and SHALL let each user list their own notifications newest first, with the number of unread ones, and mark one or all as read. A user SHALL never see or change another user's notifications; such an id SHALL answer 404 `NOTIFICATION_NOT_FOUND`. New notifications SHALL reach the user's open Atlas tabs immediately. Notifications older than 90 days SHALL be deleted.

#### Scenario: Reading a notification
- **WHEN** a user lists notifications and marks one read
- **THEN** it is returned with `readAt` set and the unread count drops by one

#### Scenario: Someone else's notification
- **WHEN** a user tries to mark another user's notification read
- **THEN** the response is 404 `NOTIFICATION_NOT_FOUND` and nothing changes

### Requirement: Who is notified
The system SHALL never notify the user who caused an event, and SHALL never notify a user about something they cannot open, such as a personal task, a chat they are not in, or another person's customer.

#### Scenario: Personal task stays private
- **WHEN** someone comments on a manager's personal task
- **THEN** only people who can see that task are notified

### Requirement: Task notifications
The system SHALL notify users added as assignees of a task (`TASK_ASSIGNED`), the author and assignees of a task that gets a comment (`TASK_COMMENTED`), and, once per task each after 08:00 Kyiv time, the assignees of open tasks due today (`TASK_DUE`) or past due (`TASK_OVERDUE`).

#### Scenario: Task assigned by a head
- **WHEN** the head of «Департамент продаж» assigns a task to Тимошенко
- **THEN** Тимошенко gets an unread `TASK_ASSIGNED` notification linking to the task, and the head gets none

#### Scenario: Overdue reminder once
- **WHEN** a task stays overdue for three days
- **THEN** its assignees get one `TASK_OVERDUE` notification, not one a day

### Requirement: Chat and Telegram notifications
The system SHALL notify the other members of a direct conversation who have not muted it (`CHAT_DIRECT`), the users the chat mention rules notify (`CHAT_MENTION`), and the person responsible for a Telegram customer who writes in (`TELEGRAM_MESSAGE`), keeping one unread notification per customer.

#### Scenario: Customer writes several times
- **WHEN** a customer sends three Telegram messages before the responsible manager reads the notification
- **THEN** the manager has one unread `TELEGRAM_MESSAGE` notification for that customer, showing the latest message

#### Scenario: Muted direct conversation
- **WHEN** a user has muted a direct conversation and gets a message there without a mention
- **THEN** no notification is created

### Requirement: Alert and CRM notifications
The system SHALL notify the users who can see a new AI alert (`ALERT_CREATED`), and the new owner of a deal or client when someone else hands it over (`DEAL_ASSIGNED`, `CLIENT_ASSIGNED`).

#### Scenario: Deal handed over
- **WHEN** a head makes Трубило the owner of a deal
- **THEN** Трубило gets a `DEAL_ASSIGNED` notification linking to the deal

### Requirement: Desktop notification subscriptions
A user SHALL be able to turn desktop notifications on for a browser, which stores a Web Push subscription for them, and off again, and SHALL choose which groups (tasks, chat, Telegram, alerts and CRM) produce desktop notifications. Without server push keys, desktop notifications SHALL report as unavailable. Subscribing and unsubscribing SHALL be audited with ids only.

#### Scenario: Group turned off
- **WHEN** a user turns off the chat group and receives a direct message
- **THEN** the message appears on their bell but no desktop notification is pushed

#### Scenario: No push keys
- **WHEN** the server has no push keys
- **THEN** the profile shows desktop notifications as unavailable, and the bell still works

### Requirement: Desktop notification delivery
Each new notification of an enabled group SHALL be pushed to all of the user's subscriptions with a title, a plain-text preview of at most 120 characters and a link. Pushes SHALL be sent with high urgency, so a locked or idle phone shows them at once. A subscription the push service reports as gone SHALL be deleted. In Chrome, while an Atlas window is visible and focused, no pop-up SHALL be shown; browsers that require every push to be shown (Safari on iPhone and Mac) SHALL always show it.

#### Scenario: Atlas closed
- **WHEN** a user with desktop notifications on has no Atlas tab open and a task is assigned to them
- **THEN** their browser shows a desktop notification, and clicking it opens the task in Atlas

#### Scenario: Atlas in focus
- **WHEN** a notification arrives while an Atlas tab is focused
- **THEN** the bell updates and no desktop pop-up is shown

#### Scenario: Phone locked
- **WHEN** a user's phone with the installed Atlas is locked and a colleague sends them a direct message
- **THEN** the notification appears on the lock screen at once, without waiting for the phone to be unlocked

### Requirement: Notification screens
The bell in the top bar SHALL open a panel with the user's notifications, show the unread count, open the linked item and mark it read on click, and offer «Прочитать все». The profile SHALL have an «Уведомления» section showing whether desktop notifications are unsupported, blocked, off or on in this browser, with buttons to turn them on or off, the group switches and «Проверить», which sends a test notification.

#### Scenario: Opening from the bell
- **WHEN** a user clicks the bell and then a `TASK_ASSIGNED` notification
- **THEN** the task opens and the notification is no longer unread

#### Scenario: Blocked by the browser
- **WHEN** the browser's permission for Atlas is «Блокировать»
- **THEN** the section explains how to allow notifications in Chrome's site settings, and «Включить» is not offered
