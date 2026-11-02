import type { achievements as source } from '../uk/achievements';
import type { Dictionary } from '../types';

export const achievements = {
  title: "Достижения",
  description: "Личный результат и командный рейтинг",
  of100: "из 100",
  score: "Рейтинг успешности",
  place: "{{place}}-е место в доступной команде",
  forming: "Рейтинг формируется",
  points: "{{count}} баллов за достижения",
  received: "получено",
  kpiDone: "KPI выполнено",
  rankPlace: "место в рейтинге",
  mine: "Мои награды",
  awardPoints: "{{date}} · +{{points}} баллов",
  none: "Наград пока нет",
  noneText: "Они появятся после первых завершённых целей",
  ranking: "Рейтинг команды",
} satisfies Dictionary<typeof source>;
