/**
 * Links Atlas employees to their BPI staff accounts by name. BPI has no list of staff without b2b's session, but
 * `user-id/<id>` works and staff (admins and managers) hold the lowest ids, so the first 100 ids are read once a day.
 */
import { query } from "../db";
import { bpiUser, type BpiUser } from "./bpi";

export const STAFF_TYPES = ["admin", "manager"];
const SCAN_LIMIT = 100;
const STAFF_TTL_MS = 24 * 60 * 60 * 1000;
let staffCache: { at: number; staff: BpiUser[] } | null = null;
export function forgetBpiStaff(): void { staffCache = null; }

export async function bpiStaff(force = false): Promise<BpiUser[]> {
  if (!force && staffCache && Date.now() - staffCache.at < STAFF_TTL_MS) return staffCache.staff;
  const found: BpiUser[] = [];
  for (let start = 1; start <= SCAN_LIMIT; start += 10) {
    const batch = await Promise.all(Array.from({ length: 10 }, (_, index) => bpiUser(start + index)));
    for (const user of batch) if (user && STAFF_TYPES.includes(user.user_type) && !/^superadmin$/i.test(user.name.trim())) found.push(user);
  }
  if (found.length || !staffCache) staffCache = { at: Date.now(), staff: found };
  return staffCache.staff;
}

/** Lowercase, one spelling for letters Ukrainian and Russian write differently, no apostrophes. */
export function normalizeName(value: string): string[] {
  return value.toLowerCase()
    .replace(/[ʼ'’`"]/g, "")
    .replace(/ё/g, "е").replace(/є/g, "е").replace(/э/g, "е")
    .replace(/[іїы]/g, "и").replace(/й/g, "и").replace(/ґ/g, "г")
    .split(/[\s.,-]+/).filter(Boolean);
}

/**
 * Whether two full names are the same person: an equal surname (any word order) and first names that are equal or
 * share their first three letters (Наталья ↔ Наталія).
 */
export function sameName(a: string, b: string): boolean {
  const [left, right] = [normalizeName(a), normalizeName(b)];
  if (left.length < 2 || right.length < 2) return false;
  for (const surname of left) {
    if (!right.includes(surname)) continue;
    const leftRest = left.filter((word) => word !== surname);
    const rightRest = right.filter((word) => word !== surname);
    if (leftRest.some((word) => rightRest.some((other) => word === other || (word.length >= 3 && other.length >= 3 && word.slice(0, 3) === other.slice(0, 3))))) return true;
  }
  return false;
}

export function matchStaff(fullName: string, staff: BpiUser[]): BpiUser | null {
  const matches = staff.filter((member) => sameName(fullName, member.name));
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * The employee's BPI manager id: a director's choice, else a stored or fresh name match (stored as AUTO).
 * Null when nobody matches.
 */
export async function bpiManagerOf(userId: string): Promise<number | null> {
  const user = (await query<{ full_name: string; bpi_manager_id: number | null; bpi_manager_source: string | null }>(
    "SELECT full_name, bpi_manager_id, bpi_manager_source FROM users WHERE id = $1", [userId])).rows[0];
  if (!user) return null;
  if (user.bpi_manager_source === "DIRECTOR" && user.bpi_manager_id) return user.bpi_manager_id;
  const match = matchStaff(user.full_name, await bpiStaff().catch(() => []));
  const id = match?.id ?? (user.bpi_manager_source === "AUTO" ? user.bpi_manager_id : null);
  if (match && match.id !== user.bpi_manager_id) {
    await query("UPDATE users SET bpi_manager_id = $2, bpi_manager_source = 'AUTO' WHERE id = $1 AND bpi_manager_source IS DISTINCT FROM 'DIRECTOR'", [userId, match.id]);
  }
  return id ?? null;
}
