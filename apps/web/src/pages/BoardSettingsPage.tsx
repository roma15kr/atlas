import { ArrowLeft, CheckCircle2, Circle, Clock3, Pencil, Plus, SquareKanban, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DeleteStageDialog, NameDialog, StageDialog, StageRows, useSubmit, type EditableStage } from '../components/stageSettings';
import { Avatar, Badge, Button, Dialog, EmptyState, Field, PageHeader, SectionHeader, SelectField, Surface } from '../components/ui';
import { useAuth, useWorkspace, type BoardStageInput } from '../context/AppContext';
import { boardErrorMessage } from '../lib/boardErrors';
import { BOARDS, boardGroupName, categories, categoryOrder, orderedStages, STAGES, TASKS } from '../lib/boards';
import { plural } from '../lib/format';
import type { BoardUser, TaskBoard, TaskCategory, TaskStage } from '../types';

const PEOPLE: [string, string, string] = ['человек', 'человека', 'человек'];
const icons: Record<TaskCategory, typeof Circle> = { TODO: Circle, ACTIVE: Clock3, DONE: CheckCircle2 };

const defaultStages: BoardStageInput[] = [
  { name: 'Нужно сделать', color: '#687472', category: 'TODO' },
  { name: 'В работе', color: '#a66c20', category: 'ACTIVE' },
  { name: 'Готово', color: '#39815a', category: 'DONE' },
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
  const { session } = useAuth();
  const { taskBoards, tasks, taskBoardConfig } = useWorkspace();
  const navigate = useNavigate();
  const { id } = useParams();
  const user = session!.user;
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
    void taskBoardConfig.reorderStages(board.id, stageIds).catch((reason: unknown) => setPageError(boardErrorMessage(reason, 'Порядок этапов не сохранён')));
  };
  const deleteBlocked = (stage: EditableStage<TaskCategory>) => {
    if (stages.length === 1) return 'Нельзя удалить последний этап';
    if (stage.kind !== 'ACTIVE' && stages.filter((item) => item.kind === stage.kind).length === 1) return `На доске должен остаться этап «${categories[stage.kind].label}»`;
    return undefined;
  };
  const toInput = (input: { name: string; color: string; kind: TaskCategory }): BoardStageInput => ({ name: input.name, color: input.color, category: input.kind });
  const peopleCount = people?.filter((person) => person.role !== 'DIRECTOR').length ?? 0;

  return <>
    <button className="back-link" onClick={() => navigate('/boards')}><ArrowLeft size={15} />К доскам</button>
    <PageHeader title="Настройка досок" description={`${plural(managed.length, BOARDS)} · ${plural(stageCount, STAGES)}`} action={<Button icon={Plus} onClick={() => setDialog({ kind: 'create' })}>Новая доска</Button>} />
    {pageError && <div className="notice notice--danger" role="alert">{pageError}<button onClick={() => setPageError('')}>Закрыть</button></div>}
    {!board ? <Surface><EmptyState title="Досок пока нет" description="Создайте доску для задач отдела — её увидят все сотрудники отдела" icon={SquareKanban} action={<Button icon={Plus} onClick={() => setDialog({ kind: 'create' })}>Новая доска</Button>} /></Surface> : <div className="team-layout">
      <Surface className="team-list">
        <div className="team-list__rows funnel-list">{managed.map((item) => <button key={item.id} className={item.id === board.id ? 'is-active' : ''} onClick={() => select(item.id)}>
          <span className="integration-icon funnel-icon"><SquareKanban size={17} /></span>
          <span><strong>{item.name}</strong><small>{boardGroupName(item)} · {plural(item.stages.length, STAGES)} · {plural(boardTaskCount(item), TASKS)}</small></span>
          {item.memberIds?.length ? <Badge tone="info">+{item.memberIds.length}</Badge> : null}
        </button>)}</div>
      </Surface>

      <div className="team-detail">
        <Surface className="team-profile">
          <div className="team-profile__head">
            <span className="integration-icon funnel-icon funnel-icon--lg"><SquareKanban size={24} /></span>
            <div><h2>{board.name}</h2><span>{plural(board.stages.length, STAGES)} · {plural(boardTaskCount(board), TASKS)}</span><div>{board.departmentId ? <Badge tone="info">{board.departmentName}</Badge> : <Badge tone="warning">Доска руководства</Badge>}</div></div>
            <div className="team-profile__actions">
              <Button variant="secondary" icon={Pencil} onClick={() => setDialog({ kind: 'rename' })}>Переименовать</Button>
              <Button variant="ghost" icon={Trash2} onClick={() => setDialog({ kind: 'delete-board' })}>Удалить</Button>
            </div>
          </div>
          <div className="profile-facts">
            {categoryOrder.map((category) => { const Icon = icons[category]; const items = stages.filter((stage) => stage.kind === category); return <div key={category}><Icon size={16} /><span><small>{categories[category].label}</small><strong>{plural(items.length, STAGES)} · {plural(items.reduce((sum, stage) => sum + stage.count, 0), TASKS)}</strong></span></div>; })}
            <div><Users size={16} /><span><small>Доступ</small><strong>{people ? plural(peopleCount, PEOPLE) : '…'}</strong></span></div>
          </div>
        </Surface>

        <Surface className="funnel-card">
          <SectionHeader title="Этапы" meta={<Badge tone="info">{stages.length}</Badge>} action={<Button variant="secondary" icon={Plus} onClick={() => setDialog({ kind: 'stage' })}>Добавить этап</Button>} />
          <p className="funnel-card__hint">Этапы — колонки доски. Категория определяет, считается ли задача начатой или выполненной в «Моих задачах» и отчётах.</p>
          <StageRows stages={stages} kinds={categories} countForms={TASKS} deleteBlockedReason={deleteBlocked} onReorder={reorder}
            onEdit={(stage) => setDialog({ kind: 'stage', stage })} onDelete={(stage) => setDialog({ kind: 'delete-stage', stage })} />
        </Surface>

        <Surface className="funnel-card">
          <SectionHeader title="Участники" meta={people ? <Badge tone="info">{peopleCount}</Badge> : undefined} action={<Button variant="secondary" icon={Users} onClick={() => setDialog({ kind: 'members' })}>Изменить участников</Button>} />
          <p className="funnel-card__hint">{board.departmentId ? `Сотрудники отдела «${board.departmentName}» видят доску автоматически. ` : 'Доску руководства видят только директора и добавленные участники. '}Директора видят все доски.</p>
          {!people ? <p className="funnel-card__hint">Загружаем участников…</p> : <ul className="stage-rows member-rows">{people.filter((person) => person.role !== 'DIRECTOR').map((person) => <li key={person.id}>
            <Avatar name={person.fullName} size="sm" />
            <span className="stage-rows__name"><strong>{person.fullName}</strong><small>{[person.departmentName ?? 'Без отдела', person.jobTitle].filter(Boolean).join(' · ')}</small></span>
            {person.isMember ? <Badge tone="info">Участник</Badge> : <Badge>Отдел</Badge>}
          </li>)}{!peopleCount && <li><span className="stage-rows__name"><small>Пока никого — добавьте участников</small></span></li>}</ul>}
        </Surface>
      </div>
    </div>}

    {dialog?.kind === 'create' && <CreateBoardDialog onClose={close} onCreated={select} />}
    {dialog?.kind === 'rename' && board && <NameDialog title="Переименовать доску" label="Название доски" placeholder="Например, Запуск продукта" submitLabel="Сохранить" initial={board.name} describeError={boardErrorMessage} onClose={close} onSubmit={(name) => taskBoardConfig.updateBoard(board.id, { name })} />}
    {dialog?.kind === 'delete-board' && board && <DeleteBoardDialog board={board} taskCount={boardTaskCount(board)} onClose={close} onDelete={async () => { await taskBoardConfig.deleteBoard(board.id); navigate('/boards/settings'); }} />}
    {dialog?.kind === 'stage' && board && <StageDialog stage={dialog.stage} kinds={categories} kindLabel="Категория" defaultKind="ACTIVE" placement="Этап появится последней колонкой на доске. Порядок можно изменить." describeError={boardErrorMessage} onClose={close}
      onSubmit={(input) => dialog.stage ? taskBoardConfig.updateStage(board.id, dialog.stage.id, changedFields(dialog.stage, toInput(input))) : taskBoardConfig.addStage(board.id, toInput(input))} />}
    {dialog?.kind === 'delete-stage' && board && <DeleteStageDialog stage={dialog.stage} stages={stages} countForms={TASKS} recordsLabel="задачи" describeError={boardErrorMessage} onClose={close} onDelete={(target) => taskBoardConfig.deleteStage(board.id, dialog.stage.id, target)} />}
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
  const { session } = useAuth();
  const { users, taskBoardConfig } = useWorkspace();
  const user = session!.user;
  const isDirector = user.role === 'DIRECTOR';
  const departments = useMemo(() => [...new Map(users.filter((member) => member.departmentId).map((member) => [member.departmentId!, member.department])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'ru')), [users]);
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState(isDirector ? (user.departmentId ?? '') : user.departmentId ?? '');
  const { saving, error, run } = useSubmit(onClose, boardErrorMessage);
  const trimmed = name.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => onCreated(await taskBoardConfig.createBoard({ name: trimmed, departmentId: departmentId || null, stages: defaultStages })), 'Доска не создана');
  };
  return <Dialog open title="Новая доска" description="Будут созданы этапы «Нужно сделать», «В работе» и «Готово» — их можно изменить после создания." onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="board-form" disabled={saving || !trimmed}>{saving ? 'Создаём…' : 'Создать доску'}</Button></>}>
    <form id="board-form" className="form-grid" onSubmit={submit}>
      <Field label="Название доски" className="field--wide"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required placeholder="Например, Запуск продукта" autoFocus /></Field>
      {isDirector
        ? <div className="field field--wide"><SelectField label="Отдел" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>{departments.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="">Без отдела — доска руководства</option></SelectField><small>{departmentId ? 'Доску увидят все сотрудники отдела.' : 'Доску увидят только директора и добавленные участники.'}</small></div>
        : <Field label="Отдел" className="field--wide" hint="Руководитель создаёт доски своего отдела"><input value={user.department} disabled /></Field>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

function DeleteBoardDialog({ board, taskCount, onClose, onDelete }: { board: TaskBoard; taskCount: number; onClose: () => void; onDelete: () => Promise<unknown> }) {
  const { saving, error, run } = useSubmit(onClose, boardErrorMessage);
  return <Dialog open title={`Удалить доску «${board.name}»?`} description={taskCount ? `На доске ${plural(taskCount, TASKS)}. Перенесите их на другую доску, чтобы удалить её.` : 'Этапы и список участников будут удалены. Действие нельзя отменить.'} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button variant="danger" disabled={saving || taskCount > 0} onClick={() => void run(onDelete, 'Доска не удалена')}>Удалить</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : <p className="dialog-text">{taskCount ? 'Задачу можно перенести, открыв её и выбрав другую доску.' : 'Сотрудники перестанут видеть эту доску.'}</p>}
  </Dialog>;
}

function MembersDialog({ board, onClose }: { board: TaskBoard; onClose: () => void }) {
  const { taskBoardConfig } = useWorkspace();
  const [candidates, setCandidates] = useState<BoardUser[] | null>(null);
  const [selected, setSelected] = useState<string[]>(board.memberIds ?? []);
  const [loadError, setLoadError] = useState('');
  const { saving, error, run } = useSubmit(onClose, boardErrorMessage);
  useEffect(() => {
    taskBoardConfig.memberCandidates(board.id).then(setCandidates, (reason: unknown) => { setCandidates([]); setLoadError(boardErrorMessage(reason, 'Список сотрудников не загружен')); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id]);
  // Department members already see the board; only people from elsewhere can be added.
  const outside = (candidates ?? []).filter((person) => !board.departmentId || person.departmentId !== board.departmentId);
  const groups = [...new Map(outside.map((person) => [person.departmentName ?? 'Без отдела', outside.filter((item) => (item.departmentName ?? 'Без отдела') === (person.departmentName ?? 'Без отдела'))])).entries()];
  const toggle = (userId: string) => setSelected(selected.includes(userId) ? selected.filter((item) => item !== userId) : [...selected, userId]);
  return <Dialog open title="Участники доски" description={board.departmentId ? `Отдел «${board.departmentName}» видит доску автоматически. Добавьте сотрудников других отделов.` : 'Выберите сотрудников, которые увидят доску руководства.'} size="lg" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button disabled={saving || !candidates} onClick={() => void run(() => taskBoardConfig.setMembers(board.id, selected), 'Участники не сохранены')}>{saving ? 'Сохраняем…' : 'Сохранить участников'}</Button></>}>
    <div className="form-grid">
      {!candidates ? <p className="dialog-text field--wide">Загружаем сотрудников…</p> : groups.length ? groups.map(([department, members]) => <fieldset className="check-list" key={department}><legend>{department}</legend>{members.map((person) => <label key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} /><span>{person.fullName}<small>{person.jobTitle || department}</small></span></label>)}</fieldset>) : <p className="dialog-text field--wide">В других отделах пока нет сотрудников.</p>}
      <p className="dialog-text field--wide">Участник видит все задачи доски, может создавать и перемещать их. Настраивать доску он не может.</p>
      {(loadError || error) && <div className="form-error field--wide" role="alert">{error || loadError}</div>}
    </div>
  </Dialog>;
}
