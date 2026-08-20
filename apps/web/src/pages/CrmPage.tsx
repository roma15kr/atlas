import { Building2, Download, Filter, Mail, MoreHorizontal, Pencil, Phone, Plus, Search, UserRound, UsersRound } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Dialog, EmptyState, Field, IconButton, PageHeader, SelectField, Surface } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { formatDateTime } from '../lib/format';
import { api } from '../lib/api';
import type { Client } from '../types';

const statusMeta: Record<Client['status'], { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  ACTIVE: { label: 'Активный', tone: 'success' }, NEW: { label: 'Новый', tone: 'info' }, PAUSED: { label: 'На паузе', tone: 'neutral' },
};

export function CrmPage() {
  const { session } = useAuth();
  const { clients, users, addClient } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [owner, setOwner] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportError, setExportError] = useState('');
  const [formError, setFormError] = useState('');
  const visible = useMemo(() => clients.filter((client) => {
    const haystack = `${client.name} ${client.companyName} ${client.email} ${client.phone}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (status === 'ALL' || client.status === status) && (owner === 'ALL' || client.ownerId === owner);
  }), [clients, query, status, owner]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const ownerId = String(form.get('ownerId'));
    setSaving(true); setFormError('');
    try {
      const created = await addClient({ name: String(form.get('name')), companyName: String(form.get('companyName')), email: String(form.get('email')), phone: String(form.get('phone')), source: String(form.get('source')), status: form.get('status') as Client['status'], ownerId, ownerName: users.find((user) => user.id === ownerId)?.fullName ?? session!.user.fullName, notes: String(form.get('notes') ?? '') });
      setDialogOpen(false); navigate(`/crm/${created.id}`);
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Карточка не создана'); }
    finally { setSaving(false); }
  };

  const exportCsv = async () => {
    setExportError('');
    try {
      const blob = await api.download('/clients/export.csv');
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `atlas-clients-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : 'Экспорт не выполнен'); }
  };

  return <>
    <PageHeader title="Клиенты" description={`${clients.length} карточек в доступной области`} action={<><Button variant="secondary" icon={Filter} className="mobile-filter-button">Фильтры</Button>{session!.user.role === 'DIRECTOR' && <Button variant="secondary" icon={Download} onClick={() => void exportCsv()}>Экспорт</Button>}<Button icon={Plus} onClick={() => setDialogOpen(true)}>Добавить клиента</Button></>} />
    {exportError && <div className="notice notice--danger" role="alert">{exportError}<button onClick={() => setExportError('')}>Закрыть</button></div>}
    <Surface className="table-surface">
      <div className="table-toolbar"><label className="table-search"><Search size={16} /><input aria-label="Поиск клиентов" placeholder="Имя, компания, email или телефон" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="table-filters"><select aria-label="Статус" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Все статусы</option><option value="NEW">Новые</option><option value="ACTIVE">Активные</option><option value="PAUSED">На паузе</option></select>{session!.user.role !== 'EMPLOYEE' && <select aria-label="Ответственный" value={owner} onChange={(event) => setOwner(event.target.value)}><option value="ALL">Все ответственные</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select>}</div><span className="table-count">Найдено: {visible.length}</span></div>
      {visible.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Клиент</th><th>Контакты</th><th>Источник</th><th>Статус</th><th>Ответственный</th><th>Обновлено</th><th aria-label="Действия" /></tr></thead><tbody>{visible.map((client) => <tr key={client.id} onDoubleClick={() => navigate(`/crm/${client.id}`)}><td><button className="client-cell" onClick={() => navigate(`/crm/${client.id}`)}><span className="company-avatar"><Building2 size={17} /></span><span><strong>{client.companyName}</strong><small>{client.name}</small></span></button></td><td><span className="contact-cell"><span><Mail size={13} />{client.email}</span><span><Phone size={13} />{client.phone}</span></span></td><td>{client.source}</td><td><Badge tone={statusMeta[client.status].tone}>{statusMeta[client.status].label}</Badge></td><td><span className="owner-cell"><Avatar name={client.ownerName} size="sm" />{client.ownerName}</span></td><td>{formatDateTime(client.updatedAt)}</td><td><IconButton label="Открыть карточку" icon={MoreHorizontal} onClick={() => navigate(`/crm/${client.id}`)} /></td></tr>)}</tbody></table></div> : <EmptyState title="Клиенты не найдены" description="Измените фильтры или добавьте новую карточку" icon={UsersRound} action={<Button icon={Plus} onClick={() => setDialogOpen(true)}>Добавить клиента</Button>} />}
    </Surface>
    <Dialog open={dialogOpen} title="Новый клиент" description="Контакты и ответственный сотрудник" size="lg" onClose={() => setDialogOpen(false)} footer={<><Button variant="secondary" onClick={() => setDialogOpen(false)}>Отмена</Button><Button form="client-form" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Создать карточку'}</Button></>}><form id="client-form" className="form-grid" onSubmit={(event) => void submit(event)}><Field label="Компания"><input name="companyName" required placeholder="Название компании" /></Field><Field label="Контактное лицо"><input name="name" required placeholder="Имя и фамилия" /></Field><Field label="Email"><input name="email" type="email" required placeholder="name@company.ru" /></Field><Field label="Телефон"><input name="phone" type="tel" required placeholder="+7 900 000-00-00" /></Field><Field label="Источник"><input name="source" required placeholder="Сайт, рекомендация…" /></Field><SelectField label="Статус" name="status" defaultValue="NEW"><option value="NEW">Новый</option><option value="ACTIVE">Активный</option><option value="PAUSED">На паузе</option></SelectField><SelectField label="Ответственный" name="ownerId" defaultValue={session!.user.id}>{users.map((user) => <option value={user.id} key={user.id}>{user.fullName}</option>)}</SelectField><Field label="Комментарий" className="field--wide"><textarea name="notes" rows={3} placeholder="Контекст, договорённости, следующий шаг" /></Field>{formError && <div className="form-error field--wide" role="alert">{formError}</div>}</form></Dialog>
  </>;
}
