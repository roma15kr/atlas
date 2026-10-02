import type { ProfileInput, User } from '../types';

export const MIN_AGE_YEARS = 14;
export const ABOUT_MAX = 500;

export type ProfileForm = Required<Omit<ProfileInput, 'showBirthday'>> & { showBirthday: boolean };
export type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** "03-12" or "1994-03-12" → "12 марта"; the year is never shown. */
export function formatBirthday(value?: string): string | undefined {
  const match = value?.match(/(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const month = months[Number(match[1]) - 1];
  return month ? `${Number(match[2])} ${month}` : undefined;
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

/** The same rules as the API, with Russian messages per field. */
export function validateProfile(form: ProfileForm, today = new Date()): ProfileErrors {
  const errors: ProfileErrors = {};
  if (form.fullName.trim().length < 2) errors.fullName = 'Укажите имя не короче 2 символов';
  const birth = form.birthDate;
  if (birth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || Number.isNaN(Date.parse(`${birth}T00:00:00Z`))) errors.birthDate = 'Укажите дату в формате ДД.ММ.ГГГГ';
    else if (birth < '1900-01-01') errors.birthDate = 'Дата не может быть раньше 1900 года';
    else if (birth > isoDate(today)) errors.birthDate = 'Дата рождения не может быть в будущем';
    else if (birth > latestBirthDate(today)) errors.birthDate = `Сотруднику должно быть не меньше ${MIN_AGE_YEARS} лет`;
  }
  const phone = form.phone.trim();
  if (phone && (!/^[+\d\s()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 5 || phone.length > 40)) errors.phone = 'Цифры, пробелы, +, скобки и дефис; не меньше 5 цифр';
  const email = form.contactEmail.trim();
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) errors.contactEmail = 'Укажите корректный email';
  if (form.city.trim().length > 120) errors.city = 'Не длиннее 120 символов';
  if (form.about.trim().length > ABOUT_MAX) errors.about = `Не длиннее ${ABOUT_MAX} символов`;
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
