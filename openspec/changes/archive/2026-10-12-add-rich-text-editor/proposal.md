# Proposal

## Why

**Problem.** "I can't write anything structured in Atlas. A meeting summary, a checklist for a task or a price table in a client note all turn into one grey block of text. In ClickUp or GitHub I just make it bold, add a list or a table, or paste a screenshot."

**Evidence.** The team asked for this on 2026-10-11, after moving to real staff and dealers in Atlas. Atlas has no formatting anywhere today. Tasks have no comment thread and deals have no notes, so discussion about them happens elsewhere.

**Success metric.** At least 30% of new task descriptions, client notes and chat messages written in the first month use formatting (a list, checklist, table, heading, link or image). Measured by a one-off query over texts created in that month that contain Markdown structure.

## What Changes

- A formatting editor ("what you see is what you get", like ClickUp) replaces the plain text boxes for:
  - chat messages, thread replies and message edits;
  - task and board-card descriptions;
  - client notes and client comments;
  - job descriptions.
- New: **task comments**, a comment thread on every task, like client comments.
- New: **deal notes**, one formatted notes field per deal.
- Supported formatting:
  - bold, italic, strikethrough, headings, bulleted and numbered lists, links, quotes, inline code and code blocks;
  - checklists;
  - tables;
  - images pasted or dropped into the text.
- Wherever this text is shown, it appears formatted. Anything unsafe (scripts, unknown HTML) is removed.
- In a description or note you can edit, ticking a checklist box saves it straight away.
- Chat @mentions keep working inside formatted messages. Previews (conversation list, notifications) show plain text without formatting marks.
- Text is kept in Markdown, so it stays readable for AI analysis and export.

## Announcement

Atlas now has a real text editor. Make text bold, add lists, checklists and tables, or paste a screenshot straight into a chat message, a task, a client note or a deal. Tasks now have their own comment thread, and every deal has notes, so the whole conversation about a sale or a job stays in one place. Tick a checklist item in a task description and it is saved immediately. @mentions in chat work as before.

## Non-goals

- Collaborative live editing (two people typing in the same text at once).
- Formatting in email, Telegram replies or AI analysis output.
- Editing or deleting task comments and client comments after posting (client comments can't be edited today either).
- Files other than images (documents stay in «Документы»).
- Converting existing plain text: it already reads correctly as Markdown.

## Capabilities

### New Capabilities

- `rich-text`: the shared formatting rules: what formatting is supported, safe display, checklists, pasted images and plain-text previews.

### Modified Capabilities

- `team-chat`: messages are formatted, and mentions and previews keep working.
- `tasks`: formatted descriptions, interactive checklists and the new task comments.
- `crm-clients`: formatted client notes and comments.
- `sales-pipeline`: the new deal notes.
- `team-management`: formatted job descriptions.

## Impact

- **New libraries:** a Markdown parser and an HTML sanitizer (already approved), plus a WYSIWYG editor library that still needs approval; see design.
- **Size:** the editor adds noticeably to the web bundle, so it loads only when an editor first opens.
- **Data:** new data for task comments, deal notes and uploaded images.
- **Old plain text:** keeps its meaning, but a line starting with `#`, `-` or `1.` now displays as a heading or list.
