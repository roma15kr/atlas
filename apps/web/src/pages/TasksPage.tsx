import { CheckCircle2, Circle, Clock3, Flag, ListChecks, Plus } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskCard } from '../components/TaskCard';
import { TaskDialog } from '../components/TaskDialog';
import { Badge, Button, EmptyState, PageHeader } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { boardErrorMessage } from '../lib/boardErrors';
import { categories, categoryOrder, defaultBoard, firstStageOf, isAssignedTo, isOverdue, onBoards, rememberedBoard, TASKS } from '../lib/boards';
import { plural } from '../lib/format';
import type { TaskCategory, WorkTask } from '../types';

const icons: Record<TaskCategory, typeof Circle> = { TODO: Circle, ACTIVE: Clock3, DONE: CheckCircle2 };

/** "Мои задачи": every task assigned to the current user, on any board, grouped by stage category. */
export function TasksPage() {
  const { session } = useAuth();
  const { tasks, taskBoards, moveTask } = useWorkspace();
  const navigate = useNavigate();
  const user = session!.user;
  const [priority, setPriority] = useState('ALL');
  const [dialog, setDialog] = useState<{ task?: WorkTask } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState('');
  const mine = useMemo(() => tasks.filter((task) => isAssignedTo(task, user.id) && (priority === 'ALL' || task.priority === priority)), [tasks, user.id, priority]);
  const overdue = mine.filter(isOverdue).length;
  const boardCount = new Set(mine.map((task) => task.boardId)).size;

  const moveToCategory = async (task: WorkTask, category: TaskCategory) => {
    if (task.stage.category === category) return;
    const stage = firstStageOf(taskBoards.find((board) => board.id === task.boardId), category);
    if (!stage) { setError(`На доске «${task.boardName}» нет этапа «${categories[category].label}»`); return; }
    setError('');
    try { await moveTask(task.id, stage.id); } catch (reason) { setError(boardErrorMessage(reason, 'Задача не перемещена')); }
  };
  const drop = (event: DragEvent, category: TaskCategory) => {
    event.preventDefault();
    const task = mine.find((item) => item.id === dragged);
    if (task) void moveToCategory(task, category);
    setDragged(null);
  };

  const description = `${plural(mine.length, TASKS)}${overdue ? ` · ${overdue} просрочено` : ''}${boardCount ? ` · на ${onBoards(boardCount)}` : ''}`;
  return <>
    <PageHeader title="Мои задачи" description={description} action={<>
      <label className="compact-select"><Flag size={15} /><select aria-label="Приоритет" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="ALL">Все приоритеты</option><option value="HIGH">Высокий</option><option value="NORMAL">Обычный</option><option value="LOW">Низкий</option></select></label>
      {taskBoards.length > 0 && <Button icon={Plus} onClick={() => setDialog({})}>Новая задача</Button>}
    </>} />
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>Закрыть</button></div>}
    {!taskBoards.length ? <EmptyState title="Нет доступных досок" description="Попросите руководителя отдела добавить вас на доску задач" icon={ListChecks} />
      : <div className="kanban kanban--tasks">{categoryOrder.map((category) => {
        const items = mine.filter((task) => task.stage.category === category);
        const Icon = icons[category];
        return <section className="kanban-column task-column" key={category} aria-label={categories[category].label} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, category)}>
          <header><div><Icon size={16} /><strong>{categories[category].label}</strong><Badge>{items.length}</Badge></div></header>
          <div className="kanban-column__body">
            {items.map((task) => <TaskCard key={task.id} task={task} caption={`${task.boardName} · ${task.stage.name}`} moveLabel={`Изменить статус задачи ${task.title}`} moveValue={category}
              moveOptions={categoryOrder.map((value) => ({ value, label: categories[value].label }))}
              onDrag={() => setDragged(task.id)} onMove={(value) => void moveToCategory(task, value as TaskCategory)} onOpen={() => setDialog({ task })} />)}
            {!items.length && <div className="kanban-empty">Нет задач</div>}
            {category === 'TODO' && <button className="kanban-add" onClick={() => setDialog({})}><Plus size={15} />Добавить задачу</button>}
          </div>
        </section>;
      })}</div>}
    {taskBoards.length > 0 && !mine.length && <p className="page-hint">Задачи коллег по отделу — на странице <button className="text-button" onClick={() => navigate('/boards')}>Доски</button></p>}
    {dialog && <TaskDialog task={dialog.task} boardId={defaultBoard(taskBoards, user, rememberedBoard(user.id))?.id} onClose={() => setDialog(null)} />}
  </>;
}
