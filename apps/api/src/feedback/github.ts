import { config } from "../config";
import { scrubPersonalData } from "./scrub";

/** GitHub issues need a token and an `owner/name` repository. */
export function githubConfigured(): boolean {
  return Boolean(config.GITHUB_TOKEN && config.GITHUB_REPOSITORY);
}

/** What an issue is built from: the triage and technical context, never the original text, screenshot, log or reporter. */
export interface IssueSource {
  id: string;
  page: string;
  app_version: string | null;
  user_agent: string | null;
  language: string | null;
  title_en: string;
  summary_en: string;
  translation_en: string;
  steps_en: string[] | null;
  category: "BUG" | "COMPLAINT" | "IDEA" | "QUESTION";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  area: string;
}

const categoryTitle = { BUG: "Bug", COMPLAINT: "Complaint", IDEA: "Idea", QUESTION: "Question" } as const;
const languageName: Record<string, string> = { uk: "Ukrainian", ru: "Russian", en: "English", other: "another language" };

/** "Chrome 141" from a user agent: enough to reproduce, without the full fingerprint. */
export function browserName(userAgent: string | null): string {
  if (!userAgent) return "unknown";
  // Order matters: Edge and Opera also announce Chrome, and Chrome also announces Safari.
  for (const [token, name] of [["Edg", "Edge"], ["OPR", "Opera"], ["Firefox", "Firefox"], ["Chrome", "Chrome"], ["Version", "Safari"]] as const) {
    const match = new RegExp(`${token}/(\\d+)`).exec(userAgent);
    if (match) return `${name} ${match[1]}`;
  }
  return "unknown";
}

export function issueTitle(source: IssueSource): string {
  return scrubPersonalData(`[${categoryTitle[source.category]}] ${source.title_en}`).slice(0, 120);
}

export function issueLabels(source: IssueSource): string[] {
  return ["feedback", source.category.toLowerCase(), `severity:${source.severity.toLowerCase()}`, `area:${source.area}`];
}

/** The issue body: anonymised English text and technical context only. Scrubbed once more as a whole. */
export function feedbackIssueBody(source: IssueSource): string {
  const steps = source.steps_en?.length ? source.steps_en.map((step, index) => `${index + 1}. ${step}`).join("\n") : "_Not given._";
  const quote = source.translation_en.split("\n").map((line) => `> ${line}`).join("\n");
  return scrubPersonalData([
    "## Summary", source.summary_en, "",
    `## Report (translated from ${languageName[source.language ?? "other"] ?? "another language"}, anonymised)`, quote, "",
    "## Steps to reproduce", steps, "",
    "## Context",
    `- Page: \`${source.page}\``,
    `- App version: \`${source.app_version ?? "unknown"}\``,
    `- Browser: ${browserName(source.user_agent)}`,
    `- Category: ${categoryTitle[source.category]} · severity ${source.severity.toLowerCase()} · area \`${source.area}\``,
    `- Atlas report: \`${source.id.slice(0, 8)}\``, "",
    "---",
    "_Created automatically from an in-app report. The original text, screenshot and diagnostic log stay in Atlas for directors._"
  ].join("\n"));
}

const labelColors: Record<string, string> = { feedback: "5319e7", bug: "d73a4a", complaint: "e99695", idea: "a2eeef", question: "d876e3" };
const createdLabels = new Set<string>();

async function github(path: string, init: { method: string; body?: unknown }): Promise<Response> {
  return fetch(`https://api.github.com/repos/${config.GITHUB_REPOSITORY}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "atlas-feedback",
      "Content-Type": "application/json"
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000)
  });
}

/** Creates each label once; 422 means it already exists. */
async function ensureLabels(labels: string[]): Promise<void> {
  for (const name of labels) {
    if (createdLabels.has(name)) continue;
    const color = labelColors[name] ?? (name.startsWith("severity:") ? "fbca04" : "c5def5");
    const response = await github("/labels", { method: "POST", body: { name, color } });
    if (response.ok || response.status === 422) createdLabels.add(name);
    else throw new Error(`GitHub label ${name}: ${response.status}`);
  }
}

export async function createIssue(source: IssueSource): Promise<{ number: number; url: string }> {
  if (!githubConfigured()) throw new Error("GitHub is not configured");
  const labels = issueLabels(source);
  await ensureLabels(labels);
  const response = await github("/issues", { method: "POST", body: { title: issueTitle(source), body: feedbackIssueBody(source), labels } });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const issue = await response.json() as { number: number; html_url: string };
  return { number: issue.number, url: issue.html_url };
}

/** Test helper. */
export function resetGithubLabels(): void {
  createdLabels.clear();
}
