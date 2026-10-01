import { Download, ImageOff, Paperclip, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useMail } from '../../context/MailContext';
import { fileSize, formatDateTime } from '../../lib/format';
import { displayAddress, parseAddresses, senderName, type Address, type MailAttachment, type MailMessage } from '../../lib/mail';
import { mailErrorMessage } from '../../lib/mailErrors';
import { Avatar, Badge, Button } from '../ui';

const frameStyles = `html,body{margin:0}body{padding:1px 0 4px;font:13px/1.55 Inter,ui-sans-serif,-apple-system,"Segoe UI",sans-serif;color:#202827;word-wrap:break-word;overflow-wrap:anywhere}
img{max-width:100%;height:auto}a{color:#176f68}blockquote{margin:8px 0;padding-left:10px;border-left:3px solid #dfe5e3;color:#687472}table{max-width:100%}pre{white-space:pre-wrap}`;

/**
 * Shows sanitized mail HTML in a sandboxed frame: no scripts, no forms, and remote images blocked by
 * CSP until the owner allows them. Same-origin access is kept only so the frame can size to its content.
 */
export function MailFrame({ html, allowRemote }: { html: string; allowRemote: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(80);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:${allowRemote ? ' https: http:' : ''}`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${frameStyles}</style></head><body>${html}</body></html>`;
  const resize = () => {
    const root = frame.current?.contentDocument?.documentElement;
    if (root) setHeight(Math.min(Math.max(root.scrollHeight + 4, 40), 4000));
  };
  useEffect(() => {
    const body = frame.current?.contentDocument?.body;
    if (!body || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resize);
    observer.observe(body);
    return () => observer.disconnect();
  });
  return <iframe ref={frame} className="mail-frame" title="Текст письма" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} style={{ height }} onLoad={() => { resize(); setTimeout(resize, 120); }} />;
}

export function AttachmentList({ attachments }: { attachments: MailAttachment[] }) {
  const { backend } = useMail();
  const [error, setError] = useState('');
  if (!attachments.length) return null;
  const download = async (attachment: MailAttachment) => {
    setError('');
    try {
      const blob = await backend.download(attachment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = attachment.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(mailErrorMessage(reason, 'Вложение не скачано')); }
  };
  return <div className="mail-attachments">
    {attachments.map((attachment) => <button key={attachment.id} type="button" onClick={() => void download(attachment)} aria-label={`Скачать ${attachment.filename}`}>
      <Paperclip size={14} /><span><strong>{attachment.filename}</strong><small>{fileSize(attachment.size)}</small></span><Download size={14} />
    </button>)}
    {error && <div className="form-error" role="alert">{error}</div>}
  </div>;
}

/** One message of a thread, read-only; actions are rendered by the caller. */
export function MessageCard({ message, showBcc = true, actions, collapsed = false, onToggle }: { message: MailMessage; showBcc?: boolean; actions?: React.ReactNode; collapsed?: boolean; onToggle?: () => void }) {
  const { backend } = useMail();
  const [html, setHtml] = useState(message.html);
  const [remote, setRemote] = useState(false);
  const showImages = async () => { setHtml(await backend.showImages(message.id)); setRemote(true); };
  const recipients = (label: string, list: Address[]) => list.length ? <span><b>{label}</b> {list.map(displayAddress).join(', ')}</span> : null;
  return <article className={`mail-message ${collapsed ? 'mail-message--collapsed' : ''}`} aria-label={`Письмо от ${senderName(message)}`}>
    <header onClick={onToggle}>
      <Avatar name={senderName(message)} size="sm" />
      <div>
        <strong>{senderName(message)} <small>&lt;{message.fromAddress}&gt;</small></strong>
        {collapsed ? <small className="mail-message__snippet">{message.snippet}</small> : <small className="mail-message__recipients">{recipients('Кому:', message.to)}{recipients('Копия:', message.cc)}{showBcc && recipients('Скрытая копия:', message.bcc)}</small>}
      </div>
      <time dateTime={message.sentAt}>{formatDateTime(message.sentAt)}</time>
      {message.sendStatus === 'FAILED' && <Badge tone="danger">Не отправлено</Badge>}
      {message.sendStatus === 'SENDING' && <Badge tone="warning">Отправляется</Badge>}
    </header>
    {!collapsed && <>
      {message.sendStatus === 'FAILED' && message.sendError && <div className="notice notice--danger">{message.sendError}</div>}
      {message.hasRemoteImages && !remote && <div className="mail-images-blocked"><ImageOff size={14} /><span>Внешние изображения скрыты, чтобы отправитель не узнал о прочтении</span><button type="button" className="text-button" onClick={() => void showImages()}>Показать изображения</button></div>}
      {html ? <MailFrame html={html} allowRemote={remote} /> : <div className="mail-text">{message.text}</div>}
      <AttachmentList attachments={message.attachments} />
      {actions && <footer>{actions}</footer>}
    </>}
  </article>;
}

/** Recipient input: chips for parsed addresses and suggestions from CRM clients and past correspondents. */
export function AddressField({ label, value, onChange, autoFocus }: { label: string; value: Address[]; onChange: (value: Address[]) => void; autoFocus?: boolean }) {
  const { backend } = useMail();
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ address: string; name: string | null; source: string }>>([]);
  const [invalid, setInvalid] = useState('');
  useEffect(() => {
    const query = text.trim();
    if (query.length < 2) { setSuggestions([]); return; }
    let active = true;
    const timer = setTimeout(() => backend.suggest(query).then((items) => { if (active) setSuggestions(items.filter((item) => !value.some((entry) => entry.address === item.address))); }).catch(() => undefined), 200);
    return () => { active = false; clearTimeout(timer); };
  }, [text, backend, value]);
  const commit = (raw = text) => {
    const parsed = parseAddresses(raw);
    if (parsed.valid.length) onChange([...value, ...parsed.valid.filter((item) => !value.some((entry) => entry.address === item.address))]);
    setInvalid(parsed.invalid.join(', '));
    setText(parsed.invalid.join(', '));
    setSuggestions([]);
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'Enter' || event.key === ',' || event.key === ';' || event.key === 'Tab') && text.trim()) { event.preventDefault(); commit(); }
    if (event.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
  };
  const id = useMemo(() => `address-${label}-${Math.random().toString(36).slice(2)}`, [label]);
  return <div className="field field--wide address-field">
    <label htmlFor={id}>{label}</label>
    <div className="address-field__box">
      {value.map((item) => <span key={item.address} className="address-chip">{item.name ? `${item.name} · ${item.address}` : item.address}<button type="button" aria-label={`Убрать ${item.address}`} onClick={() => onChange(value.filter((entry) => entry !== item))}><X size={12} /></button></span>)}
      <input id={id} value={text} autoFocus={autoFocus} onChange={(event) => { setText(event.target.value); setInvalid(''); }} onKeyDown={keyDown} onBlur={() => text.trim() && commit()} placeholder={value.length ? '' : 'адрес@пример.com'} autoComplete="off" />
    </div>
    {suggestions.length > 0 && <ul className="address-suggestions" role="listbox" aria-label={`Подсказки: ${label}`}>{suggestions.map((item) => <li key={item.address} role="option" aria-selected="false"><button type="button" onMouseDown={(event) => { event.preventDefault(); commit(item.name ? `${item.name} <${item.address}>` : item.address); }}><strong>{item.name ?? item.address}</strong><small>{item.address}{item.source === 'client' ? ' · клиент' : ''}</small></button></li>)}</ul>}
    {invalid && <small className="form-hint form-hint--danger">Неверный адрес: {invalid}</small>}
  </div>;
}
