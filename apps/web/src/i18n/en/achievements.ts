import type { achievements as source } from '../uk/achievements';
import type { Dictionary } from '../types';

export const achievements = {
  title: "Achievements",
  description: "Personal results and the team rating",
  of100: "out of 100",
  score: "Success rating",
  place: "Place {{place}} in your visible team",
  forming: "The rating is being calculated",
  points: "{{count}} points for achievements",
  received: "earned",
  kpiDone: "KPIs met",
  rankPlace: "rating place",
  mine: "My awards",
  awardPoints: "{{date}} · +{{points}} points",
  none: "No awards yet",
  noneText: "They appear after your first completed goals",
  ranking: "Team rating",
} satisfies Dictionary<typeof source>;
