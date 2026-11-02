import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pencil, RefreshCw, Send, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Dialog, Field, IconButton, PageHeader, SectionHeader, SelectField, Surface } from '../components/ui';
import { useWorkspace } from '../context/AppContext';
import { useTelegram } from '../context/TelegramContext';
import { formatDateTime } from '../lib/format';
import { telegramErrorMessage } from '../lib/telegramErrors';

type Editing = 'greeting' | 'welcome' | 'responsible' | null;

/** Director-only: bot health, greeting and welcome texts, and the default responsible user. */
export function TelegramSettingsPage() {
  const { t } = useTranslation(['telegram', 'common']);
  const { status, backend, refresh } = useTelegram();
  const { users } = useWorkspace();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Editing>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const check = async () => {
    setChecking(true); setError('');
    try { const result = await backend.checkConnection(); setNotice(`${t('settings.checked', { bot: result.botUsername, mode: result.mode === 'webhook' ? 'webhook' : t('settings.polling') })}${result.lastError ? t('settings.lastError', { error: result.lastError }) : ''}`); await refresh(); }
    catch (reason) { setError(telegramErrorMessage(reason, t('settings.checkFailed'))); } finally { setChecking(false); }
  };
  const responsible = users.find((user) => user.id === status?.defaultResponsibleId);
  const row = (label: string, value: string, key: Exclude<Editing, null>, icon = Pencil) => <div className="dialog-row">
    <span className="chat-icon">{key === 'responsible' ? <UserRound size={15} /> : <Send size={15} />}</span>
    <span><strong>{label}</strong><small className="tg-settings__text">{value}</small></span>
    <IconButton label={t('settings.edit', { label })} icon={icon} onClick={() => setEditing(key)} />
  </div>;
  return <>
    <button className="back-link" onClick={() => navigate('/telegram')}><ArrowLeft size={15} />{t('settings.back')}</button>
    <PageHeader title={t('settings.title')} description={status?.botUsername ? t('settings.bot', { bot: status.botUsername }) : t('settings.companyBot')} action={<Button icon={RefreshCw} disabled={checking || !status?.configured} onClick={() => void check()}>{checking ? t('settings.checking') : t('settings.check')}</Button>} />
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>{t('common:actions.close')}</button></div>}
    {notice && <div className="notice notice--info" role="status">{notice}<button onClick={() => setNotice('')}>{t('common:actions.close')}</button></div>}
    <div className="tg-settings">
      <Surface className="tg-settings__card">
        <SectionHeader title={t('settings.connection')} meta={status?.configured ? status.lastError ? <Badge tone="warning">{t('settings.hasErrors')}</Badge> : <Badge tone="success">{t('settings.works')}</Badge> : <Badge>{t('settings.notSet')}</Badge>} />
        <dl className="dialog-facts"><div><dt>{t('settings.botLabel')}</dt><dd>{status?.botUsername ? `@${status.botUsername}` : '—'}</dd></div><div><dt>{t('settings.mode')}</dt><dd>{status?.mode === 'polling' ? t('settings.pollingMode') : 'Webhook'}</dd></div><div><dt>{t('settings.lastMessage')}</dt><dd>{status?.lastUpdateAt ? formatDateTime(status.lastUpdateAt) : '—'}</dd></div></dl>
        {status?.lastError && <div className="form-error">{t('settings.telegramError', { error: status.lastError })}</div>}
      </Surface>
      <Surface className="tg-settings__card">
        <SectionHeader title={t('settings.texts')} />
        <div className="dialog-rows">
          {row(t('settings.greeting'), status?.greetingText ?? '—', 'greeting')}
          {row(t('settings.welcome'), status?.welcomeText ?? '—', 'welcome')}
          {row(t('settings.responsible'), responsible ? t('settings.responsibleSet', { name: responsible.fullName }) : t('settings.responsibleNone'), 'responsible')}
        </div>
      </Surface>
    </div>
    {editing && <SettingDialog field={editing} onClose={() => setEditing(null)} />}
  </>;
}

function SettingDialog({ field, onClose }: { field: Exclude<Editing, null>; onClose: () => void }) {
  const { t } = useTranslation(['telegram', 'common']);
  const { status, backend, refresh } = useTelegram();
  const { users } = useWorkspace();
  const initial = field === 'greeting' ? status?.greetingText : field === 'welcome' ? status?.welcomeText : status?.defaultResponsibleId;
  const [value, setValue] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await backend.updateSettings(field === 'greeting' ? { greetingText: value.trim() } : field === 'welcome' ? { welcomeText: value.trim() } : { defaultResponsibleId: value || null });
      await refresh(); onClose();
    } catch (reason) { setError(telegramErrorMessage(reason, t('settings.saveFailed'))); } finally { setSaving(false); }
  };
  const title = field === 'greeting' ? t('settings.greeting') : field === 'welcome' ? t('settings.welcomeShort') : t('settings.responsible');
  return <Dialog open title={title} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="tg-setting-form" disabled={saving || (field !== 'responsible' && !value.trim())}>{t('common:actions.save')}</Button></>}>
    <form id="tg-setting-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      {field === 'responsible'
        ? <SelectField label={t('settings.employee')} value={value} onChange={(event) => setValue(event.target.value)} className="field--wide"><option value="">{t('settings.notAssigned')}</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName} · {user.department}</option>)}</SelectField>
        : <Field label={t('settings.text')} className="field--wide" hint={`${value.length} / 1000`}><textarea rows={4} maxLength={1000} value={value} onChange={(event) => setValue(event.target.value)} autoFocus /></Field>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}
