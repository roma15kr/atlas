import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import {
  BRANDING_FILES, BRANDING_FILE_SIZES, MIN_ACCENT_CONTRAST, brandingOf, contrastRatio, manifestFor, pngSize, soleCompanyId,
  type Branding, type BrandingFile
} from "../branding";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { emitToUsers } from "../realtime";
import { objectStorage } from "../storage";
import type { AuthContext } from "../types";

const FILE_MAX_BYTES = 1024 * 1024;

/** Read without a token: the login screen and the installed app need the appearance before anyone signs in. */
export const brandingPublicRouter = Router();

brandingPublicRouter.get("/", asyncHandler(async (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.json({ data: await brandingOf(await soleCompanyId()) });
}));

brandingPublicRouter.get("/manifest.webmanifest", asyncHandler(async (_req, res) => {
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(JSON.stringify(manifestFor(await brandingOf(await soleCompanyId()))));
}));

/** Logo and icon files by version: a new upload gets a new version, so a file never changes and is cached for good. */
brandingPublicRouter.get("/files/:version/:name.png", asyncHandler(async (req, res) => {
  const version = z.string().uuid().safeParse(req.params.version);
  const name = z.enum(BRANDING_FILES).safeParse(req.params.name);
  if (!version.success || !name.success) throw new ApiError(404, "NOT_FOUND", "File not found");
  const row = (await query<{ logo_keys: Record<BrandingFile, string> }>(
    "SELECT logo_keys FROM company_branding WHERE logo_version = $1", [version.data])).rows[0];
  const key = row?.logo_keys?.[name.data];
  const stream = key ? await objectStorage.get(key).catch(() => null) : null;
  if (!stream) throw new ApiError(404, "NOT_FOUND", "File not found");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  stream.on("error", (error) => res.destroy(error));
  stream.pipe(res);
}));

/** Changes: directors only. */
export const brandingRouter = Router();

/** Only a director changes the appearance; anyone else is refused with 403 and the attempt is audited. */
async function requireDirector(req: Request): Promise<AuthContext> {
  const auth = requireAuth(req);
  if (auth.role !== "DIRECTOR") {
    await writeAudit(req, { auth, action: "BRANDING_CHANGE_DENIED", entityType: "company", entityId: auth.companyId });
    throw new ApiError(403, "DIRECTOR_ONLY", "Only a director can change the appearance");
  }
  return auth;
}

/** Everyone in the company sees a change at once. */
async function announce(companyId: string): Promise<Branding> {
  const branding = await brandingOf(companyId);
  const people = await query<{ id: string }>("SELECT id FROM users WHERE company_id = $1 AND status = 'ACTIVE'", [companyId]);
  emitToUsers(people.rows.map((row) => row.id), "branding:changed", branding);
  return branding;
}

const hex = z.string().trim().toLowerCase().regex(/^#[0-9a-f]{6}$/);
const patchInput = z.object({
  appName: z.string().trim().min(1).max(30).refine((value) => ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)),
  accentColor: hex,
  sidebarColor: hex
}).partial().strict();

brandingRouter.patch("/", asyncHandler(async (req, res) => {
  const auth = await requireDirector(req);
  const parsed = patchInput.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Check the title and colours", parsed.error.flatten());
  const input = parsed.data;
  const fields = Object.keys(input) as Array<keyof typeof input>;
  if (!fields.length) throw new ApiError(400, "NO_CHANGES", "No fields to update");
  if (input.accentColor && contrastRatio("#ffffff", input.accentColor) < MIN_ACCENT_CONTRAST) {
    throw new ApiError(400, "BRANDING_LOW_CONTRAST", "White text on this accent colour is hard to read");
  }
  const columns = { appName: "app_name", accentColor: "accent_color", sidebarColor: "sidebar_color" } as const;
  await query(
    `INSERT INTO company_branding (company_id, updated_by, ${fields.map((field) => columns[field]).join(", ")})
     VALUES ($1, $2, ${fields.map((_, index) => `$${index + 3}`).join(", ")})
     ON CONFLICT (company_id) DO UPDATE SET ${fields.map((field) => `${columns[field]} = EXCLUDED.${columns[field]}`).join(", ")},
       updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [auth.companyId, auth.userId, ...fields.map((field) => input[field])]);
  await writeAudit(req, { auth, action: "BRANDING_UPDATED", entityType: "company", entityId: auth.companyId, metadata: { fields } });
  res.json({ data: await announce(auth.companyId) });
}));

const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: FILE_MAX_BYTES, files: BRANDING_FILES.length } })
  .fields(BRANDING_FILES.map((name) => ({ name, maxCount: 1 })));
const uploadLogo = (req: Request, res: Response, next: NextFunction) => logoUpload(req, res, (error: unknown) => {
  if (error instanceof multer.MulterError) next(new ApiError(error.code === "LIMIT_FILE_SIZE" ? 413 : 400, "UNSUPPORTED_IMAGE", "Each logo file must be a PNG up to 1 MB"));
  else next(error);
});

/** Deletes stored logo files, ignoring ones already gone. */
const deleteFiles = async (keys: Record<string, string> | null | undefined) => {
  await Promise.all(Object.values(keys ?? {}).map((key) => objectStorage.delete(key).catch(() => undefined)));
};

/**
 * The browser sends the logo and the icons made from it, each a square PNG of a fixed size. The new files are stored
 * first; the previous version's files are deleted only after the row points at the new ones.
 */
brandingRouter.put("/logo", (req, res, next) => { void requireDirector(req).then(() => next(), next); }, uploadLogo, asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const parts = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
  for (const name of BRANDING_FILES) {
    const body = parts[name]?.[0]?.buffer;
    const size = body ? pngSize(body) : null;
    if (!size || size.width !== BRANDING_FILE_SIZES[name] || size.height !== BRANDING_FILE_SIZES[name]) {
      throw new ApiError(400, "UNSUPPORTED_IMAGE", `${name} must be a ${BRANDING_FILE_SIZES[name]}×${BRANDING_FILE_SIZES[name]} PNG`);
    }
  }
  const stored: Record<string, string> = {};
  try {
    for (const name of BRANDING_FILES) {
      stored[name] = (await objectStorage.put({ companyId: auth.companyId, fileName: `branding-${name}.png`, body: parts[name]![0]!.buffer })).key;
    }
  } catch (error) { await deleteFiles(stored); throw error; }
  const version = randomUUID();
  let previous: Record<string, string> | null = null;
  try {
    previous = await transaction(async (client) => {
      const before = await client.query<{ logo_keys: Record<string, string> | null }>(
        "SELECT logo_keys FROM company_branding WHERE company_id = $1 FOR UPDATE", [auth.companyId]);
      await client.query(
        `INSERT INTO company_branding (company_id, logo_version, logo_keys, updated_by) VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (company_id) DO UPDATE SET logo_version = EXCLUDED.logo_version, logo_keys = EXCLUDED.logo_keys,
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [auth.companyId, version, JSON.stringify(stored), auth.userId]);
      return before.rows[0]?.logo_keys ?? null;
    });
  } catch (error) { await deleteFiles(stored); throw error; }
  await deleteFiles(previous);
  await writeAudit(req, { auth, action: "BRANDING_LOGO_UPDATED", entityType: "company", entityId: auth.companyId, metadata: { logoVersion: version } });
  res.json({ data: await announce(auth.companyId) });
}));

brandingRouter.delete("/logo", asyncHandler(async (req, res) => {
  const auth = await requireDirector(req);
  const before = await query<{ logo_keys: Record<string, string> | null }>(
    "UPDATE company_branding b SET logo_version = NULL, logo_keys = NULL, updated_by = $2, updated_at = now() FROM (SELECT logo_keys FROM company_branding WHERE company_id = $1) old WHERE b.company_id = $1 RETURNING old.logo_keys",
    [auth.companyId, auth.userId]);
  await deleteFiles(before.rows[0]?.logo_keys);
  await writeAudit(req, { auth, action: "BRANDING_LOGO_REMOVED", entityType: "company", entityId: auth.companyId });
  res.json({ data: await announce(auth.companyId) });
}));

/** Back to the standard look: the row and its files go. */
brandingRouter.delete("/", asyncHandler(async (req, res) => {
  const auth = await requireDirector(req);
  const removed = await query<{ logo_keys: Record<string, string> | null }>(
    "DELETE FROM company_branding WHERE company_id = $1 RETURNING logo_keys", [auth.companyId]);
  await deleteFiles(removed.rows[0]?.logo_keys);
  await writeAudit(req, { auth, action: "BRANDING_RESET", entityType: "company", entityId: auth.companyId });
  res.json({ data: await announce(auth.companyId) });
}));
