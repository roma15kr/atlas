import { useTranslation } from 'react-i18next';
import { localeOf } from '../i18n';
import { AlertTriangle, Archive, ArrowLeft, BriefcaseBusiness, FileText, Folder, Forward, Inbox, Link2, Mail, MailOpen, Paperclip, PenSquare, RefreshCw, Reply, ReplyAll, Search, Send, Settings2, ShieldAlert, Star, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ComposeDialog, type ComposeRequest } from '../components/mail/ComposeDialog';
import { CreateClientFromMailDialog, CreateDealFromMailDialog, LinkThreadDialog, MailConfirmDialog } from '../components/mail/MailDialogs';
import { MessageCard } from '../components/mail/MailParts';
import { Badge, Button, EmptyState, IconButton, LoadingState, PageHeader, SectionHeader, Surface } from '../components/ui';
import { useMail } from '../context/MailContext';
import { relativeTime } from '../lib/format';
import { folderOrder, type MailAction, type MailDraft, type MailFolder, type MailThread, type SpecialUse, type ThreadDetail, folderName } from '../lib/mail';
import { mailErrorMessage } from '../lib/mailErrors';

const folderIcons: Record<SpecialUse, typeof Inbox> = { INBOX: Inbox, SENT: Send, DRAFTS: FileText, ARCHIVE: Archive, JUNK: ShieldAlert, TRASH: Trash2, ALL: Mail };
type View = { kind: 'folder'; folderId: string } | { kind: 'starred' };

/** The user's own mail: folders, conversations and a reading pane, with CRM links on each conversation. */
export function MailPage() {
  const { t } = useTranslation(['mail', 'common']);
  const mail = useMail();
  const { accounts, backend, loaded } = mail;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [view, setView] = useState<View | null>(null);
  const [threads, setThreads] = useState<MailThread[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [drafts, setDrafts] = useState<MailDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [compose, setCompose] = useState<ComposeRequest | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const account = accounts.find((item) => item.id === accountId) ?? accounts[0];
  const folder = view?.kind === 'folder' ? folders.find((item) => item.id === view.folderId) : undefined;
  const attention = accounts.filter((item) => item.status === 'NEEDS_ATTENTION');

  useEffect(() => { if (!accountId && accounts[0]) setAccountId(accounts[0].id); }, [accounts, accountId]);

  const loadFolders = useCallback(async () => {
    if (!account) return;
    const list = await backend.folders(account.id);
    setFolders(list);
    setView((current) => current && (current.kind === 'starred' || list.some((item) => item.id === current.folderId)) ? current : list[0] ? { kind: 'folder', folderId: list[0].id } : null);
  }, [account, backend]);

  const loadThreads = useCallback(async (offset = 0) => {
    if (!account || !view) return;
    const page = await backend.threads({ accountId: account.id, folderId: view.kind === 'folder' && !query ? view.folderId : undefined, starred: view.kind === 'starred' || undefined, q: query || undefined, offset });
    setThreads((current) => offset ? [...(current ?? []), ...page.items] : page.items);
    setHasMore(page.hasMore);
  }, [account, view, query, backend]);

  useEffect(() => { void loadFolders().catch((reason) => setError(mailErrorMessage(reason, t('page.loadFoldersFailed')))); }, [loadFolders, t]);
  useEffect(() => { setThreads(null); setChecked([]); void loadThreads().catch((reason) => setError(mailErrorMessage(reason, t('page.loadThreadsFailed')))); }, [loadThreads, t]);
  useEffect(() => { if (folder?.specialUse === 'DRAFTS') void backend.drafts().then(setDrafts).catch(() => setDrafts([])); }, [folder, backend]);
  useEffect(() => mail.subscribe(() => { void loadFolders().catch(() => undefined); void loadThreads().catch(() => undefined); if (folder?.specialUse === 'DRAFTS') void backend.drafts().then(setDrafts); }), [mail, loadFolders, loadThreads, folder, backend]);

  // Deep link from a client card: /mail?compose=1&to=a@b.c&client=<id>
  useEffect(() => {
    if (params.get('compose') !== '1' || !loaded) return;
    const to = params.get('to');
    setCompose({ mode: 'NEW', to: to ? [{ address: to, name: params.get('name') ?? undefined }] : [], clientId: params.get('client'), dealId: params.get('deal') });
    setParams({}, { replace: true });
  }, [params, setParams, loaded]);

  const act = async (action: MailAction, threadIds: string[], folderId?: string) => {
    setError('');
    try {
      await backend.act({ threadIds, action, folderId, fromFolderId: view?.kind === 'folder' && ['archive', 'spam', 'trash', 'move', 'delete'].includes(action) ? view.folderId : undefined });
      if (['archive', 'spam', 'trash', 'move', 'delete'].includes(action) && threadIds.includes(selectedId ?? '')) setSelectedId(null);
      setChecked([]);
      mail.notify({ type: 'changed' });
      await Promise.all([loadFolders(), loadThreads(), mail.refresh()]);
    } catch (reason) { setError(mailErrorMessage(reason, t('page.actionFailed'))); }
  };

  const sortedFolders = useMemo(() => [...folders].sort((a, b) => (a.specialUse ? folderOrder.indexOf(a.specialUse) : 99) - (b.specialUse ? folderOrder.indexOf(b.specialUse) : 99) || a.name.localeCompare(b.name, localeOf())), [folders]);
  const title = query ? t('page.search', { query }) : view?.kind === 'starred' ? t('page.starred') : (folder ? folderName(folder) : t('page.title'));

  if (loaded && !accounts.length) {
    return <>
      <PageHeader title={t('page.title')} description={t('page.connectText')} action={<Button icon={Settings2} onClick={() => navigate('/mail/settings')}>{t('page.connect')}</Button>} />
      <Surface><EmptyState title={t('page.notConnected')} description={t('page.notConnectedText')} icon={Mail} action={<Button icon={Settings2} onClick={() => navigate('/mail/settings')}>{t('page.connect')}</Button>} /></Surface>
    </>;
  }

  return <>
    <PageHeader title={t('page.title')} description={account ? `${t('count.unread', { count: account.unread })} · ${account.email}` : undefined} action={<>
      {accounts.length > 1 && <label className="compact-select"><Mail size={15} /><select aria-label={t('page.mailbox')} value={account?.id} onChange={(event) => { setAccountId(event.target.value); setView(null); setSelectedId(null); }}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.email}{item.unread ? ` (${item.unread})` : ''}</option>)}</select></label>}
      <form className="table-search mail-search" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setSelectedId(null); }}><Search size={16} /><input aria-label={t('page.searchLabel')} placeholder={t('page.searchLabel')} value={search} onChange={(event) => { setSearch(event.target.value); if (!event.target.value) setQuery(''); }} /></form>
      <IconButton label={t('page.refresh')} icon={RefreshCw} disabled={!account || account.status !== 'CONNECTED'} onClick={() => account && void backend.sync(account.id).then(() => setNotice(t('page.syncStarted'))).catch((reason) => setError(mailErrorMessage(reason, t('page.syncFailed'))))} />
      <IconButton label={t('page.settings')} icon={Settings2} onClick={() => navigate('/mail/settings')} />
      <Button icon={PenSquare} onClick={() => setCompose({ mode: 'NEW', accountId: account?.id })}>{t('page.write')}</Button>
    </>} />
    {attention.map((item) => <div key={item.id} className="notice notice--danger" role="alert"><AlertTriangle size={16} />{t('page.attention', { email: item.email, reason: item.statusReason ?? t('page.reconnectReason') })}<button onClick={() => navigate('/mail/settings')}>{t('page.reconnect')}</button></div>)}
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>{t('common:actions.close')}</button></div>}
    {notice && <div className="notice notice--info" role="status">{notice}<button onClick={() => setNotice('')}>{t('common:actions.close')}</button></div>}
    <div className={`mail-layout ${selectedId ? 'mail-layout--reading' : ''}`}>
      <Surface className="mail-folders" aria-label={t('page.folders')}>
        <div className="mail-folders__rows">
          {sortedFolders.filter((item) => item.specialUse !== 'ALL').map((item) => {
            const Icon = item.specialUse ? folderIcons[item.specialUse] : Folder;
            const active = !query && view?.kind === 'folder' && view.folderId === item.id;
            return <button key={item.id} type="button" className={active ? 'is-active' : ''} aria-current={active ? 'true' : undefined} onClick={() => { setView({ kind: 'folder', folderId: item.id }); setQuery(''); setSearch(''); setSelectedId(null); }}>
              <Icon size={16} aria-hidden="true" /><span>{folderName(item)}</span>{item.unread > 0 && item.specialUse !== 'SENT' && <Badge tone="info">{item.unread}</Badge>}
            </button>;
          })}
          <button type="button" className={!query && view?.kind === 'starred' ? 'is-active' : ''} onClick={() => { setView({ kind: 'starred' }); setQuery(''); setSelectedId(null); }}><Star size={16} aria-hidden="true" /><span>{t('page.starred')}</span></button>
        </div>
      </Surface>
      <Surface className="mail-threads" aria-label={t('page.threads')}>
        <SectionHeader title={title} meta={threads ? <Badge>{threads.length}{hasMore ? '+' : ''}</Badge> : undefined} />
        <div className="mail-bulk" aria-label={t('page.bulk')}>
          <label className="inline-check"><input type="checkbox" aria-label={t('page.selectAll')} checked={Boolean(threads?.length) && checked.length === threads?.length} onChange={(event) => setChecked(event.target.checked ? threads?.map((item) => item.id) ?? [] : [])} />{checked.length ? t('page.selected', { count: checked.length }) : t('page.select')}</label>
          {checked.length > 0 && <>
            <IconButton label={t('page.markRead')} icon={MailOpen} onClick={() => void act('read', checked)} />
            <IconButton label={t('page.archiveSelected')} icon={Archive} onClick={() => void act('archive', checked)} />
            <IconButton label={t('page.deleteSelected')} icon={Trash2} onClick={() => void act('trash', checked)} />
          </>}
        </div>
        <div className="mail-threads__rows">
          {folder?.specialUse === 'DRAFTS' && drafts.map((draft) => <button key={draft.id} type="button" className="mail-thread-row" onClick={() => setCompose({ mode: draft.mode, draft })}>
            <span /><span><strong>{draft.to.map((item) => item.name ?? item.address).join(', ') || t('page.noRecipient')} <Badge tone="warning">{t('page.draft')}</Badge></strong><b>{draft.subject || t('page.noSubject')}</b></span><time>{relativeTime(draft.updatedAt)}</time>
          </button>)}
          {!threads ? <LoadingState label={t('page.loading')} /> : threads.length ? threads.map((thread) => <div key={thread.id} className={`mail-thread-row ${selectedId === thread.id ? 'is-active' : ''} ${thread.unreadCount ? 'is-unread' : ''}`}>
            <input type="checkbox" aria-label={t('page.selectThread', { subject: thread.subject || t('page.noSubjectShort') })} checked={checked.includes(thread.id)} onChange={(event) => setChecked(event.target.checked ? [...checked, thread.id] : checked.filter((id) => id !== thread.id))} />
            <button type="button" onClick={() => setSelectedId(thread.id)} aria-current={selectedId === thread.id ? 'true' : undefined}>
              <span><strong>{thread.correspondents || thread.participants.join(', ') || thread.mailboxEmail}{thread.messageCount > 1 && <small> {thread.messageCount}</small>}</strong><b>{thread.subject || t('page.noSubject')}</b><small>{thread.snippet}</small>
                {(thread.client || thread.sendFailed) && <span className="mail-thread-row__tags">{thread.client && <Badge tone="info">{thread.client.companyName || thread.client.name}</Badge>}{thread.sendFailed && <Badge tone="danger">{t('page.notSent')}</Badge>}</span>}</span>
              <span className="mail-thread-row__meta"><time dateTime={thread.lastMessageAt}>{relativeTime(thread.lastMessageAt)}</time>{thread.hasAttachments && <Paperclip size={13} aria-label={t('page.hasAttachments')} />}{thread.flagged && <Star size={13} className="is-starred" aria-label={t('page.isStarred')} />}</span>
            </button>
          </div>) : <EmptyState title={query ? t('page.nothingFound') : t('page.noMail')} description={query ? t('page.tryOther') : t('page.emptyFolder')} icon={Inbox} />}
          {hasMore && <button type="button" className="text-button mail-threads__more" onClick={() => void loadThreads(threads?.length ?? 0)}>{t('page.showMore')}</button>}
        </div>
      </Surface>
      {selectedId ? <ThreadView key={selectedId} threadId={selectedId} folders={sortedFolders} onBack={() => setSelectedId(null)} onCompose={setCompose} onAction={(action, folderId) => void act(action, [selectedId], folderId)} onChanged={() => void loadThreads()} />
        : <Surface className="mail-reader"><EmptyState title={t('page.chooseTitle')} description={t('page.chooseText')} icon={Mail} /></Surface>}
    </div>
    {compose && <ComposeDialog request={compose} onClose={() => setCompose(null)} onSent={(threadId) => { setCompose(null); setNotice(t('page.sent')); setSelectedId(threadId); void loadThreads(); }} />}
  </>;
}

function ThreadView({ threadId, folders, onBack, onCompose, onAction, onChanged }: {
  threadId: string; folders: MailFolder[]; onBack: () => void; onCompose: (request: ComposeRequest) => void; onAction: (action: MailAction, folderId?: string) => void; onChanged: () => void;
}) {
  const { t } = useTranslation(['mail', 'common']);
  const mail = useMail();
  const navigate = useNavigate();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'link' | 'client' | 'deal' | 'delete' | null>(null);
  const load = useCallback(async () => {
    try { setThread(await mail.backend.thread(threadId)); } catch (reason) { setError(mailErrorMessage(reason, t('page.threadFailed'))); }
  }, [mail.backend, threadId, t]);
  useEffect(() => { void load().then(() => { void mail.refresh(); onChanged(); }); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => mail.subscribe(() => void load()), [mail, load]);
  if (error) return <Surface className="mail-reader"><div className="form-error" role="alert">{error}</div></Surface>;
  if (!thread) return <Surface className="mail-reader"><LoadingState label={t('page.opening')} /></Surface>;
  const last = thread.messages.at(-1);
  const inTrash = thread.messages.every((message) => message.folderSpecialUse === 'TRASH');
  const starred = thread.messages.some((message) => message.flagged);
  const serverDraft = thread.messages.find((message) => message.folderSpecialUse === 'DRAFTS');
  const afterLink = () => { setDialog(null); void load(); onChanged(); };
  return <Surface className="mail-reader" aria-label={t('page.reader', { subject: thread.subject || t('page.noSubjectShort') })}>
    <header className="mail-reader__header">
      <IconButton label={t('page.back')} icon={ArrowLeft} className="mail-reader__back" onClick={onBack} />
      <h2>{thread.subject || t('page.noSubject')}</h2>
      <div className="mail-reader__actions">
        <IconButton label={starred ? t('page.unstar') : t('page.star')} icon={Star} className={starred ? 'is-starred' : ''} onClick={() => onAction(starred ? 'unstar' : 'star')} />
        <IconButton label={t('page.markUnread')} icon={MailOpen} onClick={() => onAction('unread')} />
        <IconButton label={t('page.archive')} icon={Archive} onClick={() => onAction('archive')} />
        <IconButton label={t('page.spam')} icon={ShieldAlert} onClick={() => onAction('spam')} />
        <IconButton label={inTrash ? t('page.deleteForever') : t('page.delete')} icon={Trash2} onClick={() => inTrash ? setDialog('delete') : onAction('trash')} />
        <label className="compact-select"><Folder size={15} /><select aria-label={t('page.moveTo')} value="" onChange={(event) => event.target.value && onAction('move', event.target.value)}><option value="">{t('page.move')}</option>{folders.filter((item) => item.specialUse !== 'ALL').map((item) => <option key={item.id} value={item.id}>{folderName(item)}</option>)}</select></label>
      </div>
    </header>
    <div className="mail-crm" aria-label={t('page.crm')}>
      {thread.client ? <>
        <BriefcaseBusiness size={15} aria-hidden="true" />
        <span>{t('page.client')} <button type="button" className="text-button" onClick={() => navigate(`/crm/${thread.client!.id}`)}>{thread.client.companyName || thread.client.name}</button>{thread.deal && <> · {t('page.deal')} <b>{thread.deal.title}</b></>}{thread.linkSource === 'AUTO' && <small>{t('page.autoLinked')}</small>}</span>
        <button type="button" className="text-button" onClick={() => setDialog('link')}>{t('page.change')}</button>
        {!thread.deal && <Button variant="secondary" icon={BriefcaseBusiness} onClick={() => setDialog('deal')}>{t('page.createDeal')}</Button>}
      </> : <>
        <Link2 size={15} aria-hidden="true" />
        <span>{thread.linkSuggestions.length > 1 ? t('page.severalClients') : t('page.notLinked')}</span>
        <button type="button" className="text-button" onClick={() => setDialog('link')}>{t('page.link')}</button>
        <Button variant="secondary" icon={UserPlus} onClick={() => setDialog('client')}>{t('page.createClient')}</Button>
      </>}
    </div>
    <div className="mail-reader__messages">
      {thread.messages.map((message, index) => {
        const collapsed = thread.messages.length > 3 && index < thread.messages.length - 2 && !expanded.includes(message.id);
        const isLast = message === last;
        return <MessageCard key={message.id} message={message} collapsed={collapsed} onToggle={() => setExpanded((current) => current.includes(message.id) ? current : [...current, message.id])}
          actions={isLast ? serverDraft === message ? <Button variant="secondary" icon={PenSquare} onClick={() => void mail.backend.draftFromMessage(message.id).then((draft) => onCompose({ mode: 'NEW', draft }))}>{t('page.continueDraft')}</Button> : <>
            <Button variant="secondary" icon={Reply} onClick={() => onCompose({ mode: 'REPLY', source: message, accountId: thread.accountId, clientId: thread.client?.id, dealId: thread.deal?.id })}>{t('page.reply')}</Button>
            <Button variant="secondary" icon={ReplyAll} onClick={() => onCompose({ mode: 'REPLY_ALL', source: message, accountId: thread.accountId, clientId: thread.client?.id, dealId: thread.deal?.id })}>{t('page.replyAll')}</Button>
            <Button variant="secondary" icon={Forward} onClick={() => onCompose({ mode: 'FORWARD', source: message, accountId: thread.accountId })}>{t('page.forward')}</Button>
          </> : undefined} />;
      })}
    </div>
    {dialog === 'link' && <LinkThreadDialog thread={thread} onClose={() => setDialog(null)} onSaved={afterLink} />}
    {dialog === 'client' && <CreateClientFromMailDialog thread={thread} onClose={() => setDialog(null)} onSaved={afterLink} />}
    {dialog === 'deal' && <CreateDealFromMailDialog thread={thread} onClose={() => setDialog(null)} onSaved={afterLink} />}
    {dialog === 'delete' && <MailConfirmDialog title={t('page.deleteTitle')} description={t('page.deleteText')} confirm={t('page.deleteForever')} onClose={() => setDialog(null)} onConfirm={async () => { setDialog(null); onAction('delete'); }} />}
  </Surface>;
}
