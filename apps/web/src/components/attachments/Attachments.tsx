import { Download, FileArchive, FileImage, FileSpreadsheet, FileText, Paperclip, Presentation, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { ATTACHMENT_ACCEPT, attachmentProblem, ATTACHMENTS_PER_MESSAGE, fileKind, formatFileSize, type ChatAttachment, type FileKind } from '../../lib/chatAttachments';
import { IconButton } from '../ui';

/** A file being attached: uploading, ready (with its id) or failed. */
export interface PendingFile { key: string; name: string; size: number; attachment?: ChatAttachment; error?: string }

/**
 * Files attached to a message or comment before it is sent: each uploads at once through `upload`; `ids` are the ready
 * ones. `errorMessage` turns a failed upload into Russian text. Spread `dropZone` on the element that accepts dropped files.
 */
export function useAttachmentDraft(upload: ((file: File) => Promise<ChatAttachment>) | undefined, errorMessage: (reason: unknown) => string) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const attach = (chosen: File[]) => {
    if (!upload) return;
    const room = ATTACHMENTS_PER_MESSAGE - files.length;
    chosen.slice(0, Math.max(0, room)).forEach((file) => {
      const key = crypto.randomUUID();
      const problem = attachmentProblem(file);
      setFiles((current) => [...current, { key, name: file.name, size: file.size, error: problem ?? undefined }]);
      if (problem) return;
      upload(file).then(
        (attachment) => setFiles((current) => current.map((item) => item.key === key ? { ...item, attachment } : item)),
        (reason) => setFiles((current) => current.map((item) => item.key === key ? { ...item, error: errorMessage(reason) } : item)),
      );
    });
  };
  const dropZone = {
    onDragOver: (event: DragEvent) => { if (upload && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } },
    onDragLeave: () => setDragging(false),
    // A drop the editor already took (it inserts images and hands other files to `attach`) is not attached twice.
    onDrop: (event: DragEvent) => { setDragging(false); if (!upload || event.defaultPrevented || !event.dataTransfer.files.length) return; event.preventDefault(); attach([...event.dataTransfer.files]); },
  };
  return {
    files, dragging, attach, dropZone,
    uploading: files.some((file) => !file.attachment && !file.error),
    ids: files.flatMap((file) => file.attachment ? [file.attachment.id] : []),
    full: files.length >= ATTACHMENTS_PER_MESSAGE,
    remove: (key: string) => setFiles((current) => current.filter((item) => item.key !== key)),
    clear: () => setFiles([]),
  };
}

/** The paper clip: opens the file picker (any number of files, the allowed types). */
export function AttachButton({ label, disabled, onFiles, className = '' }: { label: string; disabled?: boolean; onFiles: (files: File[]) => void; className?: string }) {
  const picker = useRef<HTMLInputElement>(null);
  return <>
    <IconButton label="Прикрепить файл" icon={Paperclip} className={className} disabled={disabled} onClick={() => picker.current?.click()} />
    <input ref={picker} type="file" hidden multiple accept={ATTACHMENT_ACCEPT} aria-label={`Файлы: ${label}`}
      onChange={(event) => { const chosen = [...(event.target.files ?? [])]; event.target.value = ''; onFiles(chosen); }} />
  </>;
}

/** Files waiting to be sent, with progress or the reason they failed, and «×». */
export function PendingFiles({ files, onRemove }: { files: PendingFile[]; onRemove: (key: string) => void }) {
  if (!files.length) return null;
  return <ul className="chat-composer__files" aria-label="Прикреплённые файлы">{files.map((file) => <li key={file.key} className={file.error ? 'is-failed' : file.attachment ? '' : 'is-uploading'}>
    <FileIcon name={file.name} /><span className="file-meta"><strong>{file.name}</strong><small>{file.error ?? (file.attachment ? formatFileSize(file.size) : 'Загружается…')}</small></span>
    <IconButton label={`Убрать ${file.name}`} icon={X} onClick={() => onRemove(file.key)} />
  </li>)}</ul>;
}

const FILE_ICONS: Record<FileKind, typeof FileText> = { pdf: FileText, sheet: FileSpreadsheet, doc: FileText, slides: Presentation, archive: FileArchive, image: FileImage, text: FileText };
export function FileIcon({ name }: { name: string }) {
  const kind = fileKind(name);
  const Icon = FILE_ICONS[kind];
  return <span className={`file-icon file-icon--${kind}`}><Icon size={18} aria-hidden /></span>;
}

/** Sent files as cards; a click downloads the original through `download`. */
export function AttachmentList({ attachments, download, errorMessage }: {
  attachments: ChatAttachment[]; download: (id: string) => Promise<Blob>; errorMessage: (reason: unknown) => string;
}) {
  const [error, setError] = useState('');
  const save = async (file: ChatAttachment) => {
    setError('');
    try {
      const url = URL.createObjectURL(await download(file.id));
      const link = document.createElement('a');
      link.href = url; link.download = file.fileName;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (reason) { setError(errorMessage(reason)); }
  };
  return <div className="chat-attachments">
    {attachments.map((file) => <button key={file.id} type="button" className="chat-attachment" aria-label={`Скачать ${file.fileName}, ${formatFileSize(file.size)}`} onClick={() => void save(file)}>
      <FileIcon name={file.fileName} /><span className="file-meta"><strong>{file.fileName}</strong><small>{formatFileSize(file.size)}</small></span><Download size={15} aria-hidden />
    </button>)}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
