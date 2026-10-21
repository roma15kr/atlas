import { ReactionBar } from './reactions/ReactionBar';
import { ReactionPicker } from './reactions/ReactionPicker';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useAuth } from '../context/AppContext';
import { boardErrorMessage } from '../lib/boardErrors';
import { formatDateTime, relativeTime } from '../lib/format';
import { demoTaskComments, remoteTaskComments, TASK_COMMENT_LIMIT, type TaskComment } from '../lib/taskComments';
import { fitsLimit, RichTextEditor } from './richtext/RichTextEditor';
import { RichTextView } from './richtext/RichTextView';
import { Avatar, Badge, Button } from './ui';
import { AttachButton, AttachmentList, PendingFiles, useAttachmentDraft } from './attachments/Attachments';

/** Lets the task dialog send a comment that was typed but not added when the task is saved. */
export interface TaskCommentsHandle {
  /** Adds the typed comment, if any; resolves false when it could not be added (the error is shown). */
  flush: () => Promise<boolean>;
}

/** A task's comment thread: oldest first, formatted, with an editor to add one. */
export const TaskComments = forwardRef<TaskCommentsHandle, { taskId: string }>(function TaskComments({ taskId }, ref) {
  const { session } = useAuth();
  const user = session!.user;
  const backend = useMemo(() => session!.accessToken.startsWith('demo-')
    ? demoTaskComments({ id: user.id, fullName: user.fullName, avatarUrl: user.avatarUrl ?? null })
    : remoteTaskComments, [session, user]);
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    backend.list(taskId).then((list) => { if (active) setComments(list); }).catch((reason) => { if (active) { setComments([]); setError(boardErrorMessage(reason, 'Комментарии не загрузились')); } });
    return () => { active = false; };
  }, [backend, taskId]);

  const files = useAttachmentDraft((file) => backend.uploadAttachment(taskId, file), (reason) => boardErrorMessage(reason, 'Файл не загружен'));
  const body = draft.trim();
  const add = async (): Promise<boolean> => {
    if (!body && !files.ids.length) return true;
    if (saving || files.uploading || !fitsLimit(body, TASK_COMMENT_LIMIT)) return false;
    setSaving(true); setError('');
    try {
      const created = await backend.add(taskId, body, files.ids);
      setComments((current) => [...(current ?? []), created]);
      setDraft('');
      files.clear();
      return true;
    } catch (reason) { setError(boardErrorMessage(reason, 'Комментарий не добавлен')); return false; } finally { setSaving(false); }
  };
  useImperativeHandle(ref, () => ({ flush: add }));
  const react = async (commentId: string, emoji: string, adding: boolean) => {
    setError('');
    try {
      const reactions = await backend.react(commentId, emoji, adding);
      setComments((current) => current?.map((comment) => comment.id === commentId ? { ...comment, reactions } : comment) ?? current);
    } catch (reason) { setError(boardErrorMessage(reason, 'Реакция не сохранена')); }
  };

  return <section className={`task-comments field--wide${files.dragging ? ' is-dragging' : ''}`} aria-label="Комментарии" {...files.dropZone}>
    <div className="task-comments__header"><h3>Комментарии</h3>{comments && <Badge>{comments.length}</Badge>}</div>
    {!comments ? <small>Загружаем комментарии…</small> : comments.length === 0 ? <small className="task-comments__empty">Комментариев пока нет</small>
      : <ol className="task-comments__list">{comments.map((comment) => <li key={comment.id}>
        <Avatar name={comment.author.fullName} src={comment.author.avatarUrl ?? undefined} size="sm" />
        <div><header><strong>{comment.author.fullName}</strong> <time dateTime={comment.createdAt} title={formatDateTime(comment.createdAt)}>{relativeTime(comment.createdAt)}</time></header>
          {comment.body && <RichTextView markdown={comment.body} />}
          {Boolean(comment.attachments?.length) && <AttachmentList attachments={comment.attachments!} download={(id) => backend.downloadAttachment(id)} errorMessage={(reason) => boardErrorMessage(reason, 'Файл не скачан')} />}
          <div className="task-comments__reactions">
            <ReactionBar reactions={comment.reactions} meId={user.id} onToggle={(emoji, add) => void react(comment.id, emoji, add)} />
            <ReactionPicker onPick={(emoji) => void react(comment.id, emoji, !comment.reactions?.some((reaction) => reaction.emoji === emoji && reaction.users.some((person) => person.id === user.id)))} />
          </div></div>
      </li>)}</ol>}
    <RichTextEditor value={draft} onChange={setDraft} maxLength={TASK_COMMENT_LIMIT} label="Новый комментарий" placeholder="Написать комментарий…" minRows={2} onFiles={files.attach} />
    <PendingFiles files={files.files} onRemove={files.remove} />
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="task-comments__actions">
      <AttachButton label="Новый комментарий" disabled={saving || files.full} onFiles={files.attach} />
      <Button type="button" variant="secondary" className="task-comments__add" disabled={saving || files.uploading || (!body && !files.ids.length) || !fitsLimit(body, TASK_COMMENT_LIMIT)} onClick={() => void add()}>{saving ? 'Добавляем…' : 'Добавить комментарий'}</Button>
    </div>
  </section>;
});
