import { CalendarDays, GripVertical, Layers, MoreHorizontal, NotebookText, Pencil, Plus, Settings2, SlidersHorizontal, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fitsLimit, RichTextEditor } from '../components/richtext/RichTextEditor';
import { RichTextView } from '../components/richtext/RichTextView';
import { Badge, Button, Dialog, EmptyState, Field, IconButton, PageHeader, SelectField } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { firstName, formatDate, formatMoney } from '../lib/format';
import { funnelErrorMessage } from '../lib/funnelErrors';
import type { Deal, DealPatch, DealStage, Funnel } from '../types';

const funnelKey = (userId: string) => `atlas.sales.funnel.${userId}`;
/** Characters of Markdown in deal notes (the API limit). */
const NOTES_LIMIT = 10_000;

function rememberedFunnel(userId: string): string | null {
  try { return localStorage.getItem(funnelKey(userId)); } catch { return null; }
}

function rememberFunnel(userId: string, funnelId: string): void {
  try { localStorage.setItem(funnelKey(userId), funnelId); } catch { /* selection is a convenience only */ }
}

export function SalesPage() {
  const { t } = useTranslation(['sales', 'common']);
  const { session } = useAuth();
  const { deals, funnels, clients, users, moveDeal, addDeal } = useWorkspace();
  const navigate = useNavigate();
  const user = session!.user;
  const [selectedId, setSelectedId] = useState<string | null>(() => rememberedFunnel(user.id));
  const [dealOpen, setDealOpen] = useState(false);
  const [notesDealId, setNotesDealId] = useState<string | null>(null);
  const [owner, setOwner] = useState('ALL'); const [saving, setSaving] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isDirector = user.role === 'DIRECTOR';
  const funnel = funnels.find((item) => item.id === selectedId) ?? funnels[0];
  // A notification links here with ?deal=<id>: show the deal's funnel and open the deal, then drop the parameter.
  const [params, setParams] = useSearchParams();
  const linkedDeal = params.get('deal');
  useEffect(() => {
    if (!linkedDeal) return;
    const deal = deals.find((item) => item.id === linkedDeal);
    if (!deal) return;
    setSelectedId(deal.funnelId);
    setNotesDealId(deal.id);
    setParams((current) => { current.delete('deal'); return current; }, { replace: true });
  }, [linkedDeal, deals, setParams]);

  useEffect(() => { if (funnel) rememberFunnel(user.id, funnel.id); }, [funnel, user.id]);

  const stages = funnel?.stages ?? [];
  const visibleDeals = useMemo(() => deals.filter((deal) => deal.funnelId === funnel?.id && (owner === 'ALL' || deal.ownerId === owner)), [deals, funnel, owner]);
  const total = visibleDeals.filter((deal) => deal.stage.outcome === 'OPEN').reduce((sum, deal) => sum + deal.value, 0);

  const changeDeal = async (id: string, stageId: string) => { setError(''); try { await moveDeal(id, stageId); } catch (reason) { setError(funnelErrorMessage(reason, t('page.moveFailed'))); } };
  const drop = (event: DragEvent, stageId: string) => { event.preventDefault(); if (dragged) void changeDeal(dragged, stageId); setDragged(null); };
  const saveDeal = async (input: Omit<Deal, 'id'>) => {
    setSaving(true); setError('');
    try { await addDeal(input); setSelectedId(input.funnelId); setDealOpen(false); }
    catch (reason) { setError(funnelErrorMessage(reason, t('form.createFailed'))); }
    finally { setSaving(false); }
  };

  const notesDeal = notesDealId ? deals.find((deal) => deal.id === notesDealId) ?? null : null;
  const funnelSwitcher = funnels.length > 1 && <label className="compact-select"><Layers size={15} /><select aria-label={t('page.funnel')} value={funnel?.id} onChange={(event) => setSelectedId(event.target.value)}>{funnels.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>;

  return <>
    <PageHeader title={funnel?.name ?? t('page.title')} description={t('page.description', { count: visibleDeals.length, total: formatMoney(total) })} action={<>{funnelSwitcher}{user.role !== 'EMPLOYEE' && <label className="compact-select"><UserRound size={15} /><select aria-label={t('page.owner')} value={owner} onChange={(event) => setOwner(event.target.value)}><option value="ALL">{t('page.allTeam')}</option>{users.map((member) => <option value={member.id} key={member.id}>{member.fullName}</option>)}</select></label>}{isDirector && <IconButton label={t('page.configure')} icon={Settings2} onClick={() => navigate('/sales/settings')} />}{funnel && <Button icon={Plus} onClick={() => setDealOpen(true)}>{t('page.newDeal')}</Button>}</>} />
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>{t('common:actions.close')}</button></div>}
    {!funnel ? <EmptyState title={t('page.noFunnelsTitle')} description={isDirector ? t('page.noFunnelsDirector') : t('page.noFunnelsOther')} icon={SlidersHorizontal} action={isDirector ? <Button icon={Settings2} onClick={() => navigate('/sales/settings')}>{t('page.configure')}</Button> : undefined} />
      : <div className="kanban kanban--sales">{stages.map((stage) => { const items = visibleDeals.filter((deal) => deal.stage.id === stage.id); const sum = items.reduce((value, deal) => value + deal.value, 0); return <section className="kanban-column" key={stage.id} aria-label={stage.name} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, stage.id)}><header style={{ '--stage-color': stage.color } as React.CSSProperties}><div><i /><strong>{stage.name}</strong><Badge>{items.length}</Badge>{stage.outcome !== 'OPEN' && <Badge tone={stage.outcome === 'WON' ? 'success' : 'danger'}>{stage.outcome === 'WON' ? t('page.won') : t('page.lost')}</Badge>}</div><span>{formatMoney(sum)}</span></header><div className="kanban-column__body">{items.map((deal) => <DealCard key={deal.id} deal={deal} stages={stages} onDrag={() => setDragged(deal.id)} onMove={(next) => void changeDeal(deal.id, next)} onOpen={() => setNotesDealId(deal.id)} />)}{!items.length && <div className="kanban-empty">{t('page.noDeals')}</div>}<button className="kanban-add" onClick={() => setDealOpen(true)}><Plus size={15} />{t('page.addDeal')}</button></div></section>; })}</div>}
    {notesDeal && <DealDetailsDialog deal={notesDeal} onClose={() => setNotesDealId(null)} />}
    {dealOpen && funnel && <DealDialog funnels={funnels} initialFunnelId={funnel.id} saving={saving} onClose={() => setDealOpen(false)} onSave={(input) => void saveDeal(input)} clients={clients} users={users} currentUser={user} />}
  </>;
}

function DealDialog({ funnels, initialFunnelId, saving, onClose, onSave, clients, users, currentUser }: {
  funnels: Funnel[]; initialFunnelId: string; saving: boolean; onClose: () => void; onSave: (input: Omit<Deal, 'id'>) => void;
  clients: ReturnType<typeof useWorkspace>['clients']; users: ReturnType<typeof useWorkspace>['users']; currentUser: ReturnType<typeof useWorkspace>['users'][number];
}) {
  const { t } = useTranslation(['sales', 'common']);
  const [funnelId, setFunnelId] = useState(initialFunnelId);
  const stages = funnels.find((item) => item.id === funnelId)?.stages ?? [];
  const firstOpen = stages.find((stage) => stage.outcome === 'OPEN') ?? stages[0];
  const [stageId, setStageId] = useState(firstOpen?.id ?? '');
  const [notes, setNotes] = useState('');
  const changeFunnel = (next: string) => {
    setFunnelId(next);
    const nextStages = funnels.find((item) => item.id === next)?.stages ?? [];
    setStageId((nextStages.find((stage) => stage.outcome === 'OPEN') ?? nextStages[0])?.id ?? '');
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const clientId = String(form.get('clientId')); const ownerId = String(form.get('ownerId'));
    const stage = stages.find((item) => item.id === stageId)!;
    onSave({
      clientId, title: String(form.get('title')), companyName: clients.find((client) => client.id === clientId)?.companyName ?? '',
      ownerId, ownerName: users.find((member) => member.id === ownerId)?.fullName ?? currentUser.fullName,
      funnelId, stage: { id: stage.id, name: stage.name, color: stage.color, outcome: stage.outcome },
      value: Number(form.get('value')), currency: 'UAH', probability: Number(form.get('probability')),
      expectedCloseAt: new Date(String(form.get('expectedCloseAt'))).toISOString(),
      notes: notes.trim() || null,
    });
  };
  return <Dialog open title={t('page.newDeal')} description={t('form.description')} size="lg" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="deal-form" disabled={saving || !stageId || !fitsLimit(notes.trim(), NOTES_LIMIT)}>{saving ? t('common:actions.saving') : t('form.create')}</Button></>}><form id="deal-form" className="form-grid" onSubmit={submit}><Field label={t('form.title')} className="field--wide"><input name="title" required placeholder={t('form.titlePlaceholder')} /></Field><SelectField label={t('form.client')} name="clientId" required><option value="">{t('form.chooseClient')}</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.companyName}</option>)}</SelectField><SelectField label={t('page.owner')} name="ownerId" defaultValue={currentUser.id}>{users.map((member) => <option value={member.id} key={member.id}>{member.fullName}</option>)}</SelectField><SelectField label={t('page.funnel')} value={funnelId} onChange={(event) => changeFunnel(event.target.value)}>{funnels.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField><SelectField label={t('form.stage')} value={stageId} onChange={(event) => setStageId(event.target.value)}>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</SelectField><Field label={t('form.amount')}><input name="value" type="number" min="0" max="1000000000" step="0.01" required /></Field><Field label={t('form.probability')}><input name="probability" type="number" min="0" max="100" defaultValue="30" required /></Field><Field label={t('form.closeDate')}><input name="expectedCloseAt" type="date" defaultValue={new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)} required /></Field><div className="field--wide rich-field"><span className="rich-field__label">{t('form.notes')}</span><RichTextEditor value={notes} onChange={setNotes} maxLength={NOTES_LIMIT} label={t('form.notesEditor')} placeholder={t('form.notesPlaceholder')} /></div></form></Dialog>;
}

function DealCard({ deal, stages, onDrag, onMove, onOpen }: { deal: Deal; stages: DealStage[]; onDrag: () => void; onMove: (stageId: string) => void; onOpen: () => void }) {
  const { t } = useTranslation(['sales', 'common']);
  // The whole card opens the deal, except its own controls (stage select, buttons) and the drag handle.
  const open = (event: MouseEvent<HTMLElement>) => { if (!(event.target as Element).closest('select, button, a, .drag-handle')) onOpen(); };
  return <article className="kanban-card kanban-card--clickable" onClick={open} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', deal.id); onDrag(); }}><div className="kanban-card__top"><span className="drag-handle"><GripVertical size={15} /></span><small>{deal.companyName}</small><IconButton label={t('card.open', { title: deal.title })} icon={deal.notes ? NotebookText : MoreHorizontal} onClick={onOpen} /></div><strong>{deal.title}</strong><div className="deal-value"><b>{formatMoney(deal.value, deal.currency)}</b><span>{deal.probability}%</span></div><div className="kanban-card__meta"><span><CalendarDays size={13} />{formatDate(deal.expectedCloseAt)}</span><span><UserRound size={13} />{firstName(deal.ownerName)}</span></div><select className="card-move-select" aria-label={t('card.move', { title: deal.title })} value={deal.stage.id} onChange={(event) => onMove(event.target.value)}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></article>;
}

/** A deal: its details, corrected with «Изменить сделку», and its notes (checklist items save on a tick, editor on demand). */
function DealDetailsDialog({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { t } = useTranslation(['sales', 'common']);
  const { updateDealNotes } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const [draft, setDraft] = useState(deal.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const saveNotes = async (notes: string, close: boolean) => {
    setSaving(true); setError('');
    try { await updateDealNotes(deal.id, notes); if (close) setNotesEditing(false); }
    catch (reason) { setError(funnelErrorMessage(reason, t('details.notesFailed'))); }
    finally { setSaving(false); }
  };
  const body = draft.trim();
  return <Dialog open title={t('card.open', { title: deal.title })} description={deal.companyName} size="lg" onClose={onClose} footer={<Button onClick={onClose}>{t('common:actions.done')}</Button>}>
    {editing
      ? <DealDetailsForm deal={deal} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
      : <>
        <dl className="dialog-facts deal-facts">
          <div><dt>{t('form.stage')}</dt><dd>{deal.stage.name}</dd></div>
          <div><dt>{t('details.amount')}</dt><dd>{formatMoney(deal.value, deal.currency)}</dd></div>
          <div><dt>{t('details.probability')}</dt><dd>{deal.probability}%</dd></div>
          <div><dt>{t('form.closeDate')}</dt><dd>{formatDate(deal.expectedCloseAt)}</dd></div>
          <div><dt>{t('page.owner')}</dt><dd>{deal.ownerName}</dd></div>
        </dl>
        <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>{t('details.edit')}</Button>
      </>}
    <section className="deal-notes" aria-label={t('form.notes')}>
      <header><h3>{t('form.notes')}</h3>{!notesEditing && <button type="button" className="text-button" onClick={() => { setDraft(deal.notes ?? ''); setNotesEditing(true); }}>{deal.notes ? t('details.editNotes') : t('details.addNotes')}</button>}</header>
      {notesEditing
        ? <>
          <RichTextEditor value={draft} onChange={setDraft} maxLength={NOTES_LIMIT} label={t('form.notesEditor')} placeholder={t('form.notesPlaceholder')} autoFocus />
          <div className="deal-notes__actions"><Button variant="secondary" onClick={() => { setDraft(deal.notes ?? ''); setNotesEditing(false); }}>{t('common:actions.cancel')}</Button><Button disabled={saving || !fitsLimit(body, NOTES_LIMIT) || body === (deal.notes ?? '')} onClick={() => void saveNotes(body, true)}>{saving ? t('common:actions.saving') : t('details.saveNotes')}</Button></div>
        </>
        : deal.notes ? <RichTextView markdown={deal.notes} onChange={(notes) => saveNotes(notes, false)} className="rich-field__view" /> : <p className="deal-notes__empty">{t('details.noNotes')}</p>}
    </section>
    {error && <div className="form-error" role="alert">{error}</div>}
  </Dialog>;
}

/** The deal's fields as a form; sends only what changed. The owner can be changed by heads and directors only. */
function DealDetailsForm({ deal, onCancel, onSaved }: { deal: Deal; onCancel: () => void; onSaved: () => void }) {
  const { t } = useTranslation(['sales', 'common']);
  const { session } = useAuth();
  const { funnels, users, clients, updateDeal } = useWorkspace();
  const stages = funnels.find((item) => item.id === deal.funnelId)?.stages ?? [];
  const canAssign = session!.user.role !== 'EMPLOYEE';
  const [title, setTitle] = useState(deal.title);
  const [clientId, setClientId] = useState(deal.clientId);
  const [value, setValue] = useState(String(deal.value));
  const [probability, setProbability] = useState(String(deal.probability));
  const [closeDate, setCloseDate] = useState(deal.expectedCloseAt ? deal.expectedCloseAt.slice(0, 10) : '');
  const [stageId, setStageId] = useState(deal.stage.id);
  const [ownerId, setOwnerId] = useState(deal.ownerId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const patch: DealPatch = {};
    if (title.trim() !== deal.title) patch.title = title.trim();
    if (clientId !== deal.clientId) patch.clientId = clientId;
    if (Number(value) !== deal.value) patch.value = Number(value);
    if (Number(probability) !== deal.probability) patch.probability = Number(probability);
    if (closeDate && closeDate !== deal.expectedCloseAt?.slice(0, 10)) patch.expectedCloseAt = new Date(`${closeDate}T00:00:00.000Z`).toISOString();
    if (stageId !== deal.stage.id) patch.stageId = stageId;
    if (canAssign && ownerId !== deal.ownerId) patch.ownerId = ownerId;
    if (!Object.keys(patch).length) { onSaved(); return; }
    setSaving(true); setError('');
    try { await updateDeal(deal.id, patch); onSaved(); }
    catch (reason) { setError(funnelErrorMessage(reason, t('details.saveFailed'))); }
    finally { setSaving(false); }
  };
  return <form className="form-grid deal-edit" aria-label={t('details.editForm')} onSubmit={(event) => void submit(event)}>
    <Field label={t('form.title')} className="field--wide"><input value={title} required maxLength={200} onChange={(event) => setTitle(event.target.value)} /></Field>
    <SelectField label={t('form.client')} value={clientId} onChange={(event) => setClientId(event.target.value)}>
      {clients.some((client) => client.id === deal.clientId) ? null : <option value={deal.clientId}>{deal.companyName}</option>}
      {[...clients].sort((a, b) => a.companyName.localeCompare(b.companyName, 'ru')).map((client) => <option value={client.id} key={client.id}>{client.companyName}</option>)}
    </SelectField>
    <Field label={t('form.amount')}><input type="number" min="0" max="1000000000" step="0.01" required value={value} onChange={(event) => setValue(event.target.value)} /></Field>
    <Field label={t('form.probability')}><input type="number" min="0" max="100" step="1" required value={probability} onChange={(event) => setProbability(event.target.value)} /></Field>
    <Field label={t('form.closeDate')}><input type="date" required value={closeDate} onChange={(event) => setCloseDate(event.target.value)} /></Field>
    <SelectField label={t('form.stage')} value={stageId} onChange={(event) => setStageId(event.target.value)}>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</SelectField>
    {canAssign
      ? <SelectField label={t('page.owner')} value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{users.some((member) => member.id === deal.ownerId) ? null : <option value={deal.ownerId}>{deal.ownerName}</option>}{users.map((member) => <option value={member.id} key={member.id}>{member.fullName}</option>)}</SelectField>
      : <Field label={t('page.owner')}><input value={deal.ownerName} readOnly disabled /></Field>}
    {error && <div className="form-error field--wide" role="alert">{error}</div>}
    <div className="field--wide deal-edit__actions"><Button type="button" variant="secondary" onClick={onCancel}>{t('common:actions.cancel')}</Button><Button type="submit" disabled={saving}>{saving ? t('common:actions.saving') : t('common:actions.save')}</Button></div>
  </form>;
}
