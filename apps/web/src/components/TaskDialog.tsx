import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth, useWorkspace, type TaskInput } from '../context/AppContext';
import { boardErrorMessage } from '../lib/boardErrors';
import { categories, firstStageOf, groupBoards, orderedStages } from '../lib/boards';
import type { BoardUser, TaskBoard, TaskPriority, WorkTask } from '../types';
import { Button, Dialog, Field, SelectField } from './ui';

const toDateInput = (value?: string) => value ? new Date(value).toISOString().slice(0, 10) : '';
const fromDateInput = (value: string) => value ? new Date(value).toISOString() : null;

interface Draft {
  title: string;
  description: string;
  boardId: string;
  stageId: string;
  dueAt: string;
  priority: TaskPriority;
  assigneeIds: string[];
}

/**
 * Creates a task, or edits one when `task` is given. Assignees are limited to people who can
 * open the chosen board; a new task is assigned to the current user until changed.
 */
export function TaskDialog({ task, boardId, stageId, onClose }: { task?: WorkTask; boardId?: string; stageId?: string; onClose: () => void }) {
  const { session } = useAuth();
  const { taskBoards, addTask, updateTask, deleteTask, taskBoardConfig } = useWorkspace();
  const user = session!.user;
  const initialBoard = taskBoards.find((board) => board.id === (task?.boardId ?? boardId)) ?? taskBoards[0];
  const [draft, setDraft] = useState<Draft>(() => ({
    title: task?.title ?? '',
    description: task?.description ?? '',
    boardId: initialBoard?.id ?? '',
    stageId: task?.stage.id ?? stageId ?? firstStageOf(initialBoard, 'TODO')?.id ?? '',
    dueAt: toDateInput(task ? task.dueAt : new Date(Date.now() + 86400000).toISOString()),
    priority: task?.priority ?? 'NORMAL',
    assigneeIds: task ? task.assignees.map((assignee) => assignee.id) : [user.id],
  }));
  const [people, setPeople] = useState<BoardUser[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const board = taskBoards.find((item) => item.id === draft.boardId);
  const groups = useMemo(() => groupBoards(taskBoards), [taskBoards]);

  useEffect(() => {
    if (!draft.boardId) return;
    let active = true;
    setPeople(null);
    taskBoardConfig.boardUsers(draft.boardId).then((users) => {
      if (!active) return;
      setPeople(users);
      // Keep only assignees who can open the chosen board.
      setDraft((current) => ({ ...current, assigneeIds: current.assigneeIds.filter((id) => users.some((person) => person.id === id)) }));
    }).catch(() => { if (active) setPeople([]); });
    return () => { active = false; };
  // taskBoardConfig changes identity with every board list update; the board id is what matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.boardId]);

  const changeBoard = (next: TaskBoard | undefined) => {
    if (!next) return;
    const category = board?.stages.find((stage) => stage.id === draft.stageId)?.category ?? 'TODO';
    setDraft({ ...draft, boardId: next.id, stageId: (firstStageOf(next, category) ?? firstStageOf(next, 'TODO'))?.id ?? '' });
  };
  const toggle = (id: string) => setDraft({ ...draft, assigneeIds: draft.assigneeIds.includes(id) ? draft.assigneeIds.filter((item) => item !== id) : [...draft.assigneeIds, id] });

  const title = draft.title.trim();
  const ready = Boolean(title && draft.boardId && draft.stageId && draft.assigneeIds.length && people);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setSaving(true); setError('');
    const input: TaskInput = { boardId: draft.boardId, stageId: draft.stageId, assigneeIds: draft.assigneeIds, title, description: draft.description.trim(), dueAt: fromDateInput(draft.dueAt), priority: draft.priority };
    try {
      if (task) await updateTask(task.id, changes(task, input));
      else await addTask(input);
      onClose();
    } catch (reason) {
      setError(boardErrorMessage(reason, task ? 'Задача не сохранена' : 'Задача не создана'));
    } finally { setSaving(false); }
  };

  if (confirmDelete && task) return <DeleteTaskDialog task={task} onClose={() => setConfirmDelete(false)} onDeleted={onClose} onDelete={() => deleteTask(task.id)} />;

  const deleteBlocked = task && !task.canDelete ? 'Удалить задачу может её автор или руководитель отдела доски' : undefined;
  return <Dialog open title={task ? 'Задача' : 'Новая задача'} description={task ? `${task.boardName} · ${task.stage.name}` : 'Задачу увидят все участники выбранной доски'} size="lg" onClose={onClose} footer={<>
    {task && <Button variant="ghost" icon={Trash2} className="dialog-footer__start" disabled={Boolean(deleteBlocked)} title={deleteBlocked} onClick={() => setConfirmDelete(true)}>Удалить</Button>}
    <Button variant="secondary" onClick={onClose}>Отмена</Button>
    <Button type="submit" form="task-form" disabled={saving || !ready}>{saving ? 'Сохраняем…' : task ? 'Сохранить' : 'Создать задачу'}</Button>
  </>}>
    <form id="task-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label="Название" className="field--wide"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={240} required placeholder="Что нужно сделать" autoFocus={!task} /></Field>
      <Field label="Описание" className="field--wide"><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} placeholder="Контекст и ожидаемый результат" /></Field>
      <SelectField label="Доска" value={draft.boardId} onChange={(event) => changeBoard(taskBoards.find((item) => item.id === event.target.value))}>{groups.map((group) => <optgroup key={group.label} label={group.label}>{group.boards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</SelectField>
      <SelectField label="Этап" value={draft.stageId} onChange={(event) => setDraft({ ...draft, stageId: event.target.value })}>{board && orderedStages(board).map((stage) => <option key={stage.id} value={stage.id}>{stage.name} · {categories[stage.category].label}</option>)}</SelectField>
      <Field label="Срок"><input type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></Field>
      <SelectField label="Приоритет" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })}><option value="LOW">Низкий</option><option value="NORMAL">Обычный</option><option value="HIGH">Высокий</option></SelectField>
      <fieldset className="check-list field--wide"><legend>Исполнители</legend>
        {!people ? <small>Загружаем участников доски…</small> : people.map((person) => <label key={person.id}><input type="checkbox" checked={draft.assigneeIds.includes(person.id)} onChange={() => toggle(person.id)} /><span>{person.fullName}{person.id === user.id ? ' (вы)' : ''}<small>{person.departmentName ?? 'Без отдела'}</small></span></label>)}
      </fieldset>
      {people && !draft.assigneeIds.length && <small className="field--wide form-hint">Выберите хотя бы одного исполнителя</small>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

function changes(task: WorkTask, input: TaskInput): Partial<TaskInput> {
  const patch: Partial<TaskInput> = {};
  if (input.title !== task.title) patch.title = input.title;
  if ((input.description ?? '') !== (task.description ?? '')) patch.description = input.description;
  if (input.priority !== task.priority) patch.priority = input.priority;
  if (toDateInput(input.dueAt ?? undefined) !== toDateInput(task.dueAt || undefined)) patch.dueAt = input.dueAt;
  if (input.boardId !== task.boardId) { patch.boardId = input.boardId; patch.stageId = input.stageId; }
  else if (input.stageId !== task.stage.id) patch.stageId = input.stageId;
  const before = task.assignees.map((assignee) => assignee.id).sort().join();
  if ([...input.assigneeIds].sort().join() !== before) patch.assigneeIds = input.assigneeIds;
  return patch;
}

function DeleteTaskDialog({ task, onClose, onDelete, onDeleted }: { task: WorkTask; onClose: () => void; onDelete: () => Promise<void>; onDeleted: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    setSaving(true); setError('');
    try { await onDelete(); onDeleted(); } catch (reason) { setError(boardErrorMessage(reason, 'Задача не удалена')); } finally { setSaving(false); }
  };
  return <Dialog open title={`Удалить задачу «${task.title}»?`} description="Задача исчезнет с доски у всех участников. Действие нельзя отменить." size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button variant="danger" disabled={saving} onClick={() => void remove()}>Удалить</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : <p className="dialog-text">Исполнители: {task.assignees.map((assignee) => assignee.fullName).join(', ')}</p>}
  </Dialog>;
}
