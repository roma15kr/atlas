# Proposal: in-app problem reports and complaints

## Problem

> "Something on the screen doesn't work, and I don't know whom to tell or how to explain it."

Atlas users have no way to report a problem from inside the app. Today a broken screen means:
- a chat message or a phone call to the director;
- a verbal description with no screenshot;
- no record of what the browser was doing.

The development team works in English on GitHub. Users write in Ukrainian. Someone has to retell, translate and type every report by hand, and many reports are lost or arrive too late to reproduce.

## Evidence

- The product owner asked for it directly on 2026-10-05: users must be able to send a bug report or complaint from every page, with an automatic screenshot and a log, and the feedback, written in Ukrainian, must reach GitHub translated and summarised as tickets.
- There is no inbox evidence yet: `docs/product/inbox/` is empty. This feature is what will start producing that evidence.

## Success metric

**At least 90% of submitted reports appear as a GitHub issue within 10 minutes,** measured monthly from each report's submission time to its issue's creation time.

Reports the director dismisses on purpose are excluded. Reports still waiting because GitHub or the translation service isn't configured count as misses.

## Announcement

> **Сообщить о проблеме — прямо из Atlas.** На каждой странице теперь есть кнопка «Сообщить о проблеме». Опишите, что случилось, своими словами и на своём языке. Atlas сам приложит снимок экрана и технические сведения о последних действиях: без паролей и без содержимого ваших записей. Обращение сразу попадает к команде разработки, а в разделе «Мои обращения» видно, что с ним происходит.

## What Changes

- **Reporting from anywhere.** Every signed-in screen gets a "Сообщить о проблеме" control. It opens a short form: the kind (problem, complaint or idea) and a description in any language.
- **Screenshot.**
  - A picture of the current screen is taken automatically, before the form opens. The user sees it and can leave it out.
  - Password fields are always blanked.
- **Diagnostic log.**
  - Recent technical events go with the report: errors the app hit, recent requests with their result and timing, the pages visited, the app version and the browser.
  - It never contains what the person typed, the contents of records, or credentials.
  - The user can see a summary of what is included and leave it out.
- **Matching server events.** Each report can be matched to the server's own records of the same requests.
- **Status for the reporter.** "Мои обращения" shows each report and whether it has become a ticket.
- **Director inbox.** Directors see every report, with its screenshot and log, its translation, and the linked GitHub issue. They can dismiss a report or retry it.
- **Translation and tickets.** Each report is automatically:
  1. translated to English, summarised and classified (bug, complaint, idea, question), with a severity and the product area;
  2. stripped of personal data;
  3. filed as a GitHub issue with labels.
- **Privacy rule.** The GitHub repository is public, so an issue contains only the anonymised English text and technical context. The screenshot, the log, the original text and the reporter's identity stay in Atlas.
- **Without credentials.** Until the GitHub and translation-service (OpenAI) credentials are configured, reports are kept and shown in the director inbox, and they are filed once the credentials exist.

## Non-goals

- **Reports from the sign-in screen** or from people without an account; only signed-in users can report.
- **Two-way sync.** GitHub comments and status changes aren't mirrored back into Atlas beyond the link.
- **Automatic duplicate merging** of similar reports.
- **Video or session replay,** recording of typing, or continuous monitoring. Data is collected only at the moment someone reports.
- **Mobile apps or browser extensions.**
- **Heads seeing reports.** Department heads don't see their staff's reports, because complaints can be about them.
