import { ArrowDown, ArrowLeft, ArrowUp, CircleCheck, CircleDot, CircleX, GripVertical, Layers, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Dialog, EmptyState, Field, IconButton, PageHeader, SectionHeader, Segmented, SelectField, Surface } from '../components/ui';
import { useWorkspace, type FunnelAccessInput, type StageInput } from '../context/AppContext';
import { plural } from '../lib/format';
import { funnelErrorMessage } from '../lib/funnelErrors';
import type { DealStage, Funnel, FunnelAccessMode, StageOutcome } from '../types';

const STAGES: [string, string, string] = ['этап', 'этапа', 'этапов'];
const DEALS: [string, string, string] = ['сделка', 'сделки', 'сделок'];
const FUNNELS: [string, string, string] = ['воронка', 'воронки', 'воронок'];

const outcomes: Record<StageOutcome, { label: string; tone: 'neutral' | 'success' | 'danger'; hint: string }> = {
  OPEN: { label: 'Открыт', tone: 'neutral', hint: 'Сделки в работе, входят в сумму воронки' },
  WON: { label: 'Успех', tone: 'success', hint: 'Выигранные сделки, в отчётах считаются успешными' },
  LOST: { label: 'Проигрыш', tone: 'danger', hint: 'Проигранные сделки, не входят в сумму в работе' },
};

/** Presets reuse colors already on the Sales board; any color can still be chosen. */
export const stageColorPresets = ['#398078', '#176f68', '#366e9e', '#765ca8', '#a66c20', '#b07627', '#39815a', '#a44444'];

const defaultStages: StageInput[] = [
  { name: 'Новая', color: '#366e9e', outcome: 'OPEN' },
  { name: 'В работе', color: '#a66c20', outcome: 'OPEN' },
  { name: 'Успех', color: '#39815a', outcome: 'WON' },
  { name: 'Проигрыш', color: '#a44444', outcome: 'LOST' },
];

type DialogState =
  | { kind: 'create' }
  | { kind: 'rename' }
  | { kind: 'delete-funnel' }
  | { kind: 'stage'; stage?: DealStage }
  | { kind: 'delete-stage'; stage: DealStage }
  | { kind: 'access' }
  | null;

const dealTotal = (funnel: Funnel) => funnel.stages.reduce((sum, stage) => sum + (stage.dealCount ?? 0), 0);

export function FunnelSettingsPage() {
  const { funnels, funnelConfig, users } = useWorkspace();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pageError, setPageError] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const funnel = funnels.find((item) => item.id === selectedId) ?? funnels[0];
  const stageCount = funnels.reduce((sum, item) => sum + item.stages.length, 0);
  const close = () => setDialog(null);

  const move = (from: number, to: number) => {
    if (!funnel || to < 0 || to >= funnel.stages.length || from === to) return;
    const ids = funnel.stages.map((stage) => stage.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    setPageError('');
    void funnelConfig.reorderStages(funnel.id, ids).catch((reason: unknown) => setPageError(funnelErrorMessage(reason, 'Порядок этапов не сохранён')));
  };
  const drop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragged && funnel) move(funnel.stages.findIndex((stage) => stage.id === dragged), index);
    setDragged(null);
  };

  return <>
    <button className="back-link" onClick={() => navigate('/sales')}><ArrowLeft size={15} />К воронке продаж</button>
    <PageHeader title="Настройка воронок" description={`${plural(funnels.length, FUNNELS)} · ${plural(stageCount, STAGES)}`} action={<Button icon={Plus} onClick={() => setDialog({ kind: 'create' })}>Новая воронка</Button>} />
    {pageError && <div className="notice notice--danger" role="alert">{pageError}<button onClick={() => setPageError('')}>Закрыть</button></div>}
    {!funnel ? <Surface><EmptyState title="Воронок пока нет" description="Создайте первую воронку, чтобы сотрудники могли вести в ней сделки" icon={Layers} action={<Button icon={Plus} onClick={() => setDialog({ kind: 'create' })}>Новая воронка</Button>} /></Surface> : <div className="team-layout">
      <Surface className="team-list">
        <div className="team-list__rows funnel-list">{funnels.map((item) => <button key={item.id} className={item.id === funnel.id ? 'is-active' : ''} onClick={() => setSelectedId(item.id)}>
          <span className="integration-icon funnel-icon"><Layers size={17} /></span>
          <span><strong>{item.name}</strong><small>{plural(item.stages.length, STAGES)} · {plural(dealTotal(item), DEALS)}</small></span>
          {item.accessMode === 'RESTRICTED' ? <Badge tone="warning"><Lock size={11} aria-hidden="true" />Ограничен</Badge> : <Badge>Вся компания</Badge>}
        </button>)}</div>
      </Surface>

      <div className="team-detail">
        <Surface className="team-profile">
          <div className="team-profile__head">
            <span className="integration-icon funnel-icon funnel-icon--lg"><Layers size={24} /></span>
            <div><h2>{funnel.name}</h2><span>{plural(funnel.stages.length, STAGES)} · {plural(dealTotal(funnel), DEALS)}</span><div>{funnel.accessMode === 'RESTRICTED' ? <Badge tone="warning">Ограниченный доступ</Badge> : <Badge tone="info">Вся компания</Badge>}</div></div>
            <div className="team-profile__actions">
              <Button variant="secondary" icon={Pencil} onClick={() => setDialog({ kind: 'rename' })}>Переименовать</Button>
              <Button variant="ghost" icon={Trash2} disabled={funnels.length === 1} title={funnels.length === 1 ? 'Нельзя удалить последнюю воронку' : undefined} onClick={() => setDialog({ kind: 'delete-funnel' })}>Удалить</Button>
            </div>
          </div>
          <div className="profile-facts">
            {(['OPEN', 'WON', 'LOST'] as StageOutcome[]).map((outcome) => { const Icon = outcome === 'OPEN' ? CircleDot : outcome === 'WON' ? CircleCheck : CircleX; const stages = funnel.stages.filter((stage) => stage.outcome === outcome); return <div key={outcome}><Icon size={16} /><span><small>{outcomes[outcome].label}</small><strong>{plural(stages.length, STAGES)} · {plural(stages.reduce((sum, stage) => sum + (stage.dealCount ?? 0), 0), DEALS)}</strong></span></div>; })}
            <div><Users size={16} /><span><small>Доступ</small><strong>{accessSummary(funnel, users).short}</strong></span></div>
          </div>
        </Surface>

        <Surface className="funnel-card">
          <SectionHeader title="Этапы" meta={<Badge tone="info">{funnel.stages.length}</Badge>} action={<Button variant="secondary" icon={Plus} onClick={() => setDialog({ kind: 'stage' })}>Добавить этап</Button>} />
          <p className="funnel-card__hint">Порядок этапов совпадает с колонками на доске. Перетащите строку или используйте стрелки.</p>
          <ol className="stage-rows">{funnel.stages.map((stage, index) => <li key={stage.id} draggable onDragStart={() => setDragged(stage.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, index)} className={dragged === stage.id ? 'is-dragging' : ''}>
            <span className="drag-handle" aria-hidden="true"><GripVertical size={15} /></span>
            <i className="color-marker" style={{ background: stage.color }} aria-hidden="true" />
            <span className="stage-rows__name"><strong>{stage.name}</strong><small>{plural(stage.dealCount ?? 0, DEALS)}</small></span>
            <Badge tone={outcomes[stage.outcome].tone}>{outcomes[stage.outcome].label}</Badge>
            <span className="row-actions">
              <IconButton label={`Переместить выше: ${stage.name}`} icon={ArrowUp} disabled={index === 0} onClick={() => move(index, index - 1)} />
              <IconButton label={`Переместить ниже: ${stage.name}`} icon={ArrowDown} disabled={index === funnel.stages.length - 1} onClick={() => move(index, index + 1)} />
              <IconButton label={`Изменить этап ${stage.name}`} icon={Pencil} onClick={() => setDialog({ kind: 'stage', stage })} />
              <IconButton label={`Удалить этап ${stage.name}`} icon={Trash2} disabled={funnel.stages.length === 1} title={funnel.stages.length === 1 ? 'Нельзя удалить последний этап' : `Удалить этап ${stage.name}`} onClick={() => setDialog({ kind: 'delete-stage', stage })} />
            </span>
          </li>)}</ol>
        </Surface>

        <Surface className="funnel-card">
          <SectionHeader title="Доступ" action={<Button variant="secondary" icon={Users} onClick={() => setDialog({ kind: 'access' })}>Изменить доступ</Button>} />
          <dl className="detail-list access-summary">
            <div><dt>Кто видит воронку</dt><dd>{funnel.accessMode === 'RESTRICTED' ? 'Только выбранные отделы и сотрудники' : 'Вся компания'}</dd></div>
            {funnel.accessMode === 'RESTRICTED' && <>
              <div><dt>Отделы</dt><dd>{accessSummary(funnel, users).departments || 'Не выбраны'}</dd></div>
              <div><dt>Сотрудники</dt><dd>{accessSummary(funnel, users).people || 'Не выбраны'}</dd></div>
            </>}
          </dl>
          <p className="funnel-card__hint">Директора видят все воронки. Внутри воронки сотрудник видит только свои сделки, руководитель — сделки своего отдела.</p>
        </Surface>
      </div>
    </div>}

    {dialog?.kind === 'create' && <NameDialog title="Новая воронка" description="Будут созданы этапы «Новая», «В работе», «Успех» и «Проигрыш» — их можно изменить после создания." submitLabel="Создать воронку" initial="" onClose={close} onSubmit={async (name) => { const id = await funnelConfig.createFunnel({ name, stages: defaultStages }); setSelectedId(id); }} />}
    {dialog?.kind === 'rename' && funnel && <NameDialog title="Переименовать воронку" submitLabel="Сохранить" initial={funnel.name} onClose={close} onSubmit={(name) => funnelConfig.updateFunnel(funnel.id, { name })} />}
    {dialog?.kind === 'delete-funnel' && funnel && <DeleteFunnelDialog funnel={funnel} onClose={close} onDelete={async () => { await funnelConfig.deleteFunnel(funnel.id); setSelectedId(null); }} />}
    {dialog?.kind === 'stage' && funnel && <StageDialog stage={dialog.stage} onClose={close} onSubmit={(input) => dialog.stage ? funnelConfig.updateStage(funnel.id, dialog.stage.id, changedFields(dialog.stage, input)) : funnelConfig.addStage(funnel.id, input)} />}
    {dialog?.kind === 'delete-stage' && funnel && <DeleteStageDialog stage={dialog.stage} stages={funnel.stages} onClose={close} onDelete={(target) => funnelConfig.deleteStage(funnel.id, dialog.stage.id, target)} />}
    {dialog?.kind === 'access' && funnel && <AccessDialog funnel={funnel} onClose={close} onSubmit={(access) => funnelConfig.setFunnelAccess(funnel.id, access)} />}
  </>;
}

function accessSummary(funnel: Funnel, users: ReturnType<typeof useWorkspace>['users']) {
  const departmentNames = new Map(users.filter((user) => user.departmentId).map((user) => [user.departmentId!, user.department]));
  const departments = (funnel.departmentIds ?? []).map((id) => departmentNames.get(id) ?? 'Отдел').join(' · ');
  const people = (funnel.userIds ?? []).map((id) => users.find((user) => user.id === id)?.fullName ?? 'Сотрудник').join(' · ');
  const parts = [
    funnel.departmentIds?.length ? plural(funnel.departmentIds.length, ['отдел', 'отдела', 'отделов']) : '',
    funnel.userIds?.length ? plural(funnel.userIds.length, ['сотрудник', 'сотрудника', 'сотрудников']) : '',
  ].filter(Boolean);
  return { departments, people, short: funnel.accessMode === 'RESTRICTED' ? (parts.length ? parts.join(' · ') : 'Только директора') : 'Вся компания' };
}

function changedFields(stage: DealStage, input: StageInput): Partial<StageInput> {
  const patch: Partial<StageInput> = {};
  if (input.name !== stage.name) patch.name = input.name;
  if (input.color.toLowerCase() !== stage.color.toLowerCase()) patch.color = input.color;
  if (input.outcome !== stage.outcome) patch.outcome = input.outcome;
  return patch;
}

/** Shared submit handling: keeps the dialog open with a Russian error when the API rejects the change. */
function useSubmit(onClose: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setSaving(true); setError('');
    try { await action(); onClose(); } catch (reason) { setError(funnelErrorMessage(reason, fallback)); } finally { setSaving(false); }
  };
  return { saving, error, run };
}

function NameDialog({ title, description, submitLabel, initial, onClose, onSubmit }: { title: string; description?: string; submitLabel: string; initial: string; onClose: () => void; onSubmit: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState(initial);
  const { saving, error, run } = useSubmit(onClose);
  const trimmed = name.trim();
  const submit = (event: FormEvent) => { event.preventDefault(); void run(() => onSubmit(trimmed), 'Название не сохранено'); };
  return <Dialog open title={title} description={description} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="funnel-name-form" disabled={saving || !trimmed || trimmed === initial}>{saving ? 'Сохраняем…' : submitLabel}</Button></>}>
    <form id="funnel-name-form" className="form-grid" onSubmit={submit}><Field label="Название воронки" className="field--wide"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required placeholder="Например, Опт" autoFocus /></Field>{error && <div className="form-error field--wide" role="alert">{error}</div>}</form>
  </Dialog>;
}

function DeleteFunnelDialog({ funnel, onClose, onDelete }: { funnel: Funnel; onClose: () => void; onDelete: () => Promise<unknown> }) {
  const { saving, error, run } = useSubmit(onClose);
  const deals = dealTotal(funnel);
  return <Dialog open title={`Удалить воронку «${funnel.name}»?`} description={deals ? `В воронке ${plural(deals, DEALS)}. Перенесите их в другую воронку, чтобы удалить её.` : 'Этапы и настройки доступа будут удалены. Действие нельзя отменить.'} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button variant="danger" disabled={saving || deals > 0} onClick={() => void run(onDelete, 'Воронка не удалена')}>Удалить</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : <p className="dialog-text">{deals ? 'Сделки переносятся на доске продаж: откройте сделку и выберите другую воронку.' : 'Сотрудники перестанут видеть эту воронку на доске продаж.'}</p>}
  </Dialog>;
}

export function StageDialog({ stage, onClose, onSubmit }: { stage?: DealStage; onClose: () => void; onSubmit: (input: StageInput) => Promise<unknown> }) {
  const [draft, setDraft] = useState<StageInput>({ name: stage?.name ?? '', color: stage?.color ?? stageColorPresets[0]!, outcome: stage?.outcome ?? 'OPEN' });
  const { saving, error, run } = useSubmit(onClose);
  const name = draft.name.trim();
  const unchanged = Boolean(stage) && name === stage!.name && draft.color.toLowerCase() === stage!.color.toLowerCase() && draft.outcome === stage!.outcome;
  const submit = (event: FormEvent) => { event.preventDefault(); void run(() => onSubmit({ ...draft, name }), stage ? 'Этап не сохранён' : 'Этап не добавлен'); };
  return <Dialog open title={stage ? 'Изменить этап' : 'Новый этап'} description={stage ? undefined : 'Этап появится последней колонкой на доске. Порядок можно изменить.'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="stage-form" disabled={saving || !name || unchanged}>{saving ? 'Сохраняем…' : stage ? 'Сохранить' : 'Добавить этап'}</Button></>}>
    <form id="stage-form" className="form-grid" onSubmit={submit}>
      <Field label="Название" className="field--wide"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={100} required placeholder="Например, Согласование" autoFocus /></Field>
      <Field label="Цвет" className="field--wide"><span className="color-presets" role="radiogroup" aria-label="Цвет этапа">{stageColorPresets.map((color) => <button key={color} type="button" role="radio" aria-checked={draft.color.toLowerCase() === color} aria-label={`Цвет ${color}`} className={draft.color.toLowerCase() === color ? 'is-active' : ''} style={{ background: color }} onClick={() => setDraft({ ...draft, color })} />)}<label className={`color-presets__custom ${stageColorPresets.includes(draft.color.toLowerCase()) ? '' : 'is-active'}`} title="Другой цвет"><input type="color" aria-label="Другой цвет" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label></span></Field>
      <div className="field field--wide"><SelectField label="Итог этапа" value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value as StageOutcome })}>{(Object.keys(outcomes) as StageOutcome[]).map((value) => <option key={value} value={value}>{outcomes[value].label}</option>)}</SelectField><small>{outcomes[draft.outcome].hint}</small></div>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function DeleteStageDialog({ stage, stages, onClose, onDelete }: { stage: DealStage; stages: DealStage[]; onClose: () => void; onDelete: (moveToStageId?: string) => Promise<unknown> }) {
  const [target, setTarget] = useState('');
  const { saving, error, run } = useSubmit(onClose);
  const count = stage.dealCount ?? 0;
  const needsTarget = count > 0;
  return <Dialog open title={`Удалить этап «${stage.name}»?`} description={needsTarget ? `В этапе ${plural(count, DEALS)}. Выберите, куда их перенести.` : 'В этапе нет сделок.'} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button variant="danger" disabled={saving || (needsTarget && !target)} onClick={() => void run(() => onDelete(needsTarget ? target : undefined), 'Этап не удалён')}>{needsTarget ? 'Перенести и удалить' : 'Удалить'}</Button></>}>
    {needsTarget && <SelectField label="Перенести сделки в этап" value={target} onChange={(event) => setTarget(event.target.value)} required><option value="">Выберите этап</option>{stages.filter((item) => item.id !== stage.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </Dialog>;
}

export function AccessDialog({ funnel, onClose, onSubmit }: { funnel: Funnel; onClose: () => void; onSubmit: (access: FunnelAccessInput) => Promise<unknown> }) {
  const { users } = useWorkspace();
  const [mode, setMode] = useState<FunnelAccessMode>(funnel.accessMode ?? 'COMPANY');
  const [departmentIds, setDepartmentIds] = useState<string[]>(funnel.departmentIds ?? []);
  const [userIds, setUserIds] = useState<string[]>(funnel.userIds ?? []);
  const { saving, error, run } = useSubmit(onClose);
  const departments = useMemo(() => [...new Map(users.filter((user) => user.departmentId).map((user) => [user.departmentId!, user.department])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'ru')), [users]);
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  const submit = () => void run(() => onSubmit({ accessMode: mode, departmentIds: mode === 'RESTRICTED' ? departmentIds : [], userIds: mode === 'RESTRICTED' ? userIds : [] }), 'Доступ не сохранён');
  return <Dialog open title="Доступ к воронке" description={funnel.name} size="lg" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button disabled={saving} onClick={submit}>{saving ? 'Сохраняем…' : 'Сохранить доступ'}</Button></>}>
    <div className="form-grid">
      <div className="field--wide"><Segmented label="Кто видит воронку" value={mode} onChange={setMode} options={[{ value: 'COMPANY', label: 'Вся компания' }, { value: 'RESTRICTED', label: 'Только выбранные' }]} /></div>
      {mode === 'RESTRICTED' ? <>
        <fieldset className="check-list"><legend>Отделы</legend>{departments.length ? departments.map(([id, name]) => <label key={id}><input type="checkbox" checked={departmentIds.includes(id)} onChange={() => setDepartmentIds(toggle(departmentIds, id))} />{name}</label>) : <small>Отделов пока нет</small>}</fieldset>
        <fieldset className="check-list"><legend>Сотрудники</legend>{users.filter((user) => user.role !== 'DIRECTOR').map((user) => <label key={user.id}><input type="checkbox" checked={userIds.includes(user.id)} onChange={() => setUserIds(toggle(userIds, user.id))} /><span>{user.fullName}<small>{user.department}</small></span></label>)}</fieldset>
      </> : null}
      <p className="dialog-text field--wide">{mode === 'COMPANY' ? 'Воронку видят все сотрудники компании.' : 'Директора видят воронку всегда.'} Внутри воронки сотрудник видит только свои сделки, руководитель — сделки своего отдела.</p>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </div>
  </Dialog>;
}
