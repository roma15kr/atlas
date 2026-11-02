import { useTranslation } from 'react-i18next';
import { localeOf } from '../i18n';
import { Trash2 } from 'lucide-react';
import { useRef, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth, useWorkspace, type TaskInput } from '../context/AppContext';
import { boardErrorMessage } from '../lib/boardErrors';
import { categories, firstStageOf, groupBoards, involvesColleagues, orderedStages } from '../lib/boards';
import type { BoardUser, TaskBoard, TaskPriority, WorkTask } from '../types';
import { fitsLimit, RichTextEditor } from './richtext/RichTextEditor';
import { TaskComments, type TaskCommentsHandle } from './TaskComments';
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
  const { t } = useTranslation(['tasks', 'common']);
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
  const comments = useRef<TaskCommentsHandle>(null);
  // «Показать на доске» follows the server's default until the user sets it.
  const [placement, setPlacement] = useState<boolean | null>(null);
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
      const key = person.departmentName ?? t('board.noDepartment');
      groups.set(key, [...(groups.get(key) ?? []), person]);
    }
    const own = board?.departmentName ?? null;
    return [...groups.entries()].sort(([a], [b]) => (a === own ? -1 : b === own ? 1 : a.localeCompare(b, localeOf())));
  }, [people, query, draft.assigneeIds, board, t]);
  const stageOptions = outsider ? (task?.boardStages ?? []) : board ? orderedStages(board) : [];
  const outsideBoard = (person: BoardUser) => Boolean(board) && person.departmentId !== board!.departmentId;

  const changeBoard = (next: TaskBoard | undefined) => {
    if (!next) return;
    const category = board?.stages.find((stage) => stage.id === draft.stageId)?.category ?? 'TODO';
    setDraft({ ...draft, boardId: next.id, stageId: (firstStageOf(next, category) ?? firstStageOf(next, 'TODO'))?.id ?? '' });
  };
  const authorId = task?.createdBy ?? user.id;
  const added = task ? draft.assigneeIds.filter((id) => !task.assignees.some((assignee) => assignee.id === id)) : draft.assigneeIds;
  const automatic = task ? task.onBoard !== false || involvesColleagues(authorId, added, people ?? []) : involvesColleagues(authorId, added, people ?? []);
  const onBoard = placement ?? automatic;
  const toggle = (id: string) => setDraft({ ...draft, assigneeIds: draft.assigneeIds.includes(id) ? draft.assigneeIds.filter((item) => item !== id) : [...draft.assigneeIds, id] });

  const title = draft.title.trim();
  const ready = Boolean(title && draft.boardId && draft.stageId && draft.assigneeIds.length && people && fitsLimit(draft.description.trim(), DESCRIPTION_LIMIT));
  const tickDescription = async (description: string) => {
    if (!task) return;
    setError('');
    try {
      await updateTask(task.id, { description });
      setDraft((current) => ({ ...current, description }));
    } catch (reason) { setError(boardErrorMessage(reason, t('dialog.markFailed'))); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setSaving(true); setError('');
    const input: TaskInput = { boardId: draft.boardId, stageId: draft.stageId, assigneeIds: draft.assigneeIds, title, description: draft.description.trim(), dueAt: fromDateInput(draft.dueAt), priority: draft.priority, onBoard };
    try {
      if (task) {
        // A comment typed but not added yet is part of what the user saves; keep the dialog open if it fails.
        if (!(await comments.current?.flush() ?? true)) return;
        const patch = changes(task, input);
        if (Object.keys(patch).length) await updateTask(task.id, patch);
      } else await addTask(input);
      onClose();
    } catch (reason) {
      setError(boardErrorMessage(reason, task ? t('dialog.saveFailed') : t('dialog.createFailed')));
    } finally { setSaving(false); }
  };

  if (confirmDelete && task) return <DeleteTaskDialog task={task} onClose={() => setConfirmDelete(false)} onDeleted={onClose} onDelete={() => deleteTask(task.id)} />;

  const deleteBlocked = task && !task.canDelete ? t('dialog.deleteForbidden') : undefined;
  return <Dialog open title={task ? t('dialog.title') : t('dialog.newTitle')} description={task ? `${task.boardName} · ${task.stage.name}` : t('dialog.newDescription')} size="lg" onClose={onClose} footer={<>
    {task && <Button variant="ghost" icon={Trash2} className="dialog-footer__start" disabled={Boolean(deleteBlocked)} title={deleteBlocked} onClick={() => setConfirmDelete(true)}>{t('common:actions.delete')}</Button>}
    <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
    <Button type="submit" form="task-form" disabled={saving || !ready}>{saving ? t('common:actions.saving') : task ? t('common:actions.save') : t('dialog.create')}</Button>
  </>}>
    <form id="task-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label={t('dialog.name')} className="field--wide"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={240} required placeholder={t('dialog.namePlaceholder')} autoFocus={!task} /></Field>
      <div className="field--wide rich-field">
        <span className="rich-field__label">{t('dialog.description')}</span>
        {editingDescription
          ? <RichTextEditor value={draft.description} onChange={(description) => setDraft((current) => ({ ...current, description }))} maxLength={DESCRIPTION_LIMIT} label={t('dialog.description')} placeholder={t('dialog.descriptionPlaceholder')} />
          : <><RichTextView markdown={draft.description} onChange={tickDescription} className="rich-field__view" />
            <button type="button" className="text-button" onClick={() => setEditingDescription(true)}>{t('dialog.editDescription')}</button></>}
      </div>
      {outsider
        ? <Field label={t('dialog.board')}><input value={task!.boardName} readOnly aria-describedby="outsider-note" /></Field>
        : <SelectField label={t('dialog.board')} value={draft.boardId} onChange={(event) => changeBoard(taskBoards.find((item) => item.id === event.target.value))}>{groups.map((group) => <optgroup key={group.label} label={group.label}>{group.boards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</SelectField>}
      <SelectField label={t('dialog.stage')} value={draft.stageId} onChange={(event) => setDraft({ ...draft, stageId: event.target.value })}>{stageOptions.map((stage) => <option key={stage.id} value={stage.id}>{stage.name} · {categories[stage.category].label}</option>)}</SelectField>
      <Field label={t('dialog.due')}><input type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></Field>
      <SelectField label={t('priority.label')} value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })}><option value="LOW">{t('priority.LOW')}</option><option value="NORMAL">{t('priority.NORMAL')}</option><option value="HIGH">{t('priority.HIGH')}</option></SelectField>
      {outsider
        ? <div className="field--wide"><span className="rich-field__label">{t('dialog.assignees')}</span><p>{task!.assignees.map((assignee) => assignee.fullName).join(', ')}</p>
          <small id="outsider-note" className="form-hint">{t('dialog.outsiderSelf')}</small></div>
        : <fieldset className="check-list field--wide assignee-picker"><legend>{t('dialog.assignees')}</legend>
          <input type="search" aria-label={t('dialog.findAssignee')} placeholder={t('dialog.findPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} />
          {!people ? <small>{t('dialog.loadingPeople')}</small> : peopleGroups.map(([department, members]) => <div key={department} className="assignee-picker__group" role="group" aria-label={department}>
            <h4>{department}{board?.departmentName === department ? t('dialog.boardMark') : ''}</h4>
            {members.map((person) => <label key={person.id}><input type="checkbox" checked={draft.assigneeIds.includes(person.id)} onChange={() => toggle(person.id)} /><span>{person.fullName}{person.id === user.id ? ` ${t('dialog.you')}` : ''}<small>{person.jobTitle ?? ''}</small></span></label>)}
          </div>)}
          {people && draft.assigneeIds.some((id) => { const person = people.find((item) => item.id === id); return person && outsideBoard(person); }) && <small className="form-hint">{t('dialog.outsiderNote')}</small>}
        </fieldset>}
      {people && !draft.assigneeIds.length && <small className="field--wide form-hint">{t('dialog.chooseAssignee')}</small>}
      {!outsider && <label className="check-field field--wide"><input type="checkbox" checked={onBoard} onChange={(event) => setPlacement(event.target.checked)} /><span><strong>{t('dialog.showOnBoard')}</strong>
        <small className="form-hint">{onBoard ? t('dialog.onBoardNote') : t('dialog.personalNote')}</small></span></label>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
    {task && <TaskComments ref={comments} taskId={task.id} />}
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
  // An explicit placement only; adding a colleague shares the task on the server by itself.
  if (input.onBoard !== undefined && input.onBoard !== (task.onBoard !== false)) patch.onBoard = input.onBoard;
  const before = task.assignees.map((assignee) => assignee.id).sort().join();
  if ([...input.assigneeIds].sort().join() !== before) patch.assigneeIds = input.assigneeIds;
  return patch;
}

function DeleteTaskDialog({ task, onClose, onDelete, onDeleted }: { task: WorkTask; onClose: () => void; onDelete: () => Promise<void>; onDeleted: () => void }) {
  const { t } = useTranslation(['tasks', 'common']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    setSaving(true); setError('');
    try { await onDelete(); onDeleted(); } catch (reason) { setError(boardErrorMessage(reason, t('dialog.deleteFailed'))); } finally { setSaving(false); }
  };
  return <Dialog open title={t('dialog.deleteTitle', { title: task.title })} description={t('dialog.deleteText')} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button variant="danger" disabled={saving} onClick={() => void remove()}>{t('common:actions.delete')}</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : <p className="dialog-text">{t('card.assignees', { names: task.assignees.map((assignee) => assignee.fullName).join(', ') })}</p>}
  </Dialog>;
}
