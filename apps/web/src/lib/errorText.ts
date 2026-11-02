import i18n from '../i18n';
import { errors } from '../i18n/uk/errors';

export type ErrorArea = keyof typeof errors;

/** The text for an API error code of an area in the interface language, or undefined when the area has none for it. */
export function errorText(area: ErrorArea, code: string | undefined): string | undefined {
  if (!code || !Object.prototype.hasOwnProperty.call(errors[area], code)) return undefined;
  return (i18n.t as (key: string) => string)(`errors:${area}.${code}`);
}
