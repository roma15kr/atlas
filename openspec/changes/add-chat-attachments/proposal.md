# Proposal

## Why

**Problem.** Chat accepts only pasted images. A spreadsheet, PDF or Word file can't be shared in Atlas, so people send files through Telegram and keep only a screenshot or a mention in Atlas. The file then lives outside the company's system, and colleagues have to look for it elsewhere.

**Evidence.** Харруд Хишам, 2026-10-19, in «Общий»: «я закрепил файл… для склада… я файл отправил его в телеграм здесь не смог», then «кто то знает как тут загрузить файлы? программа только изображений грузить». He posted a screenshot of the Excel table instead of the file.

**Success metric.** Харруд attaches the Excel list of goods to a message in «Общий», and a colleague downloads the original file from Atlas, with no Telegram detour.

## What Changes

- **Attaching files:** a paper-clip button in the chat composer, plus drag-and-drop and paste, attaches up to 10 files to a message.
- **Allowed files:**
  - PDF;
  - Word (.docx, .doc), Excel (.xlsx, .xls, .csv), PowerPoint (.pptx);
  - text (.txt), ZIP;
  - images.
- **Size:** up to 20 MB each, the same limit as «Документы».
- **A message can be only files,** with no text.
- **In the conversation:** each file shows as a card with its type icon, name and size; a click downloads it. Images still show as thumbnails.
- **Who can download:** only people who may read that conversation. Anyone else gets 404, and downloads are not public links.
- **Deleting a message** erases its files too, as the deleted-messages rule requires.
- **Threads:** works in thread replies too.

## Announcement

You can now attach files in chat: press the paper clip next to «Отправить», or drag files into the message. PDF, Excel, Word, PowerPoint, text, ZIP and images up to 20 MB each; colleagues download them with one click.

## Non-goals

- Previewing PDFs or spreadsheets inside Atlas (the file downloads).
- Attachments in task comments, client comments or Telegram (later, on the same storage).
- Executable or unknown file types.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-chat`: messages can carry file attachments.

## Impact

- **Data:**
  - migration `024_chat_attachments.sql`: `chat_attachments`, holding the message, conversation, uploader, name, type, size and storage key;
  - files go to the existing object storage.
- **API:**
  - `POST /chat/conversations/:id/attachments` uploads one file;
  - posting a message accepts `attachmentIds`;
  - `GET /chat/attachments/:id` downloads a file;
  - messages carry `attachments`.
  - Uploads not sent within 24 hours are cleaned up.
- **Web:** the composer's paper clip and drop zone, and attachment cards in messages. The demo mirrors it.
