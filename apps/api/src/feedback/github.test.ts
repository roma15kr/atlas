import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserName, feedbackIssueBody, issueLabels, issueTitle, resetGithubLabels, type IssueSource } from "./github";

const source: IssueSource = {
  id: "0f6c1f62-8d7a-4c39-9a52-1d2e3f4a5b6c", page: "/sales", app_version: "a1b2c3d4e5f6",
  user_agent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  language: "uk", title_en: "Deal changes disappear after saving", summary_en: "Saving a deal returns 500; contact anna@example.com.",
  translation_en: "[person] cannot see the deal of [client].\nAfter clicking Save, everything disappears. Call +380 67 123 45 67.",
  steps_en: ["Open a deal", "Click Save"], category: "BUG", severity: "HIGH", area: "sales-pipeline"
};

describe("issue content", () => {
  it("has a category-prefixed title and the four labels", () => {
    expect(issueTitle(source)).toBe("[Bug] Deal changes disappear after saving");
    expect(issueLabels(source)).toEqual(["feedback", "bug", "severity:high", "area:sales-pipeline"]);
  });

  it("holds the summary, anonymised translation, steps and context, and scrubs it once more", () => {
    const body = feedbackIssueBody(source);
    expect(body).toContain("## Summary");
    expect(body).toContain("> [person] cannot see the deal of [client].");
    expect(body).toContain("1. Open a deal\n2. Click Save");
    expect(body).toContain("- Page: `/sales`");
    expect(body).toContain("- Browser: Chrome 141");
    expect(body).toContain("- Atlas report: `0f6c1f62`");
    expect(body).toContain("translated from Ukrainian");
    expect(body).not.toMatch(/anna@example\.com|\+380 67 123 45 67|AppleWebKit/);
    expect(body).toContain("[email]");
    expect(body).toContain("[phone]");
  });

  it("names browsers briefly", () => {
    expect(browserName(null)).toBe("unknown");
    expect(browserName("Mozilla/5.0 Firefox/131.0")).toBe("Firefox 131");
    expect(browserName("Mozilla/5.0 Chrome/141.0 Safari/537.36 Edg/141.0")).toBe("Edge 141");
  });
});

describe("createIssue", () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  beforeEach(() => {
    calls.length = 0; resetGithubLabels();
    vi.stubEnv("GITHUB_TOKEN", "test-token"); vi.stubEnv("GITHUB_REPOSITORY", "roma15kr/atlas");
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      if (url.endsWith("/labels")) return new Response("{}", { status: calls.length === 1 ? 201 : 422 });
      return new Response(JSON.stringify({ number: 42, html_url: "https://github.com/roma15kr/atlas/issues/42" }), { status: 201 });
    }));
    vi.resetModules();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("creates missing labels once, then the issue, and returns its number and link", async () => {
    const { createIssue } = await import("./github");
    expect(await createIssue(source)).toEqual({ number: 42, url: "https://github.com/roma15kr/atlas/issues/42" });
    expect(calls.filter((call) => call.url.endsWith("/labels"))).toHaveLength(4);
    const issue = calls.find((call) => call.url.endsWith("/issues"))!;
    expect(issue.url).toBe("https://api.github.com/repos/roma15kr/atlas/issues");
    expect(issue.body).toMatchObject({ title: "[Bug] Deal changes disappear after saving", labels: ["feedback", "bug", "severity:high", "area:sales-pipeline"] });
    calls.length = 0;
    await createIssue(source);
    expect(calls.filter((call) => call.url.endsWith("/labels"))).toHaveLength(0);
  });
});
