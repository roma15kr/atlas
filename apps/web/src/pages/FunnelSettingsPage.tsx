import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Layers, Lock, Plus, Save, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Dialog, EmptyState, Field, IconButton, PageHeader, SectionHeader, Segmented, SelectField, Surface } from '../components/ui';
import { useWorkspace, type StageInput } from '../context/AppContext';
import { funnelErrorMessage } from '../lib/funnelErrors';
import type { DealStage, Funnel, FunnelAccessMode, StageOutcome } from '../types';

const outcomeLabels: Record<StageOutcome, string> = { OPEN: 'Открыт', WON: 'Успех', LOST: 'Проигрыш' };
const defaultStages: StageInput[] = [
  { name: 'Новая', color: '#2563EB', outcome: 'OPEN' },
  { name: 'В работе', color: '#D97706', outcome: 'OPEN' },
  { name: 'Успех', color: '#059669', outcome: 'WON' },
  { name: 'Проигрыш', color: '#DC2626', outcome: 'LOST' },
];

export function FunnelSettingsPage() {
  const { funnels, funnelConfig } = useWorkspace();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const funnel = funnels.find((item) => item.id === selectedId) ?? funnels[0];

  const run = async (action: () => Promise<unknown>, fallback: string): Promise<boolean> => {
    setError('');
    try { await action(); return true; } catch (reason) { setError(funnelErrorMessage(reason, fallback)); return false; }
  };

  return <>
    <button className="back-link" onClick={() => navigate('/sales')}><ArrowLeft size={15} />К воронке продаж</button>
    <PageHeader title="Настройка воронок" description="Этапы, их порядок и доступ к каждой воронке" action={<Button icon={Plus} onClick={() => setCreateOpen(true)}>Новая воронка</Button>} />
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>Закрыть</button></div>}
    <div className="funnel-settings">
      <Surface className="funnel-settings__list"><SectionHeader title="Воронки" meta={<Badge>{funnels.length}</Badge>} />
        {funnels.map((item) => <button key={item.id} className={`funnel-settings__item ${item.id === funnel?.id ? 'is-active' : ''}`} onClick={() => setSelectedId(item.id)}><Layers size={15} /><span><strong>{item.name}</strong><small>{item.stages.length} этапов · {item.accessMode === 'RESTRICTED' ? 'ограниченный доступ' : 'вся компания'}</small></span>{item.accessMode === 'RESTRICTED' && <Lock size={13} aria-label="Ограниченный доступ" />}</button>)}
      </Surface>
      {funnel ? <FunnelEditor key={funnel.id} funnel={funnel} onlyFunnel={funnels.length === 1} run={run} config={funnelConfig} onDeleted={() => setSelectedId(null)} />
        : <EmptyState title="Воронок пока нет" description="Создайте первую воронку" icon={Layers} />}
    </div>
    {createOpen && <CreateFunnelDialog onClose={() => setCreateOpen(false)} onCreate={async (name) => {
      let id = '';
      if (await run(async () => { id = await funnelConfig.createFunnel({ name, stages: defaultStages }); }, 'Воронка не создана')) { setSelectedId(id); setCreateOpen(false); }
    }} />}
  </>;
}

type Run = (action: () => Promise<unknown>, fallback: string) => Promise<boolean>;

function FunnelEditor({ funnel, onlyFunnel, run, config, onDeleted }: { funnel: Funnel; onlyFunnel: boolean; run: Run; config: ReturnType<typeof useWorkspace>['funnelConfig']; onDeleted: () => void }) {
  const [name, setName] = useState(funnel.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<DealStage | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const dealTotal = funnel.stages.reduce((sum, stage) => sum + (stage.dealCount ?? 0), 0);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= funnel.stages.length || from === to) return;
    const ids = funnel.stages.map((stage) => stage.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    void run(() => config.reorderStages(funnel.id, ids), 'Порядок этапов не сохранён');
  };
  const drop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragged) move(funnel.stages.findIndex((stage) => stage.id === dragged), index);
    setDragged(null);
  };
  const rename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim() && name.trim() !== funnel.name) void run(() => config.updateFunnel(funnel.id, { name: name.trim() }), 'Название не сохранено');
  };

  return <div className="funnel-settings__editor">
    <Surface><form className="funnel-settings__name" onSubmit={rename}><Field label="Название воронки"><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></Field><Button type="submit" variant="secondary" icon={Save} disabled={!name.trim() || name.trim() === funnel.name}>Сохранить</Button><Button type="button" variant="danger" icon={Trash2} onClick={() => setDeleteOpen(true)} disabled={onlyFunnel} title={onlyFunnel ? 'Нельзя удалить последнюю воронку' : undefined}>Удалить воронку</Button></form></Surface>
    <Surface><SectionHeader title="Этапы" meta={<Badge>{funnel.stages.length}</Badge>} />
      <ol className="stage-list">{funnel.stages.map((stage, index) => <li key={stage.id} draggable onDragStart={() => setDragged(stage.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, index)}>
        <span className="drag-handle" aria-hidden="true"><GripVertical size={15} /></span>
        <StageRow stage={stage} run={run} onSave={(patch) => config.updateStage(funnel.id, stage.id, patch)} />
        <IconButton label={`Поднять этап ${stage.name}`} icon={ArrowUp} disabled={index === 0} onClick={() => move(index, index - 1)} />
        <IconButton label={`Опустить этап ${stage.name}`} icon={ArrowDown} disabled={index === funnel.stages.length - 1} onClick={() => move(index, index + 1)} />
        <IconButton label={`Удалить этап ${stage.name}`} icon={Trash2} disabled={funnel.stages.length === 1} onClick={() => setStageToDelete(stage)} />
      </li>)}</ol>
      <AddStageForm onAdd={(stage) => run(() => config.addStage(funnel.id, stage), 'Этап не добавлен')} />
    </Surface>
    <AccessEditor funnel={funnel} run={run} onSave={(access) => config.setFunnelAccess(funnel.id, access)} />
    {stageToDelete && <DeleteStageDialog stage={stageToDelete} stages={funnel.stages} onClose={() => setStageToDelete(null)} onDelete={async (target) => {
      if (await run(() => config.deleteStage(funnel.id, stageToDelete.id, target), 'Этап не удалён')) setStageToDelete(null);
    }} />}
    <Dialog open={deleteOpen} title="Удалить воронку?" description={dealTotal ? `В воронке ${dealTotal} сделок. Перенесите их в другую воронку, прежде чем удалять.` : 'Этапы и настройки доступа будут удалены.'} size="sm" onClose={() => setDeleteOpen(false)} footer={<><Button variant="secondary" onClick={() => setDeleteOpen(false)}>Отмена</Button><Button variant="danger" disabled={dealTotal > 0} onClick={() => void run(() => config.deleteFunnel(funnel.id), 'Воронка не удалена').then((ok) => { if (ok) { setDeleteOpen(false); onDeleted(); } })}>Удалить</Button></>}><p>{funnel.name}</p></Dialog>
  </div>;
}

function StageRow({ stage, run, onSave }: { stage: DealStage; run: Run; onSave: (patch: Partial<StageInput>) => Promise<void> }) {
  const [draft, setDraft] = useState<StageInput>({ name: stage.name, color: stage.color, outcome: stage.outcome });
  useEffect(() => { setDraft({ name: stage.name, color: stage.color, outcome: stage.outcome }); }, [stage.name, stage.color, stage.outcome]);
  const patch: Partial<StageInput> = {};
  if (draft.name.trim() !== stage.name) patch.name = draft.name.trim();
  if (draft.color.toLowerCase() !== stage.color.toLowerCase()) patch.color = draft.color;
  if (draft.outcome !== stage.outcome) patch.outcome = draft.outcome;
  const dirty = Object.keys(patch).length > 0 && Boolean(draft.name.trim());
  return <div className="stage-row">
    <input type="color" aria-label={`Цвет этапа ${stage.name}`} value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} />
    <input aria-label={`Название этапа ${stage.name}`} value={draft.name} maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
    <select aria-label={`Итог этапа ${stage.name}`} value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value as StageOutcome })}>{Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <Badge>{stage.dealCount ?? 0} сделок</Badge>
    <Button variant="secondary" disabled={!dirty} onClick={() => void run(() => onSave(patch), 'Этап не сохранён')}>Сохранить</Button>
  </div>;
}

function AddStageForm({ onAdd }: { onAdd: (stage: StageInput) => Promise<boolean> }) {
  const [draft, setDraft] = useState<StageInput>({ name: '', color: '#398078', outcome: 'OPEN' });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onAdd({ ...draft, name: draft.name.trim() })) setDraft({ name: '', color: '#398078', outcome: 'OPEN' });
  };
  return <form className="stage-row stage-row--new" onSubmit={(event) => void submit(event)}>
    <input type="color" aria-label="Цвет нового этапа" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} />
    <input aria-label="Название нового этапа" placeholder="Новый этап" value={draft.name} maxLength={100} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
    <select aria-label="Итог нового этапа" value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value as StageOutcome })}>{Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <Button type="submit" icon={Plus} disabled={!draft.name.trim()}>Добавить этап</Button>
  </form>;
}

export function DeleteStageDialog({ stage, stages, onClose, onDelete }: { stage: DealStage; stages: DealStage[]; onClose: () => void; onDelete: (moveToStageId?: string) => Promise<void> }) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const count = stage.dealCount ?? 0;
  const needsTarget = count > 0;
  const submit = async () => { setBusy(true); try { await onDelete(needsTarget ? target : undefined); } finally { setBusy(false); } };
  return <Dialog open title={`Удалить этап «${stage.name}»?`} description={needsTarget ? `В этапе ${count} сделок. Выберите, куда их перенести.` : 'В этапе нет сделок.'} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button variant="danger" disabled={busy || (needsTarget && !target)} onClick={() => void submit()}>{needsTarget ? 'Перенести и удалить' : 'Удалить'}</Button></>}>
    {needsTarget && <SelectField label="Перенести сделки в этап" value={target} onChange={(event) => setTarget(event.target.value)} required><option value="">Выберите этап</option>{stages.filter((item) => item.id !== stage.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>}
  </Dialog>;
}

function AccessEditor({ funnel, run, onSave }: { funnel: Funnel; run: Run; onSave: (access: { accessMode: FunnelAccessMode; departmentIds: string[]; userIds: string[] }) => Promise<void> }) {
  const { users } = useWorkspace();
  const [mode, setMode] = useState<FunnelAccessMode>(funnel.accessMode ?? 'COMPANY');
  const [departmentIds, setDepartmentIds] = useState<string[]>(funnel.departmentIds ?? []);
  const [userIds, setUserIds] = useState<string[]>(funnel.userIds ?? []);
  const departments = useMemo(() => [...new Map(users.filter((user) => user.departmentId).map((user) => [user.departmentId!, user.department])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'ru')), [users]);
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  const same = (a: string[], b: string[] = []) => a.length === b.length && a.every((id) => b.includes(id));
  const dirty = mode !== (funnel.accessMode ?? 'COMPANY') || (mode === 'RESTRICTED' && (!same(departmentIds, funnel.departmentIds) || !same(userIds, funnel.userIds)));

  return <Surface><SectionHeader title="Доступ" meta={<Users size={15} />} />
    <Segmented label="Кто видит воронку" value={mode} onChange={setMode} options={[{ value: 'COMPANY', label: 'Вся компания' }, { value: 'RESTRICTED', label: 'Только выбранные' }]} />
    {mode === 'RESTRICTED' && <div className="access-grid">
      <fieldset><legend>Отделы</legend>{departments.map(([id, name]) => <label key={id}><input type="checkbox" checked={departmentIds.includes(id)} onChange={() => setDepartmentIds(toggle(departmentIds, id))} />{name}</label>)}</fieldset>
      <fieldset><legend>Сотрудники</legend>{users.filter((user) => user.role !== 'DIRECTOR').map((user) => <label key={user.id}><input type="checkbox" checked={userIds.includes(user.id)} onChange={() => setUserIds(toggle(userIds, user.id))} />{user.fullName}<small>{user.department}</small></label>)}</fieldset>
      <p className="access-hint">Директора видят все воронки. Внутри воронки сотрудник видит только свои сделки, руководитель — сделки своего отдела.</p>
    </div>}
    <Button icon={Save} disabled={!dirty} onClick={() => void run(() => onSave({ accessMode: mode, departmentIds: mode === 'RESTRICTED' ? departmentIds : [], userIds: mode === 'RESTRICTED' ? userIds : [] }), 'Доступ не сохранён')}>Сохранить доступ</Button>
  </Surface>;
}

function CreateFunnelDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); try { await onCreate(name.trim()); } finally { setBusy(false); } };
  return <Dialog open title="Новая воронка" description="Будет создана с этапами «Новая», «В работе», «Успех», «Проигрыш» и доступом для всей компании" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="funnel-form" disabled={busy || !name.trim()}>Создать</Button></>}><form id="funnel-form" className="form-grid" onSubmit={(event) => void submit(event)}><Field label="Название" className="field--wide"><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} placeholder="Например, Опт" /></Field></form></Dialog>;
}
