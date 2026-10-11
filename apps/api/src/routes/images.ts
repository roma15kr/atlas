import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { imageUploadLimiter } from "../middleware";
import { objectStorage } from "../storage";
import { detectImageType } from "./avatars";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
const extensions: Record<ImageMime, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp" };

/** PNG, JPEG, GIF or WebP by magic bytes; the client's declared type is ignored. */
export function detectRichImageType(body: Buffer): ImageMime | null {
  if (body.length >= 6 && ["GIF87a", "GIF89a"].includes(body.toString("ascii", 0, 6))) return "image/gif";
  return detectImageType(body);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: IMAGE_MAX_BYTES, files: 1 } });

export const imagesRouter = Router();

/** `POST /api/v1/images`: one image (`file`), up to 5 MB, for any active user. Returns its Atlas URL. */
imagesRouter.post("/", imageUploadLimiter, (req, res, next) => upload.single("file")(req, res, (error: unknown) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") next(new ApiError(413, "IMAGE_TOO_LARGE", "Images can be up to 5 MB"));
  else next(error);
}), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (!req.file) throw new ApiError(400, "IMAGE_REQUIRED", "Attach an image as `file`");
  const mime = detectRichImageType(req.file.buffer);
  if (!mime) throw new ApiError(400, "UNSUPPORTED_IMAGE", "Only PNG, JPEG, GIF or WebP images can be added");
  const stored = await objectStorage.put({ companyId: auth.companyId, fileName: `image${extensions[mime]}`, body: req.file.buffer });
  let id: string;
  try {
    id = (await query<{ id: string }>(
      "INSERT INTO rich_text_images (company_id, uploaded_by, storage_key, mime_type, size_bytes) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [auth.companyId, auth.userId, stored.key, mime, req.file.size]
    )).rows[0]!.id;
  } catch (error) {
    await objectStorage.delete(stored.key).catch(() => undefined);
    throw error;
  }
  await writeAudit(req, { auth, action: "RICH_TEXT_IMAGE_UPLOADED", entityType: "rich_text_image", entityId: id, metadata: { mime, size: req.file.size } });
  res.status(201).json({ data: { id, url: `/api/v1/images/${id}` } });
}));

/** `GET /api/v1/images/:id`: signed-in users of the same company only; anyone else gets 404. */
imagesRouter.get("/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new ApiError(404, "IMAGE_NOT_FOUND", "Image not found");
  const image = (await query<{ storage_key: string; mime_type: string }>(
    "SELECT storage_key, mime_type FROM rich_text_images WHERE id = $1 AND company_id = $2", [id.data, auth.companyId])).rows[0];
  if (!image) throw new ApiError(404, "IMAGE_NOT_FOUND", "Image not found");
  const stream = await objectStorage.get(image.storage_key).catch(() => null);
  if (!stream) throw new ApiError(404, "IMAGE_NOT_FOUND", "Image not found");
  res.setHeader("Content-Type", image.mime_type);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  stream.on("error", (error) => res.destroy(error));
  stream.pipe(res);
}));
