# Design

## Context

- `RichTextView` builds React elements from sanitized HTML and renders each `<img>` as `AuthImage`.
- `AuthImage` fetches `/api/v1/images/:id` with the token through `lib/images.ts` `loadImage`, which caches object URLs. The same URL can therefore serve the thumbnail and the enlarged view without a second download.

## Decisions

1. **Thumbnails.**
   - In `RichTextView` (display only, not the editor), images get `.rich-image--thumb`: `max-width: min(320px, 100%)`, `max-height: 240px`, `object-fit: contain`, rounded, with a subtle border and `cursor: zoom-in`.
   - Each image is wrapped in a `<button type="button">` labelled «Открыть изображение», so keyboard users can open it.
   - `RichTextView` collects the image sources of the text in order and passes them and the index to the viewer.
2. **`ImageViewer`.**
   - A portal dialog (`role="dialog"`, `aria-modal`, labelled «Просмотр изображения»), with a backdrop `rgba(10,16,15,.86)`.
   - The image is `max-width: 92vw; max-height: 86vh`.
   - Opening animates from the thumbnail's rectangle (FLIP: measure, transform, transition 180ms), and is disabled under `prefers-reduced-motion`.
   - Controls:
     - «×» (Escape) and a click on the backdrop close it;
     - «‹ ›» and the ArrowLeft/ArrowRight keys browse, with a horizontal swipe of at least 50px on touch;
     - the counter «2 из 5»;
     - «Скачать» downloads through `api.download` with the original name `image.<ext>`.
   - Focus moves to «×» on open and returns to the thumbnail on close. Body scroll is locked while open.
3. **Reuse.** The viewer reads the object URL from `loadImage`'s cache, so it never refetches. Images that failed to load aren't clickable.

## Risks / Trade-offs

- **Large originals scaled by the browser** cost memory on old phones. Images are capped at 5 MB, which is accepted.
- **The FLIP animation needs layout.** jsdom tests cover behaviour (open, browse, close, focus); the animation is checked by eye.
