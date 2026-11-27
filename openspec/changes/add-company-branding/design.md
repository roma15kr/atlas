# Design: Company branding

## Context
- **Name and mark are hard-coded** in `AppShell.tsx` (`<span className="brand-mark">A</span><strong>ATLAS</strong>`), in `LoginPage.tsx` (twice: the photo panel and the phone header), in `index.html` (`<title>Quorfield</title>`, `theme-color`, icons) and in the static `public/manifest.webmanifest`.
  - Pop-up notifications use `public/notification-icon.png` from `sw.js`.
  - Server texts name «Quorfield» in `push.testTitle` and the `alert.INACTIVITY.*` templates (`apps/api/src/i18n`).
- **Colours** are tokens in `styles.css :root` (`--primary`, `--primary-dark`, `--primary-soft`, `--sidebar`, `--sidebar-muted`). Several teal and sidebar shades are still hard-coded:
  - `#e7f2ef`/`#1e625c` on the sidebar mark, and `#f0f6f5` for selected rows;
  - `#31504c` for the active nav item, `#758683`, `#889995` and `#c2d0cd` in the sidebar;
  - `rgba(255,255,255,…)` sidebar overlays, and teal `rgba(23,111,104,…)` in two places.
- **Image handling already exists:**
  - avatars are prepared in the browser by canvas (`lib/image.ts prepareAvatar`: decode, square, re-encode, which drops metadata);
  - the API checks file types by content (`routes/avatars.ts detectImageType`) and stores them with `objectStorage`;
  - avatars are served by a public route behind `ipFloodLimiter` before authentication, with `immutable` caching keyed by a random id.
- **Realtime:** `emitToUsers(userIds, event, payload)`. The web re-dispatches socket events as `atlas:socket` window events.
- **The login screen** has no session, so branding must be readable without a token. The installation has one company; `auth.ts` already has `soleCompanyId()` for such public paths.

## Goals / Non-Goals
- **Goals:**
  - one appearance per company, editable by directors and readable by everyone, including before sign-in;
  - live updates;
  - an installed app named and iconed from the branding;
  - no new libraries.
- **Non-goals:** see the proposal (fonts, radius, dark mode, other tokens, SVG, per-department themes).

## Decisions

### D1. Storage: one row per company, icons as stored files
Migration **`027_company_branding.sql`**:
```sql
CREATE TABLE company_branding (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  app_name text NOT NULL DEFAULT 'Quorfield' CHECK (char_length(btrim(app_name)) BETWEEN 1 AND 30),
  accent_color text NOT NULL DEFAULT '#176f68' CHECK (accent_color ~ '^#[0-9a-f]{6}$'),
  sidebar_color text NOT NULL DEFAULT '#1d2a28' CHECK (sidebar_color ~ '^#[0-9a-f]{6}$'),
  logo_version uuid,               -- NULL = no logo; changes with every upload (cache key)
  logo_keys jsonb,                 -- { "logo": key, "icon192": key, "icon512": key, "maskable512": key, "apple180": key, "badge96": key }
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- A missing row means the standard look; the API returns defaults.
- Reset deletes the row and its stored files.

### D2. Icons are generated in the browser, not on the server
The director's browser draws the uploaded image with canvas, extending `lib/image.ts`, into six PNGs:
- `logo`: 512×512, contained, transparent background;
- `icon192` and `icon512`: on a white square, 10% padding;
- `maskable512`: on the accent colour, logo within the 80% safe zone;
- `apple180`: white, no transparency, which iOS requires;
- `badge96`: for notifications.

All six go up in one multipart request. The server:
- accepts only PNG for each part, checked by magic bytes;
- reads the size from the PNG `IHDR` chunk and requires the expected square size;
- limits each part to 1 MB.

This avoids an image library on the API (sharp or jimp would be a new dependency) and reuses the avatar approach. The 5 MB limit applies to the source file in the browser, before re-encoding.

The maskable icon uses the accent colour at upload time. Changing colours later regenerates it only on the next logo upload (see least confident decisions).

### D3. API
New router `routes/branding.ts`. Public parts are mounted before `authenticate`, like avatars (`ipFloodLimiter`).

| Method and path | Who | Response |
|---|---|---|
| `GET /api/v1/branding` | public (sole company), or the caller's company when a token is sent | `{ data: Branding }` |
| `GET /api/v1/branding/manifest.webmanifest` | public | manifest JSON (`application/manifest+json`), `Cache-Control: no-cache` |
| `GET /api/v1/branding/files/:version/:name.png` | public | PNG, `public, max-age=31536000, immutable`; 404 for an unknown version or name |
| `PATCH /api/v1/branding` | DIRECTOR | `{ appName?, accentColor?, sidebarColor? }` → `{ data: Branding }` |
| `PUT /api/v1/branding/logo` | DIRECTOR | multipart with the six PNG parts → `{ data: Branding }` |
| `DELETE /api/v1/branding/logo` | DIRECTOR | `{ data: Branding }` |
| `DELETE /api/v1/branding` | DIRECTOR | reset → `{ data: Branding }` (defaults) |

- **Access:** reading is open to everyone; branding isn't confidential and the login screen needs it. Writing is DIRECTOR only; MANAGER and EMPLOYEE get 403 `DIRECTOR_ONLY`, audited as denied.
- **Several companies:** the public endpoints serve the sole company and fall back to defaults when there are several; signed-in reads use `auth.companyId`.
- **Validation:**
  - zod: a hex `#rrggbb`, lowercased;
  - `appName` trimmed to 1–30 characters, with no control characters;
  - the accent's contrast with `#ffffff` must be ≥ 4.5, else 400 `BRANDING_LOW_CONTRAST`. The same function runs on the web.
- **Audit:**
  - `BRANDING_UPDATED { fields }`;
  - `BRANDING_LOGO_UPDATED { logoVersion }` and `BRANDING_LOGO_REMOVED`;
  - `BRANDING_RESET`;
  - refusals are audited with `result: DENIED`.
- **Realtime:** after each write, `emitToUsers(activeUserIdsOf(company), "branding:changed", Branding)`.
- **Server texts:**
  - `push.testTitle` becomes `"{app}: перевірка сповіщень"`, and the `alert.INACTIVITY.*` templates gain `{app}`, rendered with the company's app name;
  - `push.ts` adds `icon`/`badge` URLs of the current logo version (or the standard files) to the payload.

```ts
// apps/api/src/branding.ts
export interface Branding { appName: string; accentColor: string; sidebarColor: string; logoVersion: string | null; files: BrandingFiles | null; updatedAt: string | null }
export interface BrandingFiles { logo: string; icon192: string; icon512: string; maskable512: string; apple180: string; badge96: string } // URLs
export const DEFAULT_BRANDING: Branding;
export async function brandingOf(companyId: string | null): Promise<Branding>;
export function contrastRatio(foreground: string, background: string): number;
export function manifestFor(branding: Branding, language: Language): Record<string, unknown>;
export function pngSize(body: Buffer): { width: number; height: number } | null;
```

### D4. Web: one branding source, applied as CSS variables
`lib/branding.ts`, shared with the API's contrast rule through a copy kept equal by a unit test, as `channelIcons` and `emoji.json` already are:
```ts
export interface Branding { appName: string; accentColor: string; sidebarColor: string; logoVersion: string | null; files: BrandingFiles | null }
export const DEFAULT_BRANDING: Branding;
export const BRANDING_PRESETS: Array<{ key: string; accentColor: string; sidebarColor: string }>; // 8 pairs, all ≥ 4.5
export function contrastRatio(a: string, b: string): number;
export function brandingTokens(branding: Branding): Record<`--${string}`, string>;
//   --primary, --primary-dark (accent darkened 18% in OKLab-free HSL), --primary-soft (accent at 10% on white),
//   --sidebar, --sidebar-text, --sidebar-muted, --sidebar-subtle, --sidebar-hover, --sidebar-active, --sidebar-line
export function applyBranding(branding: Branding): void; // sets tokens on :root, <title> suffix, favicon, theme-color, apple-touch-icon
export function prepareBrandIcons(file: File, accentColor: string): Promise<Record<keyof BrandingFiles, Blob>>; // in lib/image.ts
```
- **`BrandingProvider`** in `context/BrandingContext.tsx` wraps both the login route and the workspace.
  - It loads `GET /branding` once, through `lib/api.ts` (public, no token needed).
  - It listens for `atlas:socket` `branding:changed`, and calls `applyBranding` on every change.
  - It caches the last branding in `localStorage` (`atlas.branding`), a per-browser convenience, so the next load paints without a flash.
- **The sidebar text colour** is white-ish on a dark sidebar and `--text` on a light one, whichever contrast is higher. The muted, subtle, hover, active and line shades are derived from that choice.
- **`<BrandMark size>`** shows the logo (`files.logo`) or the first letter of `appName` on `--primary`. It replaces the three hard-coded marks; the name text replaces «ATLAS» (shown as typed, no forced capitals).
- **Tab title:** `AppShell` sets `document.title = \`${pageName} · ${appName}\``.
- **`index.html`:** `<link rel="manifest" href="/api/v1/branding/manifest.webmanifest">`. `public/manifest.webmanifest` stays as the server's fallback content. `applyBranding` updates the theme colour, favicon and apple-touch-icon `<link>`s.
- **`sw.js`:** uses `data.icon`/`data.badge` from the payload, falling back to `/notification-icon.png`. `offline.html` stays standard; it has no data.
- **Demo mode:** `brandingBackend` has a demo branch that keeps the branding in memory plus `localStorage`, and accepts the same actions.

### D5. The «Оформлення» screen (`pages/BrandingSettingsPage.tsx`, route `/settings/appearance`)
- `RoleGate roles={['DIRECTOR']}`. The nav item «Оформлення» (`Palette` icon) is director-only, placed after «Аудит».
- The layout follows the settings screen pattern with a single object, like `TelegramSettingsPage`: read-only cards plus dialogs.
- **Dialogs:**
  - `TitleDialog`: one field and a counter.
  - `LogoDialog`: choose a file, see a preview of the square mark and the app icon, then «Завантажити».
  - `ColoursDialog`: eight preset swatches, two «Свій колір» inputs (`<input type="color">` plus a hex field) and a live preview card. For a low-contrast accent it shows a warning, «Зберегти» is disabled, and the reason is shown.
  - The reset confirmation.
- Mockups: `mockups/appearance-settings.html` and `mockups/colours-dialog.html`.
- **Translations:** a new `branding` namespace in uk, ru and en, plus `shell:nav.appearance`.

### D6. Hard-coded shades become tokens
These are replaced in `styles.css`:
- sidebar: `#31504c`, `#758683`, `#889995`, `#c2d0cd`, `#d5dfdd` and the white `rgba` overlays;
- brand mark: `#e7f2ef` and `#1e625c`;
- selected rows: `#f0f6f5`;
- teal `rgba(23,111,104,…)`.

The standard values stay visually identical (a screenshot comparison of four screens is in the test plan).

## Files

| File | Change |
|---|---|
| `database/027_company_branding.sql` | new table (D1) |
| `apps/api/src/branding.ts` | defaults, read, contrast, manifest, PNG size check |
| `apps/api/src/routes/branding.ts` | public and director routes (D3), audit, realtime |
| `apps/api/src/app.ts` | mount the public branding routes before `authenticate`, the rest after |
| `apps/api/src/notifications/push.ts` | `icon`/`badge` in the payload |
| `apps/api/src/routes/notifications.ts` | test push title with `{app}` |
| `apps/api/src/automation/alertText.ts` | `{app}` for INACTIVITY |
| `apps/api/src/i18n/{uk,ru,en}.ts` | `{app}` placeholders |
| `apps/web/src/lib/branding.ts` | tokens, contrast, presets, apply (D4) |
| `apps/web/src/lib/image.ts` | `prepareBrandIcons` |
| `apps/web/src/context/BrandingContext.tsx` | provider, socket listener, demo branch |
| `apps/web/src/components/BrandMark.tsx` | logo or letter mark |
| `apps/web/src/components/AppShell.tsx` | brand mark, name, tab title, nav item |
| `apps/web/src/pages/LoginPage.tsx` | brand mark and name, two places |
| `apps/web/src/pages/BrandingSettingsPage.tsx` | the screen and its dialogs (D5) |
| `apps/web/src/App.tsx` | route and provider |
| `apps/web/src/styles.css` | tokens (D6), screen styles |
| `apps/web/index.html`, `apps/web/public/sw.js` | manifest link, notification icons |
| `apps/web/src/i18n/{uk,ru,en}/branding.ts`, `shell.ts` | texts |
| `docs/ARCHITECTURE.md`, `STATUS.md` | code map, status |

## Call stacks
- **Load (any visitor):** `main.tsx` → `BrandingProvider` → reads the cached `atlas.branding` → `applyBranding` → `GET /branding` (`brandingOf(soleCompanyId)`) → `applyBranding`.
- **Change the colours (director):** `ColoursDialog` save → `PATCH /branding`:
  1. `requireRoles("DIRECTOR")`;
  2. zod validation and `contrastRatio`;
  3. upsert;
  4. `writeAudit BRANDING_UPDATED`;
  5. `emitToUsers branding:changed`.

  Each open tab: `atlas:socket` → `BrandingProvider` → `applyBranding`.
- **Upload a logo:** `LogoDialog` → `prepareBrandIcons(file, accent)` → `PUT /branding/logo` (multer memory storage, six parts):
  1. PNG and size checks;
  2. `objectStorage.put` ×6;
  3. update `logo_version`/`logo_keys`;
  4. delete the old files;
  5. audit;
  6. emit.
- **Install the app:** the browser fetches the manifest → `manifestFor(brandingOf(sole), uk)` → its icons point at `/branding/files/<version>/icon512.png`.
- **Test push:** `POST /notifications/push/test` → `render(text("push.testTitle", { app }))` → the payload carries `icon` → `sw.js showNotification({ icon })`.

## Test plan
- **API (`routes/branding.integration.test.ts`):**
  - «gives the standard look before anything is saved, without a token»;
  - «lets a director change the title and colours, audits the field names and emits branding:changed»;
  - «refuses a manager and an employee with 403 and audits the refusal»;
  - «refuses an accent with contrast below 4.5 and an empty or 31-character title»;
  - «stores a logo's six PNGs, serves them by version with immutable caching, and deletes the old version's files»;
  - «refuses a JPEG part, a wrong-sized PNG and an SVG disguised as PNG»;
  - «serves a manifest with the company's name, theme colour and icon URLs»;
  - «resets to defaults and deletes the stored files»;
  - «names the company in the test push title and adds the icon».
- **API unit (`branding.test.ts`):** `contrastRatio` known pairs (#176f68 on white ≈ 6.0; #f5d90a < 2); `pngSize` reads IHDR.
- **Web unit (`lib/branding.test.ts`):**
  - presets all pass contrast;
  - `brandingTokens` picks dark text for #f1f3f2 and light for #1d2a28;
  - the web and API contrast functions agree on 20 colours, through the shared fixture.
- **Web screens (`BrandingSettingsPage.test.tsx`):**
  - «a director changes the colours and the sidebar follows without a reload»;
  - «the save button stays disabled for #f5d90a and explains why»;
  - «uploading a wide logo shows it in the sidebar mark» (demo mode, canvas mocked);
  - «a manager has no «Оформлення» item and the address redirects»;
  - «the tab title reads «Задачі · RDIM Office»»;
  - «the login screen shows the saved title before sign-in».
- **i18n:** the dictionaries test covers the new namespace.
- **Visual:** a headless pass of the dashboard, team, chat and login at 1440 and 390 px with the standard branding, compared with before D6 (no visible change), and once with a light sidebar and a blue accent.

## Risks / Trade-offs
- **Installed-app caching:** Android and iOS refresh the name and icon on their own schedule, and iOS only on reinstall. This is documented in the spec and the announcement.
- **A light sidebar** exposes any sidebar style still hard-coded white. D6 and the visual pass cover it.
- **Public read:** reveals the company's name, logo and colours to anyone who knows the URL, which the login screen already does by design.

## Migration Plan
- 027 only adds a table, so there is no backfill; a missing row means the standard look. Rollback: the web ignores an empty or failed branding response and stays standard.

## Least confident decisions
1. **Icons generated in the browser (D2)** rather than server-side resizing. It saves a dependency, but the maskable icon bakes in the accent colour at upload time; changing colours later leaves an old-coloured maskable icon until the logo is re-uploaded. Alternative: regenerate on colour change from the stored 512 logo (the director's browser would do it as part of saving colours).
2. **Contrast rule only on the accent (white text ≥ 4.5).** A dark accent on a dark sidebar can make the active nav item hard to spot; we could also require a minimum difference between accent and sidebar.
3. **Public `GET /branding` for the sole company.** It is fine for this single-company installation; a multi-company host would need a hostname-to-company mapping.
4. **The tab title becomes «Page · App»**; today it is just «Quorfield». A change for everyone, though minor.
5. **Eight presets:** the palette is my choice. The director may want their exact brand colours as a preset instead.
