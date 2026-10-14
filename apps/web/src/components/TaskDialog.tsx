import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth, useWorkspace, type TaskInput } from '../context/AppContext';
import { boardErrorMessage } from '../lib/boardErrors';
import { categories, firstStageOf, groupBoards, orderedStages } from '../lib/boards';
import type { BoardUser, TaskBoard, TaskPriority, WorkTask } from '../types';
import { fitsLimit, RichTextEditor } from './richtext/RichTextEditor';
import { TaskComments } from './TaskComments';
import { RichTextView } from './richtext/RichTextView';
import { Button, Dialog, Field, SelectField } from './ui';

/** Characters of Markdown in a task description (the API limit). */
const DESCRIPTION_LIMIT = 10_000;

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
    boardId: task?.viaAssignment ? task.boardId : initialBoard?.id ?? '',
    stageId: task?.stage.id ?? stageId ?? firstStageOf(initialBoard, 'TODO')?.id ?? '',
    dueAt: toDateInput(task ? task.dueAt : new Date(Date.now() + 86400000).toISOString()),
    priority: task?.priority ?? 'NORMAL',
    assigneeIds: task ? task.assignees.map((assignee) => assignee.id) : [user.id],
  }));
  const [people, setPeople] = useState<BoardUser[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // An existing description opens formatted, with checklist items that save on a tick; the editor opens on demand.
  const [editingDescription, setEditingDescription] = useState(!task?.description);
  const board = taskBoards.find((item) => item.id === draft.boardId);
  const groups = useMemo(() => groupBoards(taskBoards), [taskBoards]);

  // Anyone in the company can be assigned; someone outside the board then sees only this task.
  useEffect(() => {
    let active = true;
    taskBoardConfig.assignableUsers().then((users) => { if (active) setPeople(users); }).catch(() => { if (active) setPeople([]); });
    return () => { active = false; };
  // taskBoardConfig changes identity with every board list update; the list itself does not depend on it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const outsider = Boolean(task?.viaAssignment);
  const [query, setQuery] = useState('');
  const peopleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = (people ?? []).filter((person) => draft.assigneeIds.includes(person.id) || !needle
      || `${person.fullName} ${person.departmentName ?? ''} ${person.jobTitle ?? ''}`.toLowerCase().includes(needle));
    const groups = new Map<string, BoardUser[]>();
    for (const person of matching) {
      const key = person.departmentName ?? 'Без отдела';
      groups.set(key, [...(groups.get(key) ?? []), person]);
    }
    const own = board?.departmentName ?? null;
    return [...groups.entries()].sort(([a], [b]) => (a === own ? -1 : b === own ? 1 : a.localeCompare(b, 'ru')));
  }, [people, query, draft.assigneeIds, board]);
  const stageOptions = outsider ? (task?.boardStages ?? []) : board ? orderedStages(board) : [];
  const outsideBoard = (person: BoardUser) => Boolean(board) && person.departmentId !== board!.departmentId;

  const changeBoard = (next: TaskBoard | undefined) => {
    if (!next) return;
    const category = board?.stages.find((stage) => stage.id === draft.stageId)?.category ?? 'TODO';
    setDraft({ ...draft, boardId: next.id, stageId: (firstStageOf(next, category) ?? firstStageOf(next, 'TODO'))?.id ?? '' });
  };
  const toggle = (id: string) => setDraft({ ...draft, assigneeIds: draft.assigneeIds.includes(id) ? draft.assigneeIds.filter((item) => item !== id) : [...draft.assigneeIds, id] });

  const title = draft.title.trim();
  const ready = Boolean(title && draft.boardId && draft.stageId && draft.assigneeIds.length && people && fitsLimit(draft.description.trim(), DESCRIPTION_LIMIT));
  const tickDescription = async (description: string) => {
    if (!task) return;
    setError('');
    try {
      await updateTask(task.id, { description });
      setDraft((current) => ({ ...current, description }));
    } catch (reason) { setError(boardErrorMessage(reason, 'Отметка не сохранена')); }
  };
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
      <div className="field--wide rich-field">
        <span className="rich-field__label">Описание</span>
        {editingDescription
          ? <RichTextEditor value={draft.description} onChange={(description) => setDraft((current) => ({ ...current, description }))} maxLength={DESCRIPTION_LIMIT} label="Описание" placeholder="Контекст и ожидаемый результат" />
          : <><RichTextView markdown={draft.description} onChange={tickDescription} className="rich-field__view" />
            <button type="button" className="text-button" onClick={() => setEditingDescription(true)}>Изменить описание</button></>}
      </div>
      {outsider
        ? <Field label="Доска"><input value={task!.boardName} readOnly aria-describedby="outsider-note" /></Field>
        : <SelectField label="Доска" value={draft.boardId} onChange={(event) => changeBoard(taskBoards.find((item) => item.id === event.target.value))}>{groups.map((group) => <optgroup key={group.label} label={group.label}>{group.boards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</SelectField>}
      <SelectField label="Этап" value={draft.stageId} onChange={(event) => setDraft({ ...draft, stageId: event.target.value })}>{stageOptions.map((stage) => <option key={stage.id} value={stage.id}>{stage.name} · {categories[stage.category].label}</option>)}</SelectField>
      <Field label="Срок"><input type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></Field>
      <SelectField label="Приоритет" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })}><option value="LOW">Низкий</option><option value="NORMAL">Обычный</option><option value="HIGH">Высокий</option></SelectField>
      {outsider
        ? <div className="field--wide"><span className="rich-field__label">Исполнители</span><p>{task!.assignees.map((assignee) => assignee.fullName).join(', ')}</p>
          <small id="outsider-note" className="form-hint">Вы исполнитель из другого отдела: видите только эту задачу. Перенести её на другую доску или сменить исполнителей может команда доски.</small></div>
        : <fieldset className="check-list field--wide assignee-picker"><legend>Исполнители</legend>
          <input type="search" aria-label="Найти исполнителя" placeholder="Найти сотрудника — любой отдел" value={query} onChange={(event) => setQuery(event.target.value)} />
          {!people ? <small>Загружаем сотрудников…</small> : peopleGroups.map(([department, members]) => <div key={department} className="assignee-picker__group" role="group" aria-label={department}>
            <h4>{department}{board?.departmentName === department ? ' · доска' : ''}</h4>
            {members.map((person) => <label key={person.id}><input type="checkbox" checked={draft.assigneeIds.includes(person.id)} onChange={() => toggle(person.id)} /><span>{person.fullName}{person.id === user.id ? ' (вы)' : ''}<small>{person.jobTitle ?? ''}</small></span></label>)}
          </div>)}
          {people && draft.assigneeIds.some((id) => { const person = people.find((item) => item.id === id); return person && outsideBoard(person); }) && <small className="form-hint">Исполнители из других отделов увидят только эту задачу, а не всю доску.</small>}
        </fieldset>}
      {people && !draft.assigneeIds.length && <small className="field--wide form-hint">Выберите хотя бы одного исполнителя</small>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
    {task && <TaskComments taskId={task.id} />}
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
