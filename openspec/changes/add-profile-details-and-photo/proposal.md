# Proposal

## Why

The profile screen lets people change only their name and specialty. Users can't:
- upload a photo, so every avatar in Atlas is a pair of initials;
- record their date of birth, so colleagues can't see birthdays;
- leave a work phone, a contact email, their city or a few words about themselves.

The `users.avatar_url` column has existed since the first schema, but nothing ever writes it.

## What Changes

- **Personal details.** `PATCH /api/v1/team/me` also accepts:
  - `birthDate`;
  - `phone`;
  - `contactEmail`;
  - `city`;
  - `about`, up to 500 characters;
  - `showBirthday`, which defaults to on.

  Each field can be cleared. Role, department, job title and job description stay with the manager.
- **Birthday privacy.** Only the person sees their full date of birth. Colleagues see the day and month, never the year, and only while `showBirthday` is on.
- **Profile photo.**
  - `POST /api/v1/team/me/avatar` takes one JPEG, PNG or WebP image of up to 2 MB, checked by its content.
  - `DELETE /api/v1/team/me/avatar` removes it.
  - The browser crops the picture to a square and re-encodes it at 512×512 before uploading, which drops camera metadata such as GPS.
  - Photos are served from `GET /api/v1/avatars/:id`. The id is random and changes with every upload, so `<img>` works without a token and the photo can be cached forever.
- **Moderation.** A director, or the head of the person's department, can remove a member's photo with `DELETE /api/v1/team/:id/avatar`. This follows the existing administration scope.
- **Directory.** `GET /team` returns each member's photo, phone, contact email, city, "about" and visible birthday.
- **Audit.** New events: `PROFILE_UPDATED` (field names only), `PROFILE_PHOTO_UPDATED`, `PROFILE_PHOTO_REMOVED`, and `TEAM_MEMBER_PHOTO_REMOVED`.
- **Web.**
  - The profile screen gets a photo card with upload, replace and remove, and all the new fields, with validation messages in Russian.
  - The Team panel shows contacts, city, birthday and "about".
  - Photos replace initials in the sidebar, profile, team list, dashboard presence list and task cards. Initials stay as the fallback.

## Impact

- Migration `012_profile_details.sql`.
- API: `routes/team.ts`, a new `routes/avatars.ts`, `routes/teamAdmin.ts`, `routes/auth.ts` and `app.ts`.
- Web:
  - `ProfilePage`, `TeamPage`, `Avatar`;
  - `AppContext`, adding `updateProfile`, `uploadAvatar`, `removeAvatar` and `removeMemberAvatar`;
  - a new `lib/image.ts`.
- Photos use the existing document storage: the local volume or S3. The backups that already cover the documents volume also cover photos.
