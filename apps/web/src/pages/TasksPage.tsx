import { CalendarDays, CheckCircle2, Circle, Clock3, Filter, GripVertical, ListFilter, Plus, UserRound } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { Badge, Button, EmptyState, PageHeader, Segmented } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { formatDate } from '../lib/format';
import type { TaskStatus, WorkTask } from '../types';
import { TaskDialog } from './DashboardPage';

const columns: Array<{ key: TaskStatus; label: string; icon: typeof Circle }> = [
  { key: 'TODO', label: 'Нужно сделать', icon: Circle }, { key: 'IN_PROGRESS', label: 'В работе', icon: Clock3 }, { key: 'DONE', label: 'Готово', icon: CheckCircle2 },
];

export function TasksPage() {
  const { session } = useAuth(); const { tasks, users, moveTask, addTask } = useWorkspace();
  const [view, setView] = useState<'mine' | 'team'>(session!.user.role === 'EMPLOYEE' ? 'mine' : 'team');
  const [priority, setPriority] = useState('ALL'); const [dialogOpen, setDialogOpen] = useState(false); const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState('');
  const visible = useMemo(() => tasks.filter((task) => (view === 'team' || task.assigneeId === session!.user.id) && (priority === 'ALL' || task.priority === priority)), [tasks, view, priority, session]);
  const overdue = visible.filter((task) => task.status !== 'DONE' && new Date(task.dueAt).getTime() < Date.now()).length;
  const changeTask = async (id: string, status: TaskStatus) => { setError(''); try { await moveTask(id, status); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Статус не изменён'); } };
  const drop = (event: DragEvent, status: TaskStatus) => { event.preventDefault(); if (dragged) void changeTask(dragged, status); setDragged(null); };

  return <>
    <PageHeader title="Задачи" description={`${visible.length} задач${overdue ? ` · ${overdue} просрочено` : ''}`} action={<><select className="header-select" aria-label="Фильтр по приоритету" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="ALL">Все приоритеты</option><option value="HIGH">Высокий</option><option value="NORMAL">Обычный</option><option value="LOW">Низкий</option></select><Button icon={Plus} onClick={() => setDialogOpen(true)}>Новая задача</Button></>}><Segmented value={view} label="Область задач" options={session!.user.role === 'EMPLOYEE' ? [{ value: 'mine', label: 'Мои задачи' }] : [{ value: 'mine', label: 'Мои' }, { value: 'team', label: 'Команда' }]} onChange={setView} /></PageHeader>
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>Закрыть</button></div>}
    <div className="kanban kanban--tasks">{columns.map((column) => { const items = visible.filter((task) => task.status === column.key); return <section className="kanban-column task-column" key={column.key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, column.key)}><header><div><column.icon size={16} /><strong>{column.label}</strong><Badge>{items.length}</Badge></div></header><div className="kanban-column__body">{items.map((task) => <TaskCard key={task.id} task={task} onDrag={() => setDragged(task.id)} onMove={(status) => void changeTask(task.id, status)} />)}{!items.length && <div className="kanban-empty">Нет задач</div>}<button className="kanban-add" onClick={() => setDialogOpen(true)}><Plus size={15} />Добавить задачу</button></div></section>; })}</div>
    {!visible.length && <EmptyState title="Задач нет" description="Создайте задачу или измените фильтр" icon={ListFilter} />}
    <TaskDialog open={dialogOpen} onClose={() => setDialogOpen(false)} users={users} onSave={addTask} />
  </>;
}

function TaskCard({ task, onDrag, onMove }: { task: WorkTask; onDrag: () => void; onMove: (status: TaskStatus) => void }) {
  const overdue = task.status !== 'DONE' && new Date(task.dueAt).getTime() < Date.now();
  return <article className={`kanban-card task-card ${overdue ? 'task-card--overdue' : ''}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; onDrag(); }}><div className="kanban-card__top"><span className="drag-handle"><GripVertical size={15} /></span><Badge tone={task.priority === 'HIGH' ? 'danger' : task.priority === 'LOW' ? 'neutral' : 'info'}>{task.priority === 'HIGH' ? 'Высокий' : task.priority === 'LOW' ? 'Низкий' : 'Обычный'}</Badge></div><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}{task.dealTitle && <small className="linked-deal">{task.dealTitle}</small>}<div className="kanban-card__meta"><span className={overdue ? 'is-overdue' : ''}><CalendarDays size={13} />{formatDate(task.dueAt)}</span><span><UserRound size={13} />{task.assigneeName.split(' ')[0]}</span></div><select className="card-move-select" aria-label={`Изменить статус задачи ${task.title}`} value={task.status} onChange={(event) => onMove(event.target.value as TaskStatus)}>{columns.map((column) => <option value={column.key} key={column.key}>{column.label}</option>)}</select></article>;
}
