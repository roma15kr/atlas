import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, Circle, Clock3, Pencil, Plus, SquareKanban, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DeleteStageDialog, NameDialog, StageDialog, StageRows, useSubmit, type EditableStage } from '../components/stageSettings';
import { Avatar, Badge, Button, Dialog, EmptyState, Field, PageHeader, SectionHeader, SelectField, Surface } from '../components/ui';
import { useAuth, useWorkspace, type BoardStageInput } from '../context/AppContext';
import { boardErrorMessage } from '../lib/boardErrors';
import { boardGroupName, categories, categoryOrder, countBoards, countStages, countTasks, orderedStages, taskRecords } from '../lib/boards';
import i18n, { localeOf } from '../i18n';
import type { BoardUser, TaskBoard, TaskCategory, TaskStage } from '../types';

const icons: Record<TaskCategory, typeof Circle> = { TODO: Circle, ACTIVE: Clock3, DONE: CheckCircle2 };

/** The stages a new board starts with, named in the creator's language (they are data afterwards). */
const defaultStages = (): BoardStageInput[] => [
  { name: i18n.t('tasks:settings.defaults.todo'), color: '#687472', category: 'TODO' },
  { name: i18n.t('tasks:settings.defaults.active'), color: '#a66c20', category: 'ACTIVE' },
  { name: i18n.t('tasks:settings.defaults.done'), color: '#39815a', category: 'DONE' },
];

type DialogState =
  | { kind: 'create' }
  | { kind: 'rename' }
  | { kind: 'delete-board' }
  | { kind: 'stage'; stage?: EditableStage<TaskCategory> }
  | { kind: 'delete-stage'; stage: EditableStage<TaskCategory> }
  | { kind: 'members' }
  | null;

/** Board settings for directors (every board) and department heads (their department's boards). */
export function BoardSettingsPage() {
  const { t } = useTranslation(['tasks', 'common']);
  const { taskBoards, tasks, taskBoardConfig } = useWorkspace();
  const navigate = useNavigate();
  const { id } = useParams();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pageError, setPageError] = useState('');
  const [people, setPeople] = useState<BoardUser[] | null>(null);
  const managed = useMemo(() => taskBoards.filter((board) => board.canManage), [taskBoards]);
  const board = managed.find((item) => item.id === id) ?? managed[0];
  const close = () => setDialog(null);

  const counts = useMemo(() => {
    const byStage = new Map<string, number>();
    tasks.forEach((task) => byStage.set(task.stage.id, (byStage.get(task.stage.id) ?? 0) + 1));
    return byStage;
  }, [tasks]);
  const boardTaskCount = (item: TaskBoard) => item.stages.reduce((sum, stage) => sum + (counts.get(stage.id) ?? 0), 0);
  const editable = (stage: TaskStage): EditableStage<TaskCategory> => ({ id: stage.id, name: stage.name, color: stage.color, kind: stage.category, count: counts.get(stage.id) ?? 0 });
  const stages = board ? orderedStages(board).map(editable) : [];
  const stageCount = managed.reduce((sum, item) => sum + item.stages.length, 0);
  const memberKey = board?.memberIds?.join() ?? '';

  useEffect(() => {
    if (!board) return;
    let active = true;
    setPeople(null);
    taskBoardConfig.boardUsers(board.id).then((users) => { if (active) setPeople(users); }, () => { if (active) setPeople([]); });
    return () => { active = false; };
  // Reload when the board or its member list changes, not on every board list refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.id, memberKey]);

  const select = (boardId: string) => navigate(`/boards/${boardId}/settings`);
  const reorder = (stageIds: string[]) => {
    if (!board) return;
    setPageError('');
    void taskBoardConfig.reorderStages(board.id, stageIds).catch((reason: unknown) => setPageError(boardErrorMessage(reason, t('settings.reorderFailed'))));
  };
  const deleteBlocked = (stage: EditableStage<TaskCategory>) => {
    if (stages.length === 1) return t('settings.lastStage');
    if (stage.kind !== 'ACTIVE' && stages.filter((item) => item.kind === stage.kind).length === 1) return t('settings.keepStage', { stage: categories[stage.kind].label });
    return undefined;
  };
  const toInput = (input: { name: string; color: string; kind: TaskCategory }): BoardStageInput => ({ name: input.name, color: input.color, category: input.kind });
  const peopleCount = people?.filter((person) => person.role !== 'DIRECTOR').length ?? 0;

  return <>
    <button className="back-link" onClick={() => navigate('/boards')}><ArrowLeft size={15} />{t('settings.back')}</button>
    <PageHeader title={t('settings.title')} description={`${countBoards(managed.length)} · ${countStages(stageCount)}`} action={<Button icon={Plus} onClick={() => setDialog({ kind: 'create' })}>{t('settings.newBoard')}</Button>} />
    {pageError && <div className="notice notice--danger" role="alert">{pageError}<button onClick={() => setPageError('')}>{t('common:actions.close')}</button></div>}
    {!board ? <Surface><EmptyState title={t('settings.emptyTitle')} description={t('settings.emptyText')} icon={SquareKanban} action={<Button icon={Plus} onClick={() => setDialog({ kind: 'create' })}>{t('settings.newBoard')}</Button>} /></Surface> : <div className="team-layout">
      <Surface className="team-list">
        <div className="team-list__rows funnel-list">{managed.map((item) => <button key={item.id} className={item.id === board.id ? 'is-active' : ''} onClick={() => select(item.id)}>
          <span className="integration-icon funnel-icon"><SquareKanban size={17} /></span>
          <span><strong>{item.name}</strong><small>{boardGroupName(item)} · {countStages(item.stages.length)} · {countTasks(boardTaskCount(item))}</small></span>
          {item.memberIds?.length ? <Badge tone="info">+{item.memberIds.length}</Badge> : null}
        </button>)}</div>
      </Surface>

      <div className="team-detail">
        <Surface className="team-profile">
          <div className="team-profile__head">
            <span className="integration-icon funnel-icon funnel-icon--lg"><SquareKanban size={24} /></span>
            <div><h2>{board.name}</h2><span>{countStages(board.stages.length)} · {countTasks(boardTaskCount(board))}</span><div>{board.departmentId ? <Badge tone="info">{board.departmentName}</Badge> : <Badge tone="warning">{t('settings.leadershipBoard')}</Badge>}</div></div>
            <div className="team-profile__actions">
              <Button variant="secondary" icon={Pencil} onClick={() => setDialog({ kind: 'rename' })}>{t('settings.rename')}</Button>
              <Button variant="ghost" icon={Trash2} onClick={() => setDialog({ kind: 'delete-board' })}>{t('common:actions.delete')}</Button>
            </div>
          </div>
          <div className="profile-facts">
            {categoryOrder.map((category) => { const Icon = icons[category]; const items = stages.filter((stage) => stage.kind === category); return <div key={category}><Icon size={16} /><span><small>{categories[category].label}</small><strong>{countStages(items.length)} · {countTasks(items.reduce((sum, stage) => sum + stage.count, 0))}</strong></span></div>; })}
            <div><Users size={16} /><span><small>{t('settings.access')}</small><strong>{people ? t('count.people', { count: peopleCount }) : '…'}</strong></span></div>
          </div>
        </Surface>

        <Surface className="funnel-card">
          <SectionHeader title={t('settings.stages')} meta={<Badge tone="info">{stages.length}</Badge>} action={<Button variant="secondary" icon={Plus} onClick={() => setDialog({ kind: 'stage' })}>{t('settings.addStage')}</Button>} />
          <p className="funnel-card__hint">{t('settings.stagesHint')}</p>
          <StageRows stages={stages} kinds={categories} countLabel={countTasks} deleteBlockedReason={deleteBlocked} onReorder={reorder}
            onEdit={(stage) => setDialog({ kind: 'stage', stage })} onDelete={(stage) => setDialog({ kind: 'delete-stage', stage })} />
        </Surface>

        <Surface className="funnel-card">
          <SectionHeader title={t('settings.members')} meta={people ? <Badge tone="info">{peopleCount}</Badge> : undefined} action={<Button variant="secondary" icon={Users} onClick={() => setDialog({ kind: 'members' })}>{t('settings.editMembers')}</Button>} />
          <p className="funnel-card__hint">{board.departmentId ? t('settings.departmentHint', { department: board.departmentName }) : `${t('settings.leadershipHint')} `}{t('settings.directorsSeeAll')}</p>
          {!people ? <p className="funnel-card__hint">{t('settings.loadingMembers')}</p> : <ul className="stage-rows member-rows">{people.filter((person) => person.role !== 'DIRECTOR').map((person) => <li key={person.id}>
            <Avatar name={person.fullName} src={person.avatarUrl} size="sm" />
            <span className="stage-rows__name"><strong>{person.fullName}</strong><small>{[person.departmentName ?? t('board.noDepartment'), person.jobTitle].filter(Boolean).join(' · ')}</small></span>
            {person.isMember ? <Badge tone="info">{t('settings.member')}</Badge> : <Badge>{t('settings.department')}</Badge>}
          </li>)}{!peopleCount && <li><span className="stage-rows__name"><small>{t('settings.noMembers')}</small></span></li>}</ul>}
        </Surface>
      </div>
    </div>}

    {dialog?.kind === 'create' && <CreateBoardDialog onClose={close} onCreated={select} />}
    {dialog?.kind === 'rename' && board && <NameDialog title={t('settings.renameTitle')} label={t('settings.boardName')} placeholder={t('settings.boardNamePlaceholder')} submitLabel={t('common:actions.save')} initial={board.name} describeError={boardErrorMessage} onClose={close} onSubmit={(name) => taskBoardConfig.updateBoard(board.id, { name })} />}
    {dialog?.kind === 'delete-board' && board && <DeleteBoardDialog board={board} taskCount={boardTaskCount(board)} onClose={close} onDelete={async () => { await taskBoardConfig.deleteBoard(board.id); navigate('/boards/settings'); }} />}
    {dialog?.kind === 'stage' && board && <StageDialog stage={dialog.stage} kinds={categories} kindLabel={t('settings.category')} defaultKind="ACTIVE" placement={t('settings.placement')} describeError={boardErrorMessage} onClose={close}
      onSubmit={(input) => dialog.stage ? taskBoardConfig.updateStage(board.id, dialog.stage.id, changedFields(dialog.stage, toInput(input))) : taskBoardConfig.addStage(board.id, toInput(input))} />}
    {dialog?.kind === 'delete-stage' && board && <DeleteStageDialog stage={dialog.stage} stages={stages} records={taskRecords()} describeError={boardErrorMessage} onClose={close} onDelete={(target) => taskBoardConfig.deleteStage(board.id, dialog.stage.id, target)} />}
    {dialog?.kind === 'members' && board && <MembersDialog board={board} onClose={close} />}
  </>;

  function changedFields(stage: EditableStage<TaskCategory>, input: BoardStageInput): Partial<BoardStageInput> {
    const patch: Partial<BoardStageInput> = {};
    if (input.name !== stage.name) patch.name = input.name;
    if (input.color.toLowerCase() !== stage.color.toLowerCase()) patch.color = input.color;
    if (input.category !== stage.kind) patch.category = input.category;
    return patch;
  }
}

function CreateBoardDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation(['tasks', 'common']);
  const { session } = useAuth();
  const { users, taskBoardConfig } = useWorkspace();
  const user = session!.user;
  const isDirector = user.role === 'DIRECTOR';
  const departments = useMemo(() => [...new Map(users.filter((member) => member.departmentId).map((member) => [member.departmentId!, member.department])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], localeOf())), [users]);
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState(isDirector ? (user.departmentId ?? '') : user.departmentId ?? '');
  const { saving, error, run } = useSubmit(onClose, boardErrorMessage);
  const trimmed = name.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => onCreated(await taskBoardConfig.createBoard({ name: trimmed, departmentId: departmentId || null, stages: defaultStages() })), t('settings.createFailed'));
  };
  return <Dialog open title={t('settings.newBoard')} description={t('settings.createDescription')} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="board-form" disabled={saving || !trimmed}>{saving ? t('settings.creating') : t('settings.create')}</Button></>}>
    <form id="board-form" className="form-grid" onSubmit={submit}>
      <Field label={t('settings.boardName')} className="field--wide"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required placeholder={t('settings.boardNamePlaceholder')} autoFocus /></Field>
      {isDirector
        ? <div className="field field--wide"><SelectField label={t('settings.department')} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>{departments.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="">{t('settings.noDepartmentOption')}</option></SelectField><small>{departmentId ? t('settings.createDepartmentNote') : t('settings.createLeadershipNote')}</small></div>
        : <Field label={t('settings.department')} className="field--wide" hint={t('settings.headCreates')}><input value={user.department} disabled /></Field>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

function DeleteBoardDialog({ board, taskCount, onClose, onDelete }: { board: TaskBoard; taskCount: number; onClose: () => void; onDelete: () => Promise<unknown> }) {
  const { t } = useTranslation(['tasks', 'common']);
  const { saving, error, run } = useSubmit(onClose, boardErrorMessage);
  return <Dialog open title={t('settings.deleteTitle', { name: board.name })} description={taskCount ? t('settings.deleteHasTasks', { tasks: countTasks(taskCount) }) : t('settings.deleteEmpty')} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button variant="danger" disabled={saving || taskCount > 0} onClick={() => void run(onDelete, t('settings.deleteFailed'))}>{t('common:actions.delete')}</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : <p className="dialog-text">{taskCount ? t('settings.deleteHasTasksNote') : t('settings.deleteEmptyNote')}</p>}
  </Dialog>;
}

function MembersDialog({ board, onClose }: { board: TaskBoard; onClose: () => void }) {
  const { t } = useTranslation(['tasks', 'common']);
  const { taskBoardConfig } = useWorkspace();
  const [candidates, setCandidates] = useState<BoardUser[] | null>(null);
  const [selected, setSelected] = useState<string[]>(board.memberIds ?? []);
  const [loadError, setLoadError] = useState('');
  const { saving, error, run } = useSubmit(onClose, boardErrorMessage);
  useEffect(() => {
    taskBoardConfig.memberCandidates(board.id).then(setCandidates, (reason: unknown) => { setCandidates([]); setLoadError(boardErrorMessage(reason, t('settings.peopleFailed'))); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id]);
  // Department members already see the board; only people from elsewhere can be added.
  const outside = (candidates ?? []).filter((person) => !board.departmentId || person.departmentId !== board.departmentId);
  const groups = [...new Map(outside.map((person) => [person.departmentName ?? t('board.noDepartment'), outside.filter((item) => (item.departmentName ?? t('board.noDepartment')) === (person.departmentName ?? t('board.noDepartment')))])).entries()];
  const toggle = (userId: string) => setSelected(selected.includes(userId) ? selected.filter((item) => item !== userId) : [...selected, userId]);
  return <Dialog open title={t('settings.membersTitle')} description={board.departmentId ? t('settings.membersDepartment', { department: board.departmentName }) : t('settings.membersLeadership')} size="lg" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button disabled={saving || !candidates} onClick={() => void run(() => taskBoardConfig.setMembers(board.id, selected), t('settings.membersFailed'))}>{saving ? t('common:actions.saving') : t('settings.membersSave')}</Button></>}>
    <div className="form-grid">
      {!candidates ? <p className="dialog-text field--wide">{t('dialog.loadingPeople')}</p> : groups.length ? groups.map(([department, members]) => <fieldset className="check-list" key={department}><legend>{department}</legend>{members.map((person) => <label key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} /><span>{person.fullName}<small>{person.jobTitle || department}</small></span></label>)}</fieldset>) : <p className="dialog-text field--wide">{t('settings.noOtherPeople')}</p>}
      <p className="dialog-text field--wide">{t('settings.memberNote')}</p>
      {(loadError || error) && <div className="form-error field--wide" role="alert">{error || loadError}</div>}
    </div>
  </Dialog>;
}
