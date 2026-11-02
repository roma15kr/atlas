/**
 * Server texts for notifications, reminders, alerts and AI answers, rendered in the reader's language
 * (`users.language`). The API needs a few dozen short templates, so it uses this typed map instead of i18next.
 */
import { query } from "../db";
import { en } from "./en";
import { ru } from "./ru";
import { uk } from "./uk";

export const LANGUAGES = ["uk", "ru", "en"] as const;
export type Language = typeof LANGUAGES[number];
export const DEFAULT_LANGUAGE: Language = "uk";
export type TemplateKey = keyof typeof uk;
export type Templates = Record<TemplateKey, string>;

/** A text to render later, once the reader's language is known. Params may themselves be texts. */
export interface Text { key: TemplateKey; params?: Record<string, TextParam> }
export type TextParam = string | number | Text;

const templates: Record<Language, Templates> = { uk, ru, en };
const LOCALES: Record<Language, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-GB" };

export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);
export const text = (key: TemplateKey, params?: Record<string, TextParam>): Text => ({ key, params });
export const localeOf = (language: Language): string => LOCALES[language];

/** Renders a template, or returns plain strings as they are. Unknown placeholders stay visible. */
export function render(language: Language, value: Text | string): string {
  if (typeof value === "string") return value;
  const template = templates[language][value.key] ?? templates[DEFAULT_LANGUAGE][value.key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const param = value.params?.[name];
    if (param === undefined) return match;
    return typeof param === "object" ? render(language, param) : String(param);
  });
}

/** Each user's interface language; anyone unknown reads the default. */
export async function languagesOf(userIds: string[]): Promise<Map<string, Language>> {
  if (!userIds.length) return new Map();
  const rows = await query<{ id: string; language: string }>("SELECT id, language FROM users WHERE id = ANY($1::uuid[])", [userIds]);
  return new Map(rows.rows.map((row) => [row.id, isLanguage(row.language) ? row.language : DEFAULT_LANGUAGE]));
}

export async function languageOf(userId: string): Promise<Language> {
  return (await languagesOf([userId])).get(userId) ?? DEFAULT_LANGUAGE;
}
