# Tasks

## 1. Tracer bullet: the title, end to end

- [ ] 1.1 Migration `027_company_branding.sql`; `branding.ts` with `brandingOf` and defaults.
  - Routes: public `GET /branding` and director-only `PATCH /branding` for `appName`, audited (`BRANDING_UPDATED`, denied attempts), emitting `branding:changed`.
  - Web: `BrandingProvider` (with a demo-mode branch) and `BrandMark`. The sidebar, phone header and login screen show the title; the tab title reads «Page · App».
  - A minimal «Оформлення» screen (director-only route and nav item) with the «Назва і логотип» card and `TitleDialog`, in three languages.
  - Verify the integration tests:
    - «gives the standard look before anything is saved, without a token»;
    - title change and audit;
    - manager/employee 403;
    - empty and 31-character titles refused;

    and the web tests:
    - «the tab title reads «Задачі · RDIM Office»»;
    - «a manager has no «Оформлення» item and the address redirects»;
    - «the login screen shows the saved title before sign-in».

    Commit.

## 2. Colours

- [ ] 2.1 Replace the hard-coded teal and sidebar shades with tokens (D6); the standard look stays visually identical. Verify: a headless before/after pass of the dashboard, team, chat and login at 1440 and 390 px shows no visible difference. Commit.
- [ ] 2.2 Add colours (accent and sidebar) to the API and web:
  - the shared `contrastRatio` and refusal `BRANDING_LOW_CONTRAST`;
  - `brandingTokens` with derived shades and the sidebar text choice;
  - `applyBranding` on load and on `branding:changed`;
  - the «Кольори» card, the preview card and `ColoursDialog` with eight presets, custom colours and a live preview.

  Verify the tests:
  - presets pass contrast; light and dark sidebar text;
  - web/API contrast agree;
  - low-contrast accent refused in the API and with «Зберегти» disabled in the dialog;
  - «a director changes the colours and the sidebar follows without a reload»;
  - status badges unchanged.

  Commit.

## 3. Logo

- [ ] 3.1 Add the logo:
  - `prepareBrandIcons` in `lib/image.ts`;
  - `PUT` and `DELETE /branding/logo` with PNG magic-byte and IHDR size checks, storage, removal of the old version, audit and emit;
  - public versioned `GET /branding/files/:version/:name.png` with immutable caching;
  - `LogoDialog` with a preview, and «Прибрати логотип»;
  - `BrandMark` shows the logo or the first letter; the tab favicon follows.

  Verify the tests:
  - six PNGs stored and served by version, old files deleted;
  - JPEG part, wrong-sized PNG and disguised SVG refused;
  - «uploading a wide logo shows it in the sidebar mark»;
  - removing it brings back the letter.

  Commit.

## 4. Installed app and notifications

- [ ] 4.1 Add the installed app and notifications:
  - `GET /branding/manifest.webmanifest` (name, short name, theme colour, icons of the current version), with the `index.html` manifest link;
  - `applyBranding` updates `theme-color` and `apple-touch-icon`;
  - push payloads carry `icon`/`badge`, and `sw.js` uses them;
  - `{app}` in the test push title and the INACTIVITY alert texts in uk, ru and en.

  Verify the tests:
  - «serves a manifest with the company's name, theme colour and icon URLs»;
  - «names the company in the test push title and adds the icon»;
  - the alert text names the app.

  Commit.

## 5. Reset, docs and checks

- [ ] 5.1 Add «Повернути стандартне оформлення»: `DELETE /branding` deletes the row and files, audited (`BRANDING_RESET`), and a confirmation dialog. Verify: «resets to defaults and deletes the stored files», and a web test that the standard look returns. Commit.
- [ ] 5.2 Update `docs/ARCHITECTURE.md` (code map: branding) and `STATUS.md`. Run `make check`, `npm run build`, a headless pass with a blue accent and a light sidebar (no unreadable sidebar text, no overflow) and `npx openspec validate add-company-branding --strict`. Verify that everything passes. Commit.
