import { Mail, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMail } from '../../context/MailContext';
import { useTelegram } from '../../context/TelegramContext';
import type { TelegramMessage } from '../../lib/telegram';
import { telegramErrorMessage } from '../../lib/telegramErrors';
import { plural, relativeTime } from '../../lib/format';
import type { CommunicationEntry, CommunicationThread } from '../../lib/mail';
import { mailErrorMessage } from '../../lib/mailErrors';
import type { Deal } from '../../types';
import { Badge, Dialog, EmptyState, LoadingState, SectionHeader, Surface } from '../ui';
import { MessageCard } from './MailParts';

const MESSAGES: [string, string, string] = ['сообщение', 'сообщения', 'сообщений'];

/** A client's correspondence from every channel, optionally narrowed to one of its deals. Read-only. */
export function ClientCorrespondence({ clientId, deals }: { clientId: string; deals: Deal[] }) {
  const { backend, subscribe } = useMail();
  const { demoHistory } = useTelegram();
  const [dealId, setDealId] = useState('');
  const [entries, setEntries] = useState<CommunicationEntry[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<CommunicationEntry | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => subscribe(() => setVersion((value) => value + 1)), [subscribe]);
  useEffect(() => {
    let active = true;
    setEntries(null); setError('');
    Promise.all([dealId ? backend.dealHistory(dealId) : backend.clientHistory(clientId), demoHistory(dealId ? { dealId } : { clientId })])
      .then(([items, extra]) => { if (active) setEntries([...items, ...extra].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))); })
      .catch((reason) => { if (active) { setEntries([]); setError(mailErrorMessage(reason, 'Переписка не загружена')); } });
    return () => { active = false; };
  }, [backend, demoHistory, clientId, dealId, version]);
  return <Surface className="client-history" aria-label="Переписка">
    <SectionHeader title="Переписка" meta={entries ? <Badge>{entries.length}</Badge> : undefined} action={deals.length ? <label className="compact-select"><select aria-label="Переписка по сделке" value={dealId} onChange={(event) => setDealId(event.target.value)}><option value="">Все сделки</option>{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}</select></label> : undefined} />
    {error && <div className="form-error" role="alert">{error}</div>}
    {!entries ? <LoadingState label="Загружаем переписку" /> : entries.length ? <div className="correspondence-rows">{entries.map((entry) => {
      const Icon = entry.channel === 'EMAIL' ? Mail : MessageCircle;
      return <button key={`${entry.channel}-${entry.id}`} type="button" onClick={() => setOpen(entry)}>
        <span className="chat-icon"><Icon size={15} /></span>
        <span><strong>{entry.title}</strong><small>{entry.channel === 'EMAIL' ? 'Почта' : 'Telegram'} · {entry.owner?.fullName ?? '—'}{entry.messageCount ? ` · ${plural(entry.messageCount, MESSAGES)}` : ''}</small>{entry.snippet && <small className="correspondence-rows__snippet">{entry.snippet}</small>}</span>
        <time dateTime={entry.lastActivityAt}>{relativeTime(entry.lastActivityAt)}</time>
      </button>;
    })}</div> : <EmptyState title="Переписки пока нет" description="Письма и сообщения клиента появятся здесь, когда сотрудники привяжут их к клиенту" icon={Mail} />}
    {open?.channel === 'EMAIL' && <HistoryThreadDialog entry={open} onClose={() => setOpen(null)} />}
    {open?.channel === 'TELEGRAM' && <TelegramHistoryDialog entry={open} onClose={() => setOpen(null)} />}
  </Surface>;
}

function HistoryThreadDialog({ entry, onClose }: { entry: CommunicationEntry; onClose: () => void }) {
  const { backend } = useMail();
  const [thread, setThread] = useState<CommunicationThread | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { backend.historyThread(entry.id).then(setThread).catch((reason) => setError(mailErrorMessage(reason, 'Переписка недоступна'))); }, [backend, entry.id]);
  return <Dialog open size="lg" title={entry.title} description={thread ? `Ящик ${thread.mailboxEmail} · ${thread.owner.fullName} · только для чтения` : undefined} onClose={onClose}>
    {error ? <div className="form-error" role="alert">{error}</div> : !thread ? <LoadingState label="Открываем переписку" /> : <div className="mail-reader__messages">{thread.messages.map((message) => <MessageCard key={message.id} message={message} />)}</div>}
  </Dialog>;
}

const time = (value: string) => new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** A Telegram conversation as recorded in the client's history, read-only, with who replied. */
function TelegramHistoryDialog({ entry, onClose }: { entry: CommunicationEntry; onClose: () => void }) {
  const { backend } = useTelegram();
  const [messages, setMessages] = useState<TelegramMessage[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { backend.history(entry.id).then((thread) => setMessages(thread.messages)).catch((reason) => setError(telegramErrorMessage(reason, 'Переписка недоступна'))); }, [backend, entry.id]);
  return <Dialog open size="lg" title={`Telegram: ${entry.title}`} description={`Ответственный: ${entry.owner?.fullName ?? 'не назначен'} · только для чтения`} onClose={onClose}>
    {error ? <div className="form-error" role="alert">{error}</div> : !messages ? <LoadingState label="Открываем переписку" /> : <div className="tg-history">{messages.map((message) => <article key={message.id} className={`tg-message tg-message--${message.direction === 'IN' ? 'in' : 'out'}`}>
      {message.direction === 'OUT' && <small className="tg-message__author">{message.sentBy?.fullName ?? 'Бот'}</small>}
      {message.summary && message.kind !== 'TEXT' && <span className="tg-message__summary">{message.summary}{message.fileName ? `: ${message.fileName}` : ''}</span>}
      {message.text && <p>{message.text}</p>}
      <footer><time dateTime={message.createdAt}>{time(message.createdAt)}</time></footer>
    </article>)}</div>}
  </Dialog>;
}
