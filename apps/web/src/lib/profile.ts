import i18n, { localeOf } from '../i18n';
import type { ProfileInput, User } from '../types';

export const MIN_AGE_YEARS = 14;
export const ABOUT_MAX = 500;

// The language has its own section («Мова інтерфейсу»), outside the personal-data form.
export type ProfileForm = Required<Omit<ProfileInput, 'showBirthday' | 'language'>> & { showBirthday: boolean };
export type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

/** "03-12" or "1994-03-12" → "12 марта" (in the interface language); the year is never shown. */
export function formatBirthday(value?: string): string | undefined {
  const match = value?.match(/(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const month = Number(match[1]), day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return new Intl.DateTimeFormat(localeOf(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, day)));
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** The latest birth date that makes someone at least 14 today. */
export function latestBirthDate(today = new Date()): string {
  const date = new Date(Date.UTC(today.getUTCFullYear() - MIN_AGE_YEARS, today.getUTCMonth(), today.getUTCDate()));
  return isoDate(date);
}

export const profileFormOf = (user: User): ProfileForm => ({
  fullName: user.fullName, specialty: user.specialty ?? '', birthDate: user.birthDate ?? '', phone: user.phone ?? '',
  contactEmail: user.contactEmail ?? '', city: user.city ?? '', about: user.about ?? '', showBirthday: user.showBirthday ?? true,
});

/** The same rules as the API, with a message per field in the interface language. */
export function validateProfile(form: ProfileForm, today = new Date()): ProfileErrors {
  const errors: ProfileErrors = {};
  if (form.fullName.trim().length < 2) errors.fullName = i18n.t('profile:errors.fullName');
  const birth = form.birthDate;
  if (birth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || Number.isNaN(Date.parse(`${birth}T00:00:00Z`))) errors.birthDate = i18n.t('profile:errors.birthFormat');
    else if (birth < '1900-01-01') errors.birthDate = i18n.t('profile:errors.birthEarly');
    else if (birth > isoDate(today)) errors.birthDate = i18n.t('profile:errors.birthFuture');
    else if (birth > latestBirthDate(today)) errors.birthDate = i18n.t('profile:errors.birthAge', { years: MIN_AGE_YEARS });
  }
  const phone = form.phone.trim();
  if (phone && (!/^[+\d\s()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 5 || phone.length > 40)) errors.phone = i18n.t('profile:errors.phone');
  const email = form.contactEmail.trim();
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) errors.contactEmail = i18n.t('profile:errors.email');
  if (form.city.trim().length > 120) errors.city = i18n.t('profile:errors.city');
  if (form.about.trim().length > ABOUT_MAX) errors.about = i18n.t('profile:errors.about', { max: ABOUT_MAX });
  return errors;
}

/** Only the fields that differ from the saved profile; text is trimmed and an empty string clears it. */
export function changedProfileFields(form: ProfileForm, saved: ProfileForm): ProfileInput {
  const patch: ProfileInput = {};
  for (const key of Object.keys(form) as Array<keyof ProfileForm>) {
    const value = typeof form[key] === 'string' ? (form[key] as string).trim() : form[key];
    if (value !== saved[key]) (patch as Record<string, unknown>)[key] = value;
  }
  return patch;
}
