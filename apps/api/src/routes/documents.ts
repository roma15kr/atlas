import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { config } from "../config";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { pagination } from "../http";
import { objectStorage } from "../storage";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, done) => {
    const allowed = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg", "image/png", "image/webp"
    ]);
    if (!allowed.has(file.mimetype)) {
      done(new ApiError(400, "UNSUPPORTED_FILE_TYPE", "Unsupported document type"));
      return;
    }
    done(null, true);
  }
});

const metadataSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  folder: z.string().trim().min(1).max(240).default("General"),
  visibility: z.enum(["COMPANY", "DEPARTMENT", "PRIVATE"]).default("COMPANY"),
  departmentId: z.string().uuid().optional()
});
const idSchema = z.string().uuid();

export const documentsRouter = Router();

documentsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const page = pagination(req);
  const filters = z.object({ folder: z.string().max(240).optional() }).parse(req.query);
  const access = documentAccess(auth);
  const values: unknown[] = [...access.values];
  const clauses = [access.sql];
  if (filters.folder) { values.push(filters.folder); clauses.push(`doc.folder = $${values.length}`); }
  values.push(page.limit, page.offset);
  const result = await query(
    `SELECT ${documentColumns()}, count(*) OVER()::int AS "totalCount"
     FROM documents doc JOIN users u ON u.id = doc.uploaded_by
     WHERE ${clauses.join(" AND ")} ORDER BY doc.updated_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ data: result.rows.map(stripTotal), meta: { ...page, total: Number(result.rows[0]?.totalCount ?? 0) } });
}));

documentsRouter.post("/", upload.single("file"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (!req.file) throw new ApiError(400, "FILE_REQUIRED", "A document file is required");
  const input = metadataSchema.parse(req.body);
  if (auth.role === "EMPLOYEE" && input.visibility === "COMPANY") {
    throw new ApiError(403, "FORBIDDEN", "Only managers and directors can publish company-wide documents");
  }
  const departmentId = await resolveDepartment(auth, input.visibility, input.departmentId);
  const stored = await objectStorage.put({ companyId: auth.companyId, fileName: req.file.originalname, body: req.file.buffer });
  try {
    const id = await transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO documents
          (company_id, department_id, uploaded_by, folder, title, file_name, mime_type, size_bytes, storage_key, version, visibility)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10) RETURNING id`,
        [auth.companyId, departmentId, auth.userId, input.folder, input.title ?? req.file!.originalname,
          req.file!.originalname, req.file!.mimetype, stored.size, stored.key, input.visibility]
      );
      const documentId = result.rows[0]!.id;
      await client.query(
        `INSERT INTO document_versions
          (document_id, version, uploaded_by, file_name, mime_type, size_bytes, storage_key)
         VALUES ($1,1,$2,$3,$4,$5,$6)`,
        [documentId, auth.userId, req.file!.originalname, req.file!.mimetype, stored.size, stored.key]
      );
      return documentId;
    });
    await writeAudit(req, { auth, action: "DOCUMENT_UPLOADED", entityType: "document", entityId: id, departmentId, metadata: { size: stored.size, visibility: input.visibility } });
    res.status(201).json({ data: publicDocument(await scopedDocument(auth, id)) });
  } catch (error) {
    await objectStorage.delete(stored.key).catch(() => undefined);
    throw error;
  }
}));

documentsRouter.post("/:id/versions", upload.single("file"), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const existing = await scopedDocument(auth, id);
  if (!req.file) throw new ApiError(400, "FILE_REQUIRED", "A document file is required");
  const ownsDocument = existing.uploadedById === auth.userId;
  const managerOwnsDepartment = auth.role === "MANAGER" && existing.departmentId === auth.departmentId;
  if (auth.role !== "DIRECTOR" && !ownsDocument && !managerOwnsDepartment) {
    throw new ApiError(403, "FORBIDDEN", "Document is outside your management scope");
  }
  const stored = await objectStorage.put({ companyId: auth.companyId, fileName: req.file.originalname, body: req.file.buffer });
  try {
    const version = await transaction(async (client) => {
      const locked = await client.query<{ version: number }>(
        "SELECT version FROM documents WHERE id = $1 AND company_id = $2 FOR UPDATE",
        [id, auth.companyId]
      );
      const nextVersion = (locked.rows[0]?.version ?? 0) + 1;
      await client.query(
        `INSERT INTO document_versions
          (document_id, version, uploaded_by, file_name, mime_type, size_bytes, storage_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, nextVersion, auth.userId, req.file!.originalname, req.file!.mimetype, stored.size, stored.key]
      );
      await client.query(
        `UPDATE documents SET version = $2, file_name = $3, mime_type = $4, size_bytes = $5, storage_key = $6
         WHERE id = $1`,
        [id, nextVersion, req.file!.originalname, req.file!.mimetype, stored.size, stored.key]
      );
      return nextVersion;
    });
    await writeAudit(req, { auth, action: "DOCUMENT_VERSION_UPLOADED", entityType: "document", entityId: id, metadata: { version, size: stored.size } });
    res.status(201).json({ data: publicDocument(await scopedDocument(auth, id)) });
  } catch (error) {
    await objectStorage.delete(stored.key).catch(() => undefined);
    throw error;
  }
}));

documentsRouter.get("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const document = await scopedDocument(auth, id);
  const versions = await query(
    `SELECT dv.id, dv.version, dv.file_name AS "fileName", dv.mime_type AS "mimeType",
            dv.size_bytes::float8 AS "sizeBytes", dv.created_at AS "createdAt",
            json_build_object('id', u.id, 'fullName', u.full_name) AS uploader
     FROM document_versions dv JOIN users u ON u.id = dv.uploaded_by
     WHERE dv.document_id = $1 ORDER BY dv.version DESC`,
    [id]
  );
  res.json({ data: { ...publicDocument(document), versions: versions.rows } });
}));

documentsRouter.get("/:id/download", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const document = await scopedDocument(auth, id);
  const stream = await objectStorage.get(document.storageKey as string);
  await writeAudit(req, { auth, action: "DOCUMENT_DOWNLOADED", entityType: "document", entityId: id, metadata: { version: document.version } });
  res.setHeader("Content-Type", document.mimeType as string);
  res.setHeader("Content-Length", String(document.sizeBytes));
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName as string)}`);
  stream.on("error", (error) => res.destroy(error));
  stream.pipe(res);
}));

function documentAccess(auth: ReturnType<typeof requireAuth>, startIndex = 1): { sql: string; values: unknown[] } {
  if (auth.role === "DIRECTOR") return { sql: `doc.company_id = $${startIndex}`, values: [auth.companyId] };
  return {
    sql: `doc.company_id = $${startIndex} AND (
      doc.visibility = 'COMPANY' OR doc.uploaded_by = $${startIndex + 1} OR
      (doc.visibility = 'DEPARTMENT' AND doc.department_id IS NOT DISTINCT FROM $${startIndex + 2})
    )`,
    values: [auth.companyId, auth.userId, auth.departmentId]
  };
}

async function resolveDepartment(
  auth: ReturnType<typeof requireAuth>,
  visibility: "COMPANY" | "DEPARTMENT" | "PRIVATE",
  requested?: string
): Promise<string | null> {
  if (visibility !== "DEPARTMENT") return auth.departmentId;
  if (auth.role === "DIRECTOR") {
    if (!requested) throw new ApiError(400, "DEPARTMENT_REQUIRED", "departmentId is required for department visibility");
    const department = await query("SELECT id FROM departments WHERE id = $1 AND company_id = $2", [requested, auth.companyId]);
    if (!department.rowCount) throw new ApiError(400, "INVALID_DEPARTMENT", "Department does not belong to this company");
    return requested;
  }
  if (!auth.departmentId) throw new ApiError(400, "DEPARTMENT_REQUIRED", "User has no department");
  if (requested && requested !== auth.departmentId) throw new ApiError(403, "INVALID_DEPARTMENT", "Department is outside your scope");
  return auth.departmentId;
}

async function scopedDocument(auth: ReturnType<typeof requireAuth>, id: string): Promise<Record<string, unknown>> {
  const access = documentAccess(auth, 2);
  const result = await query(
    `SELECT ${documentColumns()} FROM documents doc JOIN users u ON u.id = doc.uploaded_by
     WHERE doc.id = $1 AND ${access.sql}`,
    [id, ...access.values]
  );
  if (!result.rows[0]) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  return result.rows[0];
}

function documentColumns(): string {
  return `doc.id, doc.folder, doc.title, doc.file_name AS "fileName", doc.mime_type AS "mimeType",
    doc.size_bytes::float8 AS "sizeBytes", doc.storage_key AS "storageKey", doc.version,
    doc.visibility, doc.department_id AS "departmentId", doc.uploaded_by AS "uploadedById", u.full_name AS "uploadedBy",
    json_build_object('id', u.id, 'fullName', u.full_name) AS uploader,
    doc.created_at AS "createdAt", doc.updated_at AS "updatedAt"`;
}

function stripTotal(row: Record<string, unknown>): Record<string, unknown> {
  const { totalCount: _total, storageKey: _key, ...rest } = row;
  return rest;
}

function publicDocument(row: Record<string, unknown>): Record<string, unknown> {
  const { storageKey: _key, ...rest } = row;
  return rest;
}
