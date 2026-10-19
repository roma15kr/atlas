/** Files that can be attached to a chat message: the same list and limits as the API (`apps/api/src/chat/attachments.ts`). */
export interface ChatAttachment { id: string; fileName: string; mimeType: string; size: number }

export const ATTACHMENT_EXTENSIONS = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(',');
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENTS_PER_MESSAGE = 10;
export const ATTACHMENT_RULES = 'PDF, Word, Excel, CSV, PowerPoint, текст, ZIP или изображения до 20 МБ';

const extensionOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

/** Why a file can't be attached (in Russian), or null when it can. The server checks again by content. */
export function attachmentProblem(file: Pick<File, 'name' | 'size'>): string | null {
  if (!ATTACHMENT_EXTENSIONS.includes(extensionOf(file.name))) return `«${file.name}»: такой файл не прикрепить. Можно: ${ATTACHMENT_RULES}.`;
  if (file.size > ATTACHMENT_MAX_BYTES) return `«${file.name}» больше 20 МБ.`;
  if (!file.size) return `«${file.name}» пустой.`;
  return null;
}

export type FileKind = 'pdf' | 'sheet' | 'doc' | 'slides' | 'archive' | 'image' | 'text';
export function fileKind(name: string): FileKind {
  const extension = extensionOf(name);
  if (extension === 'pdf') return 'pdf';
  if (['xlsx', 'xls', 'csv'].includes(extension)) return 'sheet';
  if (['docx', 'doc'].includes(extension)) return 'doc';
  if (extension === 'pptx') return 'slides';
  if (extension === 'zip') return 'archive';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'image';
  return 'text';
}

/** «850 КБ», «1,2 МБ». */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
}
