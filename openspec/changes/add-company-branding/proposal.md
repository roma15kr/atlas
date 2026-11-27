# Proposal: Company branding (logo, title and colours)

## Problem
«I need app customization, available only to the director: upload a logo, change the app title, and colours and styling.» Every installation looks and is called «Quorfield», with the same teal colour and an «A» letter as its mark. The company can't make the workspace its own, on screen, in the browser tab or on the phone's home screen.

## Evidence
- The director's request in the working session on 2026-11-22 (no inbox report).
- Today the name «Quorfield» and the teal colour are fixed in code: in the sidebar, the login screen, the browser tab, the installed app's name and icon, and a few notification texts. Nothing can be changed without a developer.

## Success metric
The production company sets its own name, logo and colours within a week of release, and has not had to change them back. Measured by the stored appearance and the audit events for appearance changes.

## Why
Staff open Quorfield every day on computers and phones. Showing the company's own name and logo makes it feel like the company's tool rather than a third-party product, and makes the installed app easy to find on a phone. The director already administers the rest of the company setup, so appearance belongs with them.

## What Changes
- A new «Оформлення» screen, visible and usable **only by the director**. On it the director can:
  - **change the app title** (for example, «RDIM Office»);
  - **upload a logo** (PNG, JPEG or WebP; the browser fits it into a square) or remove it;
  - **choose colours:** the accent colour (buttons, links, active items) and the sidebar colour. They pick from ready-made pairs or any colour, with a live preview. An accent too light to read white text on is refused with an explanation. Lighter and darker shades are worked out automatically, and the sidebar text switches between light and dark to stay readable.
  - **reset everything** to the standard Quorfield look.
- The chosen title and logo show:
  - in the sidebar, the phone header and the login screen;
  - in the browser tab title and tab icon;
  - in notification texts that name the app;
  - in the **installed app**: its name and home-screen icon (generated from the logo) and its theme colour.
- Changes apply at once for everyone who has Quorfield open, without reloading. Phones may keep the old installed-app name and icon until the system refreshes them, which can take a few days.
- Status colours (red, amber, green, blue) keep their fixed meaning and can't be changed.
- Every change is recorded in the audit log.

## Capabilities

### New Capabilities
- `company-branding`: the company's title, logo and colours. Covers who may change them, the «Оформлення» screen, the readability rules, reset, and everywhere the branding appears (shell, login, browser tab, installed app, notifications).

### Modified Capabilities
- `ui-design-system`: «Design tokens». The accent and sidebar tokens follow the company's chosen colours instead of fixed values. The status colours and other tokens stay fixed.

## Non-goals
- Custom fonts, corner radius, dark mode, or editing background, surface or text colours.
- Per-department or per-person themes. One look per company.
- SVG logos (they can carry scripts) and animated logos.
- Changing the login screen's photo.
- Branded email templates or Telegram bot profile.
- Instantly replacing the icon on phones that already installed the app; the system decides when to refresh.

## Announcement
Quorfield can now wear your company's colours. In the new «Оформлення» section the director can upload the company logo, rename the app and choose its main and sidebar colours. The changes appear at once for everyone, on computers and phones, in the browser tab and in the installed app. If something doesn't look right, one button brings back the standard look.

## Impact
- **Web:**
  - a new director-only screen;
  - the shell, login screen and browser tab read the branding;
  - the app-wide colour tokens become dynamic, and a few hard-coded teal shades are replaced by tokens.
- **API:**
  - stored branding per company, readable before sign-in so the login screen shows it;
  - director-only changes;
  - a manifest and icons generated from the branding;
  - a realtime update to open sessions.
- **Database:** one new migration.
- **Installed app:** the manifest and icons come from the server instead of fixed files.
- **Translations:** new texts in Ukrainian, Russian and English.
