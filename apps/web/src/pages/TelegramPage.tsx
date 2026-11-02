import { useTranslation } from 'react-i18next';
import { useScrollBack } from '../lib/useScrollBack';
import { useIsPhone } from '../lib/useIsPhone';
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, Download, FileUp, Link2, Paperclip, Search, Send, Settings2, UserPlus, UserRoundCog, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BindClientDialog, CreateClientFromTelegramDialog, CreateDealFromTelegramDialog, ImportDialog, ReassignDialog } from '../components/telegram/TelegramDialogs';
import { Avatar, Badge, Button, EmptyState, IconButton, LoadingState, PageHeader, Segmented, Surface } from '../components/ui';
import { useAuth } from '../context/AppContext';
import { useTelegram } from '../context/TelegramContext';
import { fileSize, relativeTime } from '../lib/format';
import { statusLabel, type ContactFilter, type TelegramContact, type TelegramMessage } from '../lib/telegram';
import { telegramErrorMessage } from '../lib/telegramErrors';

const time = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Customers' Telegram chats with the company bot, routed to their responsible managers. */
export function TelegramPage() {
  const { t } = useTranslation(['telegram', 'common']);
  const { session } = useAuth();
  const me = session!.user;
  const telegram = useTelegram();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ContactFilter>(me.role === 'EMPLOYEE' ? 'mine' : 'all');
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<TelegramContact[] | null>(null);
  // A notification links here with ?contact=<id>.
  const [params, setParams] = useSearchParams();
  const phone = useIsPhone();
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('contact'));
  const linked = params.get('contact');
  useEffect(() => {
    if (!linked) return;
    setSelectedId(linked);
    setParams((current) => { current.delete('contact'); return current; }, { replace: true });
  }, [linked, setParams]);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setContacts(await telegram.backend.contacts(filter, query.trim() || undefined)); } catch (reason) { setError(telegramErrorMessage(reason, t('page.loadFailed'))); setContacts([]); }
  }, [telegram.backend, filter, query, t]);
  useEffect(() => { const timer = setTimeout(() => void load(), query ? 250 : 0); return () => clearTimeout(timer); }, [load, query]);
  const { subscribe: subscribeList } = telegram;
  useEffect(() => subscribeList(() => void load()), [subscribeList, load]);
  const selected = contacts?.find((item) => item.id === selectedId) ?? null;
  const filters: Array<{ value: ContactFilter; label: string }> = me.role === 'EMPLOYEE'
    ? [{ value: 'mine', label: t('page.filter.mine') }, { value: 'all', label: t('page.filter.all') }]
    : [{ value: 'all', label: t('page.filter.all') }, { value: 'mine', label: t('page.filter.mine') }, { value: 'unassigned', label: t('page.filter.unassigned') }];

  if (telegram.status && !telegram.status.configured) {
    return <>
      <PageHeader title="Telegram" description={t('page.description')} />
      <Surface><EmptyState title={t('page.offTitle')} description={me.role === 'DIRECTOR' ? t('page.offDirector') : t('page.offOthers')} icon={Send} /></Surface>
    </>;
  }

  // On a phone the customer list and one conversation take turns.
  const phoneConversation = phone && Boolean(selected);
  return <>
    {!phoneConversation && <PageHeader title="Telegram" description={`${telegram.status?.botUsername ? `@${telegram.status.botUsername} · ` : ''}${t('count.unread', { count: telegram.unread })}`} action={<>
      <label className="table-search tg-search"><Search size={16} /><input aria-label={t('page.search')} placeholder={t('page.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {me.role !== 'EMPLOYEE' && <Button variant="secondary" icon={FileUp} onClick={() => setImporting(true)}>{t('page.import')}</Button>}
      {me.role === 'DIRECTOR' && <IconButton label={t('page.settings')} icon={Settings2} onClick={() => navigate('/telegram/settings')} />}
    </>}><Segmented value={filter} label={t('page.filterLabel')} options={filters} onChange={(value) => { setFilter(value); setSelectedId(null); }} /></PageHeader>}
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>{t('common:actions.close')}</button></div>}
    {notice && <div className="notice notice--info" role="status">{notice}<button onClick={() => setNotice('')}>{t('common:actions.close')}</button></div>}
    <div className={`tg-layout ${selected ? 'tg-layout--open' : ''} ${phone ? 'tg-layout--phone' : ''}`}>
      {!phoneConversation && <Surface className="tg-list" aria-label={t('page.list')}>
        <div className="tg-list__rows">
          {!contacts ? <LoadingState label={t('page.loading')} /> : contacts.length ? contacts.map((contact) => <button key={contact.id} type="button" className={`${selectedId === contact.id ? 'is-active' : ''} ${contact.unread ? 'is-unread' : ''}`} onClick={() => setSelectedId(contact.id)} aria-current={selectedId === contact.id ? 'true' : undefined}>
            <Avatar name={contact.displayName} size="sm" />
            <span><strong>{contact.displayName}</strong><small>{contact.client ? contact.client.companyName || contact.client.name : contact.responsible ? t('page.noClient') : t('page.unassigned')}{contact.lastMessage ? ` · ${contact.lastMessage.direction === 'OUT' ? t('page.you') : ''}${contact.lastMessage.text ?? ''}` : ''}</small>
              {statusLabel[contact.status] && <span className="tg-list__status"><Badge tone={contact.status === 'BLOCKED' ? 'danger' : 'warning'}>{statusLabel[contact.status]}</Badge></span>}</span>
            <span className="tg-list__meta">{contact.lastMessageAt && <time dateTime={contact.lastMessageAt}>{relativeTime(contact.lastMessageAt)}</time>}{contact.unread > 0 && <Badge tone="info">{contact.unread}</Badge>}</span>
          </button>) : <EmptyState title={filter === 'unassigned' ? t('page.noUnassigned') : t('page.empty')} description={filter === 'mine' ? t('page.emptyMine') : t('page.emptyAll')} icon={Send} />}
        </div>
      </Surface>}
      {selected ? <Conversation key={selected.id} contact={selected} onBack={() => setSelectedId(null)} onChanged={() => void load()} />
        : phone ? null : <Surface className="tg-chat"><EmptyState title={t('page.choose')} description={t('page.chooseText')} icon={Send} /></Surface>}
    </div>
    {importing && <ImportDialog onClose={() => setImporting(false)} onDone={(summary) => { setImporting(false); setNotice(summary); void load(); }} />}
  </>;
}

function MessageBubble({ message, onReply }: { message: TelegramMessage; onReply?: () => void }) {
  const { t } = useTranslation(['telegram', 'common']);
  const { backend } = useTelegram();
  const [error, setError] = useState('');
  const download = async () => {
    try {
      const url = URL.createObjectURL(await backend.download(message.id));
      const link = document.createElement('a'); link.href = url; link.download = message.fileName ?? 'file'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(telegramErrorMessage(reason, t('message.downloadFailed'))); }
  };
  return <article className={`tg-message tg-message--${message.direction === 'IN' ? 'in' : 'out'} ${message.status === 'FAILED' ? 'tg-message--failed' : ''}`} aria-label={message.direction === 'IN' ? t('message.incoming') : t('message.outgoing')}>
    {message.direction === 'OUT' && <small className="tg-message__author">{message.sentBy?.fullName ?? t('message.bot')}</small>}
    {message.summary && message.kind !== 'TEXT' && <span className="tg-message__summary">{message.summary}</span>}
    {message.fileName && <span className="tg-message__file">
      <Paperclip size={13} /><span>{message.fileName}{message.fileSize ? ` · ${fileSize(message.fileSize)}` : ''}</span>
      {message.fileTooLarge ? <small>{t('message.tooLarge')}</small> : message.fileReady ? <IconButton label={t('message.download', { name: message.fileName })} icon={Download} onClick={() => void download()} /> : <small>{t('message.loadingFile')}</small>}
    </span>}
    {message.text && <p>{message.text}</p>}
    <footer><time dateTime={message.createdAt}>{time(message.createdAt)}</time>{message.editedAt && <span>{t('message.edited')}</span>}{message.status === 'FAILED' && <span className="tg-message__error">{message.error ?? t('message.notDelivered')}</span>}
      {onReply && message.direction === 'IN' && <button type="button" className="text-button" onClick={onReply}>{t('message.reply')}</button>}</footer>
    {error && <div className="form-error" role="alert">{error}</div>}
  </article>;
}

function Conversation({ contact, onBack, onChanged }: { contact: TelegramContact; onBack: () => void; onChanged: () => void }) {
  const { t } = useTranslation(['telegram', 'common']);
  const { session } = useAuth();
  const me = session!.user;
  const telegram = useTelegram();
  const { backend, refresh, subscribe } = telegram;
  const navigate = useNavigate();
  const [messages, setMessages] = useState<TelegramMessage[] | null>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<TelegramMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'bind' | 'reassign' | 'client' | 'deal' | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  // The newest page; earlier pages the user already scrolled back to are kept, not replaced.
  const load = useCallback(async () => {
    try {
      const page = await backend.messages(contact.id);
      setMessages((current) => {
        if (!current?.length || !page.items.length) { setHasMore(page.hasMore); return page.items; }
        const ids = new Set(page.items.map((item) => item.id));
        const earlier = current.filter((item) => !ids.has(item.id) && item.createdAt < page.items[0]!.createdAt);
        if (!earlier.length) setHasMore(page.hasMore);
        return [...earlier, ...page.items];
      });
      await backend.read(contact.id);
      void refresh();
    } catch (reason) { setError(telegramErrorMessage(reason, t('chat.loadFailed'))); setMessages((current) => current ?? []); }
  }, [backend, refresh, contact.id, t]);
  const loadOlder = useCallback(async () => {
    const first = messages?.[0];
    if (!first) return;
    try {
      const page = await backend.messages(contact.id, first.id);
      setMessages((current) => [...page.items.filter((item) => !current?.some((existing) => existing.id === item.id)), ...(current ?? [])]);
      setHasMore(page.hasMore);
    } catch (reason) { setError(telegramErrorMessage(reason, t('chat.olderFailed'))); }
  }, [backend, contact.id, messages, t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribe((event) => { if (!event.contactId || event.contactId === contact.id) void load(); }), [subscribe, contact.id, load]);
  const last = messages?.at(-1);
  const history = useScrollBack({ firstId: messages?.[0]?.id, lastId: last?.id, lastIsMine: last?.direction === 'OUT' && last.sentBy?.id === me.id, hasMore, loadOlder });

  const send = async () => {
    if ((!text.trim() && !file) || sending) return;
    setSending(true); setError('');
    try {
      const sent = await telegram.backend.send(contact.id, { text: text.trim(), file, replyToId: replyTo?.id });
      setMessages((current) => [...(current ?? []), sent]);
      setText(''); setFile(null); setReplyTo(null);
      onChanged();
    } catch (reason) { setError(telegramErrorMessage(reason, t('chat.sendFailed'))); void load(); onChanged(); } finally { setSending(false); }
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } };
  const afterDialog = () => { setDialog(null); onChanged(); };
  const canReassign = me.role !== 'EMPLOYEE';

  return <Surface className="tg-chat" aria-label={t('chat.label', { name: contact.displayName })}>
    <header className="tg-chat__header">
      <IconButton label={t('chat.back')} icon={ArrowLeft} className="tg-chat__back" onClick={onBack} />
      <Avatar name={contact.displayName} size="sm" />
      <div><h2>{contact.displayName}</h2><span>{contact.username ? `@${contact.username} · ` : ''}ID {contact.telegramUserId}</span></div>
      {statusLabel[contact.status] && <Badge tone={contact.status === 'BLOCKED' ? 'danger' : 'warning'}>{statusLabel[contact.status]}</Badge>}
    </header>
    <div className="mail-crm tg-chat__crm" aria-label={t('chat.crm')}>
      <BriefcaseBusiness size={15} aria-hidden="true" />
      <span>{contact.client ? <>{t('chat.client')}<button type="button" className="text-button" onClick={() => navigate(`/crm/${contact.client!.id}`)}>{contact.client.companyName || contact.client.name}</button></> : t('chat.notLinked')}
        {' · '}{t('chat.responsible')}<b>{contact.responsible?.fullName ?? t('chat.nobody')}</b>{contact.deals.length > 0 && <>{t('chat.deals')}{contact.deals.map((deal) => deal.title).join(', ')}</>}</span>
      <button type="button" className="text-button" onClick={() => setDialog('bind')}><Link2 size={13} />{contact.client ? t('chat.changeClient') : t('chat.link')}</button>
      {canReassign && <button type="button" className="text-button" onClick={() => setDialog('reassign')}><UserRoundCog size={13} />{t('chat.reassign')}</button>}
      {contact.client ? <Button variant="secondary" icon={BriefcaseBusiness} onClick={() => setDialog('deal')}>{t('chat.createDeal')}</Button> : <Button variant="secondary" icon={UserPlus} onClick={() => setDialog('client')}>{t('chat.createClient')}</Button>}
    </div>
    <div className="tg-chat__messages" ref={history.container} onScroll={history.onScroll}>
      <div ref={history.sentinel} aria-hidden />
      {hasMore ? <button type="button" className="text-button chat-main__older" disabled={history.busy} onClick={() => void history.older()}>{history.busy ? t('chat.loadingOlder') : t('chat.showOlder')}</button>
        : messages && messages.length > 0 && <div className="chat-main__start">{t('chat.start')}</div>}
      {!messages ? <LoadingState label={t('chat.loading')} /> : messages.length ? messages.map((message) => <MessageBubble key={message.id} message={message} onReply={contact.status !== 'BLOCKED' ? () => setReplyTo(message) : undefined} />)
        : <EmptyState title={t('chat.empty')} description={contact.status === 'UNVERIFIED' ? t('chat.imported') : t('chat.writeFirst')} icon={Send} />}
    </div>
    {error && <div className="notice notice--danger tg-chat__notice" role="alert"><AlertTriangle size={15} />{error}<button onClick={() => setError('')}>{t('common:actions.close')}</button></div>}
    {history.newBelow && <button type="button" className="new-messages" onClick={history.scrollToEnd}>{t('chat.newMessages')}</button>}
    {contact.status === 'BLOCKED' ? <div className="chat-main__notice">{t('chat.blocked')}</div> : <div className="tg-composer">
      {(replyTo || file) && <div className="tg-composer__context">
        {replyTo && <span>{t('chat.replyTo')}{replyTo.text ?? replyTo.summary}<IconButton label={t('chat.cancelReply')} icon={X} onClick={() => setReplyTo(null)} /></span>}
        {file && <span><Paperclip size={13} />{file.name} · {fileSize(file.size)}<IconButton label={t('chat.removeFile')} icon={X} onClick={() => setFile(null)} /></span>}
      </div>}
      <div className="chat-composer">
        <IconButton label={t('chat.attach')} icon={Paperclip} onClick={() => files.current?.click()} />
        <input ref={files} type="file" hidden aria-label={t('chat.file')} onChange={(event) => { setFile(event.target.files?.[0] ?? null); event.target.value = ''; }} />
        <textarea aria-label={t('chat.composer')} placeholder={contact.status === 'UNVERIFIED' ? t('chat.unverified') : t('chat.placeholder')} rows={2} maxLength={4096} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={keyDown} />
        <IconButton label={t('chat.send')} icon={Send} className="chat-composer__send" disabled={sending || (!text.trim() && !file)} onClick={() => void send()} />
      </div>
    </div>}
    {dialog === 'bind' && <BindClientDialog contact={contact} onClose={() => setDialog(null)} onSaved={afterDialog} />}
    {dialog === 'reassign' && <ReassignDialog contact={contact} onClose={() => setDialog(null)} onSaved={afterDialog} />}
    {dialog === 'client' && <CreateClientFromTelegramDialog contact={contact} onClose={() => setDialog(null)} onSaved={afterDialog} />}
    {dialog === 'deal' && <CreateDealFromTelegramDialog contact={contact} onClose={() => setDialog(null)} onSaved={afterDialog} />}
  </Surface>;
}
