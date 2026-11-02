import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['mail', 'common']);
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
    catch (reason) { setError(mailErrorMessage(reason, t('settings.startFailed'))); }
  };
  return <>
    <button className="back-link" onClick={() => navigate('/mail')}><ArrowLeft size={15} />{t('settings.back')}</button>
    <PageHeader title={t('settings.title')} description={t('settings.description', { count: accounts.length })} action={<Button icon={Plug} disabled={!anyAvailable || accounts.length >= 5} onClick={() => setDialog({ type: 'connect' })}>{t('settings.connect')}</Button>} />
    {!anyAvailable && <div className="notice notice--danger" role="alert">{t('settings.serverOff')}</div>}
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>{t('common:actions.close')}</button></div>}
    {notice && <div className="notice notice--info" role="status">{notice}<button onClick={() => setNotice('')}>{t('common:actions.close')}</button></div>}
    <Surface className="table-surface mail-accounts">
      <SectionHeader title={t('settings.mailboxes')} meta={<Badge>{accounts.length}</Badge>} />
      {accounts.length ? <div className="dialog-rows mail-accounts__rows">{accounts.map((account) => {
        const Icon = providerIcon[account.provider];
        return <div key={account.id} className="dialog-row">
          <span className="chat-icon"><Icon size={15} /></span>
          <span><strong>{account.email}</strong><small>{providerLabel[account.provider]} · {account.displayName ?? t('settings.noName')} · {account.lastSyncedAt ? t('settings.synced', { time: relativeTime(account.lastSyncedAt) }) : t('settings.neverSynced')}{account.status === 'NEEDS_ATTENTION' && account.statusReason ? ` · ${account.statusReason}` : ''}</small></span>
          {account.status === 'CONNECTED' ? <Badge tone="success">{t('settings.connected')}</Badge> : <Badge tone="warning">{t('settings.attention')}</Badge>}
          {account.status === 'NEEDS_ATTENTION' && <Button variant="secondary" icon={RefreshCw} onClick={() => void reconnect(account)}>{t('settings.reconnect')}</Button>}
          <IconButton label={t('settings.nameSignature', { email: account.email })} icon={Pencil} onClick={() => setDialog({ type: 'edit', account })} />
          {account.provider === 'IMAP' && account.status === 'CONNECTED' && <IconButton label={t('settings.serverPassword', { email: account.email })} icon={Server} onClick={() => setDialog({ type: 'reconnect', account })} />}
          <IconButton label={t('settings.disconnect', { email: account.email })} icon={Trash2} onClick={() => setDialog({ type: 'remove', account })} />
        </div>;
      })}</div> : <EmptyState title={t('settings.emptyTitle')} description={t('settings.emptyText')} icon={Mail} />}
    </Surface>
    {dialog?.type === 'connect' && <ConnectMailboxDialog onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setNotice(t('settings.connectedNotice')); }} />}
    {dialog?.type === 'reconnect' && <ConnectMailboxDialog account={dialog.account} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setNotice(t('settings.updated')); }} />}
    {dialog?.type === 'edit' && <MailboxDialog account={dialog.account} onClose={() => setDialog(null)} onSaved={() => setDialog(null)} />}
    {dialog?.type === 'remove' && <MailConfirmDialog title={t('settings.disconnectTitle', { email: dialog.account.email })} description={t('settings.disconnectText')} confirm={t('settings.disconnectConfirm')}
      onClose={() => setDialog(null)} onConfirm={async () => { await backend.removeAccount(dialog.account.id); await refresh(); setDialog(null); setNotice(t('settings.disconnected')); }} />}
  </>;
}
