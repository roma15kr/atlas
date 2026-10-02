import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { objectStorage } from "../storage";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** One image, held in memory; its type is decided by `detectImageType`, not by the client. */
export const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });

export type AvatarMime = "image/jpeg" | "image/png" | "image/webp";

/** Recognizes JPEG, PNG and WebP by their magic bytes. */
export function detectImageType(body: Buffer): AvatarMime | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const extensions: Record<AvatarMime, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

/**
 * Sets (or with `body` null, removes) a user's photo. The new object is stored first and the old one
 * deleted only after the row is updated; returns the new avatar URL, or null after a removal.
 */
export async function replaceAvatar(user: { id: string; companyId: string }, body: Buffer | null): Promise<{ avatarUrl: string | null; replaced: boolean }> {
  let mime: AvatarMime | null = null;
  if (body) {
    mime = detectImageType(body);
    if (!mime) throw new ApiError(400, "UNSUPPORTED_IMAGE", "Upload a JPEG, PNG or WebP image");
  }
  const stored = body && mime ? await objectStorage.put({ companyId: user.companyId, fileName: `avatar${extensions[mime]}`, body }) : null;
  const avatarId = stored ? randomUUID() : null;
  let previousKey: string | null;
  try {
    previousKey = await transaction(async (client) => {
      const previous = await client.query<{ avatar_key: string | null }>(
        "SELECT avatar_key FROM users WHERE id = $1 AND company_id = $2 FOR UPDATE", [user.id, user.companyId]);
      if (!previous.rows[0]) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
      await client.query(
        `UPDATE users SET avatar_id = $2, avatar_key = $3, avatar_mime = $4,
                          avatar_url = CASE WHEN $2::uuid IS NULL THEN NULL ELSE '/api/v1/avatars/' || $2::text END
         WHERE id = $1`,
        [user.id, avatarId, stored?.key ?? null, mime]
      );
      return previous.rows[0].avatar_key;
    });
  } catch (error) {
    if (stored) await objectStorage.delete(stored.key).catch(() => undefined);
    throw error;
  }
  if (previousKey) await objectStorage.delete(previousKey).catch(() => undefined);
  return { avatarUrl: avatarId ? `/api/v1/avatars/${avatarId}` : null, replaced: Boolean(previousKey) };
}

/** Serves photos without a token: the id is random and changes with every upload. */
export const avatarsRouter = Router();

avatarsRouter.get("/:id", asyncHandler(async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new ApiError(404, "NOT_FOUND", "Photo not found");
  const result = await query<{ avatar_key: string; avatar_mime: string }>(
    "SELECT avatar_key, avatar_mime FROM users WHERE avatar_id = $1", [id.data]);
  const avatar = result.rows[0];
  if (!avatar) throw new ApiError(404, "NOT_FOUND", "Photo not found");
  const stream = await objectStorage.get(avatar.avatar_key).catch(() => null);
  if (!stream) throw new ApiError(404, "NOT_FOUND", "Photo not found");
  res.setHeader("Content-Type", avatar.avatar_mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Content-Disposition", "inline");
  stream.on("error", (error) => res.destroy(error));
  stream.pipe(res);
}));
