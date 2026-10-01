const PREFIX = /^\s*((re|fwd?|aw|wg|tr|sv|ответ|отв|пересл|переслано)(\[\d+\])?\s*:\s*)+/i;

/** Subject without reply and forward prefixes, in English and Russian, for thread matching. */
export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? "").replace(PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Message-ids from a References or In-Reply-To header value. */
export function parseMessageIds(value: string | string[] | null | undefined): string[] {
  const text = Array.isArray(value) ? value.join(" ") : value ?? "";
  return [...new Set(text.match(/<[^<>\s]+>/g) ?? [])];
}

export const replySubject = (subject: string): string => /^\s*(re|ответ)\s*:/i.test(subject) ? subject : `Re: ${subject}`;
export const forwardSubject = (subject: string): string => /^\s*(fwd?|пересл)\s*:/i.test(subject) ? subject : `Fwd: ${subject}`;

export interface Address { address: string; name?: string }

/** Lowercased correspondent addresses other than the mailbox owner's. */
export function participantsOf(owner: string, ...groups: Address[][]): string[] {
  const me = owner.toLowerCase();
  return [...new Set(groups.flat().map((item) => item.address.toLowerCase()).filter((address) => address && address !== me))];
}
