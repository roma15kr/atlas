# Tasks

## 1. Database

- [x] 1.1 Add `database/012_profile_details.sql`. Verify on PGlite with demo data.

## 2. API

- [x] 2.1 Extend `profileUpdateSchema` and `PATCH /team/me`. Verify with supertest: each field is saved and cleared, a future, too-early or under-14 birth date gives 400, a bad phone or email gives 400, and `role` gives 400. The audit lists field names only.
- [x] 2.2 Return the new fields from `/team`, `/auth/me` and login. Verify that a colleague sees `birthday` without the year only while `showBirthday` is on, and never `birthDate`.
- [x] 2.3 Add `POST`/`DELETE /team/me/avatar` and `GET /avatars/:id`. Verify with tests:
  - PNG, JPEG and WebP are accepted;
  - a text file renamed `.png` gives 400 `UNSUPPORTED_IMAGE`;
  - more than 2 MB gives 413;
  - the photo is served without a token, with the type and cache headers;
  - a replacement makes the old URL 404 and deletes the old object;
  - deletion clears it.
- [x] 2.4 Add `DELETE /team/:id/avatar`. Verify with tests: a head can remove a photo for their own employee, gets 404 for another department, and an employee gets 403. `TEAM_MEMBER_PHOTO_REMOVED` is audited.

## 3. Web

- [x] 3.1 Add `lib/image.ts` `prepareAvatar`, the `Avatar` `src` with its fallback, and the `AppContext` actions with their demo variants.
- [x] 3.2 Update the profile screen with the photo card and the new fields. Verify with Testing Library: the save sends only the changed fields, the upload calls the API with the prepared blob, and a bad email shows a Russian error.
- [x] 3.3 Show contacts, birthday and "about" in the Team panel, and photos in the sidebar, team list, dashboard and task cards.
- [x] 3.4 Take screenshots at desktop and 400px widths, checked against `ui-design-system`.

## 4. Verification

- [x] 4.1 Run `npm run typecheck && npm test && npm run build` and `openspec validate add-profile-details-and-photo --strict`.
- [x] 4.2 On the test app:
  - upload a photo, reload, and see it in the sidebar;
  - set a birthday and see it from a colleague's session without the year;
  - remove the photo.
