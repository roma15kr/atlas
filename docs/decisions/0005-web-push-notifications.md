# 0005. Desktop notifications through Web Push with the `web-push` library
Date: 2026-10-16
Status: accepted

## Context
Staff need desktop pop-ups for tasks, chat, Telegram customers and alerts, also when no Atlas tab is open
(the director, 2026-10-16). The browser Notification API alone only works while a tab is open. Paid push
services (OneSignal, Firebase SDKs) would add a third party holding our users' data and a client SDK in the
web bundle. Web Push (RFC 8030/8291/8292) is built into Chrome and needs only a service worker and a VAPID key
pair, but its payload encryption and request signing are easy to get subtly wrong by hand.

## Decision
- Desktop notifications use standard Web Push from our own API, with VAPID keys from server settings
  (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Without keys the feature reports "disabled", like
  our other integrations.
- We use the `web-push` npm package (MIT, the reference Node implementation) for encryption and signing, behind
  `notifications/push.ts` so tests replace the sender.
- A service worker (`/sw.js`) shows the pop-up unless an Atlas window is focused, and opens the linked item.
  It never sees the access token.
- Payloads hold a title, a plain preview of at most 120 characters and an in-app link; the push service relays
  them end-to-end encrypted.

## Consequences
- No third-party account or SDK; pop-ups work while Chrome runs, even with Atlas closed.
- One new runtime dependency to keep updated (`web-push`).
- Rotating the VAPID key pair invalidates every subscription: people must turn desktop notifications on again.
- Mobile push and Safari specifics are out of scope (desktop Chrome is the target).
