import { randomUUID } from "node:crypto";
import { query, transaction } from "../db";
import { ApiError } from "../errors";
import type { AuthContext } from "../types";
import { parseCsv } from "./csv";

export const IMPORT_MAX_ROWS = 5000;
const PREVIEW_TTL_MS = 30 * 60_000;

export type RowStatus = "NEW" | "UPDATE" | "UNCHANGED" | "ERROR";
export interface PreviewRow {
  line: number; telegramId: string; name: string | null; status: RowStatus; error: string | null;
  clientId: string | null; clientName: string | null; responsibleId: string | null; responsibleName: string | null;
}
export interface Preview { id: string; userId: string; createdAt: number; rows: PreviewRow[] }

// Previews live in this process for 30 minutes; with several API instances the apply must reach the same one.
const previews = new Map<string, Preview>();

type Column = "telegram_id" | "client_id" | "client_email" | "client_phone" | "responsible" | "name";
const digits = (value: string) => value.replace(/\D/g, "");

/**
 * Classifies each CSV row as new, update, unchanged or error. Clients and responsible users are
 * resolved within the caller's scope: a director anywhere in the company, a head only in their department.
 */
export async function previewImport(auth: AuthContext, csv: string): Promise<Preview> {
  if (auth.role === "EMPLOYEE") throw new ApiError(403, "TELEGRAM_FORBIDDEN", "Only directors and department heads import contacts");
  const table = parseCsv(csv);
  const header = (table.shift() ?? []).map((value) => value.toLowerCase());
  if (!header.includes("telegram_id")) throw new ApiError(400, "TELEGRAM_IMPORT_INVALID", "The file needs a telegram_id column");
  if (table.length > IMPORT_MAX_ROWS) throw new ApiError(400, "TELEGRAM_IMPORT_TOO_LARGE", `At most ${IMPORT_MAX_ROWS} rows per import`);
  const column = (cells: string[], name: Column) => { const index = header.indexOf(name); return index >= 0 ? cells[index]?.trim() || null : null; };

  const [clients, users, contacts] = await Promise.all([
    query<{ id: string; name: string; company_name: string | null; email: string | null; phone: string | null; department_id: string | null; owner_id: string }>(
      "SELECT id, name, company_name, email, phone, department_id, owner_id FROM clients WHERE company_id = $1", [auth.companyId]),
    query<{ id: string; username: string; full_name: string; department_id: string | null; status: string }>(
      "SELECT id, username, full_name, department_id, status FROM users WHERE company_id = $1", [auth.companyId]),
    query<{ telegram_user_id: string; client_id: string | null; responsible_id: string | null; first_name: string | null }>(
      "SELECT telegram_user_id::text, client_id, responsible_id, first_name FROM telegram_contacts WHERE company_id = $1", [auth.companyId])
  ]);
  const inScope = (departmentId: string | null) => auth.role === "DIRECTOR" || departmentId === auth.departmentId;
  const existing = new Map(contacts.rows.map((row) => [row.telegram_user_id, row]));
  const seen = new Set<string>();

  const rows = table.map((cells, index): PreviewRow => {
    const line = index + 2;
    const telegramId = column(cells, "telegram_id") ?? "";
    const name = column(cells, "name");
    const base = { line, telegramId, name, clientId: null, clientName: null, responsibleId: null, responsibleName: null };
    const fail = (error: string): PreviewRow => ({ ...base, status: "ERROR", error });
    if (!/^[1-9]\d{0,14}$/.test(telegramId)) return fail("Неверный Telegram ID");
    if (seen.has(telegramId)) return fail("Повтор строки");
    seen.add(telegramId);

    const clientRef = { id: column(cells, "client_id"), email: column(cells, "client_email")?.toLowerCase(), phone: column(cells, "client_phone") };
    let client: (typeof clients.rows)[number] | undefined;
    if (clientRef.id || clientRef.email || clientRef.phone) {
      const matches = clients.rows.filter((row) => clientRef.id ? row.id === clientRef.id
        : clientRef.email ? row.email?.toLowerCase() === clientRef.email
        : digits(row.phone ?? "") !== "" && digits(row.phone ?? "") === digits(clientRef.phone!));
      if (!matches.length) return fail("Клиент не найден");
      if (matches.length > 1) return fail("Найдено несколько клиентов — укажите client_id");
      client = matches[0]!;
      if (!inScope(client.department_id)) return fail("Клиент вне вашего отдела");
    }

    const responsibleRef = column(cells, "responsible")?.toLowerCase();
    let responsible = responsibleRef ? users.rows.find((row) => row.username.toLowerCase() === responsibleRef) : client ? users.rows.find((row) => row.id === client!.owner_id) : undefined;
    if (responsibleRef && (!responsible || responsible.status !== "ACTIVE")) return fail("Ответственный не найден");
    if (responsible && !inScope(responsible.department_id)) {
      if (responsibleRef) return fail("Ответственный вне вашего отдела");
      responsible = undefined;
    }
    if (!responsible && auth.role === "MANAGER" && !client) return fail("Укажите клиента или ответственного из вашего отдела");

    const current = existing.get(telegramId);
    if (current?.client_id && client && current.client_id !== client.id) return fail("Telegram уже привязан к другому клиенту");
    const row: PreviewRow = {
      ...base, status: "NEW", error: null, clientId: client?.id ?? current?.client_id ?? null, clientName: client ? client.company_name || client.name : null,
      responsibleId: responsible?.id ?? current?.responsible_id ?? null, responsibleName: responsible?.full_name ?? null
    };
    if (current) row.status = current.client_id === row.clientId && current.responsible_id === row.responsibleId && (!name || current.first_name === name) ? "UNCHANGED" : "UPDATE";
    return row;
  });

  for (const [id, preview] of previews) if (Date.now() - preview.createdAt > PREVIEW_TTL_MS) previews.delete(id);
  const preview: Preview = { id: randomUUID(), userId: auth.userId, createdAt: Date.now(), rows };
  previews.set(preview.id, preview);
  return preview;
}

/** Applies the valid rows of a preview in one transaction. New contacts stay UNVERIFIED until they write. */
export async function applyImport(auth: AuthContext, previewId: string): Promise<{ applied: number; rejected: number; unchanged: number }> {
  const preview = previews.get(previewId);
  if (!preview || preview.userId !== auth.userId || Date.now() - preview.createdAt > PREVIEW_TTL_MS) {
    throw new ApiError(404, "TELEGRAM_IMPORT_EXPIRED", "The preview has expired; upload the file again");
  }
  const valid = preview.rows.filter((row) => row.status === "NEW" || row.status === "UPDATE");
  await transaction(async (client) => {
    for (const row of valid) {
      await client.query(
        `INSERT INTO telegram_contacts (company_id, telegram_user_id, first_name, client_id, responsible_id, status, bound_via)
         VALUES ($1, $2, $3, $4, $5, 'UNVERIFIED', 'IMPORT')
         ON CONFLICT (company_id, telegram_user_id) DO UPDATE SET client_id = coalesce(EXCLUDED.client_id, telegram_contacts.client_id),
           responsible_id = coalesce(EXCLUDED.responsible_id, telegram_contacts.responsible_id), first_name = coalesce(telegram_contacts.first_name, EXCLUDED.first_name),
           bound_via = coalesce(telegram_contacts.bound_via, 'IMPORT')`,
        [auth.companyId, row.telegramId, row.name, row.clientId, row.responsibleId]
      );
    }
  });
  previews.delete(previewId);
  return { applied: valid.length, rejected: preview.rows.filter((row) => row.status === "ERROR").length, unchanged: preview.rows.filter((row) => row.status === "UNCHANGED").length };
}
