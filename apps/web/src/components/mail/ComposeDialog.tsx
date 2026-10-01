import { Bold, Italic, Link2, List, ListOrdered, Paperclip, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useMail } from '../../context/MailContext';
import { fileSize } from '../../lib/format';
import { replyDraft, type Address, type DraftMode, type MailDraft, type MailMessage } from '../../lib/mail';
import { mailErrorMessage } from '../../lib/mailErrors';
import { Button, Dialog, Field, IconButton, SelectField } from '../ui';
import { AddressField } from './MailParts';

export interface ComposeRequest {
  mode: DraftMode;
  accountId?: string;
  source?: MailMessage;
  to?: Address[];
  subject?: string;
  clientId?: string | null;
  dealId?: string | null;
  draft?: MailDraft;
}

const AUTOSAVE_MS = 1500;
const titles: Record<DraftMode, string> = { NEW: 'Новое письмо', REPLY: 'Ответ', REPLY_ALL: 'Ответ всем', FORWARD: 'Пересылка' };
const exec = (command: string, value?: string) => { if (typeof document.execCommand === 'function') document.execCommand(command, false, value); };
const isEmptyHtml = (html: string) => !html.replace(/<blockquote[\s\S]*<\/blockquote>/gi, '').replace(/<[^>]+>|&nbsp;|\s|-{3,}.*$/g, '').trim();

/** Writes, replies to or forwards mail. Changes are saved as a draft automatically; closing keeps the draft. */
export function ComposeDialog({ request, onClose, onSent }: { request: ComposeRequest; onClose: () => void; onSent: (threadId: string) => void }) {
  const { backend, accounts, notify } = useMail();
  const usable = accounts.filter((account) => account.status === 'CONNECTED');
  const [draft, setDraft] = useState<MailDraft | null>(request.draft ?? null);
  const [showCopies, setShowCopies] = useState(Boolean(request.draft?.cc.length || request.draft?.bcc.length));
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const latest = useRef<MailDraft | null>(draft);
  latest.current = draft;

  // Create the draft (with reply/forward prefill) once.
  useEffect(() => {
    if (request.draft) { if (editor.current) editor.current.innerHTML = request.draft.html; return; }
    const accountId = request.accountId && usable.some((account) => account.id === request.accountId) ? request.accountId : usable[0]?.id;
    if (!accountId) return;
    const mailbox = accounts.find((account) => account.id === accountId)!.email;
    const prefill = request.source && request.mode !== 'NEW' ? replyDraft(request.source, request.mode, mailbox) : { to: request.to ?? [], cc: [], subject: request.subject ?? '', html: '' };
    backend.createDraft({
      accountId, mode: request.mode, sourceMessageId: request.source?.id ?? null, to: prefill.to, cc: prefill.cc, subject: prefill.subject, html: prefill.html,
      forwardAttachmentIds: request.mode === 'FORWARD' ? request.source?.attachments.map((item) => item.id) : [], clientId: request.clientId ?? null, dealId: request.dealId ?? null,
    }).then((created) => {
      setDraft(created);
      setShowCopies(created.cc.length > 0);
      if (editor.current) editor.current.innerHTML = created.html;
    }).catch((reason) => setError(mailErrorMessage(reason, 'Черновик не создан')));
  // Runs once per dialog.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const html = () => editor.current?.innerHTML ?? '';
  const save = useCallback(async (patch: Partial<MailDraft> = {}) => {
    const current = latest.current;
    if (!current) return null;
    const next = { ...current, ...patch, html: patch.html ?? html() };
    setSaving(true);
    try {
      const saved = await backend.updateDraft(current.id, { accountId: next.accountId, to: next.to, cc: next.cc, bcc: next.bcc, subject: next.subject, html: next.html });
      setDirty(false);
      return saved;
    } finally { setSaving(false); }
  }, [backend]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => { void save().catch(() => undefined); }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, draft, save]);

  const update = (patch: Partial<MailDraft>) => { setDraft((current) => current ? { ...current, ...patch } : current); setDirty(true); };

  const close = async () => {
    const current = latest.current;
    if (current) {
      const empty = !current.to.length && !current.cc.length && !current.bcc.length && !current.subject.trim() && isEmptyHtml(html()) && !current.attachments.length;
      if (empty && !request.draft) await backend.deleteDraft(current.id).catch(() => undefined);
      else await save().catch(() => undefined);
      notify({ type: 'changed' });
    }
    onClose();
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSending(true); setError('');
    try {
      await save();
      const result = await backend.send(draft.id);
      notify({ type: 'changed' });
      onSent(result.threadId);
    } catch (reason) {
      setError(mailErrorMessage(reason, 'Письмо не отправлено'));
    } finally { setSending(false); }
  };

  const attach = async (list: FileList | null) => {
    if (!draft || !list?.length) return;
    setError('');
    try { const updated = await backend.attach(draft.id, [...list]); setDraft((current) => current ? { ...current, attachments: updated.attachments } : current); }
    catch (reason) { setError(mailErrorMessage(reason, 'Файл не прикреплён')); }
    if (files.current) files.current.value = '';
  };
  const detach = async (id: string) => {
    if (!draft) return;
    await backend.detach(draft.id, id).catch(() => undefined);
    setDraft((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.id !== id) } : current);
  };
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const selection = useRef<Range | null>(null);
  const startLink = () => {
    const current = window.getSelection();
    selection.current = current && current.rangeCount ? current.getRangeAt(0).cloneRange() : null;
    setLinkUrl('https://');
  };
  const insertLink = () => {
    const url = linkUrl?.trim() ?? '';
    if (/^https?:\/\/\S+$/.test(url) && selection.current) {
      const current = window.getSelection();
      current?.removeAllRanges(); current?.addRange(selection.current);
      if (selection.current.collapsed) exec('insertHTML', `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>`);
      else exec('createLink', url);
      setDirty(true);
    }
    setLinkUrl(null);
  };

  const ready = Boolean(draft && (draft.to.length || draft.cc.length || draft.bcc.length));
  if (!usable.length) {
    return <Dialog open title={titles[request.mode]} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Закрыть</Button>}>
      <p className="dialog-text">Подключите почтовый ящик в настройках почты, чтобы отправлять письма из Atlas.</p>
    </Dialog>;
  }
  return <Dialog open size="lg" title={titles[request.mode]} description={saving ? 'Сохраняем черновик…' : draft ? 'Черновик сохраняется автоматически' : 'Готовим черновик…'} onClose={() => void close()} footer={<>
    <Button variant="ghost" icon={Trash2} className="dialog-footer__start" disabled={!draft} onClick={() => { if (draft) void backend.deleteDraft(draft.id).then(() => { notify({ type: 'changed' }); onClose(); }); }}>Удалить черновик</Button>
    <Button variant="secondary" onClick={() => void close()}>Закрыть</Button>
    <Button type="submit" form="compose-form" disabled={sending || !ready}>{sending ? 'Отправляем…' : 'Отправить'}</Button>
  </>}>
    <form id="compose-form" className="form-grid compose-form" onSubmit={(event) => void send(event)}>
      {usable.length > 1 && <SelectField label="От кого" value={draft?.accountId ?? ''} onChange={(event) => update({ accountId: event.target.value })} className="field--wide">{usable.map((account) => <option key={account.id} value={account.id}>{account.displayName ? `${account.displayName} <${account.email}>` : account.email}</option>)}</SelectField>}
      <AddressField label="Кому" value={draft?.to ?? []} onChange={(to) => update({ to })} autoFocus={request.mode === 'NEW' || request.mode === 'FORWARD'} />
      {showCopies ? <>
        <AddressField label="Копия" value={draft?.cc ?? []} onChange={(cc) => update({ cc })} />
        <AddressField label="Скрытая копия" value={draft?.bcc ?? []} onChange={(bcc) => update({ bcc })} />
      </> : <button type="button" className="text-button field--wide compose-form__copies" onClick={() => setShowCopies(true)}>Копия и скрытая копия</button>}
      <Field label="Тема" className="field--wide"><input value={draft?.subject ?? ''} maxLength={998} onChange={(event) => update({ subject: event.target.value })} /></Field>
      <div className="field field--wide">
        <span id="compose-body-label">Текст</span>
        <div className="compose-editor">
          <div className="compose-editor__toolbar" role="toolbar" aria-label="Форматирование">
            <IconButton label="Жирный" icon={Bold} onMouseDown={(event) => { event.preventDefault(); exec('bold'); }} />
            <IconButton label="Курсив" icon={Italic} onMouseDown={(event) => { event.preventDefault(); exec('italic'); }} />
            <IconButton label="Маркированный список" icon={List} onMouseDown={(event) => { event.preventDefault(); exec('insertUnorderedList'); }} />
            <IconButton label="Нумерованный список" icon={ListOrdered} onMouseDown={(event) => { event.preventDefault(); exec('insertOrderedList'); }} />
            <IconButton label="Ссылка" icon={Link2} onMouseDown={(event) => { event.preventDefault(); startLink(); }} />
            <IconButton label="Прикрепить файл" icon={Paperclip} onClick={() => files.current?.click()} />
            <input ref={files} type="file" multiple hidden onChange={(event) => void attach(event.target.files)} aria-label="Файлы для вложения" />
          </div>
          {linkUrl !== null && <div className="compose-editor__link"><input aria-label="Адрес ссылки" value={linkUrl} autoFocus onChange={(event) => setLinkUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); insertLink(); } if (event.key === 'Escape') { event.preventDefault(); setLinkUrl(null); } }} /><Button type="button" variant="secondary" onClick={insertLink}>Вставить ссылку</Button></div>}
          <div ref={editor} className="compose-editor__body" contentEditable={Boolean(draft)} role="textbox" aria-multiline="true" aria-labelledby="compose-body-label" suppressContentEditableWarning onInput={() => setDirty(true)} />
        </div>
      </div>
      {draft && draft.attachments.length > 0 && <div className="field--wide compose-attachments">{draft.attachments.map((item) => <span key={item.id} className="address-chip"><Paperclip size={12} />{item.filename} · {fileSize(item.size)}<button type="button" aria-label={`Убрать вложение ${item.filename}`} onClick={() => void detach(item.id)}><X size={12} /></button></span>)}</div>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}
