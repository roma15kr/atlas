import { ArrowLeft, AtSign, Mail, Pencil, Plug, RefreshCw, Server, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConnectMailboxDialog, MailboxDialog, MailConfirmDialog } from '../components/mail/MailDialogs';
import { Badge, Button, EmptyState, IconButton, PageHeader, SectionHeader, Surface } from '../components/ui';
import { useMail } from '../context/MailContext';
import { relativeTime } from '../lib/format';
import type { MailAccount } from '../lib/mail';
import { mailErrorMessage } from '../lib/mailErrors';

const providerLabel: Record<MailAccount['provider'], string> = { IMAP: 'IMAP/SMTP', GOOGLE: 'Google', MICROSOFT: 'Microsoft 365' };
const providerIcon = { IMAP: Server, GOOGLE: Mail, MICROSOFT: AtSign };

/** The user's mailboxes: connect, reconnect, signature and disconnect. */
export function MailSettingsPage() {
  const { accounts, providers, backend, refresh } = useMail();
  const navigate = useNavigate();
  const location = useLocation();
  const [dialog, setDialog] = useState<{ type: 'connect' } | { type: 'reconnect' | 'edit' | 'remove'; account: MailAccount } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState((location.state as { notice?: string } | null)?.notice ?? '');
  const anyAvailable = providers.imap || providers.google || providers.microsoft;
  const reconnect = async (account: MailAccount) => {
    if (account.provider === 'IMAP') { setDialog({ type: 'reconnect', account }); return; }
    try { window.location.assign(await backend.oauthStart(account.provider === 'GOOGLE' ? 'google' : 'microsoft', account.email)); }
    catch (reason) { setError(mailErrorMessage(reason, 'Не удалось начать подключение')); }
  };
  return <>
    <button className="back-link" onClick={() => navigate('/mail')}><ArrowLeft size={15} />К почте</button>
    <PageHeader title="Настройки почты" description={`${accounts.length} из 5 ящиков · письма видите только вы`} action={<Button icon={Plug} disabled={!anyAvailable || accounts.length >= 5} onClick={() => setDialog({ type: 'connect' })}>Подключить ящик</Button>} />
    {!anyAvailable && <div className="notice notice--danger" role="alert">Подключение почты не настроено на сервере. Администратору нужно задать ключ шифрования почты.</div>}
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>Закрыть</button></div>}
    {notice && <div className="notice notice--info" role="status">{notice}<button onClick={() => setNotice('')}>Закрыть</button></div>}
    <Surface className="table-surface mail-accounts">
      <SectionHeader title="Почтовые ящики" meta={<Badge>{accounts.length}</Badge>} />
      {accounts.length ? <div className="dialog-rows mail-accounts__rows">{accounts.map((account) => {
        const Icon = providerIcon[account.provider];
        return <div key={account.id} className="dialog-row">
          <span className="chat-icon"><Icon size={15} /></span>
          <span><strong>{account.email}</strong><small>{providerLabel[account.provider]} · {account.displayName ?? 'без имени'} · {account.lastSyncedAt ? `синхронизация ${relativeTime(account.lastSyncedAt)}` : 'ещё не синхронизирован'}{account.status === 'NEEDS_ATTENTION' && account.statusReason ? ` · ${account.statusReason}` : ''}</small></span>
          {account.status === 'CONNECTED' ? <Badge tone="success">Подключён</Badge> : <Badge tone="warning">Требует внимания</Badge>}
          {account.status === 'NEEDS_ATTENTION' && <Button variant="secondary" icon={RefreshCw} onClick={() => void reconnect(account)}>Переподключить</Button>}
          <IconButton label={`Имя и подпись: ${account.email}`} icon={Pencil} onClick={() => setDialog({ type: 'edit', account })} />
          {account.provider === 'IMAP' && account.status === 'CONNECTED' && <IconButton label={`Сервер и пароль: ${account.email}`} icon={Server} onClick={() => setDialog({ type: 'reconnect', account })} />}
          <IconButton label={`Отключить ${account.email}`} icon={Trash2} onClick={() => setDialog({ type: 'remove', account })} />
        </div>;
      })}</div> : <EmptyState title="Ящики не подключены" description="Подключите рабочую почту — Google, Microsoft или любую другую по IMAP" icon={Mail} />}
    </Surface>
    {dialog?.type === 'connect' && <ConnectMailboxDialog onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setNotice('Ящик подключён — письма появятся после первой синхронизации'); }} />}
    {dialog?.type === 'reconnect' && <ConnectMailboxDialog account={dialog.account} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setNotice('Подключение обновлено'); }} />}
    {dialog?.type === 'edit' && <MailboxDialog account={dialog.account} onClose={() => setDialog(null)} onSaved={() => setDialog(null)} />}
    {dialog?.type === 'remove' && <MailConfirmDialog title={`Отключить ${dialog.account.email}?`} description="Письма этого ящика исчезнут из Atlas. Переписка, привязанная к клиентам и сделкам, останется в их истории." confirm="Отключить"
      onClose={() => setDialog(null)} onConfirm={async () => { await backend.removeAccount(dialog.account.id); await refresh(); setDialog(null); setNotice('Ящик отключён'); }} />}
  </>;
}
