import { useIsPhone } from '../lib/useIsPhone';
import { ArrowLeft, Send, BriefcaseBusiness, CalendarDays, ExternalLink, FileText, Mail, MessageSquare, Pencil, Phone, Plus, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClientComments } from '../components/ClientComments';
import { ClientCorrespondence } from '../components/mail/ClientCorrespondence';
import { fitsLimit, RichTextEditor } from '../components/richtext/RichTextEditor';
import { RichTextView } from '../components/richtext/RichTextView';
import { InviteDialog } from '../components/telegram/TelegramDialogs';
import { Avatar, Badge, Button, Dialog, EmptyState, Field, PageHeader, SectionHeader, SelectField, Surface } from '../components/ui';
import { useWorkspace } from '../context/AppContext';
import { formatDate, formatMoney } from '../lib/format';
import type { Client } from '../types';

export function ClientPage() {
  const { t } = useTranslation(['crm', 'common']);
  const phone = useIsPhone();
  const { id } = useParams(); const navigate = useNavigate();
  const { clients, users, deals, documents, updateClient } = useWorkspace();
  const [editOpen, setEditOpen] = useState(false); const [inviteOpen, setInviteOpen] = useState(false); const [saving, setSaving] = useState(false); const [formError, setFormError] = useState(''); const [notesDraft, setNotesDraft] = useState('');
  const client = clients.find((item) => item.id === id);
  if (!client) return <Navigate to="/crm" replace />;
  const clientDeals = deals.filter((deal) => deal.clientId === client.id);
  const openEdit = () => { setNotesDraft(client.notes ?? ''); setFormError(''); setEditOpen(true); };
  // Ticking a checklist item in the notes saves the notes straight away.
  const tickNotes = async (notes: string) => { try { await updateClient(client.id, { notes }); } catch (reason) { setFormError(reason instanceof Error ? reason.message : t('card.markFailed')); } };
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const ownerId = String(form.get('ownerId')); setSaving(true); setFormError(''); try { await updateClient(client.id, { name: String(form.get('name')), companyName: String(form.get('companyName')), email: String(form.get('email')), phone: String(form.get('phone')), source: String(form.get('source')), status: form.get('status') as Client['status'], ownerId, ownerName: users.find((user) => user.id === ownerId)?.fullName ?? client.ownerName, notes: notesDraft.trim() }); setEditOpen(false); } catch (reason) { setFormError(reason instanceof Error ? reason.message : t('card.saveFailed')); } finally { setSaving(false); } };

  return <>
    <button className="back-link" onClick={() => navigate('/crm')}><ArrowLeft size={15} />{t('card.back')}</button>
    <PageHeader title={client.companyName} description={t('card.description', { name: client.name })} action={<><Button variant="secondary" icon={Send} onClick={() => setInviteOpen(true)}>{t('card.invite')}</Button><Button variant="secondary" icon={MessageSquare} onClick={() => navigate(`/mail?compose=1&to=${encodeURIComponent(client.email)}&name=${encodeURIComponent(client.name)}&client=${client.id}`)}>{t('card.write')}</Button><Button icon={Pencil} onClick={openEdit}>{t('card.edit')}</Button></>} />
    {phone && (client.phone || client.email) && <div className="phone-actions">
      {client.phone && <a className="button button--primary" href={`tel:${client.phone.replace(/[^+\d]/g, '')}`}><Phone size={17} aria-hidden />{t('card.call')}</a>}
      {client.email && <a className="button button--secondary" href={`mailto:${client.email}`}><Mail size={17} aria-hidden />Email</a>}
    </div>}
    <div className="client-detail-grid">
      <Surface className="client-overview"><div className="client-hero"><span className="company-avatar company-avatar--lg"><BriefcaseBusiness size={24} /></span><div><h2>{client.companyName}</h2><span><Badge tone={client.status === 'ACTIVE' ? 'success' : client.status === 'NEW' ? 'info' : 'neutral'}>{t(`status.${client.status}`)}</Badge><small>{t('card.source', { source: client.source })}</small></span></div></div><dl className="detail-list"><div><dt><UserRound size={15} />{t('card.contact')}</dt><dd>{client.name}</dd></div><div><dt><Mail size={15} />Email</dt><dd>{client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : '—'}</dd></div><div><dt><Phone size={15} />{t('form.phone')}</dt><dd><a href={`tel:${client.phone}`}>{client.phone}</a></dd></div><div><dt><UserRound size={15} />{t('list.owner')}</dt><dd><Avatar name={client.ownerName} size="sm" />{client.ownerName}</dd></div></dl><div className="notes-block"><span>{t('card.note')}</span>{client.notes ? <RichTextView markdown={client.notes} onChange={tickNotes} /> : <p>{t('card.noNote')}</p>}</div></Surface>
      <Surface className="client-deals"><SectionHeader title={t('card.deals')} meta={<Badge tone="info">{clientDeals.length}</Badge>} action={<Button variant="secondary" icon={Plus} onClick={() => navigate('/sales')}>{t('card.newDeal')}</Button>} />{clientDeals.length ? <div className="deal-list">{clientDeals.map((deal) => <button key={deal.id} onClick={() => navigate('/sales')}><span><strong>{deal.title}</strong><small><i className="stage-dot" style={{ background: deal.stage.color }} />{deal.stage.name} · <CalendarDays size={13} /> {t('card.until', { date: formatDate(deal.expectedCloseAt) })}</small></span><span><strong>{formatMoney(deal.value, deal.currency)}</strong><Badge tone={deal.probability >= 80 ? 'success' : 'warning'}>{deal.probability}%</Badge></span></button>)}</div> : <EmptyState title={t('card.noDealsTitle')} description={t('card.noDeals')} icon={BriefcaseBusiness} />}</Surface>
      <ClientComments clientId={client.id} />
      <ClientCorrespondence clientId={client.id} deals={clientDeals} />
      <Surface className="client-files"><SectionHeader title={t('card.files')} action={<button className="text-button" onClick={() => navigate('/documents')}>{t('card.allDocuments')} <ExternalLink size={13} /></button>} /><div className="compact-files">{documents.slice(0, 3).map((document) => <button key={document.id} onClick={() => navigate('/documents')}><span className="file-icon"><FileText size={17} /></span><span><strong>{document.title}</strong><small>{t('card.version', { version: document.version, date: formatDate(document.updatedAt) })}</small></span></button>)}</div></Surface>
    </div>
    {inviteOpen && <InviteDialog clientId={client.id} clientName={client.name} onClose={() => setInviteOpen(false)} />}
    <Dialog open={editOpen} title={t('form.editTitle')} onClose={() => setEditOpen(false)} size="lg" footer={<><Button variant="secondary" onClick={() => setEditOpen(false)}>{t('common:actions.cancel')}</Button><Button form="edit-client" type="submit" disabled={saving || !fitsLimit(notesDraft.trim(), 10_000)}>{saving ? t('common:actions.saving') : t('common:actions.save')}</Button></>}><form id="edit-client" className="form-grid" onSubmit={(event) => void save(event)}><Field label={t('form.company')}><input name="companyName" defaultValue={client.companyName} required /></Field><Field label={t('card.contact')}><input name="name" defaultValue={client.name} required /></Field><Field label="Email" hint={t('common:optional')}><input name="email" type="email" defaultValue={client.email} /></Field><Field label={t('form.phone')}><input name="phone" defaultValue={client.phone} required /></Field><Field label={t('form.source')}><input name="source" defaultValue={client.source} required /></Field><SelectField label={t('list.status')} name="status" defaultValue={client.status}><option value="NEW">{t('status.NEW')}</option><option value="ACTIVE">{t('status.ACTIVE')}</option><option value="PAUSED">{t('status.PAUSED')}</option></SelectField><SelectField label={t('list.owner')} name="ownerId" defaultValue={client.ownerId}>{users.map((user) => <option value={user.id} key={user.id}>{user.fullName}</option>)}</SelectField><div className="field--wide rich-field"><span className="rich-field__label">{t('card.note')}</span><RichTextEditor value={notesDraft} onChange={setNotesDraft} maxLength={10_000} label={t('card.note')} placeholder={t('form.notePlaceholder')} /></div>{formError && <div className="form-error field--wide" role="alert">{formError}</div>}</form></Dialog>
  </>;
}
