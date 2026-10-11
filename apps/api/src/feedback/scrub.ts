/**
 * A last pass over text bound for the public GitHub issue: the model is told to anonymise, and this
 * catches what is easy to recognise mechanically: email addresses, phone numbers, and URLs carrying
 * query strings (which can hold names, search terms or tokens).
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_WITH_QUERY = /https?:\/\/[^\s?#]+\?[^\s]*/gi;
// Candidate phone numbers: digits with spaces, dashes, dots or brackets, optionally starting with +.
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().-]{6,}\d/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "").length;
  return digits >= 9 && digits <= 15 && !ISO_DATE.test(candidate.trim());
}

export function scrubPersonalData(text: string): string {
  return text
    .replace(URL_WITH_QUERY, (url) => `${url.split("?")[0]}?[query]`)
    .replace(EMAIL, "[email]")
    .replace(PHONE_CANDIDATE, (candidate) => isPhone(candidate) ? "[phone]" : candidate);
}
