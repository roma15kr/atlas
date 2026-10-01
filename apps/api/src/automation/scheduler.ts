import { config } from "../config";
import { pool } from "../db";
import { awardAchievements } from "./achievements";
import { recomputeKpis } from "./kpis";

export interface AutomationStep { name: string; run: () => Promise<unknown> }

/** Steps run in order on every tick; later changes register more (alerts, scheduled reports). */
const steps: AutomationStep[] = [
  { name: "kpis", run: () => recomputeKpis() },
  { name: "achievements", run: () => awardAchievements() }
];

export function registerAutomationStep(step: AutomationStep): void {
  if (!steps.some((existing) => existing.name === step.name)) steps.push(step);
}

let timer: NodeJS.Timeout | null = null;

/**
 * Runs every step once, in at most one API process at a time (advisory lock on a dedicated
 * connection). A failing step is logged and does not stop the others. Returns false when another
 * process holds the lock.
 */
export async function runAutomation(): Promise<boolean> {
  const client = await pool.connect();
  try {
    const locked = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext('atlas:automation')) AS locked");
    if (!locked.rows[0]?.locked) return false;
    try {
      for (const step of steps) {
        try { await step.run(); }
        catch (error) { console.error(`Automation step ${step.name} failed`, error); }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('atlas:automation'))");
    }
    return true;
  } finally {
    client.release();
  }
}

export function startAutomation(): void {
  if (timer || config.AUTOMATION_INTERVAL_MS === 0) return;
  timer = setInterval(() => { void runAutomation().catch((error) => console.error("Automation tick failed", error)); }, config.AUTOMATION_INTERVAL_MS);
  // A first run shortly after start, so a restart doesn't delay KPIs by a whole interval.
  setTimeout(() => { void runAutomation().catch((error) => console.error("Automation tick failed", error)); }, 15_000).unref();
}

export function stopAutomation(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
