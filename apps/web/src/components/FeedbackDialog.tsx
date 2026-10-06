import { CheckCircle2, MessageSquareWarning, Send } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FEEDBACK_MAX_LENGTH, feedbackError, submitFeedback } from '../lib/feedback';
import type { FeedbackKind } from '../types';
import { Button, Dialog, Field, Segmented } from './ui';

const kinds: Array<{ value: FeedbackKind; label: string }> = [
  { value: 'PROBLEM', label: 'Проблема' }, { value: 'COMPLAINT', label: 'Жалоба' }, { value: 'IDEA', label: 'Идея' },
];

/** The report form: kind and description. Shows a confirmation with a link to «Мои обращения» once sent. */
export function FeedbackDialog({ page, onClose }: { page: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<FeedbackKind>('PROBLEM');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const invalid = feedbackError(message);
    if (invalid) { setError(invalid); return; }
    setSending(true); setError('');
    try { await submitFeedback({ kind, message, page }); setSent(true); }
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
      <p className="dialog-note">Обращение видят только директора компании. В GitHub попадёт обезличенный перевод.</p>
    </form>
  </Dialog>;
}

/** «Сообщить о проблеме» for the top bar (and Ctrl+Shift+F anywhere). */
export function FeedbackButton({ compact = false }: { compact?: boolean }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  return <>
    <button type="button" className={`feedback-button${compact ? ' feedback-button--compact' : ''}`} title="Сообщить о проблеме (Ctrl+Shift+F)" aria-label="Сообщить о проблеме" onClick={() => setOpen(true)}>
      <MessageSquareWarning size={17} aria-hidden="true" /><span>Сообщить о проблеме</span>
    </button>
    {open && <FeedbackDialog page={location.pathname} onClose={() => setOpen(false)} />}
  </>;
}
