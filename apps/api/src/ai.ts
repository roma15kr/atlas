import { z } from "zod";
import { config } from "./config";
import { query } from "./db";
import type { AuthContext } from "./types";

export type AiMode = "ADVICE" | "EVALUATION" | "FORECAST";

interface SystemMetrics {
  target: { id: string; role: string; jobTitle: string | null };
  kpiProgress: number;
  tasks: { total: number; done: number; overdue: number };
  pipeline: { openDeals: number; openValue: number; weightedValue: number };
  presence: { activeDays30: number; lastEventAt: string | null };
}

export async function analyzeWork(auth: AuthContext, targetId: string, mode: AiMode): Promise<Record<string, unknown>> {
  const metrics = await systemMetrics(auth.companyId, targetId);
  const rules = ruleBased(metrics, mode);
  if (!config.ANTHROPIC_API_KEY) return { ...rules, source: "RULES", metrics };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": config.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 550,
        temperature: 0.2,
        system: "You summarize workplace system metrics. Do not infer protected traits, intent, sabotage, or misconduct. Give concrete operational recommendations. Return JSON only with summary (string) and recommendations (string array).",
        messages: [{ role: "user", content: JSON.stringify({ mode, viewerRole: auth.role, metrics, baseline: rules }) }]
      })
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error(`Anthropic returned ${response.status}`);
    const body = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const text = body.content?.find((item) => item.type === "text")?.text;
    if (!text) throw new Error("Anthropic returned no text");
    const parsed = z.object({ summary: z.string(), recommendations: z.array(z.string()).max(8) }).parse(JSON.parse(stripCodeFence(text)));
    return { ...rules, ...parsed, source: "CLAUDE", model: config.ANTHROPIC_MODEL, metrics };
  } catch (error) {
    return { ...rules, source: "RULES", fallbackReason: error instanceof Error ? error.message : "AI unavailable", metrics };
  }
}

async function systemMetrics(companyId: string, userId: string): Promise<SystemMetrics> {
  const [user, kpi, tasks, pipeline, presence] = await Promise.all([
    query<{ id: string; role: string; jobTitle: string | null }>(
      `SELECT id, role, job_title AS "jobTitle" FROM users WHERE id = $1 AND company_id = $2`, [userId, companyId]
    ),
    query<{ progress: number }>(
      `SELECT COALESCE(sum(LEAST(actual / NULLIF(target,0),1.2) * weight) / NULLIF(sum(weight),0),0)::float8 AS progress
       FROM kpis WHERE user_id = $1 AND company_id = $2`, [userId, companyId]
    ),
    query<{ total: number; done: number; overdue: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status='DONE')::int AS done,
              count(*) FILTER (WHERE status<>'DONE' AND due_at<now())::int AS overdue
       FROM tasks WHERE assignee_id=$1 AND company_id=$2`, [userId, companyId]
    ),
    query<{ openDeals: number; openValue: number; weightedValue: number }>(
      `SELECT count(*) FILTER (WHERE NOT COALESCE(ds.is_closed,false))::int AS "openDeals",
              COALESCE(sum(d.value) FILTER (WHERE NOT COALESCE(ds.is_closed,false)),0)::float8 AS "openValue",
              COALESCE(sum(d.value*d.probability/100.0) FILTER (WHERE NOT COALESCE(ds.is_closed,false)),0)::float8 AS "weightedValue"
       FROM deals d LEFT JOIN deal_stages ds ON ds.company_id=d.company_id AND ds.key=d.stage
       WHERE d.owner_id=$1 AND d.company_id=$2`, [userId, companyId]
    ),
    query<{ activeDays30: number; lastEventAt: string | null }>(
      `SELECT count(DISTINCT occurred_at::date) FILTER (WHERE event='ONLINE' AND occurred_at > now()-interval '30 days')::int AS "activeDays30",
              max(occurred_at)::text AS "lastEventAt" FROM presence_events WHERE user_id=$1 AND company_id=$2`, [userId, companyId]
    )
  ]);
  return {
    target: user.rows[0] ?? { id: userId, role: "UNKNOWN", jobTitle: null },
    kpiProgress: kpi.rows[0]?.progress ?? 0,
    tasks: tasks.rows[0] ?? { total: 0, done: 0, overdue: 0 },
    pipeline: pipeline.rows[0] ?? { openDeals: 0, openValue: 0, weightedValue: 0 },
    presence: presence.rows[0] ?? { activeDays30: 0, lastEventAt: null }
  };
}

function ruleBased(metrics: SystemMetrics, mode: AiMode): { summary: string; recommendations: string[] } {
  const completion = metrics.tasks.total ? metrics.tasks.done / metrics.tasks.total : 0;
  const recommendations: string[] = [];
  if (metrics.tasks.overdue) recommendations.push(`Review ${metrics.tasks.overdue} overdue task${metrics.tasks.overdue === 1 ? "" : "s"} and reset next steps.`);
  if (metrics.kpiProgress < 0.7) recommendations.push("Prioritize the highest-weight KPI for the remainder of the period.");
  if (metrics.pipeline.openDeals && metrics.pipeline.weightedValue < metrics.pipeline.openValue * 0.4) recommendations.push("Qualify low-probability deals and document a next action for each.");
  if (!recommendations.length) recommendations.push("Keep the current cadence and record outcomes as work closes.");

  if (mode === "FORECAST") {
    return { summary: `Weighted pipeline forecast is ${Math.round(metrics.pipeline.weightedValue)} across ${metrics.pipeline.openDeals} open deals.`, recommendations };
  }
  if (mode === "EVALUATION") {
    return { summary: `KPI progress is ${Math.round(metrics.kpiProgress * 100)}% and task completion is ${Math.round(completion * 100)}%.`, recommendations };
  }
  return { summary: `Current priorities are based on ${metrics.tasks.total} tasks and ${metrics.pipeline.openDeals} open deals.`, recommendations };
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
