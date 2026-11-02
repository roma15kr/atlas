import type { ai as source } from '../uk/ai';
import type { Dictionary } from '../types';

export const ai = {
  mode: {
    ADVICE: "Advice",
    EVALUATION: "Evaluation",
    FORECAST: "Forecast",
    label: "Analysis mode",
  },
  model: "model",
  rules: "Rules",
  result: "Analysis result",
  fallback: "The model was unavailable; built-in rules were used.",
  requestedBy: "Requested by: {{name}}",
  requestedByShort: "requested by {{name}}",
  historyFailed: "History didn't load",
  failed: "The analysis failed. Try again later.",
  analysing: "Analysing…",
  run: "Generate",
  title: "AI analysis",
  subtitle: "{{name}} · from KPIs, tasks, funnel and presence",
  section: "AI analysis section",
  new: "New analysis",
  history: "History",
  collecting: "Collecting metrics",
  hint: "The analysis uses system metrics only. Message content isn't read. The result is saved in the history.",
  back: "Back to history",
  loadingHistory: "Loading history",
  list: "Analysis history",
  empty: "No analyses yet",
  emptyText: "Generate the first analysis — it will be saved here",
} satisfies Dictionary<typeof source>;
