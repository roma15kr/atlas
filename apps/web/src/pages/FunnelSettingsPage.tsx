import { ArrowLeft, CircleCheck, CircleDot, CircleX, Layers, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeleteStageDialog as SharedDeleteStageDialog, NameDialog, StageDialog as SharedStageDialog, StageRows, useSubmit, type EditableStage, type KindOptions } from '../components/stageSettings';
import { Badge, Button, Dialog, EmptyState, PageHeader, SectionHeader, Segmented, Surface } from '../components/ui';
import { useWorkspace, type FunnelAccessInput, type StageInput } from '../context/AppContext';
import { plural } from '../lib/format';
import { funnelErrorMessage } from '../lib/funnelErrors';
import type { DealStage, Funnel, FunnelAccessMode, StageOutcome } from '../types';

const STAGES: [string, string, string] = ['этап', 'этапа', 'этапов'];
const DEALS: [string, string, string] = ['сделка', 'сделки', 'сделок'];
const FUNNELS: [string, string, string] = ['воронка', 'воронки', 'воронок'];

const outcomes: KindOptions<StageOutcome> = {
  OPEN: { label: 'Открыт', tone: 'neutral', hint: 'Сделки в работе, входят в сумму воронки' },
  WON: { label: 'Успех', tone: 'success', hint: 'Выигранные сделки, в отчётах считаются успешными' },
  LOST: { label: 'Проигрыш', tone: 'danger', hint: 'Проигранные сделки, не входят в сумму в работе' },
};

export { stageColorPresets } from '../components/stageSettings';

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
const editable = (stage: DealStage): EditableStage<StageOutcome> => ({ id: stage.id, name: stage.name, color: stage.color, kind: stage.outcome, count: stage.dealCount ?? 0 });

export function FunnelSettingsPage() {
  const { funnels, funnelConfig, users } = useWorkspace();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pageError, setPageError] = useState('');
  const funnel = funnels.find((item) => item.id === selectedId) ?? funnels[0];
  const stageCount = funnels.reduce((sum, item) => sum + item.stages.length, 0);
  const close = () => setDialog(null);

  const reorder = (stageIds: string[]) => {
    if (!funnel) return;
    setPageError('');
    void funnelConfig.reorderStages(funnel.id, stageIds).catch((reason: unknown) => setPageError(funnelErrorMessage(reason, 'Порядок этапов не сохранён')));
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
          <StageRows stages={funnel.stages.map(editable)} kinds={outcomes} countForms={DEALS} onReorder={reorder}
            deleteBlockedReason={() => funnel.stages.length === 1 ? 'Нельзя удалить последний этап' : undefined}
            onEdit={(stage) => setDialog({ kind: 'stage', stage: funnel.stages.find((item) => item.id === stage.id) })}
            onDelete={(stage) => setDialog({ kind: 'delete-stage', stage: funnel.stages.find((item) => item.id === stage.id)! })} />
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

    {dialog?.kind === 'create' && <NameDialog label="Название воронки" placeholder="Например, Опт" describeError={funnelErrorMessage} title="Новая воронка" description="Будут созданы этапы «Новая», «В работе», «Успех» и «Проигрыш» — их можно изменить после создания." submitLabel="Создать воронку" initial="" onClose={close} onSubmit={async (name) => { const id = await funnelConfig.createFunnel({ name, stages: defaultStages }); setSelectedId(id); }} />}
    {dialog?.kind === 'rename' && funnel && <NameDialog label="Название воронки" placeholder="Например, Опт" describeError={funnelErrorMessage} title="Переименовать воронку" submitLabel="Сохранить" initial={funnel.name} onClose={close} onSubmit={(name) => funnelConfig.updateFunnel(funnel.id, { name })} />}
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

function DeleteFunnelDialog({ funnel, onClose, onDelete }: { funnel: Funnel; onClose: () => void; onDelete: () => Promise<unknown> }) {
  const { saving, error, run } = useSubmit(onClose, funnelErrorMessage);
  const deals = dealTotal(funnel);
  return <Dialog open title={`Удалить воронку «${funnel.name}»?`} description={deals ? `В воронке ${plural(deals, DEALS)}. Перенесите их в другую воронку, чтобы удалить её.` : 'Этапы и настройки доступа будут удалены. Действие нельзя отменить.'} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button variant="danger" disabled={saving || deals > 0} onClick={() => void run(onDelete, 'Воронка не удалена')}>Удалить</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : <p className="dialog-text">{deals ? 'Сделки переносятся на доске продаж: откройте сделку и выберите другую воронку.' : 'Сотрудники перестанут видеть эту воронку на доске продаж.'}</p>}
  </Dialog>;
}

export function StageDialog({ stage, onClose, onSubmit }: { stage?: DealStage; onClose: () => void; onSubmit: (input: StageInput) => Promise<unknown> }) {
  return <SharedStageDialog stage={stage && editable(stage)} kinds={outcomes} kindLabel="Итог этапа" defaultKind="OPEN" placement="Этап появится последней колонкой на доске. Порядок можно изменить." describeError={funnelErrorMessage} onClose={onClose} onSubmit={(input) => onSubmit({ name: input.name, color: input.color, outcome: input.kind })} />;
}

export function DeleteStageDialog({ stage, stages, onClose, onDelete }: { stage: DealStage; stages: DealStage[]; onClose: () => void; onDelete: (moveToStageId?: string) => Promise<unknown> }) {
  return <SharedDeleteStageDialog stage={editable(stage)} stages={stages.map(editable)} countForms={DEALS} recordsLabel="сделки" describeError={funnelErrorMessage} onClose={onClose} onDelete={onDelete} />;
}

export function AccessDialog({ funnel, onClose, onSubmit }: { funnel: Funnel; onClose: () => void; onSubmit: (access: FunnelAccessInput) => Promise<unknown> }) {
  const { users } = useWorkspace();
  const [mode, setMode] = useState<FunnelAccessMode>(funnel.accessMode ?? 'COMPANY');
  const [departmentIds, setDepartmentIds] = useState<string[]>(funnel.departmentIds ?? []);
  const [userIds, setUserIds] = useState<string[]>(funnel.userIds ?? []);
  const { saving, error, run } = useSubmit(onClose, funnelErrorMessage);
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
