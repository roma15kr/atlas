# Tasks

## 1. Thumbnails and the viewer

- [ ] 1.1 Show images in `RichTextView` as thumbnails inside «Открыть изображение» buttons, and add `ImageViewer` (backdrop, fit to screen, grow-from-thumbnail animation unless reduced motion, «‹ ›», arrows, swipe, «2 из 5», «Скачать», close by «×»/Escape/backdrop, focus return, scroll lock). Verify `ImageViewer.test.tsx` cases (open from a thumbnail, browse with keys and buttons, close three ways with focus returned, a failed image is not clickable) and that the editor still shows images as before; commit.

## 2. Integration checks

- [ ] 2.1 Run `make check` and `npm run build`; verify both pass.
- [ ] 2.2 Run `npx openspec validate add-image-lightbox --strict`; verify it passes.

## Workflow follow-up

- PR into `dev`; check a chat with several screenshots on desktop and a phone; `dev` → `main`; live check; archive.
