# Proposal

## Why

**Problem.**
- An image pasted into a chat message, a comment or a task description is shown at its full size, up to the whole width of the conversation.
- Screenshots of a screen (like the instructions posted in «Общий» on 2026-10-16) push the rest of the conversation away, and on a phone they are tiny and can't be enlarged.

**Evidence.** The director, 2026-10-16, with a screenshot of «Общий» where one pasted screenshot fills the view: «Also add the responsive photo thumbnail with popup enlargement (like highslide js)».

**Success metric.**
- A conversation with screenshots stays readable: no image takes more than a thumbnail's space.
- Every image opens large with one click and closes with Escape, a click outside, or «×».
- Checked live on desktop and a phone.

## What Changes

- **Thumbnails.** Images in formatted text (chat, threads, task and client comments, descriptions, notes) are shown as thumbnails of at most 320×240, keeping their proportions and never wider than the text around them. A thumbnail shows a zoom cursor, and on a phone a tap opens it.
- **Enlarged view (Highslide-style).**
  - A click opens the image over a dark backdrop, growing from the thumbnail and fitting the screen.
  - Several images in the same text can be browsed with «‹ ›», the arrow keys or a swipe on a phone, with «2 из 5».
  - «Скачать» saves the original.
  - It closes with «×», Escape or a click on the backdrop, and focus returns to the thumbnail.
- **Unchanged:** the editor shows images as today, and the rules for who can see an image stay as they are.

## Announcement

Images in messages, comments and descriptions now show as neat thumbnails. Click one to see it full size, use ‹ › to go through the images of a message, and press Escape to close.

## Non-goals

- Image editing, rotation or annotations.
- A gallery across messages; browsing stays within one message or comment.
- Thumbnails generated on the server. The browser scales the stored image, which is at most 5 MB.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text`: image thumbnails in displayed formatted text, and the enlarged image viewer.

## Impact

- **Web only:** `RichTextView` groups the text's images, `AuthImage` gets a thumbnail mode, and a new `ImageViewer` dialog is added. No API or data changes.
