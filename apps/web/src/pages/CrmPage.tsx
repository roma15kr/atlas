import { Building2, Download, Filter, Mail, MoreHorizontal, Phone, Plus, Search, UsersRound } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Dialog, EmptyState, Field, IconButton, PageHeader, SelectField, Surface } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { formatDateTime } from '../lib/format';
import { api } from '../lib/api';
import type { Client } from '../types';

const statusMeta: Record<Client['status'], { tone: 'success' | 'info' | 'neutral' }> = {
  ACTIVE: { tone: 'success' }, NEW: { tone: 'info' }, PAUSED: { tone: 'neutral' },
};

export function CrmPage() {
  const { t } = useTranslation(['crm', 'common']);
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
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : t('form.createFailed')); }
    finally { setSaving(false); }
  };

  const exportCsv = async () => {
    setExportError('');
    try {
      const blob = await api.download('/clients/export.csv');
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `atlas-clients-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : t('list.exportFailed')); }
  };

  return <>
    <PageHeader title={t('list.title')} description={t('list.description', { count: clients.length })} action={<><Button variant="secondary" icon={Filter} className="mobile-filter-button">{t('list.filters')}</Button>{session!.user.role === 'DIRECTOR' && <Button variant="secondary" icon={Download} onClick={() => void exportCsv()}>{t('list.export')}</Button>}<Button icon={Plus} onClick={() => setDialogOpen(true)}>{t('list.add')}</Button></>} />
    {exportError && <div className="notice notice--danger" role="alert">{exportError}<button onClick={() => setExportError('')}>{t('common:actions.close')}</button></div>}
    <Surface className="table-surface">
      <div className="table-toolbar"><label className="table-search"><Search size={16} /><input aria-label={t('list.search')} placeholder={t('list.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="table-filters"><select aria-label={t('list.status')} value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">{t('list.allStatuses')}</option><option value="NEW">{t('statusFilter.NEW')}</option><option value="ACTIVE">{t('statusFilter.ACTIVE')}</option><option value="PAUSED">{t('statusFilter.PAUSED')}</option></select>{session!.user.role !== 'EMPLOYEE' && <select aria-label={t('list.owner')} value={owner} onChange={(event) => setOwner(event.target.value)}><option value="ALL">{t('list.allOwners')}</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select>}</div><span className="table-count">{t('list.found', { count: visible.length })}</span></div>
      {visible.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t('list.client')}</th><th>{t('list.contacts')}</th><th>{t('list.source')}</th><th>{t('list.status')}</th><th>{t('list.owner')}</th><th>{t('list.updated')}</th><th aria-label={t('list.actions')} /></tr></thead><tbody>{visible.map((client) => <tr key={client.id} onDoubleClick={() => navigate(`/crm/${client.id}`)}><td><button className="client-cell" onClick={() => navigate(`/crm/${client.id}`)}><span className="company-avatar"><Building2 size={17} /></span><span><strong>{client.companyName}</strong><small>{client.name}</small></span></button></td><td><span className="contact-cell"><span><Mail size={13} />{client.email}</span><span><Phone size={13} />{client.phone}</span></span></td><td>{client.source}</td><td><Badge tone={statusMeta[client.status].tone}>{t(`status.${client.status}`)}</Badge></td><td><span className="owner-cell"><Avatar name={client.ownerName} size="sm" />{client.ownerName}</span></td><td>{formatDateTime(client.updatedAt)}</td><td><IconButton label={t('list.open')} icon={MoreHorizontal} onClick={() => navigate(`/crm/${client.id}`)} /></td></tr>)}</tbody></table></div> : <EmptyState title={t('list.emptyTitle')} description={t('list.emptyText')} icon={UsersRound} action={<Button icon={Plus} onClick={() => setDialogOpen(true)}>{t('list.add')}</Button>} />}
    </Surface>
    <Dialog open={dialogOpen} title={t('form.newTitle')} description={t('form.newDescription')} size="lg" onClose={() => setDialogOpen(false)} footer={<><Button variant="secondary" onClick={() => setDialogOpen(false)}>{t('common:actions.cancel')}</Button><Button form="client-form" type="submit" disabled={saving}>{saving ? t('common:actions.saving') : t('form.create')}</Button></>}><form id="client-form" className="form-grid" onSubmit={(event) => void submit(event)}><Field label={t('form.company')}><input name="companyName" required placeholder={t('form.companyPlaceholder')} /></Field><Field label={t('form.contact')}><input name="name" required placeholder={t('form.contactPlaceholder')} /></Field><Field label="Email" hint={t('common:optional')}><input name="email" type="email" placeholder="name@company.ua" /></Field><Field label={t('form.phone')}><input name="phone" type="tel" required placeholder="+380 67 000 00 00" /></Field><Field label={t('list.source')}><input name="source" required placeholder={t('form.sourcePlaceholder')} /></Field><SelectField label={t('list.status')} name="status" defaultValue="NEW"><option value="NEW">{t('status.NEW')}</option><option value="ACTIVE">{t('status.ACTIVE')}</option><option value="PAUSED">{t('status.PAUSED')}</option></SelectField><SelectField label={t('list.owner')} name="ownerId" defaultValue={session!.user.id}>{users.map((user) => <option value={user.id} key={user.id}>{user.fullName}</option>)}</SelectField><Field label={t('form.comment')} className="field--wide"><textarea name="notes" rows={3} placeholder={t('form.notePlaceholder')} /></Field>{formError && <div className="form-error field--wide" role="alert">{formError}</div>}</form></Dialog>
  </>;
}
