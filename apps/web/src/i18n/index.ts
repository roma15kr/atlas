import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { ru } from './ru';
import { uk } from './uk';

/** Interface languages, Ukrainian first (the default). */
export const LANGUAGES = ['uk', 'ru', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
const LOCALES: Record<Language, string> = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-GB' };
const STORAGE_KEY = 'atlas.language';

export const isLanguage = (value: unknown): value is Language => typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

/** Before sign-in: the language last used in this browser, else the browser's own if Atlas has it, else Ukrainian. */
export function detectLanguage(): Language {
  try { const stored = localStorage.getItem(STORAGE_KEY); if (isLanguage(stored)) return stored; } catch { /* storage is a convenience only */ }
  const preferred = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
  for (const tag of preferred) { const base = tag?.slice(0, 2).toLowerCase(); if (isLanguage(base)) return base; }
  return 'uk';
}

void i18n.use(initReactI18next).init({
  resources: { uk, ru, en },
  lng: detectLanguage(),
  fallbackLng: 'uk',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  initAsync: false,
});

const markDocument = (language: string) => { if (typeof document !== 'undefined') document.documentElement.lang = language; };
markDocument(i18n.language);
i18n.on('languageChanged', markDocument);

/** The active interface language. */
export const currentLanguage = (): Language => isLanguage(i18n.language) ? i18n.language : 'uk';
/** The `Intl` locale of a language (the active one by default). */
export const localeOf = (language: Language = currentLanguage()) => LOCALES[language];

/** Switches the interface at once; `remember` keeps it for this browser's login screen. */
export async function applyLanguage(language: Language, remember = true): Promise<void> {
  if (remember) { try { localStorage.setItem(STORAGE_KEY, language); } catch { /* storage is a convenience only */ } }
  if (i18n.language !== language) await i18n.changeLanguage(language);
}

export default i18n;
