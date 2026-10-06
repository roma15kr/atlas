import { z } from "zod";
import { config } from "./config";
import { query } from "./db";
import { MONITORING_POLICY_VERSION } from "./presence";
import { LlmError, llmConfigured, structuredResponse, type LlmFailure } from "./llm/openai";
import { funnelAccessSql } from "./scope";
import type { AuthContext } from "./types";

export type AiMode = "ADVICE" | "EVALUATION" | "FORECAST";

export interface SystemMetrics {
  target: { id: string; role: string; jobTitle: string | null };
  kpiProgress: number;
  tasks: { total: number; done: number; overdue: number };
  pipeline: { openDeals: number; openValue: number; weightedValue: number; currency: "UAH" };
  /** Only for people who accepted the monitoring policy; otherwise `{ consent: false }`. */
  presence: { consent: true; activeDays30: number; lastEventAt: string | null } | { consent: false };
}

export const analysisSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()).max(8)
});

/** Rules that hold for every mode; `analysisInstructions` adds the mode's purpose. */
const BASE_RULES = [
  "You summarize workplace system metrics for a manager or the employee themselves.",
  "Do not infer protected traits, intent, sabotage, or misconduct.",
  "Answer in Russian. Use only the figures given; never invent numbers.",
  "If presence.consent is false, do not mention activity, attendance or presence at all.",
  "Give at most 8 concrete operational recommendations.",
  "Write money amounts in Ukrainian hryvnia with the sign ₴ and spaces between thousands, for example 210 000 ₴; never write UAH."
].join("\n");

/** What each mode is for, so advice, evaluation and forecast read differently. */
export function analysisInstructions(mode: AiMode): string {
  switch (mode) {
    case "ADVICE":
      return "Mode ADVICE: say what to do in the coming days. The summary names the two or three most important priorities and why; recommendations are concrete next actions, most urgent first.";
    case "EVALUATION":
      return "Mode EVALUATION: assess progress against targets. The summary states KPI progress as a percentage, task completion and overdue tasks, and whether the person is on track; recommendations address the weakest area first.";
    case "FORECAST":
      return "Mode FORECAST: estimate the expected outcome of the open deals. The summary gives the weighted pipeline value as the expected result, the total open value as the upper bound, and states that the forecast rests on the current deal probabilities. If there are no open deals, say there is nothing to forecast. Recommendations are about moving deals forward and keeping probabilities current.";
  }
}

/** The full system prompt for a mode: shared rules plus the mode's purpose. */
export function analysisSystemPrompt(mode: AiMode): string {
  return `${BASE_RULES}\n${analysisInstructions(mode)}`;
}

export interface AiResult {
  summary: string;
  recommendations: string[];
  source: "AI" | "RULES";
  model?: string;
  fallbackReason?: LlmFailure;
  metrics: SystemMetrics;
}

export async function analyzeWork(auth: AuthContext, targetId: string, mode: AiMode): Promise<AiResult> {
  const metrics = await systemMetrics(auth, targetId);
  const rules = ruleBased(metrics, mode);
  if (!llmConfigured()) return { ...rules, source: "RULES", metrics };
  try {
    const result = await structuredResponse({
      model: config.AI_ANALYSIS_MODEL,
      schemaName: "work_analysis",
      schema: analysisSchema,
      system: analysisSystemPrompt(mode),
      user: JSON.stringify({ mode, viewerRole: auth.role, metrics, baseline: rules })
    });
    return { ...result, source: "AI", model: config.AI_ANALYSIS_MODEL, metrics };
  } catch (error) {
    return { ...rules, source: "RULES", fallbackReason: error instanceof LlmError ? error.reason : "api_error", metrics };
  }
}

async function systemMetrics(auth: AuthContext, userId: string): Promise<SystemMetrics> {
  const companyId = auth.companyId;
  // Pipeline figures only include funnels the requester may open.
  const dealAccess = funnelAccessSql(auth, "d.funnel_id", 3);
  const [user, kpi, tasks, pipeline, presence] = await Promise.all([
    query<{ id: string; role: string; jobTitle: string | null; consent: boolean }>(
      `SELECT id, role, job_title AS "jobTitle", (monitoring_consent_at IS NOT NULL AND monitoring_consent_version = $3) AS consent
       FROM users WHERE id = $1 AND company_id = $2`, [userId, companyId, MONITORING_POLICY_VERSION]
    ),
    query<{ progress: number }>(
      `SELECT COALESCE(sum(LEAST(actual / NULLIF(target,0),1.2) * weight) / NULLIF(sum(weight),0),0)::float8 AS progress
       FROM kpis WHERE user_id = $1 AND company_id = $2`, [userId, companyId]
    ),
    query<{ total: number; done: number; overdue: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE s.category='DONE')::int AS done,
              count(*) FILTER (WHERE s.category<>'DONE' AND t.due_at<now())::int AS overdue
       FROM tasks t JOIN task_assignees ta ON ta.task_id=t.id JOIN task_board_stages s ON s.id=t.stage_id
       WHERE ta.user_id=$1 AND t.company_id=$2`, [userId, companyId]
    ),
    query<{ openDeals: number; openValue: number; weightedValue: number }>(
      `SELECT count(*) FILTER (WHERE ds.outcome='OPEN')::int AS "openDeals",
              COALESCE(sum(d.value) FILTER (WHERE ds.outcome='OPEN'),0)::float8 AS "openValue",
              COALESCE(sum(d.value*d.probability/100.0) FILTER (WHERE ds.outcome='OPEN'),0)::float8 AS "weightedValue"
       FROM deals d JOIN deal_stages ds ON ds.id=d.stage_id
       WHERE d.owner_id=$1 AND d.company_id=$2 AND ${dealAccess.sql}`, [userId, companyId, ...dealAccess.values]
    ),
    query<{ activeDays30: number; lastEventAt: string | null }>(
      `SELECT count(DISTINCT occurred_at::date) FILTER (WHERE event='ONLINE' AND occurred_at > now()-interval '30 days')::int AS "activeDays30",
              max(occurred_at)::text AS "lastEventAt" FROM presence_events WHERE user_id=$1 AND company_id=$2`, [userId, companyId]
    )
  ]);
  const target = user.rows[0];
  return {
    target: target ? { id: target.id, role: target.role, jobTitle: target.jobTitle } : { id: userId, role: "UNKNOWN", jobTitle: null },
    kpiProgress: kpi.rows[0]?.progress ?? 0,
    tasks: tasks.rows[0] ?? { total: 0, done: 0, overdue: 0 },
    pipeline: { ...(pipeline.rows[0] ?? { openDeals: 0, openValue: 0, weightedValue: 0 }), currency: "UAH" },
    presence: target?.consent ? { consent: true, ...(presence.rows[0] ?? { activeDays30: 0, lastEventAt: null }) } : { consent: false }
  };
}

function ruleBased(metrics: SystemMetrics, mode: AiMode): { summary: string; recommendations: string[] } {
  const completion = metrics.tasks.total ? metrics.tasks.done / metrics.tasks.total : 0;
  const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(metrics.pipeline.weightedValue));
  const recommendations: string[] = [];
  if (metrics.tasks.overdue) recommendations.push(`Разберите просроченные задачи (${metrics.tasks.overdue}) и назначьте новые сроки.`);
  if (metrics.kpiProgress < 0.7) recommendations.push("Сосредоточьтесь на KPI с наибольшим весом до конца периода.");
  if (metrics.pipeline.openDeals && metrics.pipeline.weightedValue < metrics.pipeline.openValue * 0.4) recommendations.push("Проверьте сделки с низкой вероятностью и запишите следующий шаг по каждой.");
  if (!recommendations.length) recommendations.push("Сохраняйте текущий темп и фиксируйте результаты по мере закрытия задач.");
  const activity = metrics.presence.consent ? ` Активных дней за 30 дней: ${metrics.presence.activeDays30}.` : " Присутствие не анализируется: нет согласия на мониторинг.";

  if (mode === "FORECAST") {
    return { summary: `Взвешенный прогноз по воронке — ${money} ₴ по ${metrics.pipeline.openDeals} открытым сделкам.`, recommendations };
  }
  if (mode === "EVALUATION") {
    return { summary: `Выполнение KPI — ${Math.round(metrics.kpiProgress * 100)}%, задачи выполнены на ${Math.round(completion * 100)}%.${activity}`, recommendations };
  }
  return { summary: `Приоритеты составлены по ${metrics.tasks.total} задачам и ${metrics.pipeline.openDeals} открытым сделкам.`, recommendations };
}

