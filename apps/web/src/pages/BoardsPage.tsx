import { useTranslation } from 'react-i18next';
import { Lock, Flag, SquareKanban, Plus, Settings2, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskCard } from '../components/TaskCard';
import { TaskDialog } from '../components/TaskDialog';
import { Badge, Button, EmptyState, IconButton, PageHeader } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { boardErrorMessage } from '../lib/boardErrors';
import { boardGroupName, categories, countTasks, defaultBoard, groupBoards, isOverdue, orderedStages, rememberBoard, rememberedBoard } from '../lib/boards';
import type { TaskAssignee, WorkTask } from '../types';

/** A board's kanban: every task on the board, whoever it is assigned to, in the board's own stages. */
export function BoardsPage() {
  const { t } = useTranslation(['tasks', 'common']);
  const { session } = useAuth();
  const { tasks, taskBoards, moveTask } = useWorkspace();
  const navigate = useNavigate();
  const user = session!.user;
  const [selectedId, setSelectedId] = useState<string | null>(() => rememberedBoard(user.id));
  const [assignee, setAssignee] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [placement, setPlacement] = useState<'ALL' | 'BOARD' | 'PERSONAL'>('ALL');
  const [dialog, setDialog] = useState<{ task?: WorkTask; stageId?: string } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState('');
  const board = taskBoards.find((item) => item.id === selectedId) ?? defaultBoard(taskBoards, user);
  const canConfigure = user.role === 'DIRECTOR' || user.role === 'MANAGER';

  useEffect(() => { if (board) rememberBoard(user.id, board.id); }, [board, user.id]);

  const boardTasks = useMemo(() => tasks.filter((task) => task.boardId === board?.id), [tasks, board]);
  const people = useMemo(() => {
    const byId = new Map<string, TaskAssignee>();
    boardTasks.forEach((task) => task.assignees.forEach((person) => byId.set(person.id, person)));
    return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  }, [boardTasks]);
  const visible = boardTasks.filter((task) => (assignee === 'ALL' || task.assignees.some((person) => person.id === assignee)) && (priority === 'ALL' || task.priority === priority)
    && (placement === 'ALL' || (placement === 'PERSONAL') === (task.onBoard === false)));
  const overdue = visible.filter(isOverdue).length;
  const stages = board ? orderedStages(board) : [];

  const changeStage = async (task: WorkTask, stageId: string) => {
    if (task.stage.id === stageId) return;
    setError('');
    try { await moveTask(task.id, stageId); } catch (reason) { setError(boardErrorMessage(reason, t('mine.moveFailed'))); }
  };
  const drop = (event: DragEvent, stageId: string) => {
    event.preventDefault();
    const task = boardTasks.find((item) => item.id === dragged);
    if (task) void changeStage(task, stageId);
    setDragged(null);
  };
  const selectBoard = (id: string) => { setSelectedId(id); setAssignee('ALL'); };
  const settingsPath = board?.canManage ? `/boards/${board.id}/settings` : '/boards/settings';

  const switcher = taskBoards.length > 1 && <label className="compact-select"><SquareKanban size={15} /><select aria-label={t('boards.board')} value={board?.id} onChange={(event) => selectBoard(event.target.value)}>{groupBoards(taskBoards).map((group) => <optgroup key={group.label} label={group.label}>{group.boards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></label>;
  return <>
    <PageHeader title={board?.name ?? t('boards.title')} description={board ? `${boardGroupName(board)} · ${countTasks(visible.length)}${overdue ? ` · ${t('count.overdue', { count: overdue })}` : ''}` : undefined} action={<>
      {switcher}
      {board && <label className="compact-select"><UserRound size={15} /><select aria-label={t('boards.assignee')} value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="ALL">{t('boards.allAssignees')}</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>}
      {board && canConfigure && <label className="compact-select"><Lock size={15} /><select aria-label={t('boards.visibility')} value={placement} onChange={(event) => setPlacement(event.target.value as typeof placement)}><option value="ALL">{t('boards.allTasks')}</option><option value="BOARD">{t('boards.shared')}</option><option value="PERSONAL">{t('boards.personal')}</option></select></label>}
      {board && <label className="compact-select"><Flag size={15} /><select aria-label={t('priority.label')} value={priority} onChange={(event) => setPriority(event.target.value)}><option value="ALL">{t('priority.all')}</option><option value="HIGH">{t('priority.HIGH')}</option><option value="NORMAL">{t('priority.NORMAL')}</option><option value="LOW">{t('priority.LOW')}</option></select></label>}
      {canConfigure && <IconButton label={t('boards.configure')} icon={Settings2} onClick={() => navigate(settingsPath)} />}
      {board && <Button icon={Plus} onClick={() => setDialog({})}>{t('mine.newTask')}</Button>}
    </>} />
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>{t('common:actions.close')}</button></div>}
    {!board ? <EmptyState title={t('mine.noBoardsTitle')} description={canConfigure ? t('boards.createHint') : t('boards.askHint')} icon={SquareKanban} action={canConfigure ? <Button icon={Settings2} onClick={() => navigate('/boards/settings')}>{t('boards.configure')}</Button> : undefined} />
      : <div className="kanban kanban--sales">{stages.map((stage) => {
        const items = visible.filter((task) => task.stage.id === stage.id);
        return <section className="kanban-column" key={stage.id} aria-label={stage.name} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, stage.id)}>
          <header style={{ '--stage-color': stage.color } as React.CSSProperties}><div><i /><strong>{stage.name}</strong><Badge>{items.length}</Badge></div><span>{categories[stage.category].label}</span></header>
          <div className="kanban-column__body">
            {items.map((task) => <TaskCard key={task.id} task={task} moveLabel={t('boards.stageOf', { title: task.title })} moveValue={stage.id} moveOptions={stages.map((item) => ({ value: item.id, label: item.name }))}
              onDrag={() => setDragged(task.id)} onMove={(value) => void changeStage(task, value)} onOpen={() => setDialog({ task })} />)}
            {!items.length && <div className="kanban-empty">{t('mine.noTasks')}</div>}
            <button className="kanban-add" onClick={() => setDialog({ stageId: stage.id })}><Plus size={15} />{t('mine.addTask')}</button>
          </div>
        </section>;
      })}</div>}
    {dialog && board && <TaskDialog task={dialog.task} boardId={board.id} stageId={dialog.stageId} onClose={() => setDialog(null)} />}
  </>;
}
