import { CheckCircle2, ImageOff, ImagePlus, LoaderCircle, MessageSquareWarning, Send } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { diagnosticsSnapshot, summarizeDiagnostics } from '../lib/diagnostics';
import { FEEDBACK_MAX_LENGTH, feedbackError, submitFeedback } from '../lib/feedback';
import { captureScreen } from '../lib/screenshot';
import type { FeedbackKind } from '../types';
import { Button, Dialog, Field, Segmented } from './ui';
import { useTranslation } from 'react-i18next';
import { localeOf } from '../i18n';

const kinds: FeedbackKind[] = ['PROBLEM', 'COMPLAINT', 'IDEA'];

/** The report form: kind and description. Shows a confirmation with a link to «Мои обращения» once sent. */
export function FeedbackDialog({ page, screenshot, onClose }: { page: string; screenshot: Blob | null; onClose: () => void }) {
  const { t } = useTranslation('shell');
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
      setError(status === 429 ? t('feedback.tooMany') : t('feedback.failed'));
    } finally { setSending(false); }
  };

  if (sent) {
    return <Dialog open size="sm" title={t('feedback.sentTitle')} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('feedback.close')}</Button><Button onClick={() => { onClose(); navigate('/feedback'); }}>{t('feedback.mine')}</Button></>}>
      <div className="feedback-sent"><CheckCircle2 size={22} /><p>{t('feedback.sentText')}</p></div>
    </Dialog>;
  }
  return <Dialog open title={t('feedback.title')} description={t('feedback.description')} onClose={() => { if (!sending) onClose(); }}
    footer={<><Button variant="secondary" disabled={sending} onClick={onClose}>{t('feedback.cancel')}</Button><Button type="submit" form="feedback-form" icon={Send} disabled={sending}>{sending ? t('feedback.sending') : t('feedback.send')}</Button></>}>
    <form id="feedback-form" className="feedback-form" noValidate onSubmit={(event) => void send(event)}>
      <Segmented label={t('feedback.kind')} value={kind} onChange={setKind} options={kinds.map((value) => ({ value, label: t(`feedback.kinds.${value}`) }))} />
      <Field label={t('feedback.what')} hint={t('feedback.counter', { length: message.length.toLocaleString(localeOf()), max: FEEDBACK_MAX_LENGTH.toLocaleString(localeOf()), page })} error={error || undefined}>
        <textarea rows={6} maxLength={FEEDBACK_MAX_LENGTH} value={message} autoFocus aria-invalid={Boolean(error) || undefined}
          placeholder={t('feedback.placeholder')} onChange={(event) => { setMessage(event.target.value); setError(''); }} />
      </Field>
      <div className="feedback-attach">
        {screenshot && attachShot && preview
          ? <><img className="feedback-shot" src={preview} alt={t('feedback.shotAlt')} /><span><strong>{t('feedback.shotAttached')}</strong><small>{t('feedback.shotNote')}</small><Button type="button" variant="ghost" icon={ImageOff} onClick={() => setAttachShot(false)}>{t('feedback.shotRemove')}</Button></span></>
          : screenshot
            ? <span><strong>{t('feedback.shotNotAttached')}</strong><Button type="button" variant="ghost" icon={ImagePlus} onClick={() => setAttachShot(true)}>{t('feedback.shotAdd')}</Button></span>
            : <span><strong>{t('feedback.shotFailed')}</strong><small>{t('feedback.shotFailedNote')}</small></span>}
      </div>
      <div className="feedback-log">
        <label className="check-field"><input type="checkbox" checked={includeLog} onChange={(event) => setIncludeLog(event.target.checked)} /><span><strong>{t('feedback.log')}</strong><small>{t('feedback.logNote')}</small></span></label>
        {includeLog && <details><summary>{t('feedback.logContents')}</summary><ul>{logSummary.map((line) => <li key={line}>{line}</li>)}</ul></details>}
      </div>
      <p className="dialog-note">{t('feedback.privacy')}</p>
    </form>
  </Dialog>;
}

/** «Сообщить о проблеме» for the top bar (and Ctrl+Shift+F anywhere). */
export function FeedbackButton({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('shell');
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
    <button type="button" className={`feedback-button${compact ? ' feedback-button--compact' : ''}`} title={t('feedback.buttonTitle')} aria-label={t('feedback.button')} aria-busy={capturing || undefined} disabled={capturing} onClick={() => void start()}>
      {capturing ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <MessageSquareWarning size={17} aria-hidden="true" />}<span>{t('feedback.button')}</span>
    </button>
    {open && <FeedbackDialog page={location.pathname} screenshot={screenshot} onClose={() => { setOpen(false); setScreenshot(null); }} />}
  </>;
}
