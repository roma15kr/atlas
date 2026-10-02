# Design

## Context

- `users` already has `avatar_url text`, and it is always NULL. `tasks.ts` already returns `au.avatar_url` for assignees.
- The access token lives only in memory and is sent as a Bearer header. An `<img src>` can't send it.
- `objectStorage` (local volume or S3) stores documents under `<companyId>/<year>/<uuid><ext>`.
- There is no native image library in the API image. Adding `sharp` would bring libvips into the Alpine image.

## Decisions

### 1. Migration `012_profile_details.sql`
Adds these columns to `users`:
- `birth_date date`. Checked to be no earlier than 1900-01-01. The API also refuses future dates and people younger than 14.
- `phone text`, `contact_email text` and `city text`, each with a length check.
- `about text`, at most 500 characters.
- `show_birthday boolean NOT NULL DEFAULT true`.
- `avatar_id uuid UNIQUE`, `avatar_key text` and `avatar_mime text`. `avatar_url` is kept and set to `/api/v1/avatars/<avatar_id>`, so existing queries such as the task assignees work unchanged.

### 2. Validation (`profileUpdateSchema`)
- `birthDate`: `YYYY-MM-DD` or null. Refused if in the future, before 1900, or if the person would be under 14.
- `phone`: 5–40 characters from `+ 0-9 space ( ) -`, with at least 5 digits.
- `contactEmail`: an email address of up to 254 characters.
- `city`: up to 120 characters.
- `about`: up to 500 characters.
- `showBirthday`: a boolean.
- An empty string clears a text field.

The schema stays `.strict()`, so `role` or `departmentId` still give 400.

### 3. Photo upload
- Uses multer memory storage with a 2 MB limit and one file.
- The type is decided by magic bytes, never by the client's MIME type:
  - JPEG: `FF D8 FF`;
  - PNG: `89 50 4E 47 0D 0A 1A 0A`;
  - WebP: `RIFF....WEBP`.

  Anything else gives 400 `UNSUPPORTED_IMAGE`, and a file over the limit gives 413 `FILE_TOO_LARGE`.
- The upload sequence:
  1. Store the object.
  2. In a transaction, swap the user's `avatar_*` columns, generating a new `avatar_id`.
  3. After commit, delete the previous object. If the transaction fails, the new object is deleted instead.
- The server does not re-encode. The web client always re-encodes through a canvas, at 512×512 JPEG with quality 0.88, which strips EXIF.

  Someone who calls the API directly can upload their own unprocessed image. That is accepted: it is their own photo, the server checks its type, and it is served as an image with `nosniff`.

### 4. Serving photos
- `GET /api/v1/avatars/:id` is mounted before `authenticate` and before the per-IP `apiLimiter`.
  - An office of 20 people loading a team page would otherwise spend the shared anonymous budget of 300 requests in 15 minutes.
  - The route still sits behind `ipFloodLimiter`.
- It looks up an ACTIVE or DISABLED user by `avatar_id` and streams the object with:
  - `Content-Type` set to the stored MIME type;
  - `Cache-Control: public, max-age=31536000, immutable`;
  - `Content-Disposition: inline`;
  - helmet's `nosniff`;
  - `Cross-Origin-Resource-Policy: same-site`.

  An unknown id gives 404.
- The id is a random UUID that changes on every upload. Only colleagues ever see it, through authenticated API responses. A removed or replaced photo stops resolving at once.

### 5. Visibility in `GET /team` and the session user

| Field | Self (`/auth/me`, login, refresh) | Colleagues (`/team`) |
| --- | --- | --- |
| `birthDate` (full date) | yes | no |
| `birthday` (`MM-DD`) | yes | only when `showBirthday` |
| `showBirthday` | yes | no |
| phone, contactEmail, city, about, avatarUrl | yes | yes |

The `/team` row for the signed-in user also carries `birthDate` and `showBirthday`, so the client can use one source.

### 6. Moderation
- `DELETE /team/:id/avatar` uses `adminDenial` with a new `"edit"`-scoped action: a director for anyone in the company, a head for employees of their own department.
- Removing your own photo goes through `DELETE /team/me/avatar`.
- The admin removal is audited as `TEAM_MEMBER_PHOTO_REMOVED` on the target.

### 7. Web
- `lib/image.ts`: `prepareAvatar(file)`.
  1. Decode the file with `createImageBitmap`, falling back to `<img>`.
  2. Center-crop to a square.
  3. Draw it at 512×512 and export with `canvas.toBlob('image/jpeg', 0.88)`.

  Files over 15 MB or that aren't images are refused before decoding.
- `Avatar` gets an optional `src`. It renders `<img alt="">` inside the existing circle and falls back to initials when the image fails to load.
- Profile screen:
  - The identity card gets a photo with "Загрузить фото" and "Удалить", plus a short hint.
  - The "Личные данные" form adds the new fields and the birthday-visibility checkbox.
  - The page-header "Сохранить" saves everything that changed.
- Team panel: the facts grid adds phone (a `tel:` link), email (a `mailto:` link), city and birthday ("12 марта"), and the "about" text goes under the header.
- Demo mode: the profile save and the photo apply locally, the photo as an object URL.

## Risks / Trade-offs
- **Unauthenticated photos.** Anyone who gets a photo URL can load it until the photo changes. This is acceptable for a work avatar and needed for `<img>` without cookies.
- **Visible birthdays by default.** `showBirthday` defaults to true, but the date itself is empty until the person enters it. So nobody's birthday is shown without their own action.
