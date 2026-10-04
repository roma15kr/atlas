import { AlertTriangle, Archive, ArrowLeft, BriefcaseBusiness, FileText, Folder, Forward, Inbox, Link2, Mail, MailOpen, Paperclip, PenSquare, RefreshCw, Reply, ReplyAll, Search, Send, Settings2, ShieldAlert, Star, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ComposeDialog, type ComposeRequest } from '../components/mail/ComposeDialog';
import { CreateClientFromMailDialog, CreateDealFromMailDialog, LinkThreadDialog, MailConfirmDialog } from '../components/mail/MailDialogs';
import { MessageCard } from '../components/mail/MailParts';
import { Badge, Button, EmptyState, IconButton, LoadingState, PageHeader, SectionHeader, Surface } from '../components/ui';
import { useMail } from '../context/MailContext';
import { plural, relativeTime } from '../lib/format';
import { folderOrder, type MailAction, type MailDraft, type MailFolder, type MailThread, type SpecialUse, type ThreadDetail } from '../lib/mail';
import { mailErrorMessage } from '../lib/mailErrors';

const UNREAD: [string, string, string] = ['непрочитанное', 'непрочитанных', 'непрочитанных'];
const folderIcons: Record<SpecialUse, typeof Inbox> = { INBOX: Inbox, SENT: Send, DRAFTS: FileText, ARCHIVE: Archive, JUNK: ShieldAlert, TRASH: Trash2, ALL: Mail };
type View = { kind: 'folder'; folderId: string } | { kind: 'starred' };

/** The user's own mail: folders, conversations and a reading pane, with CRM links on each conversation. */
export function MailPage() {
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

  useEffect(() => { void loadFolders().catch((reason) => setError(mailErrorMessage(reason, 'Папки не загружены'))); }, [loadFolders]);
  useEffect(() => { setThreads(null); setChecked([]); void loadThreads().catch((reason) => setError(mailErrorMessage(reason, 'Письма не загружены'))); }, [loadThreads]);
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
    } catch (reason) { setError(mailErrorMessage(reason, 'Действие не выполнено')); }
  };

  const sortedFolders = useMemo(() => [...folders].sort((a, b) => (a.specialUse ? folderOrder.indexOf(a.specialUse) : 99) - (b.specialUse ? folderOrder.indexOf(b.specialUse) : 99) || a.name.localeCompare(b.name, 'ru')), [folders]);
  const title = query ? `Поиск: ${query}` : view?.kind === 'starred' ? 'Помеченные' : folder?.name ?? 'Почта';

  if (loaded && !accounts.length) {
    return <>
      <PageHeader title="Почта" description="Подключите рабочий ящик, чтобы читать и отправлять письма в Atlas" action={<Button icon={Settings2} onClick={() => navigate('/mail/settings')}>Подключить ящик</Button>} />
      <Surface><EmptyState title="Почта не подключена" description="Письма видите только вы. Переписка с клиентами появится в их карточках, когда вы её привяжете." icon={Mail} action={<Button icon={Settings2} onClick={() => navigate('/mail/settings')}>Подключить ящик</Button>} /></Surface>
    </>;
  }

  return <>
    <PageHeader title="Почта" description={account ? `${plural(account.unread, UNREAD)} · ${account.email}` : undefined} action={<>
      {accounts.length > 1 && <label className="compact-select"><Mail size={15} /><select aria-label="Почтовый ящик" value={account?.id} onChange={(event) => { setAccountId(event.target.value); setView(null); setSelectedId(null); }}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.email}{item.unread ? ` (${item.unread})` : ''}</option>)}</select></label>}
      <form className="table-search mail-search" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setSelectedId(null); }}><Search size={16} /><input aria-label="Поиск по почте" placeholder="Поиск по почте" value={search} onChange={(event) => { setSearch(event.target.value); if (!event.target.value) setQuery(''); }} /></form>
      <IconButton label="Обновить" icon={RefreshCw} disabled={!account || account.status !== 'CONNECTED'} onClick={() => account && void backend.sync(account.id).then(() => setNotice('Синхронизация запущена — новые письма появятся через несколько секунд')).catch((reason) => setError(mailErrorMessage(reason, 'Синхронизация не запущена')))} />
      <IconButton label="Настройки почты" icon={Settings2} onClick={() => navigate('/mail/settings')} />
      <Button icon={PenSquare} onClick={() => setCompose({ mode: 'NEW', accountId: account?.id })}>Написать</Button>
    </>} />
    {attention.map((item) => <div key={item.id} className="notice notice--danger" role="alert"><AlertTriangle size={16} />Ящик {item.email} требует внимания: {item.statusReason ?? 'подключите заново'}<button onClick={() => navigate('/mail/settings')}>Переподключить</button></div>)}
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>Закрыть</button></div>}
    {notice && <div className="notice notice--info" role="status">{notice}<button onClick={() => setNotice('')}>Закрыть</button></div>}
    <div className={`mail-layout ${selectedId ? 'mail-layout--reading' : ''}`}>
      <Surface className="mail-folders" aria-label="Папки">
        <div className="mail-folders__rows">
          {sortedFolders.filter((item) => item.specialUse !== 'ALL').map((item) => {
            const Icon = item.specialUse ? folderIcons[item.specialUse] : Folder;
            const active = !query && view?.kind === 'folder' && view.folderId === item.id;
            return <button key={item.id} type="button" className={active ? 'is-active' : ''} aria-current={active ? 'true' : undefined} onClick={() => { setView({ kind: 'folder', folderId: item.id }); setQuery(''); setSearch(''); setSelectedId(null); }}>
              <Icon size={16} aria-hidden="true" /><span>{item.name}</span>{item.unread > 0 && item.specialUse !== 'SENT' && <Badge tone="info">{item.unread}</Badge>}
            </button>;
          })}
          <button type="button" className={!query && view?.kind === 'starred' ? 'is-active' : ''} onClick={() => { setView({ kind: 'starred' }); setQuery(''); setSelectedId(null); }}><Star size={16} aria-hidden="true" /><span>Помеченные</span></button>
        </div>
      </Surface>
      <Surface className="mail-threads" aria-label="Переписки">
        <SectionHeader title={title} meta={threads ? <Badge>{threads.length}{hasMore ? '+' : ''}</Badge> : undefined} />
        <div className="mail-bulk" aria-label="Действия с выбранными">
          <label className="inline-check"><input type="checkbox" aria-label="Выбрать все" checked={Boolean(threads?.length) && checked.length === threads?.length} onChange={(event) => setChecked(event.target.checked ? threads?.map((item) => item.id) ?? [] : [])} />{checked.length ? `Выбрано: ${checked.length}` : 'Выбрать'}</label>
          {checked.length > 0 && <>
            <IconButton label="Прочитано" icon={MailOpen} onClick={() => void act('read', checked)} />
            <IconButton label="Архивировать выбранные" icon={Archive} onClick={() => void act('archive', checked)} />
            <IconButton label="Удалить выбранные" icon={Trash2} onClick={() => void act('trash', checked)} />
          </>}
        </div>
        <div className="mail-threads__rows">
          {folder?.specialUse === 'DRAFTS' && drafts.map((draft) => <button key={draft.id} type="button" className="mail-thread-row" onClick={() => setCompose({ mode: draft.mode, draft })}>
            <span /><span><strong>{draft.to.map((item) => item.name ?? item.address).join(', ') || 'Без получателя'} <Badge tone="warning">Черновик</Badge></strong><b>{draft.subject || '(без темы)'}</b></span><time>{relativeTime(draft.updatedAt)}</time>
          </button>)}
          {!threads ? <LoadingState label="Загружаем письма" /> : threads.length ? threads.map((thread) => <div key={thread.id} className={`mail-thread-row ${selectedId === thread.id ? 'is-active' : ''} ${thread.unreadCount ? 'is-unread' : ''}`}>
            <input type="checkbox" aria-label={`Выбрать «${thread.subject || 'без темы'}»`} checked={checked.includes(thread.id)} onChange={(event) => setChecked(event.target.checked ? [...checked, thread.id] : checked.filter((id) => id !== thread.id))} />
            <button type="button" onClick={() => setSelectedId(thread.id)} aria-current={selectedId === thread.id ? 'true' : undefined}>
              <span><strong>{thread.correspondents || thread.participants.join(', ') || thread.mailboxEmail}{thread.messageCount > 1 && <small> {thread.messageCount}</small>}</strong><b>{thread.subject || '(без темы)'}</b><small>{thread.snippet}</small>
                {(thread.client || thread.sendFailed) && <span className="mail-thread-row__tags">{thread.client && <Badge tone="info">{thread.client.companyName || thread.client.name}</Badge>}{thread.sendFailed && <Badge tone="danger">Не отправлено</Badge>}</span>}</span>
              <span className="mail-thread-row__meta"><time dateTime={thread.lastMessageAt}>{relativeTime(thread.lastMessageAt)}</time>{thread.hasAttachments && <Paperclip size={13} aria-label="Есть вложения" />}{thread.flagged && <Star size={13} className="is-starred" aria-label="Помечено" />}</span>
            </button>
          </div>) : <EmptyState title={query ? 'Ничего не найдено' : 'Писем нет'} description={query ? 'Попробуйте другие слова — поиск идёт по теме, тексту и адресам' : 'В этой папке пока пусто'} icon={Inbox} />}
          {hasMore && <button type="button" className="text-button mail-threads__more" onClick={() => void loadThreads(threads?.length ?? 0)}>Показать ещё</button>}
        </div>
      </Surface>
      {selectedId ? <ThreadView key={selectedId} threadId={selectedId} folders={sortedFolders} onBack={() => setSelectedId(null)} onCompose={setCompose} onAction={(action, folderId) => void act(action, [selectedId], folderId)} onChanged={() => void loadThreads()} />
        : <Surface className="mail-reader"><EmptyState title="Выберите письмо" description="Переписка откроется здесь" icon={Mail} /></Surface>}
    </div>
    {compose && <ComposeDialog request={compose} onClose={() => setCompose(null)} onSent={(threadId) => { setCompose(null); setNotice('Письмо отправлено'); setSelectedId(threadId); void loadThreads(); }} />}
  </>;
}

function ThreadView({ threadId, folders, onBack, onCompose, onAction, onChanged }: {
  threadId: string; folders: MailFolder[]; onBack: () => void; onCompose: (request: ComposeRequest) => void; onAction: (action: MailAction, folderId?: string) => void; onChanged: () => void;
}) {
  const mail = useMail();
  const navigate = useNavigate();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'link' | 'client' | 'deal' | 'delete' | null>(null);
  const load = useCallback(async () => {
    try { setThread(await mail.backend.thread(threadId)); } catch (reason) { setError(mailErrorMessage(reason, 'Переписка не загружена')); }
  }, [mail.backend, threadId]);
  useEffect(() => { void load().then(() => { void mail.refresh(); onChanged(); }); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => mail.subscribe(() => void load()), [mail, load]);
  if (error) return <Surface className="mail-reader"><div className="form-error" role="alert">{error}</div></Surface>;
  if (!thread) return <Surface className="mail-reader"><LoadingState label="Открываем письмо" /></Surface>;
  const last = thread.messages.at(-1);
  const inTrash = thread.messages.every((message) => message.folderSpecialUse === 'TRASH');
  const starred = thread.messages.some((message) => message.flagged);
  const serverDraft = thread.messages.find((message) => message.folderSpecialUse === 'DRAFTS');
  const afterLink = () => { setDialog(null); void load(); onChanged(); };
  return <Surface className="mail-reader" aria-label={`Переписка «${thread.subject || 'без темы'}»`}>
    <header className="mail-reader__header">
      <IconButton label="К списку писем" icon={ArrowLeft} className="mail-reader__back" onClick={onBack} />
      <h2>{thread.subject || '(без темы)'}</h2>
      <div className="mail-reader__actions">
        <IconButton label={starred ? 'Снять пометку' : 'Пометить'} icon={Star} className={starred ? 'is-starred' : ''} onClick={() => onAction(starred ? 'unstar' : 'star')} />
        <IconButton label="Отметить непрочитанным" icon={MailOpen} onClick={() => onAction('unread')} />
        <IconButton label="Архивировать" icon={Archive} onClick={() => onAction('archive')} />
        <IconButton label="В спам" icon={ShieldAlert} onClick={() => onAction('spam')} />
        <IconButton label={inTrash ? 'Удалить навсегда' : 'Удалить'} icon={Trash2} onClick={() => inTrash ? setDialog('delete') : onAction('trash')} />
        <label className="compact-select"><Folder size={15} /><select aria-label="Переместить в папку" value="" onChange={(event) => event.target.value && onAction('move', event.target.value)}><option value="">Переместить…</option>{folders.filter((item) => item.specialUse !== 'ALL').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
    </header>
    <div className="mail-crm" aria-label="Связь с CRM">
      {thread.client ? <>
        <BriefcaseBusiness size={15} aria-hidden="true" />
        <span>Клиент: <button type="button" className="text-button" onClick={() => navigate(`/crm/${thread.client!.id}`)}>{thread.client.companyName || thread.client.name}</button>{thread.deal && <> · Сделка: <b>{thread.deal.title}</b></>}{thread.linkSource === 'AUTO' && <small> · привязано автоматически</small>}</span>
        <button type="button" className="text-button" onClick={() => setDialog('link')}>Изменить</button>
        {!thread.deal && <Button variant="secondary" icon={BriefcaseBusiness} onClick={() => setDialog('deal')}>Создать сделку</Button>}
      </> : <>
        <Link2 size={15} aria-hidden="true" />
        <span>{thread.linkSuggestions.length > 1 ? 'Адрес совпадает с несколькими клиентами' : 'Не привязано к клиенту — переписку видите только вы'}</span>
        <button type="button" className="text-button" onClick={() => setDialog('link')}>Привязать</button>
        <Button variant="secondary" icon={UserPlus} onClick={() => setDialog('client')}>Создать клиента</Button>
      </>}
    </div>
    <div className="mail-reader__messages">
      {thread.messages.map((message, index) => {
        const collapsed = thread.messages.length > 3 && index < thread.messages.length - 2 && !expanded.includes(message.id);
        const isLast = message === last;
        return <MessageCard key={message.id} message={message} collapsed={collapsed} onToggle={() => setExpanded((current) => current.includes(message.id) ? current : [...current, message.id])}
          actions={isLast ? serverDraft === message ? <Button variant="secondary" icon={PenSquare} onClick={() => void mail.backend.draftFromMessage(message.id).then((draft) => onCompose({ mode: 'NEW', draft }))}>Продолжить черновик</Button> : <>
            <Button variant="secondary" icon={Reply} onClick={() => onCompose({ mode: 'REPLY', source: message, accountId: thread.accountId, clientId: thread.client?.id, dealId: thread.deal?.id })}>Ответить</Button>
            <Button variant="secondary" icon={ReplyAll} onClick={() => onCompose({ mode: 'REPLY_ALL', source: message, accountId: thread.accountId, clientId: thread.client?.id, dealId: thread.deal?.id })}>Ответить всем</Button>
            <Button variant="secondary" icon={Forward} onClick={() => onCompose({ mode: 'FORWARD', source: message, accountId: thread.accountId })}>Переслать</Button>
          </> : undefined} />;
      })}
    </div>
    {dialog === 'link' && <LinkThreadDialog thread={thread} onClose={() => setDialog(null)} onSaved={afterLink} />}
    {dialog === 'client' && <CreateClientFromMailDialog thread={thread} onClose={() => setDialog(null)} onSaved={afterLink} />}
    {dialog === 'deal' && <CreateDealFromMailDialog thread={thread} onClose={() => setDialog(null)} onSaved={afterLink} />}
    {dialog === 'delete' && <MailConfirmDialog title="Удалить навсегда?" description="Письма будут удалены с почтового сервера без возможности восстановления." confirm="Удалить навсегда" onClose={() => setDialog(null)} onConfirm={async () => { setDialog(null); onAction('delete'); }} />}
  </Surface>;
}
