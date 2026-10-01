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
  const { status, backend, refresh } = useTelegram();
  const { users } = useWorkspace();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Editing>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const check = async () => {
    setChecking(true); setError('');
    try { const result = await backend.checkConnection(); setNotice(`Бот @${result.botUsername} на связи · режим ${result.mode === 'webhook' ? 'webhook' : 'опрос'}${result.lastError ? ` · последняя ошибка: ${result.lastError}` : ''}`); await refresh(); }
    catch (reason) { setError(telegramErrorMessage(reason, 'Проверка не удалась')); } finally { setChecking(false); }
  };
  const responsible = users.find((user) => user.id === status?.defaultResponsibleId);
  const row = (label: string, value: string, key: Exclude<Editing, null>, icon = Pencil) => <div className="dialog-row">
    <span className="chat-icon">{key === 'responsible' ? <UserRound size={15} /> : <Send size={15} />}</span>
    <span><strong>{label}</strong><small className="tg-settings__text">{value}</small></span>
    <IconButton label={`Изменить: ${label}`} icon={icon} onClick={() => setEditing(key)} />
  </div>;
  return <>
    <button className="back-link" onClick={() => navigate('/telegram')}><ArrowLeft size={15} />К Telegram</button>
    <PageHeader title="Настройки Telegram" description={status?.botUsername ? `Бот @${status.botUsername}` : 'Бот компании'} action={<Button icon={RefreshCw} disabled={checking || !status?.configured} onClick={() => void check()}>{checking ? 'Проверяем…' : 'Проверить подключение'}</Button>} />
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>Закрыть</button></div>}
    {notice && <div className="notice notice--info" role="status">{notice}<button onClick={() => setNotice('')}>Закрыть</button></div>}
    <div className="tg-settings">
      <Surface className="tg-settings__card">
        <SectionHeader title="Подключение" meta={status?.configured ? status.lastError ? <Badge tone="warning">Есть ошибки</Badge> : <Badge tone="success">Работает</Badge> : <Badge>Не настроен</Badge>} />
        <dl className="dialog-facts"><div><dt>Бот</dt><dd>{status?.botUsername ? `@${status.botUsername}` : '—'}</dd></div><div><dt>Режим</dt><dd>{status?.mode === 'polling' ? 'Опрос (без HTTPS)' : 'Webhook'}</dd></div><div><dt>Последнее сообщение</dt><dd>{status?.lastUpdateAt ? formatDateTime(status.lastUpdateAt) : '—'}</dd></div></dl>
        {status?.lastError && <div className="form-error">Telegram сообщил об ошибке: {status.lastError}</div>}
      </Surface>
      <Surface className="tg-settings__card">
        <SectionHeader title="Тексты и маршрутизация" />
        <div className="dialog-rows">
          {row('Приветствие новому клиенту', status?.greetingText ?? '—', 'greeting')}
          {row('Сообщение после ссылки-приглашения', status?.welcomeText ?? '—', 'welcome')}
          {row('Ответственный по умолчанию', responsible ? `${responsible.fullName} — получает переписки от новых клиентов` : 'Не назначен — новые клиенты попадают в «Неразобранные»', 'responsible')}
        </div>
      </Surface>
    </div>
    {editing && <SettingDialog field={editing} onClose={() => setEditing(null)} />}
  </>;
}

function SettingDialog({ field, onClose }: { field: Exclude<Editing, null>; onClose: () => void }) {
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
    } catch (reason) { setError(telegramErrorMessage(reason, 'Настройка не сохранена')); } finally { setSaving(false); }
  };
  const title = field === 'greeting' ? 'Приветствие новому клиенту' : field === 'welcome' ? 'Сообщение после приглашения' : 'Ответственный по умолчанию';
  return <Dialog open title={title} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="tg-setting-form" disabled={saving || (field !== 'responsible' && !value.trim())}>Сохранить</Button></>}>
    <form id="tg-setting-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      {field === 'responsible'
        ? <SelectField label="Сотрудник" value={value} onChange={(event) => setValue(event.target.value)} className="field--wide"><option value="">Не назначен</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName} · {user.department}</option>)}</SelectField>
        : <Field label="Текст" className="field--wide" hint={`${value.length} / 1000`}><textarea rows={4} maxLength={1000} value={value} onChange={(event) => setValue(event.target.value)} autoFocus /></Field>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}
