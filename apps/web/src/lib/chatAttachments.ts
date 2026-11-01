import i18n, { localeOf } from '../i18n';
/** Files that can be attached to a chat message: the same list and limits as the API (`apps/api/src/chat/attachments.ts`). */
export interface ChatAttachment { id: string; fileName: string; mimeType: string; size: number }

export const ATTACHMENT_EXTENSIONS = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(',');
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENTS_PER_MESSAGE = 10;

const extensionOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

/** Why a file can't be attached (in Russian), or null when it can. The server checks again by content. */
export function attachmentProblem(file: Pick<File, 'name' | 'size'>): string | null {
  if (!ATTACHMENT_EXTENSIONS.includes(extensionOf(file.name))) return i18n.t('attachments.notAllowed', { name: file.name, rules: i18n.t('attachments.rules') });
  if (file.size > ATTACHMENT_MAX_BYTES) return i18n.t('attachments.tooBig', { name: file.name });
  if (!file.size) return i18n.t('attachments.empty', { name: file.name });
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
  if (bytes < 1024) return i18n.t('size.bytes', { value: bytes });
  if (bytes < 1024 * 1024) return i18n.t('size.kilobytes', { value: Math.max(1, Math.round(bytes / 1024)) });
  return i18n.t('size.megabytes', { value: (bytes / 1024 / 1024).toLocaleString(localeOf(), { maximumFractionDigits: 1 }) });
}
