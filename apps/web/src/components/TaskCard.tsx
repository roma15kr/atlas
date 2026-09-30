import { CalendarDays, GripVertical } from 'lucide-react';
import { formatDate } from '../lib/format';
import { isOverdue, priorityLabels } from '../lib/boards';
import type { TaskAssignee, WorkTask } from '../types';
import { Avatar, Badge } from './ui';

export function AvatarStack({ people, max = 3 }: { people: TaskAssignee[]; max?: number }) {
  const shown = people.slice(0, max);
  const names = people.map((person) => person.fullName).join(', ');
  return <span className="avatar-stack" title={names} aria-label={`Исполнители: ${names}`}>{shown.map((person) => <Avatar key={person.id} name={person.fullName} size="sm" />)}{people.length > max && <i>+{people.length - max}</i>}</span>;
}

/** A task card for both kanbans; the select is the keyboard alternative to dragging. */
export function TaskCard({ task, caption, moveLabel, moveValue, moveOptions, onDrag, onMove, onOpen }: {
  task: WorkTask; caption?: string; moveLabel: string; moveValue: string; moveOptions: Array<{ value: string; label: string }>;
  onDrag: () => void; onMove: (value: string) => void; onOpen: () => void;
}) {
  const overdue = isOverdue(task);
  return <article className={`kanban-card task-card ${overdue ? 'task-card--overdue' : ''}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; onDrag(); }}>
    <div className="kanban-card__top"><span className="drag-handle"><GripVertical size={15} /></span>{caption && <small>{caption}</small>}<Badge tone={task.priority === 'HIGH' ? 'danger' : task.priority === 'LOW' ? 'neutral' : 'info'}>{priorityLabels[task.priority]}</Badge></div>
    <button type="button" className="task-card__title" onClick={onOpen}>{task.title}</button>
    {task.description && <p>{task.description}</p>}
    {task.dealTitle && <small className="linked-deal">{task.dealTitle}</small>}
    <div className="kanban-card__meta"><span className={overdue ? 'is-overdue' : ''}><CalendarDays size={13} />{task.dueAt ? formatDate(task.dueAt) : 'Без срока'}</span><AvatarStack people={task.assignees} /></div>
    <select className="card-move-select" aria-label={moveLabel} value={moveValue} onChange={(event) => onMove(event.target.value)}>{moveOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
  </article>;
}
