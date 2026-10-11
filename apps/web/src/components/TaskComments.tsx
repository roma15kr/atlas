import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AppContext';
import { boardErrorMessage } from '../lib/boardErrors';
import { formatDateTime, relativeTime } from '../lib/format';
import { demoTaskComments, remoteTaskComments, TASK_COMMENT_LIMIT, type TaskComment } from '../lib/taskComments';
import { fitsLimit, RichTextEditor } from './richtext/RichTextEditor';
import { RichTextView } from './richtext/RichTextView';
import { Avatar, Badge, Button } from './ui';

/** A task's comment thread: oldest first, formatted, with an editor to add one. */
export function TaskComments({ taskId }: { taskId: string }) {
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

  const body = draft.trim();
  const add = async () => {
    if (!body || saving || !fitsLimit(body, TASK_COMMENT_LIMIT)) return;
    setSaving(true); setError('');
    try {
      const created = await backend.add(taskId, body);
      setComments((current) => [...(current ?? []), created]);
      setDraft('');
    } catch (reason) { setError(boardErrorMessage(reason, 'Комментарий не добавлен')); } finally { setSaving(false); }
  };

  return <section className="task-comments field--wide" aria-label="Комментарии">
    <div className="task-comments__header"><h3>Комментарии</h3>{comments && <Badge>{comments.length}</Badge>}</div>
    {!comments ? <small>Загружаем комментарии…</small> : comments.length === 0 ? <small className="task-comments__empty">Комментариев пока нет</small>
      : <ol className="task-comments__list">{comments.map((comment) => <li key={comment.id}>
        <Avatar name={comment.author.fullName} src={comment.author.avatarUrl ?? undefined} size="sm" />
        <div><header><strong>{comment.author.fullName}</strong> <time dateTime={comment.createdAt} title={formatDateTime(comment.createdAt)}>{relativeTime(comment.createdAt)}</time></header>
          <RichTextView markdown={comment.body} /></div>
      </li>)}</ol>}
    <RichTextEditor value={draft} onChange={setDraft} maxLength={TASK_COMMENT_LIMIT} label="Новый комментарий" placeholder="Написать комментарий…" minRows={2} />
    {error && <div className="form-error" role="alert">{error}</div>}
    <Button type="button" variant="secondary" className="task-comments__add" disabled={saving || !body || !fitsLimit(body, TASK_COMMENT_LIMIT)} onClick={() => void add()}>{saving ? 'Добавляем…' : 'Добавить комментарий'}</Button>
  </section>;
}
