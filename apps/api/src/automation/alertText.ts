import { render, text, type Language, type Text } from "../i18n";

/**
 * Alerts are shared rows, so their texts render when read, in the reader's language, from the rule, the evidence and
 * these joined names. The Russian title and summary stored by older versions remain the fallback.
 */
export const ALERT_TEXT_COLUMNS = `(SELECT full_name FROM users WHERE id = a.user_id) AS "textUser",
  (SELECT title FROM deals WHERE id = a.deal_id) AS "textDeal",
  CASE WHEN a.rule = 'KPI_BEHIND' THEN (SELECT name FROM kpis WHERE id = (a.evidence->>'kpiId')::uuid) END AS "textKpi",
  CASE WHEN a.rule = 'DEAL_STALLED' THEN current_date - (a.evidence->>'updatedAt')::timestamptz::date END AS "textDays"`;

export interface AlertTextRow {
  rule: string | null; title: string; summary: string | null; evidence: Record<string, unknown> | null;
  textUser?: string | null; textDeal?: string | null; textKpi?: string | null; textDays?: number | null;
}

const percent = (value: unknown) => Math.round(Number(value) * 100);

/** The title and summary of an alert as templates, or the stored texts when its rule or names are unknown. */
export function alertTexts(row: AlertTextRow): { title: Text | string; summary: Text | string | null } {
  const evidence = row.evidence ?? {};
  const user = row.textUser ?? "";
  switch (row.rule) {
    case "TASKS_OVERDUE":
      return { title: text("alert.TASKS_OVERDUE.title"), summary: text("alert.TASKS_OVERDUE.summary", { user, count: Number(evidence.overdue ?? 0) }) };
    case "DEAL_CLOSE_OVERDUE":
      if (!row.textDeal) break;
      return { title: text("alert.DEAL_CLOSE_OVERDUE.title"), summary: text("alert.DEAL_CLOSE_OVERDUE.summary", { deal: row.textDeal }) };
    case "DEAL_STALLED":
      if (!row.textDeal || row.textDays == null) break;
      return { title: text("alert.DEAL_STALLED.title"), summary: text("alert.DEAL_STALLED.summary", { deal: row.textDeal, days: row.textDays }) };
    case "KPI_BEHIND":
      if (!row.textKpi) break;
      return { title: text("alert.KPI_BEHIND.title"), summary: text("alert.KPI_BEHIND.summary", { user, kpi: row.textKpi, progress: percent(evidence.progress), elapsed: percent(evidence.elapsed) }) };
    case "INACTIVITY":
      return { title: text("alert.INACTIVITY.title"), summary: text("alert.INACTIVITY.summary", { user, days: Number(evidence.weekdays ?? 0) }) };
  }
  return { title: row.title, summary: row.summary };
}

/** An alert row for the API: texts in the reader's language, without the helper columns. */
export function localizeAlert<T extends AlertTextRow>(language: Language, row: T): Omit<T, "textUser" | "textDeal" | "textKpi" | "textDays"> {
  const texts = alertTexts(row);
  const { textUser: _user, textDeal: _deal, textKpi: _kpi, textDays: _days, ...rest } = row;
  return { ...rest, title: render(language, texts.title), summary: texts.summary === null ? null : render(language, texts.summary) };
}
