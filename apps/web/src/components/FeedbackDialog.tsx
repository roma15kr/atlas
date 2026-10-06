import { CheckCircle2, ImageOff, ImagePlus, LoaderCircle, MessageSquareWarning, Send } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { diagnosticsSnapshot, summarizeDiagnostics } from '../lib/diagnostics';
import { FEEDBACK_MAX_LENGTH, feedbackError, submitFeedback } from '../lib/feedback';
import { captureScreen } from '../lib/screenshot';
import type { FeedbackKind } from '../types';
import { Button, Dialog, Field, Segmented } from './ui';

const kinds: Array<{ value: FeedbackKind; label: string }> = [
  { value: 'PROBLEM', label: 'Проблема' }, { value: 'COMPLAINT', label: 'Жалоба' }, { value: 'IDEA', label: 'Идея' },
];

/** The report form: kind and description. Shows a confirmation with a link to «Мои обращения» once sent. */
export function FeedbackDialog({ page, screenshot, onClose }: { page: string; screenshot: Blob | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<FeedbackKind>('PROBLEM');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [attachShot, setAttachShot] = useState(Boolean(screenshot));
  const [preview, setPreview] = useState<string | null>(null);
  const [includeLog, setIncludeLog] = useState(true);
  const [logSummary] = useState(() => summarizeDiagnostics(diagnosticsSnapshot()));
  useEffect(() => {
    if (!screenshot) return undefined;
    const url = URL.createObjectURL(screenshot);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const invalid = feedbackError(message);
    if (invalid) { setError(invalid); return; }
    setSending(true); setError('');
    try { await submitFeedback({ kind, message, page, includeLog }, attachShot ? screenshot : null); setSent(true); }
    catch (reason) {
      const status = (reason as { status?: number }).status;
      setError(status === 429 ? 'Слишком много обращений, попробуйте позже' : 'Обращение не отправлено. Попробуйте ещё раз.');
    } finally { setSending(false); }
  };

  if (sent) {
    return <Dialog open size="sm" title="Обращение отправлено" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Закрыть</Button><Button onClick={() => { onClose(); navigate('/feedback'); }}>Мои обращения</Button></>}>
      <div className="feedback-sent"><CheckCircle2 size={22} /><p>Спасибо! Команда разработки получит обращение в переведённом и обезличенном виде. Статус виден в разделе «Мои обращения».</p></div>
    </Dialog>;
  }
  return <Dialog open title="Сообщить о проблеме" description="Пишите своими словами — на украинском или русском" onClose={() => { if (!sending) onClose(); }}
    footer={<><Button variant="secondary" disabled={sending} onClick={onClose}>Отмена</Button><Button type="submit" form="feedback-form" icon={Send} disabled={sending}>{sending ? 'Отправляем…' : 'Отправить'}</Button></>}>
    <form id="feedback-form" className="feedback-form" noValidate onSubmit={(event) => void send(event)}>
      <Segmented label="Тип обращения" value={kind} onChange={setKind} options={kinds} />
      <Field label="Что случилось?" hint={`${message.length.toLocaleString('ru-RU')} / ${FEEDBACK_MAX_LENGTH.toLocaleString('ru-RU')} · Страница: ${page}`} error={error || undefined}>
        <textarea rows={6} maxLength={FEEDBACK_MAX_LENGTH} value={message} autoFocus aria-invalid={Boolean(error) || undefined}
          placeholder="Что вы делали, что ожидали и что произошло" onChange={(event) => { setMessage(event.target.value); setError(''); }} />
      </Field>
      <div className="feedback-attach">
        {screenshot && attachShot && preview
          ? <><img className="feedback-shot" src={preview} alt="Предпросмотр снимка экрана" /><span><strong>Снимок экрана приложен</strong><small>Страница до открытия этого окна. Поля паролей скрыты.</small><Button type="button" variant="ghost" icon={ImageOff} onClick={() => setAttachShot(false)}>Не прикладывать снимок</Button></span></>
          : screenshot
            ? <span><strong>Снимок экрана не приложен</strong><Button type="button" variant="ghost" icon={ImagePlus} onClick={() => setAttachShot(true)}>Приложить снимок</Button></span>
            : <span><strong>Снимок экрана не удалось сделать</strong><small>Опишите, что было на экране, — обращение всё равно можно отправить.</small></span>}
      </div>
      <div className="feedback-log">
        <label className="check-field"><input type="checkbox" checked={includeLog} onChange={(event) => setIncludeLog(event.target.checked)} /><span><strong>Приложить технический журнал</strong><small>Ошибки и запросы к серверу за последние 15 минут — без введённого текста и данных записей.</small></span></label>
        {includeLog && <details><summary>Что входит в журнал</summary><ul>{logSummary.map((line) => <li key={line}>{line}</li>)}</ul></details>}
      </div>
      <p className="dialog-note">Обращение видят только директора компании. В GitHub попадёт обезличенный перевод.</p>
    </form>
  </Dialog>;
}

/** «Сообщить о проблеме» for the top bar (and Ctrl+Shift+F anywhere). */
export function FeedbackButton({ compact = false }: { compact?: boolean }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<Blob | null>(null);
  // The picture is taken before the dialog renders, so it shows the page and not the form.
  const start = useCallback(async () => {
    if (open || capturing) return;
    setCapturing(true);
    setScreenshot(await captureScreen());
    setCapturing(false);
    setOpen(true);
  }, [open, capturing]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); void start(); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [start]);
  return <>
    <button type="button" className={`feedback-button${compact ? ' feedback-button--compact' : ''}`} title="Сообщить о проблеме (Ctrl+Shift+F)" aria-label="Сообщить о проблеме" aria-busy={capturing || undefined} disabled={capturing} onClick={() => void start()}>
      {capturing ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <MessageSquareWarning size={17} aria-hidden="true" />}<span>Сообщить о проблеме</span>
    </button>
    {open && <FeedbackDialog page={location.pathname} screenshot={screenshot} onClose={() => { setOpen(false); setScreenshot(null); }} />}
  </>;
}
