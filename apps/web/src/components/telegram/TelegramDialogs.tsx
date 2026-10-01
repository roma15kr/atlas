import { Copy, Upload } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth, useWorkspace } from '../../context/AppContext';
import { useTelegram } from '../../context/TelegramContext';
import { formatDate } from '../../lib/format';
import type { ImportPreview, TelegramContact } from '../../lib/telegram';
import { telegramErrorMessage } from '../../lib/telegramErrors';
import { Badge, Button, Dialog, Field, SelectField } from '../ui';

function useSubmit(onDone: () => void, fallback: string) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>) => {
    setSaving(true); setError('');
    try { await action(); onDone(); } catch (reason) { setError(telegramErrorMessage(reason, fallback)); } finally { setSaving(false); }
  };
  return { saving, error, run };
}

export function BindClientDialog({ contact, onClose, onSaved }: { contact: TelegramContact; onClose: () => void; onSaved: () => void }) {
  const { backend } = useTelegram();
  const { clients } = useWorkspace();
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState(contact.client?.id ?? '');
  const { saving, error, run } = useSubmit(onSaved, 'Клиент не привязан');
  const matches = clients.filter((client) => `${client.companyName} ${client.name} ${client.phone}`.toLowerCase().includes(query.toLowerCase()));
  return <Dialog open title="Привязать к клиенту" description="Вся переписка, включая прошлые сообщения, появится в карточке клиента" onClose={onClose} footer={<>
    {contact.client && <Button variant="ghost" className="dialog-footer__start" disabled={saving} onClick={() => void run(() => backend.update(contact.id, { clientId: null }))}>Отвязать</Button>}
    <Button variant="secondary" onClick={onClose}>Отмена</Button>
    <Button type="submit" form="tg-bind-form" disabled={saving || !clientId}>Привязать</Button>
  </>}>
    <form id="tg-bind-form" className="form-grid" onSubmit={(event) => { event.preventDefault(); void run(() => backend.update(contact.id, { clientId })); }}>
      <Field label="Найти клиента" className="field--wide"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Компания, контакт или телефон" autoFocus /></Field>
      <SelectField label="Клиент" value={clientId} onChange={(event) => setClientId(event.target.value)} className="field--wide">
        <option value="">Выберите клиента</option>
        {matches.map((client) => <option key={client.id} value={client.id}>{client.companyName} · {client.name}</option>)}
      </SelectField>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function ReassignDialog({ contact, onClose, onSaved }: { contact: TelegramContact; onClose: () => void; onSaved: () => void }) {
  const { backend } = useTelegram();
  const { users } = useWorkspace();
  const { session } = useAuth();
  const me = session!.user;
  const candidates = users.filter((user) => me.role === 'DIRECTOR' || user.departmentId === me.departmentId);
  const [responsibleId, setResponsibleId] = useState(contact.responsible?.id ?? '');
  const { saving, error, run } = useSubmit(onSaved, 'Ответственный не изменён');
  return <Dialog open title="Ответственный за переписку" description={me.role === 'MANAGER' ? 'Можно назначить сотрудника вашего отдела' : 'Переписку увидят ответственный, его руководитель и директор'} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>Отмена</Button>
    <Button type="submit" form="tg-reassign-form" disabled={saving || !responsibleId || responsibleId === contact.responsible?.id}>Назначить</Button>
  </>}>
    <form id="tg-reassign-form" className="form-grid" onSubmit={(event) => { event.preventDefault(); void run(() => backend.update(contact.id, { responsibleId })); }}>
      <SelectField label="Сотрудник" value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)} className="field--wide">
        <option value="">Выберите сотрудника</option>
        {candidates.map((user) => <option key={user.id} value={user.id}>{user.fullName} · {user.department}</option>)}
      </SelectField>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function CreateClientFromTelegramDialog({ contact, onClose, onSaved }: { contact: TelegramContact; onClose: () => void; onSaved: () => void }) {
  const { backend } = useTelegram();
  const [name, setName] = useState([contact.firstName, contact.lastName].filter(Boolean).join(' '));
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const { saving, error, run } = useSubmit(onSaved, 'Клиент не создан');
  return <Dialog open title="Новый клиент из Telegram" description="Клиент будет вашим, переписка привяжется к нему" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="tg-client-form" disabled={saving || !name.trim()}>Создать клиента</Button></>}>
    <form id="tg-client-form" className="form-grid" onSubmit={(event) => { event.preventDefault(); void run(() => backend.createClient(contact.id, { name: name.trim(), companyName: companyName.trim() || undefined, phone: phone.trim() || undefined })); }}>
      <Field label="Контакт"><input value={name} required maxLength={160} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Компания"><input value={companyName} maxLength={200} onChange={(event) => setCompanyName(event.target.value)} /></Field>
      <Field label="Телефон" className="field--wide"><input value={phone} maxLength={60} onChange={(event) => setPhone(event.target.value)} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function CreateDealFromTelegramDialog({ contact, onClose, onSaved }: { contact: TelegramContact; onClose: () => void; onSaved: () => void }) {
  const { backend } = useTelegram();
  const { funnels } = useWorkspace();
  const [funnelId, setFunnelId] = useState(funnels[0]?.id ?? '');
  const [title, setTitle] = useState(`Заявка из Telegram — ${contact.displayName}`);
  const [value, setValue] = useState('0');
  const { saving, error, run } = useSubmit(onSaved, 'Сделка не создана');
  return <Dialog open title="Новая сделка из Telegram" description={`Клиент: ${contact.client?.companyName || contact.client?.name}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="tg-deal-form" disabled={saving || !funnelId || !title.trim()}>Создать сделку</Button></>}>
    <form id="tg-deal-form" className="form-grid" onSubmit={(event: FormEvent) => { event.preventDefault(); void run(() => backend.createDeal(contact.id, { funnelId, title: title.trim(), value: Number(value) || 0 })); }}>
      <Field label="Название" className="field--wide"><input value={title} required maxLength={200} onChange={(event) => setTitle(event.target.value)} /></Field>
      <SelectField label="Воронка" value={funnelId} onChange={(event) => setFunnelId(event.target.value)}>{funnels.map((funnel) => <option key={funnel.id} value={funnel.id}>{funnel.name}</option>)}</SelectField>
      <Field label="Сумма, ₴"><input type="number" min="0" step="1000" value={value} onChange={(event) => setValue(event.target.value)} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

const SAMPLE = 'telegram_id;client_email;responsible;name\n123456789;sofia@northstar.example;employee;София Тёрнер';

/** Upload a CSV, review every row, then import the valid ones. */
export function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (summary: string) => void }) {
  const { backend } = useTelegram();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const readFile = async (file: File | undefined) => { if (file) { setCsv(await file.text()); setPreview(null); } };
  const check = async () => {
    setBusy(true); setError('');
    try { setPreview(await backend.previewImport(csv)); } catch (reason) { setError(telegramErrorMessage(reason, 'Файл не прочитан')); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview) return;
    setBusy(true); setError('');
    try { const result = await backend.applyImport(preview.id); onDone(`Импортировано: ${result.applied}, с ошибками: ${result.rejected}`); }
    catch (reason) { setError(telegramErrorMessage(reason, 'Импорт не выполнен')); } finally { setBusy(false); }
  };
  const ready = preview ? preview.summary.new + preview.summary.update : 0;
  return <Dialog open size="lg" title="Импорт контактов Telegram" description="Telegram ID должны быть получены этим ботом — иначе клиенту нельзя будет написать" onClose={onClose} footer={<>
    <Button variant="secondary" className="dialog-footer__start" disabled={busy || !csv.trim()} onClick={() => void check()}>Проверить файл</Button>
    <Button variant="secondary" onClick={onClose}>Отмена</Button>
    <Button disabled={busy || !preview || !ready} onClick={() => void apply()}>{preview ? `Импортировать ${ready}` : 'Импортировать'}</Button>
  </>}>
    <div className="form-grid">
      <label className="field field--wide"><span>Файл CSV</span><span className="file-input"><Upload size={15} /><input type="file" accept=".csv,text/csv" aria-label="Файл CSV" onChange={(event) => void readFile(event.target.files?.[0])} /></span>
        <small>Колонки: telegram_id (обязательно), client_id, client_email или client_phone, responsible (логин сотрудника), name. Разделитель — запятая или точка с запятой.</small></label>
      <Field label="Или вставьте содержимое" className="field--wide"><textarea rows={5} value={csv} placeholder={SAMPLE} onChange={(event) => { setCsv(event.target.value); setPreview(null); }} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
      {preview && <div className="field--wide import-preview">
        <div className="import-preview__summary"><Badge tone="success">Новых: {preview.summary.new}</Badge><Badge tone="info">Обновить: {preview.summary.update}</Badge><Badge>Без изменений: {preview.summary.unchanged}</Badge><Badge tone="danger">Ошибок: {preview.summary.error}</Badge></div>
        <div className="table-scroll"><table className="data-table" aria-label="Предпросмотр импорта"><thead><tr><th>Строка</th><th>Telegram ID</th><th>Результат</th><th>Имя</th><th>Клиент</th><th>Ответственный</th></tr></thead>
          <tbody>{preview.rows.map((row) => <tr key={row.line} className={row.status === 'ERROR' ? 'is-error' : ''}><td>{row.line}</td><td>{row.telegramId || '—'}</td>
            <td>{row.status === 'ERROR' ? <span className="import-error">{row.error}</span> : row.status === 'NEW' ? 'Новый' : row.status === 'UPDATE' ? 'Обновится' : 'Без изменений'}</td>
            <td>{row.name ?? '—'}</td><td>{row.clientName ?? '—'}</td><td>{row.responsibleName ?? '—'}</td></tr>)}</tbody></table></div>
      </div>}
    </div>
  </Dialog>;
}

export function InviteDialog({ clientId, clientName, onClose }: { clientId: string; clientName: string; onClose: () => void }) {
  const { backend, status } = useTelegram();
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true); setError('');
    try { setInvite(await backend.invite(clientId)); } catch (reason) { setError(telegramErrorMessage(reason, 'Ссылка не создана')); } finally { setBusy(false); }
  };
  const copy = async () => { if (invite) { await navigator.clipboard?.writeText(invite.url).catch(() => undefined); setCopied(true); } };
  return <Dialog open title="Пригласить в Telegram" description={`Отправьте ссылку клиенту ${clientName} — после нажатия «Start» его переписка с @${status?.botUsername ?? 'ботом'} привяжется к карточке`} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>Закрыть</Button>
    {!invite && <Button disabled={busy || !status?.configured} onClick={() => void create()}>Создать ссылку</Button>}
  </>}>
    {!status?.configured && <p className="dialog-text">Telegram-бот не настроен на сервере.</p>}
    {invite && <div className="invite-link"><input readOnly value={invite.url} aria-label="Ссылка-приглашение" onFocus={(event) => event.target.select()} /><Button variant="secondary" icon={Copy} onClick={() => void copy()}>{copied ? 'Скопировано' : 'Копировать'}</Button>
      <small>Ссылка одноразовая и действует до {formatDate(invite.expiresAt)}.</small></div>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </Dialog>;
}
