import type { ai as source } from '../uk/ai';
import type { Dictionary } from '../types';

export const ai = {
  mode: {
    ADVICE: "Совет",
    EVALUATION: "Оценка",
    FORECAST: "Прогноз",
    label: "Режим анализа",
  },
  model: "модель",
  rules: "Правила",
  result: "Результат анализа",
  fallback: "Модель недоступна, использованы встроенные правила.",
  requestedBy: "Запросил(а): {{name}}",
  requestedByShort: "запросил(а) {{name}}",
  historyFailed: "История не загружена",
  failed: "Анализ не выполнен. Попробуйте позже.",
  analysing: "Анализируем…",
  run: "Сформировать",
  title: "AI-анализ",
  subtitle: "{{name}} · по KPI, задачам, воронке и присутствию",
  section: "Раздел AI-анализа",
  new: "Новый анализ",
  history: "История",
  collecting: "Собираем метрики",
  hint: "Анализ использует только системные метрики. Содержание переписки не читается. Результат сохраняется в истории.",
  back: "К истории",
  loadingHistory: "Загружаем историю",
  list: "История анализов",
  empty: "Анализов пока нет",
  emptyText: "Сформируйте первый анализ — он сохранится здесь",
} satisfies Dictionary<typeof source>;
