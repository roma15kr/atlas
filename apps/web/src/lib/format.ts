export const formatMoney = (value: number, currency: 'UAH' = 'UAH') =>
  new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(value);

export const formatKpiValue = (value: number, unit: string) =>
  unit.toUpperCase() === 'UAH'
    ? formatMoney(value)
    : `${new Intl.NumberFormat('ru-RU').format(value)} ${unit}`;

export const formatDate = (value?: string, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', options ?? { day: '2-digit', month: 'short' }).format(new Date(value));
};

export const formatDateTime = (value?: string) =>
  formatDate(value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const roleLabel = {
  DIRECTOR: 'Директор',
  MANAGER: 'Руководитель',
  EMPLOYEE: 'Сотрудник',
} as const;

export const relativeTime = (value?: string) => {
  if (!value) return 'нет данных';
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return formatDate(value);
};

export const fileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

/** Russian plural: plural(3, ['этап', 'этапа', 'этапов']) → '3 этапа'. */
export const plural = (count: number, [one, few, many]: [string, string, string]) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${count} ${word}`;
};

// Common Ukrainian and Russian given names, for telling «Имя Фамилия» from «Фамилия Имя».
const GIVEN_NAMES = new Set(`андрій андрей олександр александр олексій алексей анатолій анатолий антон артем артём богдан борис вадим валентин валерій валерий василь василий віктор виктор віталій виталий володимир владимир владислав в'ячеслав вячеслав геннадій геннадий георгій георгий гліб глеб григорій григорий денис дмитро дмитрий євген евгений іван иван ігор игорь ілля илья кирило кирилл костянтин константин леонід леонид максим микола николай михайло михаил назар олег павло павел петро петр роман руслан сергій сергей станіслав станислав степан тарас тимур федір федор юрій юрий ярослав
  аліна алина алла анастасія анастасия анна ганна валентина валерія валерия вікторія виктория віра вера галина дар'я дарья діана диана євгенія евгения єлизавета елизавета елена олена жанна зоя ірина ирина катерина екатерина кристина лариса леся лілія лилия любов любовь людмила маргарита марина марія мария наталія наталья наталия надія надежда оксана ольга поліна полина світлана светлана софія софия тамара тетяна татьяна уляна ульяна юлія юлия яна кароліна каролина вероніка вероника злата мілана милана хишам`.split(/\s+/));
const PATRONYMIC = /(ович|евич|євич|йович|ївна|івна|овна|евна|ична|інічна)$/i;
const SURNAME = /(енко|ченко|ук|юк|чук|щук|ик|ник|ов|ова|ев|ева|єв|єва|ін|іна|ин|ина|ський|ська|цький|цька|зький|зька|ич|ак|як)$/i;
/** Endings no given name has: the word is a surname for sure. */
const CERTAIN_SURNAME = /(енко|ук|юк|чук|щук|ський|ська|цький|цька|зький|зька)$/i;

/**
 * The given name to address someone by. Names are stored both as «Фамилия Имя Отчество» and «Имя Фамилия»:
 * a patronymic or a known given name decides; otherwise a typical surname ending; otherwise the first word.
 */
export function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  const given = (word: string) => GIVEN_NAMES.has(word.toLowerCase().replace(/[’ʼ]/g, "'"));
  if (parts.length >= 3 && PATRONYMIC.test(parts[parts.length - 1]!)) return parts[1]!;
  if (given(parts[0]!)) return parts[0]!;
  if (given(parts[1]!)) return parts[1]!;
  if (CERTAIN_SURNAME.test(parts[0]!) || (SURNAME.test(parts[0]!) && !SURNAME.test(parts[1]!))) return parts[1]!;
  return parts[0]!;
}
