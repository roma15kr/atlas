import type { Request } from "express";
import { z } from "zod";

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

export function pagination(req: Request): { limit: number; offset: number } {
  return pageSchema.parse(req.query);
}

export function updatedFields(
  data: Record<string, unknown>,
  columns: Record<string, string>,
  startIndex = 1
): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const assignments: string[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (data[key] !== undefined) {
      values.push(data[key]);
      assignments.push(`${column} = $${startIndex + values.length - 1}`);
    }
  }
  return { sql: assignments.join(", "), values };
}

export function asOptionalDate(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === null || value === "" ? null : new Date(value).toISOString();
}
