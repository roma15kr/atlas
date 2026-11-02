import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AppContext';
import { CLIENT_COMMENT_LIMIT, demoClientComments, remoteClientComments, type ClientComment } from '../lib/clientComments';
import { formatDateTime, relativeTime } from '../lib/format';
import { fitsLimit, RichTextEditor } from './richtext/RichTextEditor';
import { RichTextView } from './richtext/RichTextView';
import { Avatar, Badge, Button, SectionHeader, Surface } from './ui';

/** The client's comment feed: newest first, formatted (checklists read-only), with an editor to add one. */
export function ClientComments({ clientId }: { clientId: string }) {
  const { t } = useTranslation(['crm', 'common']);
  const { session } = useAuth();
  const user = session!.user;
  const backend = useMemo(() => {
    const me = { id: user.id, fullName: user.fullName };
    return session!.accessToken.startsWith('demo-') ? demoClientComments(me) : remoteClientComments(me);
  }, [session, user]);
  const [comments, setComments] = useState<ClientComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    backend.list(clientId).then((list) => { if (active) setComments(list); }).catch(() => { if (active) { setComments([]); setError(t('comments.loadFailed')); } });
    return () => { active = false; };
  }, [backend, clientId, t]);

  const body = draft.trim();
  const add = async () => {
    if (!body || saving || !fitsLimit(body, CLIENT_COMMENT_LIMIT)) return;
    setSaving(true); setError('');
    try {
      const created = await backend.add(clientId, body);
      setComments((current) => [created, ...(current ?? [])]);
      setDraft('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('comments.addFailed')); } finally { setSaving(false); }
  };

  return <Surface className="client-comments" aria-label={t('comments.region')}>
    <SectionHeader title={t('comments.title')} meta={comments ? <Badge>{comments.length}</Badge> : undefined} />
    <RichTextEditor value={draft} onChange={setDraft} maxLength={CLIENT_COMMENT_LIMIT} label={t('comments.editor')} placeholder={t('comments.placeholder')} minRows={2} />
    {error && <div className="form-error" role="alert">{error}</div>}
    <Button type="button" variant="secondary" className="task-comments__add" disabled={saving || !body || !fitsLimit(body, CLIENT_COMMENT_LIMIT)} onClick={() => void add()}>{saving ? t('common:actions.adding') : t('comments.add')}</Button>
    {!comments ? <small>{t('comments.loading')}</small> : comments.length === 0 ? <small className="task-comments__empty">{t('comments.empty')}</small>
      : <ol className="task-comments__list">{comments.map((comment) => <li key={comment.id}>
        <Avatar name={comment.author.fullName} size="sm" />
        <div><header><strong>{comment.author.fullName}</strong> <time dateTime={comment.createdAt} title={formatDateTime(comment.createdAt)}>{relativeTime(comment.createdAt)}</time></header>
          <RichTextView markdown={comment.body} /></div>
      </li>)}</ol>}
  </Surface>;
}
