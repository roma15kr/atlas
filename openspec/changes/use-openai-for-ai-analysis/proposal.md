# Proposal: AI analysis on OpenAI gpt-6-luna

## Problem

> "I press «AI-анализ» and get the same three generic sentences whichever mode I choose."

The Team and Profile screens offer three kinds of AI analysis: advice, evaluation and forecast. On the test app they fall back to fixed rule texts, because no AI key is configured. The code is tied to Claude, with a default model that is now outdated. Atlas is about to use OpenAI for problem reports anyway, and the product owner wants one inexpensive model for both, with the option to switch later if quality isn't good enough.

## Evidence

- **Product owner, 2026-10-06:** use OpenAI `gpt-6-luna` for the AI analysis too, and change the model later if it isn't good enough.
- **Live test, 2026-10-06:** six analyses, covering all three modes for one employee with monitoring consent and one without.
  - **Good:** answered in Russian; every figure was correct; no invented numbers; attendance never mentioned without consent.
  - **Weak:** the three modes read almost the same, the forecast didn't forecast, and amounts appeared as "UAH" instead of "₴".
  - **Cost:** about $0.00016 per analysis.

## Success metric

**At least 95% of analysis requests each month are answered by the model rather than the rule fallback,** measured from the audit log's analysis events by source.

## Announcement

> **AI-анализ стал по-настоящему разным.** «Совет» подскажет, что сделать в ближайшие дни; «Оценка» покажет, как идут KPI и задачи; «Прогноз» оценит ожидаемый результат по открытым сделкам. Анализ использует только сводные показатели — без переписки и данных клиентов — и, как и раньше, учитывает присутствие только при вашем согласии на мониторинг.

## What Changes

- The analysis uses the OpenAI model `gpt-6-luna`, configurable so the model can be changed without a release.
- Each mode gets a distinct purpose:
  - **advice:** priorities for the coming days;
  - **evaluation:** how KPIs and tasks compare with targets;
  - **forecast:** the expected outcome of open deals, based on their weighted value, and stating what it's based on.
- Amounts are shown in hryvnia with "₴".
- The result says which model produced it. When no key is configured, or the model fails, the built-in rule texts are used as before, labelled "Правила".
- Claude is no longer used anywhere in Atlas.

## Non-goals

- New inputs to the analysis, such as message contents, client data or documents. The input stays aggregated figures only.
- Changing who may request an analysis for whom.
- Choosing the model from the user interface.
