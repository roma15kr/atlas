import { useTranslation } from 'react-i18next';
import { localeOf } from '../../i18n';
import { Mail, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMail } from '../../context/MailContext';
import { useTelegram } from '../../context/TelegramContext';
import type { TelegramMessage } from '../../lib/telegram';
import { telegramErrorMessage } from '../../lib/telegramErrors';
import { relativeTime } from '../../lib/format';
import type { CommunicationEntry, CommunicationThread } from '../../lib/mail';
import { mailErrorMessage } from '../../lib/mailErrors';
import type { Deal } from '../../types';
import { Badge, Dialog, EmptyState, LoadingState, SectionHeader, Surface } from '../ui';
import { MessageCard } from './MailParts';


/** A client's correspondence from every channel, optionally narrowed to one of its deals. Read-only. */
export function ClientCorrespondence({ clientId, deals }: { clientId: string; deals: Deal[] }) {
  const { t } = useTranslation(['crm', 'common']);
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
      .catch((reason) => { if (active) { setEntries([]); setError(mailErrorMessage(reason, t('history.loadFailed'))); } });
    return () => { active = false; };
  }, [backend, demoHistory, clientId, dealId, version, t]);
  return <Surface className="client-history" aria-label={t('history.title')}>
    <SectionHeader title={t('history.title')} meta={entries ? <Badge>{entries.length}</Badge> : undefined} action={deals.length ? <label className="compact-select"><select aria-label={t('history.dealTitle')} value={dealId} onChange={(event) => setDealId(event.target.value)}><option value="">{t('history.allDeals')}</option>{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}</select></label> : undefined} />
    {error && <div className="form-error" role="alert">{error}</div>}
    {!entries ? <LoadingState label={t('history.loading')} /> : entries.length ? <div className="correspondence-rows">{entries.map((entry) => {
      const Icon = entry.channel === 'EMAIL' ? Mail : MessageCircle;
      return <button key={`${entry.channel}-${entry.id}`} type="button" onClick={() => setOpen(entry)}>
        <span className="chat-icon"><Icon size={15} /></span>
        <span><strong>{entry.title}</strong><small>{entry.channel === 'EMAIL' ? t('history.mail') : 'Telegram'} · {entry.owner?.fullName ?? '—'}{entry.messageCount ? ` · ${t('history.messages', { count: entry.messageCount })}` : ''}</small>{entry.snippet && <small className="correspondence-rows__snippet">{entry.snippet}</small>}</span>
        <time dateTime={entry.lastActivityAt}>{relativeTime(entry.lastActivityAt)}</time>
      </button>;
    })}</div> : <EmptyState title={t('history.emptyTitle')} description={t('history.emptyText')} icon={Mail} />}
    {open?.channel === 'EMAIL' && <HistoryThreadDialog entry={open} onClose={() => setOpen(null)} />}
    {open?.channel === 'TELEGRAM' && <TelegramHistoryDialog entry={open} onClose={() => setOpen(null)} />}
  </Surface>;
}

function HistoryThreadDialog({ entry, onClose }: { entry: CommunicationEntry; onClose: () => void }) {
  const { t } = useTranslation(['crm', 'common']);
  const { backend } = useMail();
  const [thread, setThread] = useState<CommunicationThread | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { backend.historyThread(entry.id).then(setThread).catch((reason) => setError(mailErrorMessage(reason, t('history.unavailable')))); }, [backend, entry.id, t]);
  return <Dialog open size="lg" title={entry.title} description={thread ? t('history.mailbox', { email: thread.mailboxEmail, owner: thread.owner.fullName }) : undefined} onClose={onClose}>
    {error ? <div className="form-error" role="alert">{error}</div> : !thread ? <LoadingState label={t('history.opening')} /> : <div className="mail-reader__messages">{thread.messages.map((message) => <MessageCard key={message.id} message={message} />)}</div>}
  </Dialog>;
}

const time = (value: string) => new Date(value).toLocaleString(localeOf(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** A Telegram conversation as recorded in the client's history, read-only, with who replied. */
function TelegramHistoryDialog({ entry, onClose }: { entry: CommunicationEntry; onClose: () => void }) {
  const { t } = useTranslation(['crm', 'common']);
  const { backend } = useTelegram();
  const [messages, setMessages] = useState<TelegramMessage[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { backend.history(entry.id).then((thread) => setMessages(thread.messages)).catch((reason) => setError(telegramErrorMessage(reason, t('history.unavailable')))); }, [backend, entry.id, t]);
  return <Dialog open size="lg" title={`Telegram: ${entry.title}`} description={t('history.readOnly', { owner: entry.owner?.fullName ?? t('history.noOwner') })} onClose={onClose}>
    {error ? <div className="form-error" role="alert">{error}</div> : !messages ? <LoadingState label={t('history.opening')} /> : <div className="tg-history">{messages.map((message) => <article key={message.id} className={`tg-message tg-message--${message.direction === 'IN' ? 'in' : 'out'}`}>
      {message.direction === 'OUT' && <small className="tg-message__author">{message.sentBy?.fullName ?? t('history.bot')}</small>}
      {message.summary && message.kind !== 'TEXT' && <span className="tg-message__summary">{message.summary}{message.fileName ? `: ${message.fileName}` : ''}</span>}
      {message.text && <p>{message.text}</p>}
      <footer><time dateTime={message.createdAt}>{time(message.createdAt)}</time></footer>
    </article>)}</div>}
  </Dialog>;
}
