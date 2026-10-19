import { detectRichImageType } from "../routes/images";

/** Files that may be attached to a chat message, by extension, with the check their content must pass. */
const TYPES: Record<string, { mime: string; content: "pdf" | "zip" | "ole" | "text" | "image" }> = {
  pdf: { mime: "application/pdf", content: "pdf" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", content: "zip" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: "zip" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", content: "zip" },
  zip: { mime: "application/zip", content: "zip" },
  doc: { mime: "application/msword", content: "ole" },
  xls: { mime: "application/vnd.ms-excel", content: "ole" },
  csv: { mime: "text/csv", content: "text" },
  txt: { mime: "text/plain", content: "text" },
  png: { mime: "image/png", content: "image" },
  jpg: { mime: "image/jpeg", content: "image" },
  jpeg: { mime: "image/jpeg", content: "image" },
  gif: { mime: "image/gif", content: "image" },
  webp: { mime: "image/webp", content: "image" }
};

export const CHAT_ATTACHMENTS_PER_MESSAGE = 10;

const startsWith = (body: Buffer, bytes: number[]) => bytes.every((byte, index) => body[index] === byte);

function contentMatches(kind: (typeof TYPES)[string]["content"], extension: string, body: Buffer): boolean {
  switch (kind) {
    case "pdf": return body.toString("latin1", 0, 5) === "%PDF-";
    case "zip": return startsWith(body, [0x50, 0x4b, 0x03, 0x04]) || startsWith(body, [0x50, 0x4b, 0x05, 0x06]);
    case "ole": return startsWith(body, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "image": return detectRichImageType(body) === TYPES[extension]!.mime;
    case "text":
      if (body.includes(0)) return false;
      try { new TextDecoder("utf-8", { fatal: true }).decode(body); return true; } catch { return false; }
  }
}

/** The stored type of an allowed file, decided by its extension and checked against its content; null otherwise. */
export function attachmentType(fileName: string, body: Buffer): string | null {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const type = TYPES[extension];
  return type && body.length && contentMatches(type.content, extension, body) ? type.mime : null;
}

/** Multer reads multipart file names as Latin-1; browsers send UTF-8, so Cyrillic names need re-decoding. */
export function uploadedFileName(original: string): string {
  const decoded = Buffer.from(original, "latin1").toString("utf8");
  const name = (decoded.includes("�") ? original : decoded).replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim();
  return (name || "файл").slice(-255);
}
