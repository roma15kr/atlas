import { AlertTriangle, ArrowLeft, BriefcaseBusiness, Download, FileUp, Link2, Paperclip, Search, Send, Settings2, UserPlus, UserRoundCog, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BindClientDialog, CreateClientFromTelegramDialog, CreateDealFromTelegramDialog, ImportDialog, ReassignDialog } from '../components/telegram/TelegramDialogs';
import { Avatar, Badge, Button, EmptyState, IconButton, LoadingState, PageHeader, Segmented, Surface } from '../components/ui';
import { useAuth } from '../context/AppContext';
import { useTelegram } from '../context/TelegramContext';
import { fileSize, plural, relativeTime } from '../lib/format';
import { statusLabel, type ContactFilter, type TelegramContact, type TelegramMessage } from '../lib/telegram';
import { telegramErrorMessage } from '../lib/telegramErrors';

const UNREAD: [string, string, string] = ['непрочитанное', 'непрочитанных', 'непрочитанных'];
const time = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Customers' Telegram chats with the company bot, routed to their responsible managers. */
export function TelegramPage() {
  const { session } = useAuth();
  const me = session!.user;
  const telegram = useTelegram();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ContactFilter>(me.role === 'EMPLOYEE' ? 'mine' : 'all');
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<TelegramContact[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setContacts(await telegram.backend.contacts(filter, query.trim() || undefined)); } catch (reason) { setError(telegramErrorMessage(reason, 'Переписки не загружены')); setContacts([]); }
  }, [telegram.backend, filter, query]);
  useEffect(() => { const timer = setTimeout(() => void load(), query ? 250 : 0); return () => clearTimeout(timer); }, [load, query]);
  const { subscribe: subscribeList } = telegram;
  useEffect(() => subscribeList(() => void load()), [subscribeList, load]);
  const selected = contacts?.find((item) => item.id === selectedId) ?? null;
  const filters: Array<{ value: ContactFilter; label: string }> = me.role === 'EMPLOYEE'
    ? [{ value: 'mine', label: 'Мои' }, { value: 'all', label: 'Все' }]
    : [{ value: 'all', label: 'Все' }, { value: 'mine', label: 'Мои' }, { value: 'unassigned', label: 'Неразобранные' }];

  if (telegram.status && !telegram.status.configured) {
    return <>
      <PageHeader title="Telegram" description="Сообщения клиентов из Telegram-бота компании" />
      <Surface><EmptyState title="Telegram-бот не подключён" description={me.role === 'DIRECTOR' ? 'Администратору нужно указать токен бота на сервере — см. раздел Telegram в инструкции по эксплуатации' : 'Обратитесь к директору, чтобы подключить бота компании'} icon={Send} /></Surface>
    </>;
  }

  return <>
    <PageHeader title="Telegram" description={`${telegram.status?.botUsername ? `@${telegram.status.botUsername} · ` : ''}${plural(telegram.unread, UNREAD)}`} action={<>
      <label className="table-search tg-search"><Search size={16} /><input aria-label="Поиск по клиентам" placeholder="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {me.role !== 'EMPLOYEE' && <Button variant="secondary" icon={FileUp} onClick={() => setImporting(true)}>Импорт контактов</Button>}
      {me.role === 'DIRECTOR' && <IconButton label="Настройки Telegram" icon={Settings2} onClick={() => navigate('/telegram/settings')} />}
    </>}><Segmented value={filter} label="Какие переписки показать" options={filters} onChange={(value) => { setFilter(value); setSelectedId(null); }} /></PageHeader>
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>Закрыть</button></div>}
    {notice && <div className="notice notice--info" role="status">{notice}<button onClick={() => setNotice('')}>Закрыть</button></div>}
    <div className={`tg-layout ${selected ? 'tg-layout--open' : ''}`}>
      <Surface className="tg-list" aria-label="Клиенты в Telegram">
        <div className="tg-list__rows">
          {!contacts ? <LoadingState label="Загружаем переписки" /> : contacts.length ? contacts.map((contact) => <button key={contact.id} type="button" className={`${selectedId === contact.id ? 'is-active' : ''} ${contact.unread ? 'is-unread' : ''}`} onClick={() => setSelectedId(contact.id)} aria-current={selectedId === contact.id ? 'true' : undefined}>
            <Avatar name={contact.displayName} size="sm" />
            <span><strong>{contact.displayName}</strong><small>{contact.client ? contact.client.companyName || contact.client.name : contact.responsible ? 'Без клиента' : 'Неразобранное'}{contact.lastMessage ? ` · ${contact.lastMessage.direction === 'OUT' ? 'Вы: ' : ''}${contact.lastMessage.text ?? ''}` : ''}</small>
              {statusLabel[contact.status] && <span className="tg-list__status"><Badge tone={contact.status === 'BLOCKED' ? 'danger' : 'warning'}>{statusLabel[contact.status]}</Badge></span>}</span>
            <span className="tg-list__meta">{contact.lastMessageAt && <time dateTime={contact.lastMessageAt}>{relativeTime(contact.lastMessageAt)}</time>}{contact.unread > 0 && <Badge tone="info">{contact.unread}</Badge>}</span>
          </button>) : <EmptyState title={filter === 'unassigned' ? 'Неразобранных нет' : 'Переписок нет'} description={filter === 'mine' ? 'Когда клиент, за которого вы отвечаете, напишет боту, переписка появится здесь' : 'Сообщения клиентов боту появятся здесь'} icon={Send} />}
        </div>
      </Surface>
      {selected ? <Conversation key={selected.id} contact={selected} onBack={() => setSelectedId(null)} onChanged={() => void load()} />
        : <Surface className="tg-chat"><EmptyState title="Выберите переписку" description="Сообщения клиента и ваши ответы появятся здесь" icon={Send} /></Surface>}
    </div>
    {importing && <ImportDialog onClose={() => setImporting(false)} onDone={(summary) => { setImporting(false); setNotice(summary); void load(); }} />}
  </>;
}

function MessageBubble({ message, onReply }: { message: TelegramMessage; onReply?: () => void }) {
  const { backend } = useTelegram();
  const [error, setError] = useState('');
  const download = async () => {
    try {
      const url = URL.createObjectURL(await backend.download(message.id));
      const link = document.createElement('a'); link.href = url; link.download = message.fileName ?? 'file'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(telegramErrorMessage(reason, 'Файл не скачан')); }
  };
  return <article className={`tg-message tg-message--${message.direction === 'IN' ? 'in' : 'out'} ${message.status === 'FAILED' ? 'tg-message--failed' : ''}`} aria-label={message.direction === 'IN' ? 'Сообщение клиента' : 'Ответ'}>
    {message.direction === 'OUT' && <small className="tg-message__author">{message.sentBy?.fullName ?? 'Бот'}</small>}
    {message.summary && message.kind !== 'TEXT' && <span className="tg-message__summary">{message.summary}</span>}
    {message.fileName && <span className="tg-message__file">
      <Paperclip size={13} /><span>{message.fileName}{message.fileSize ? ` · ${fileSize(message.fileSize)}` : ''}</span>
      {message.fileTooLarge ? <small>Файл слишком большой для загрузки ботом</small> : message.fileReady ? <IconButton label={`Скачать ${message.fileName}`} icon={Download} onClick={() => void download()} /> : <small>Загружается…</small>}
    </span>}
    {message.text && <p>{message.text}</p>}
    <footer><time dateTime={message.createdAt}>{time(message.createdAt)}</time>{message.editedAt && <span>изменено</span>}{message.status === 'FAILED' && <span className="tg-message__error">{message.error ?? 'Не доставлено'}</span>}
      {onReply && message.direction === 'IN' && <button type="button" className="text-button" onClick={onReply}>Ответить</button>}</footer>
    {error && <div className="form-error" role="alert">{error}</div>}
  </article>;
}

function Conversation({ contact, onBack, onChanged }: { contact: TelegramContact; onBack: () => void; onChanged: () => void }) {
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
  const end = useRef<HTMLDivElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      setMessages((await backend.messages(contact.id)).items);
      await backend.read(contact.id);
      void refresh();
    } catch (reason) { setError(telegramErrorMessage(reason, 'Сообщения не загружены')); setMessages([]); }
  }, [backend, refresh, contact.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribe((event) => { if (!event.contactId || event.contactId === contact.id) void load(); }), [subscribe, contact.id, load]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [messages?.length]);

  const send = async () => {
    if ((!text.trim() && !file) || sending) return;
    setSending(true); setError('');
    try {
      const sent = await telegram.backend.send(contact.id, { text: text.trim(), file, replyToId: replyTo?.id });
      setMessages((current) => [...(current ?? []), sent]);
      setText(''); setFile(null); setReplyTo(null);
      onChanged();
    } catch (reason) { setError(telegramErrorMessage(reason, 'Сообщение не отправлено')); void load(); onChanged(); } finally { setSending(false); }
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } };
  const afterDialog = () => { setDialog(null); onChanged(); };
  const canReassign = me.role !== 'EMPLOYEE';

  return <Surface className="tg-chat" aria-label={`Переписка с ${contact.displayName}`}>
    <header className="tg-chat__header">
      <IconButton label="К списку" icon={ArrowLeft} className="tg-chat__back" onClick={onBack} />
      <Avatar name={contact.displayName} size="sm" />
      <div><h2>{contact.displayName}</h2><span>{contact.username ? `@${contact.username} · ` : ''}ID {contact.telegramUserId}</span></div>
      {statusLabel[contact.status] && <Badge tone={contact.status === 'BLOCKED' ? 'danger' : 'warning'}>{statusLabel[contact.status]}</Badge>}
    </header>
    <div className="mail-crm tg-chat__crm" aria-label="Связь с CRM">
      <BriefcaseBusiness size={15} aria-hidden="true" />
      <span>{contact.client ? <>Клиент: <button type="button" className="text-button" onClick={() => navigate(`/crm/${contact.client!.id}`)}>{contact.client.companyName || contact.client.name}</button></> : 'Не привязано к клиенту'}
        {' · '}Ответственный: <b>{contact.responsible?.fullName ?? 'не назначен'}</b>{contact.deals.length > 0 && <> · Сделки: {contact.deals.map((deal) => deal.title).join(', ')}</>}</span>
      <button type="button" className="text-button" onClick={() => setDialog('bind')}><Link2 size={13} />{contact.client ? 'Изменить клиента' : 'Привязать'}</button>
      {canReassign && <button type="button" className="text-button" onClick={() => setDialog('reassign')}><UserRoundCog size={13} />Ответственный</button>}
      {contact.client ? <Button variant="secondary" icon={BriefcaseBusiness} onClick={() => setDialog('deal')}>Создать сделку</Button> : <Button variant="secondary" icon={UserPlus} onClick={() => setDialog('client')}>Создать клиента</Button>}
    </div>
    <div className="tg-chat__messages">
      {!messages ? <LoadingState label="Загружаем сообщения" /> : messages.length ? messages.map((message) => <MessageBubble key={message.id} message={message} onReply={contact.status !== 'BLOCKED' ? () => setReplyTo(message) : undefined} />)
        : <EmptyState title="Сообщений пока нет" description={contact.status === 'UNVERIFIED' ? 'Контакт импортирован. Написать можно после того, как клиент запустит бота.' : 'Напишите клиенту первым'} icon={Send} />}
      <div ref={end} />
    </div>
    {error && <div className="notice notice--danger tg-chat__notice" role="alert"><AlertTriangle size={15} />{error}<button onClick={() => setError('')}>Закрыть</button></div>}
    {contact.status === 'BLOCKED' ? <div className="chat-main__notice">Клиент заблокировал бота — сообщения ему не доходят</div> : <div className="tg-composer">
      {(replyTo || file) && <div className="tg-composer__context">
        {replyTo && <span>Ответ на: {replyTo.text ?? replyTo.summary}<IconButton label="Отменить ответ" icon={X} onClick={() => setReplyTo(null)} /></span>}
        {file && <span><Paperclip size={13} />{file.name} · {fileSize(file.size)}<IconButton label="Убрать файл" icon={X} onClick={() => setFile(null)} /></span>}
      </div>}
      <div className="chat-composer">
        <IconButton label="Прикрепить фото или файл" icon={Paperclip} onClick={() => files.current?.click()} />
        <input ref={files} type="file" hidden aria-label="Файл для отправки" onChange={(event) => { setFile(event.target.files?.[0] ?? null); event.target.value = ''; }} />
        <textarea aria-label="Ответ клиенту" placeholder={contact.status === 'UNVERIFIED' ? 'Клиент ещё не писал боту — сообщение может не дойти' : 'Ответить в Telegram'} rows={2} maxLength={4096} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={keyDown} />
        <IconButton label="Отправить" icon={Send} className="chat-composer__send" disabled={sending || (!text.trim() && !file)} onClick={() => void send()} />
      </div>
    </div>}
    {dialog === 'bind' && <BindClientDialog contact={contact} onClose={() => setDialog(null)} onSaved={afterDialog} />}
    {dialog === 'reassign' && <ReassignDialog contact={contact} onClose={() => setDialog(null)} onSaved={afterDialog} />}
    {dialog === 'client' && <CreateClientFromTelegramDialog contact={contact} onClose={() => setDialog(null)} onSaved={afterDialog} />}
    {dialog === 'deal' && <CreateDealFromTelegramDialog contact={contact} onClose={() => setDialog(null)} onSaved={afterDialog} />}
  </Surface>;
}
