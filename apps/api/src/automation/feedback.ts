import { writeAutomationAudit } from "../audit";
import { query } from "../db";
import { githubConfigured } from "../feedback/github";
import { triageReport, type Triage, type TriageInput } from "../feedback/triage";
import { LlmError, llmConfigured } from "../llm/openai";

export const MAX_ATTEMPTS = 5;
const BATCH = 10;
/** A report left in PROCESSING this long (a crash mid-way) goes back to the queue. */
const STALE_MINUTES = 10;

interface QueuedReport {
  id: string;
  company_id: string;
  kind: string;
  message: string;
  page: string;
  attempts: number;
  triaged_at: Date | null;
  issue_number: number | null;
  diagnostics: { events?: Array<{ type: string; method?: string; path?: string; status?: number; message?: string }> } | null;
}

export interface FeedbackDeps {
  triage?: (input: TriageInput) => Promise<Triage>;
  canTriage?: () => boolean;
  canFile?: () => boolean;
  /** Creates the GitHub issue; added in the next slice. */
  fileIssue?: (report: QueuedReport) => Promise<{ number: number; url: string }>;
}

/** Error lines from the log for the model: failed requests and app errors, no request ids. */
function errorLines(report: QueuedReport): string[] {
  return (report.diagnostics?.events ?? []).flatMap((event) => {
    if (event.type === "request" && (event.status === 0 || (event.status ?? 0) >= 400)) return [`${event.method} ${event.path} ${event.status}`];
    if (event.type === "error" && event.message) return [`error: ${event.message.slice(0, 160)}`];
    return [];
  }).slice(-10);
}

/**
 * Takes waiting reports, translates and classifies those not yet triaged, and files an issue for
 * triaged ones once GitHub is configured. Without configuration, reports simply wait. Failures are
 * retried with growing delays (1, 2, 4, 8 minutes) and stop after 5 attempts.
 */
export async function processFeedback(now = new Date(), deps: FeedbackDeps = {}): Promise<{ processed: number; failed: number }> {
  const canTriage = (deps.canTriage ?? llmConfigured)();
  const canFile = Boolean(deps.fileIssue) && (deps.canFile ?? githubConfigured)();
  if (!canTriage && !canFile) return { processed: 0, failed: 0 };
  const triage = deps.triage ?? triageReport;

  await query(`UPDATE feedback_reports SET status = 'PENDING' WHERE status = 'PROCESSING' AND updated_at < $1::timestamptz - make_interval(mins => $2)`, [now, STALE_MINUTES]);
  const claimed = await query<QueuedReport>(
    `UPDATE feedback_reports SET status = 'PROCESSING'
     WHERE id IN (
       SELECT id FROM feedback_reports
       WHERE issue_number IS NULL
         AND (status = 'PENDING' OR (status = 'FAILED' AND attempts < $1 AND next_attempt_at <= $2))
         AND ((triaged_at IS NULL AND $3) OR (triaged_at IS NOT NULL AND $4))
       ORDER BY created_at LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
     RETURNING id, company_id, kind, message, page, attempts, triaged_at, issue_number, diagnostics`,
    [MAX_ATTEMPTS, now, canTriage, canFile]
  );

  let processed = 0, failed = 0;
  for (const report of claimed.rows) {
    try {
      if (!report.triaged_at) {
        const result = await triage({ kind: report.kind, message: report.message, page: report.page, errors: errorLines(report) });
        await query(
          `UPDATE feedback_reports SET language = $2, title_en = $3, summary_en = $4, translation_en = $5, steps_en = $6::jsonb,
                  category = $7, severity = $8, area = $9, triaged_at = $10 WHERE id = $1`,
          [report.id, result.language, result.title, result.summary, result.translation, JSON.stringify(result.steps),
            result.category, result.severity, result.area, now]
        );
      }
      if (canFile && deps.fileIssue) {
        const issue = await deps.fileIssue(report);
        await query(`UPDATE feedback_reports SET status = 'ISSUE_CREATED', issue_number = $2, issue_url = $3, last_error = NULL WHERE id = $1`, [report.id, issue.number, issue.url]);
        await writeAutomationAudit(report.company_id, { action: "FEEDBACK_ISSUE_CREATED", entityType: "feedback_report", entityId: report.id, metadata: { issueNumber: issue.number } });
      } else {
        await query(`UPDATE feedback_reports SET status = 'PENDING', last_error = NULL WHERE id = $1`, [report.id]);
      }
      processed += 1;
    } catch (error) {
      failed += 1;
      const attempts = report.attempts + 1;
      const reason = error instanceof LlmError ? `AI: ${error.reason}` : error instanceof Error ? error.message : "Unknown error";
      await query(
        `UPDATE feedback_reports SET status = 'FAILED', attempts = $2, next_attempt_at = $3::timestamptz + make_interval(mins => $4), last_error = $5 WHERE id = $1`,
        [report.id, attempts, now, 2 ** (attempts - 1), reason.slice(0, 300)]
      );
    }
  }
  return { processed, failed };
}
