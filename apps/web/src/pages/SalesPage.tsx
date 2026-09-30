import { CalendarDays, GripVertical, Layers, MoreHorizontal, Plus, Settings2, SlidersHorizontal, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Dialog, EmptyState, Field, IconButton, PageHeader, SelectField } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { formatDate, formatMoney } from '../lib/format';
import { funnelErrorMessage } from '../lib/funnelErrors';
import type { Deal, DealStage, Funnel } from '../types';

const funnelKey = (userId: string) => `atlas.sales.funnel.${userId}`;

function rememberedFunnel(userId: string): string | null {
  try { return localStorage.getItem(funnelKey(userId)); } catch { return null; }
}

function rememberFunnel(userId: string, funnelId: string): void {
  try { localStorage.setItem(funnelKey(userId), funnelId); } catch { /* selection is a convenience only */ }
}

export function SalesPage() {
  const { session } = useAuth();
  const { deals, funnels, clients, users, moveDeal, addDeal } = useWorkspace();
  const navigate = useNavigate();
  const user = session!.user;
  const [selectedId, setSelectedId] = useState<string | null>(() => rememberedFunnel(user.id));
  const [dealOpen, setDealOpen] = useState(false);
  const [owner, setOwner] = useState('ALL'); const [saving, setSaving] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isDirector = user.role === 'DIRECTOR';
  const funnel = funnels.find((item) => item.id === selectedId) ?? funnels[0];

  useEffect(() => { if (funnel) rememberFunnel(user.id, funnel.id); }, [funnel, user.id]);

  const stages = funnel?.stages ?? [];
  const visibleDeals = useMemo(() => deals.filter((deal) => deal.funnelId === funnel?.id && (owner === 'ALL' || deal.ownerId === owner)), [deals, funnel, owner]);
  const total = visibleDeals.filter((deal) => deal.stage.outcome === 'OPEN').reduce((sum, deal) => sum + deal.value, 0);

  const changeDeal = async (id: string, stageId: string) => { setError(''); try { await moveDeal(id, stageId); } catch (reason) { setError(funnelErrorMessage(reason, 'Сделка не перемещена')); } };
  const drop = (event: DragEvent, stageId: string) => { event.preventDefault(); if (dragged) void changeDeal(dragged, stageId); setDragged(null); };
  const saveDeal = async (input: Omit<Deal, 'id'>) => {
    setSaving(true); setError('');
    try { await addDeal(input); setSelectedId(input.funnelId); setDealOpen(false); }
    catch (reason) { setError(funnelErrorMessage(reason, 'Сделка не создана')); }
    finally { setSaving(false); }
  };

  const funnelSwitcher = funnels.length > 1 && <label className="compact-select"><Layers size={15} /><select aria-label="Воронка" value={funnel?.id} onChange={(event) => setSelectedId(event.target.value)}>{funnels.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>;

  return <>
    <PageHeader title={funnel?.name ?? 'Воронка продаж'} description={`${visibleDeals.length} сделок · ${formatMoney(total)} в активной работе`} action={<>{funnelSwitcher}{user.role !== 'EMPLOYEE' && <label className="compact-select"><UserRound size={15} /><select aria-label="Ответственный" value={owner} onChange={(event) => setOwner(event.target.value)}><option value="ALL">Вся команда</option>{users.map((member) => <option value={member.id} key={member.id}>{member.fullName}</option>)}</select></label>}{isDirector && <IconButton label="Настроить воронки" icon={Settings2} onClick={() => navigate('/sales/settings')} />}{funnel && <Button icon={Plus} onClick={() => setDealOpen(true)}>Новая сделка</Button>}</>} />
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>Закрыть</button></div>}
    {!funnel ? <EmptyState title="Нет доступных воронок" description={isDirector ? 'Создайте первую воронку, чтобы начать работу со сделками' : 'Попросите директора открыть вам доступ к воронке'} icon={SlidersHorizontal} action={isDirector ? <Button icon={Settings2} onClick={() => navigate('/sales/settings')}>Настроить воронки</Button> : undefined} />
      : <div className="kanban kanban--sales">{stages.map((stage) => { const items = visibleDeals.filter((deal) => deal.stage.id === stage.id); const sum = items.reduce((value, deal) => value + deal.value, 0); return <section className="kanban-column" key={stage.id} aria-label={stage.name} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, stage.id)}><header style={{ '--stage-color': stage.color } as React.CSSProperties}><div><i /><strong>{stage.name}</strong><Badge>{items.length}</Badge>{stage.outcome !== 'OPEN' && <Badge tone={stage.outcome === 'WON' ? 'success' : 'danger'}>{stage.outcome === 'WON' ? 'Успех' : 'Проигрыш'}</Badge>}</div><span>{formatMoney(sum)}</span></header><div className="kanban-column__body">{items.map((deal) => <DealCard key={deal.id} deal={deal} stages={stages} onDrag={() => setDragged(deal.id)} onMove={(next) => void changeDeal(deal.id, next)} />)}{!items.length && <div className="kanban-empty">Нет сделок</div>}<button className="kanban-add" onClick={() => setDealOpen(true)}><Plus size={15} />Добавить сделку</button></div></section>; })}</div>}
    {dealOpen && funnel && <DealDialog funnels={funnels} initialFunnelId={funnel.id} saving={saving} onClose={() => setDealOpen(false)} onSave={(input) => void saveDeal(input)} clients={clients} users={users} currentUser={user} />}
  </>;
}

function DealDialog({ funnels, initialFunnelId, saving, onClose, onSave, clients, users, currentUser }: {
  funnels: Funnel[]; initialFunnelId: string; saving: boolean; onClose: () => void; onSave: (input: Omit<Deal, 'id'>) => void;
  clients: ReturnType<typeof useWorkspace>['clients']; users: ReturnType<typeof useWorkspace>['users']; currentUser: ReturnType<typeof useWorkspace>['users'][number];
}) {
  const [funnelId, setFunnelId] = useState(initialFunnelId);
  const stages = funnels.find((item) => item.id === funnelId)?.stages ?? [];
  const firstOpen = stages.find((stage) => stage.outcome === 'OPEN') ?? stages[0];
  const [stageId, setStageId] = useState(firstOpen?.id ?? '');
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
    });
  };
  return <Dialog open title="Новая сделка" description="Привяжите сделку к клиенту и ответственному" size="lg" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="deal-form" disabled={saving || !stageId}>{saving ? 'Сохраняем…' : 'Создать сделку'}</Button></>}><form id="deal-form" className="form-grid" onSubmit={submit}><Field label="Название" className="field--wide"><input name="title" required placeholder="Предмет сделки" /></Field><SelectField label="Клиент" name="clientId" required><option value="">Выберите клиента</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.companyName}</option>)}</SelectField><SelectField label="Ответственный" name="ownerId" defaultValue={currentUser.id}>{users.map((member) => <option value={member.id} key={member.id}>{member.fullName}</option>)}</SelectField><SelectField label="Воронка" value={funnelId} onChange={(event) => changeFunnel(event.target.value)}>{funnels.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField><SelectField label="Этап" value={stageId} onChange={(event) => setStageId(event.target.value)}>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</SelectField><Field label="Сумма, ₴"><input name="value" type="number" min="0" step="1000" required /></Field><Field label="Вероятность, %"><input name="probability" type="number" min="0" max="100" defaultValue="30" required /></Field><Field label="Ожидаемое закрытие"><input name="expectedCloseAt" type="date" defaultValue={new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)} required /></Field></form></Dialog>;
}

function DealCard({ deal, stages, onDrag, onMove }: { deal: Deal; stages: DealStage[]; onDrag: () => void; onMove: (stageId: string) => void }) {
  return <article className="kanban-card" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', deal.id); onDrag(); }}><div className="kanban-card__top"><span className="drag-handle"><GripVertical size={15} /></span><small>{deal.companyName}</small><IconButton label="Действия со сделкой" icon={MoreHorizontal} /></div><strong>{deal.title}</strong><div className="deal-value"><b>{formatMoney(deal.value, deal.currency)}</b><span>{deal.probability}%</span></div><div className="kanban-card__meta"><span><CalendarDays size={13} />{formatDate(deal.expectedCloseAt)}</span><span><UserRound size={13} />{deal.ownerName.split(' ')[0]}</span></div><select className="card-move-select" aria-label={`Переместить сделку ${deal.title}`} value={deal.stage.id} onChange={(event) => onMove(event.target.value)}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></article>;
}
