# Push notifications for the Atlas mobile app (Flutter)

For whoever builds the Flutter app for Atlas. It covers how notifications work on the server today, why the current pushes don't reach a native app, what the server must add, and how to wire up the Flutter side.

> **Status (2026-11-05).** The server sends pushes only to **browsers**, through Web Push (VAPID, ADR 0005). It cannot yet push to a Flutter app.
> Section 3 is a **proposed** contract for native pushes through Firebase Cloud Messaging. It is not built: it needs an OpenSpec change and the director's approval before work starts.
> Everything else here describes the API as it runs on production (`https://atlas.rdim.ua/api/v1`) and dev (`https://atlas-dev.141.94.30.173.sslip.io/api/v1`).

---

## 1. How notifications work today

### 1.1 One pipeline, three outputs
Every notification is created by one server function, `notify()` in `apps/api/src/notifications/notify.ts`. For each recipient it:

1. stores one row in `notifications`, which feeds the in-app bell;
2. emits `notification:new` with that row to the user's Socket.IO room, so open apps update live;
3. hands the row to push delivery: today only Web Push (`notifications/push.ts`), later also FCM.

`notify()` never notifies the person who caused the event, nor inactive users or users of another company. Callers pass only people who may open the item, so **a push never points at something its recipient can't see**.

### 1.2 Kinds and groups

| `kind` | When | Group (preference switch) | `link` |
|---|---|---|---|
| `TASK_ASSIGNED` | someone assigns you a task | `tasks` | `/tasks?task=<taskId>` |
| `TASK_COMMENTED` | a comment on your task | `tasks` | `/tasks?task=<taskId>` |
| `TASK_DUE` | your task is due today (after 08:00 Kyiv time) | `tasks` | `/tasks?task=<taskId>` |
| `TASK_OVERDUE` | your task is overdue | `tasks` | `/tasks?task=<taskId>` |
| `CHAT_DIRECT` | a direct message | `chat` | `/messages?conversation=<conversationId>` |
| `CHAT_MENTION` | an @mention | `chat` | `/messages?conversation=<conversationId>` |
| `CHAT_MESSAGE` | a group or channel message (not muted) | `chat` | `/messages?conversation=<conversationId>` |
| `TELEGRAM_MESSAGE` | a customer wrote to the company bot | `telegram` | `/telegram?contact=<contactId>` |
| `ALERT_CREATED` | a new AI signal you may see | `alerts` | `/sales?deal=<dealId>` or `/` |
| `DEAL_ASSIGNED` | a deal handed over to you | `alerts` | `/sales?deal=<dealId>` |
| `CLIENT_ASSIGNED` | a customer handed over to you | `alerts` | `/crm/<clientId>` |
| *(test)* | «Перевірити» in notification settings | — | `/profile#notifications` |

Each person can switch the four groups on or off for **pushes**. The bell always gets every notification.

```
GET   /notifications/preferences  → { data: { tasks: true, chat: true, telegram: true, alerts: true } }
PATCH /notifications/preferences  { "chat": false }   (any subset; at least one field)
```

These switches apply to every device of the user, browsers and phones alike.

### 1.3 Collapsing
- **Chat** keeps **one unread notification per conversation**. A new message updates that row (new text and time) instead of adding one.
- **Telegram** keeps one unread notification per customer.
- **Pushes** carry a `tag` so a newer pop-up replaces the older one on the device:
  - chat: `chat:<link>`, one per conversation;
  - everything else: `<kind>:<entityId>`, or the notification id.

The native app must keep the same behaviour, using `tag` as the Android notification tag and the iOS `apns-collapse-id`/`thread-id` (section 3.3).

### 1.4 Language
Titles and bodies are rendered **on the server, in each recipient's interface language** (`users.language`: `uk` by default, `ru`, `en`). The app doesn't translate notifications.
- To change the language: `PATCH /team/me { "language": "en" }`. Send it when the user picks a language in the app, so pushes and the web follow.
- A notification already stored keeps the language it was made in.
- A person's own words, such as the text of a chat message in the body, stay as written.

### 1.5 Removal
When a chat message is deleted, its notifications are deleted too, and the server emits `notification:removed { ids }` on the socket. A push already shown on a device stays there, so the app should drop it from its own list when it sees this event (section 4.6).

### 1.6 What a Web Push carries today
```json
{ "id": "<notification uuid>", "title": "Нова задача: Звіт для Nexans", "body": "Олена Морозова · Продажі", "link": "/tasks?task=…", "tag": "TASK_ASSIGNED:<taskId>" }
```
The body is a one-line plain-text preview: no Markdown or HTML, and images become «[зображення]». Pushes go out with TTL 24 h and urgency high. Native pushes should carry the **same five fields**.

---

## 2. Why the current pushes don't reach a Flutter app

| | Web Push (today) | What a native app needs |
|---|---|---|
| Android | Works in Chrome or the installed PWA | **FCM** registration token |
| iOS | Works only in the installed PWA (Safari, iOS 16.4+) | **APNs** device token, best sent through FCM |
| Server | `web-push`, VAPID keys | FCM HTTP v1 API, a Firebase service account |
| Registration | `POST /notifications/push/subscriptions {endpoint, keys}` | a new device-token endpoint (proposed below) |

A Flutter app has no service worker and no Web Push endpoint, so the server needs a second delivery channel. **Recommendation: Firebase Cloud Messaging for both platforms.** FCM hands iOS messages to APNs, which gives one token type, one API and one sender on the server.

---

## 3. Proposed server contract (not built yet, needs approval)

The Atlas side must build this before the app can receive pushes. It is written so the app can be built against it in parallel.

### 3.1 Server configuration
- **Environment:**
  - `FCM_PROJECT_ID`;
  - `FCM_SERVICE_ACCOUNT_JSON`, the service-account key, which lives only in Coolify and never in the app.
- Without these, the server reports mobile pushes as disabled, like every other Atlas integration.
- **Library:** either `firebase-admin`, which is a new dependency and needs approval, or a direct call to the FCM HTTP v1 API, signing the OAuth token with the existing JWT library. To be decided in the OpenSpec change.
- **Firebase console:** upload the APNs authentication key (`.p8`, Apple Developer → Keys) so FCM can reach iPhones.

### 3.2 Endpoints
All endpoints require `Authorization: Bearer <accessToken>`.

```
GET /notifications/push/config
→ { data: { enabled, publicKey, mobile: { enabled: true } } }        // "mobile" is new

POST /notifications/push/devices
{ "token": "<FCM registration token>", "platform": "android" | "ios",
  "appVersion": "1.4.0", "deviceName": "Pixel 8" }
→ 201 { data: { id } }
   - A token belongs to whoever registered it last (one phone, one signed-in person), as browser subscriptions do.
   - Registering the same token again updates it; call it on every app start and after every token refresh.
   - Audited as PUSH_SUBSCRIBED (ids only).

DELETE /notifications/push/devices
{ "token": "<FCM registration token>" }  → 204      // call on logout, before dropping the session

POST /notifications/push/test   → { data: { devices, delivered } }  // already exists for browsers; would include phones
```

Storage: a new `push_devices` table (`user_id`, `token` unique, `platform`, `app_version`, `device_name`, `last_success_at`, `failures`). The server deletes a token that FCM reports as `UNREGISTERED`/`INVALID_ARGUMENT` at once, and one that fails 5 times in a row, as it does for browsers.

### 3.3 The FCM message the server would send
```json
{
  "message": {
    "token": "<device token>",
    "notification": { "title": "Нова задача: Звіт для Nexans", "body": "Олена Морозова · Продажі" },
    "data": {
      "id": "<notification uuid>",
      "kind": "TASK_ASSIGNED",
      "link": "/tasks?task=8f0c…",
      "tag": "TASK_ASSIGNED:8f0c…",
      "unreadCount": "7"
    },
    "android": {
      "priority": "HIGH",
      "ttl": "86400s",
      "notification": { "channel_id": "tasks", "tag": "TASK_ASSIGNED:8f0c…", "icon": "ic_notification" }
    },
    "apns": {
      "headers": { "apns-priority": "10", "apns-collapse-id": "<tag, max 64 bytes>", "apns-expiration": "<now + 24 h>" },
      "payload": { "aps": { "sound": "default", "badge": 7, "thread-id": "<tag>" } }
    }
  }
}
```
- `data` values are **strings** (an FCM rule), so the app parses `unreadCount`.
- `channel_id` is the group: `tasks`, `chat`, `telegram` or `alerts`. The app creates these four Android channels (section 4.3).
- Chat tags start with `chat:` followed by the link. Above 64 bytes the server hashes the tag for `apns-collapse-id`.
- The message has both a `notification` block, so the OS shows it even when the app is killed, and a `data` block, so the app knows where to go on tap.

### 3.4 Open questions for the OpenSpec change
1. Should a phone skip the push while the same user has Atlas open and focused on a computer? The web does this only for its own focused window.
2. Should the badge number be the bell's unread count? Proposed: yes.
3. Should deleting a chat message send a silent data push so phones remove the shown notification?
4. Should lock-screen text be hidden for chat and Telegram (privacy), showing «Нове повідомлення» instead of the text?

---

## 4. Flutter side

### 4.1 Packages
- `firebase_core`, `firebase_messaging`: token, receiving, permission.
- `flutter_local_notifications`: shows notifications while the app is in the foreground, and creates Android channels.
- A cookie-aware HTTP client, such as `dio` with `cookie_jar` and `dio_cookie_manager` (section 5).
- `flutter_secure_storage`: stores the refresh cookie.
- `socket_io_client`: the live bell and other realtime events.

### 4.2 Firebase project setup
- **Android:** add `google-services.json` and apply the Google services Gradle plugin. Android 13+ needs the runtime permission `POST_NOTIFICATIONS`, which `FirebaseMessaging.requestPermission()` asks for.
- **iOS:**
  - add `GoogleService-Info.plist`;
  - in Xcode enable **Push Notifications** and **Background Modes → Remote notifications**;
  - upload the APNs `.p8` key to Firebase;
  - call `requestPermission(alert: true, badge: true, sound: true)`;
  - set `FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(...)` to your choice for the foreground (see 4.5).
- Use **one Firebase project per Atlas environment** (dev and production), or at least separate apps, so a dev build never registers against production.

### 4.3 Android channels
Create four channels at start-up, with the names in the user's language:

| id | uk | ru | en |
|---|---|---|---|
| `tasks` | Задачі | Задачи | Tasks |
| `chat` | Повідомлення | Сообщения | Messages |
| `telegram` | Telegram | Telegram | Telegram |
| `alerts` | Сигнали та CRM | Сигналы и CRM | Alerts and CRM |

Importance high for `chat` and `telegram`, default for the others. Channels let people mute a group in Android settings. The in-app switches (`/notifications/preferences`) remain the source of truth, so the server doesn't send at all when a group is off.

### 4.4 Token lifecycle
```dart
Future<void> registerPush(Api api) async {
  final messaging = FirebaseMessaging.instance;
  final settings = await messaging.requestPermission();
  if (settings.authorizationStatus == AuthorizationStatus.denied) return;
  final config = await api.get('/notifications/push/config');
  if (config['data']['mobile']?['enabled'] != true) return;          // server not configured
  final token = await messaging.getToken();
  if (token != null) await api.post('/notifications/push/devices', {
    'token': token, 'platform': Platform.isIOS ? 'ios' : 'android', 'appVersion': appVersion, 'deviceName': deviceName,
  });
  messaging.onTokenRefresh.listen((next) => api.post('/notifications/push/devices', {'token': next, 'platform': ...}));
}
```
- Register **after login and on every app start** while signed in.
- On **logout**: `DELETE /notifications/push/devices {token}` *first*, then `POST /auth/logout`, then `FirebaseMessaging.instance.deleteToken()`. Otherwise the next person on the phone receives the previous person's pushes.
- If another user signs in on the same phone, registering the token moves it to them on the server.

### 4.5 Receiving

| App state | What happens | What the app does |
|---|---|---|
| Killed or background | The OS shows the `notification` block itself | On tap: `FirebaseMessaging.instance.getInitialMessage()` (cold start) or `onMessageOpenedApp` → open `data.link` |
| Foreground | Nothing is shown by default (Android) | `FirebaseMessaging.onMessage` → update the bell; show a local notification unless the user is already on that screen (for example, the same chat) |

- Use `data.tag` as the local notification tag or id, so repeats replace each other.
- The bell's own data comes from the API and socket (section 4.6); don't build the list from pushes, since a push can be dropped or delayed.
- Set the app badge from `data.unreadCount` or `aps.badge`. Refresh it from `GET /notifications` whenever the app opens.

### 4.6 The in-app bell (already available)
```
GET  /notifications?limit=30&before=<ISO createdAt>&unread=true
→ { data: [{ id, userId, kind, title, body, link, entityType, entityId, createdAt, readAt }], meta: { unreadCount } }
POST /notifications/:id/read        // when the user opens a notification (also after a push tap: data.id)
POST /notifications/read-all
```
Socket.IO (same origin, path `/socket.io`). Connect with `auth: { token: accessToken }`:
- `notification:new` → a full row, the same shape as the list; prepend it and increase the badge.
- `notification:removed` → `{ ids }`; drop those rows and cancel shown local notifications with those ids.

Reconnect with a fresh access token after each refresh. The server refuses a socket that still needs a password change.

### 4.7 Deep links
`link` is the web path. Map it to app routes:

| Web `link` | App screen |
|---|---|
| `/tasks?task=<id>` | Task details |
| `/messages?conversation=<id>` | Conversation |
| `/telegram?contact=<id>` | Telegram conversation with that customer |
| `/sales?deal=<id>` | Deal card |
| `/crm/<id>` | Customer card |
| `/` | Dashboard (alerts without a deal) |
| `/profile#notifications` | Notification settings (test push) |
| anything else | Dashboard. Keep the fallback: new kinds will be added. |

The item can be gone or outside the user's access by the time they tap; the API then answers **404**. Show «недоступно» and go back, never an error screen.

---

## 5. Authentication for a mobile client (already available)

Atlas was built for a browser, so a few things need care:

- `POST /auth/login { username, password }` → `{ data: { accessToken, user } }`, and the **refresh token as an httpOnly cookie** `Set-Cookie: …; Path=/api/v1/auth`.
  - The access token is a JWT that lives **15 minutes**. Send it as `Authorization: Bearer …`.
  - The refresh cookie lives **14 days**.
  - `user.language` gives the interface language.
- `POST /auth/refresh` (cookie only) → a new access token **and a new refresh cookie**. Tokens rotate: **reusing an old refresh token revokes the whole session family** (`REFRESH_REUSE_DETECTED`) and signs the user out everywhere on that login.
  - Keep a cookie jar and persist the refresh cookie in secure storage.
  - Make refresh **single-flight**: one refresh at a time, with other requests waiting for it. Two parallel refreshes look like reuse.
  - Never keep the access token on disk; the web keeps it in memory only.
- `POST /auth/logout` revokes the refresh token.
- `403 PASSWORD_CHANGE_REQUIRED`: the user must set a new password (`POST /auth/password { currentPassword, newPassword }`) before anything else works, including the socket.
- Errors look like `{ error: { code, message, details } }`. Show text by `code`; the web's texts per code are in `apps/web/src/i18n/*/errors.ts`.
- **Login limits:** 12 failures per username and IP, plus 60 per IP. An office shares one IP, so don't retry logins automatically.

---

## 6. Security and privacy
- Push payloads contain **notification text**, including the first line of a chat or Telegram message and customer names. They pass through Google and Apple, and appear on the lock screen. Consider Android `visibility: private` / iOS «show previews when unlocked» for `chat` and `telegram`, and decide question 4 in 3.4.
- No tokens, ids of other users or personal data beyond the visible text go in `data`.
- The FCM service-account key stays on the server, in Coolify only. The app holds only its own `google-services.json`/`GoogleService-Info.plist`, which are not secrets.
- A token is tied to the signed-in user, so unregister on logout (4.4).

---

## 7. Testing checklist
1. On a phone signed in as `employee`, a director assigns a task → a push arrives with the app killed, in the background and in the foreground. A tap opens that task, and the notification shows as read on the web bell.
2. Three chat messages in one conversation give **one** notification on the phone, the latest; a mention arrives even when the chat is muted.
3. Turn «Повідомлення» off in settings → no chat pushes, but the bell still lists them.
4. Switch the language to English (`PATCH /team/me`) → the next push is in English.
5. Log out → no further pushes to that phone. Log in as someone else → only their pushes.
6. `POST /notifications/push/test` → «Atlas: перевірка сповіщень» on the phone.
7. Delete a chat message → it disappears from the app's list (`notification:removed`).
8. Airplane mode for an hour, then back → pushes from that hour arrive (TTL 24 h); the bell is refreshed from the API.

---

## 8. Work split

| Atlas server (needs an OpenSpec change) | Flutter app |
|---|---|
| `push_devices` table and the register/unregister endpoints | Firebase setup (Android, iOS, APNs key upload) |
| FCM sender next to Web Push, with the same preferences, tags and TTL | Token registration, refresh and logout cleanup |
| `mobile.enabled` in `/push/config`, a phone-aware test push | Channels, foreground display, badge |
| `FCM_*` settings in Coolify for dev and production | Deep links from `link`, bell over API and socket |
| Decisions on the open questions in 3.4 | Cookie-based refresh, single-flight |

Contacts for the server side: the Atlas repository (`roma15kr/atlas`). Server code lives in `apps/api/src/notifications/`, and the behaviour spec in `openspec/specs/notifications/`.
