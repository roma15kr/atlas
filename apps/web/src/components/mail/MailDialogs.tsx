import { AtSign, Mail, Server } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth, useWorkspace } from '../../context/AppContext';
import { useMail } from '../../context/MailContext';
import { presetFor, type ImapAccountInput, type MailAccount, type Security, type ThreadDetail } from '../../lib/mail';
import { mailErrorMessage } from '../../lib/mailErrors';
import { Button, Dialog, Field, SelectField } from '../ui';

/** Link a thread to a client or one of the client's deals, or remove the link. */
export function LinkThreadDialog({ thread, onClose, onSaved }: { thread: ThreadDetail; onClose: () => void; onSaved: () => void }) {
  const { backend } = useMail();
  const { clients, deals } = useWorkspace();
  const [clientId, setClientId] = useState(thread.client?.id ?? thread.linkSuggestions[0]?.id ?? '');
  const [dealId, setDealId] = useState(thread.deal?.id ?? '');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const matches = clients.filter((client) => `${client.companyName} ${client.name} ${client.email}`.toLowerCase().includes(query.toLowerCase()));
  const clientDeals = deals.filter((deal) => deal.clientId === clientId);
  const run = async (link: { clientId?: string | null; dealId?: string | null }) => {
    setSaving(true); setError('');
    try { await backend.link(thread.id, link); onSaved(); } catch (reason) { setError(mailErrorMessage(reason, 'Связь не сохранена')); } finally { setSaving(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (clientId) void run(dealId ? { dealId } : { clientId }); };
  return <Dialog open title="Привязать к клиенту" description="Переписку увидят все, кому доступна карточка клиента или сделка — только для чтения" onClose={onClose} footer={<>
    {(thread.client || thread.deal) && <Button variant="ghost" className="dialog-footer__start" disabled={saving} onClick={() => void run({ clientId: null, dealId: null })}>Отвязать</Button>}
    <Button variant="secondary" onClick={onClose}>Отмена</Button>
    <Button type="submit" form="link-thread-form" disabled={saving || !clientId}>Сохранить</Button>
  </>}>
    <form id="link-thread-form" className="form-grid" onSubmit={submit}>
      {thread.linkSuggestions.length > 1 && <p className="dialog-text field--wide">Адрес совпадает с несколькими клиентами — выберите нужного.</p>}
      <Field label="Найти клиента" className="field--wide"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Компания, контакт или email" /></Field>
      <SelectField label="Клиент" value={clientId} onChange={(event) => { setClientId(event.target.value); setDealId(''); }} className="field--wide">
        <option value="">Выберите клиента</option>
        {matches.map((client) => <option key={client.id} value={client.id}>{client.companyName} · {client.name}{client.email ? ` · ${client.email}` : ''}</option>)}
      </SelectField>
      <SelectField label="Сделка" value={dealId} onChange={(event) => setDealId(event.target.value)} disabled={!clientDeals.length} className="field--wide">
        <option value="">{clientDeals.length ? 'Без сделки' : 'У клиента нет сделок'}</option>
        {clientDeals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}
      </SelectField>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function CreateClientFromMailDialog({ thread, onClose, onSaved }: { thread: ThreadDetail; onClose: () => void; onSaved: () => void }) {
  const { backend } = useMail();
  const first = thread.messages.find((message) => message.fromAddress.toLowerCase() !== thread.mailboxEmail.toLowerCase()) ?? thread.messages[0];
  const fallbackEmail = first?.fromAddress.toLowerCase() === thread.mailboxEmail.toLowerCase() ? first?.to[0]?.address ?? '' : first?.fromAddress ?? '';
  const [name, setName] = useState(first && first.fromAddress.toLowerCase() !== thread.mailboxEmail.toLowerCase() ? first.fromName ?? '' : first?.to[0]?.name ?? '');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState(fallbackEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await backend.createClientFrom(thread.id, { name: name.trim(), companyName: companyName.trim() || undefined, email: email.trim() || undefined }); onSaved(); }
    catch (reason) { setError(mailErrorMessage(reason, 'Клиент не создан')); } finally { setSaving(false); }
  };
  return <Dialog open title="Новый клиент из письма" description="Клиент будет вашим, переписка привяжется к нему" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="mail-client-form" disabled={saving || !name.trim()}>Создать клиента</Button></>}>
    <form id="mail-client-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label="Контакт"><input value={name} required maxLength={160} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Компания"><input value={companyName} maxLength={200} onChange={(event) => setCompanyName(event.target.value)} /></Field>
      <Field label="Email" className="field--wide"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function CreateDealFromMailDialog({ thread, onClose, onSaved }: { thread: ThreadDetail; onClose: () => void; onSaved: () => void }) {
  const { backend } = useMail();
  const { funnels } = useWorkspace();
  const [funnelId, setFunnelId] = useState(funnels[0]?.id ?? '');
  const [title, setTitle] = useState(thread.subject.replace(/^\s*(re|fwd?|ответ)\s*:\s*/i, '') || 'Новая сделка');
  const [value, setValue] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await backend.createDealFrom(thread.id, { funnelId, title: title.trim(), value: Number(value) || 0 }); onSaved(); }
    catch (reason) { setError(mailErrorMessage(reason, 'Сделка не создана')); } finally { setSaving(false); }
  };
  return <Dialog open title="Новая сделка из письма" description={`Клиент: ${thread.client?.companyName || thread.client?.name}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="mail-deal-form" disabled={saving || !funnelId || !title.trim()}>Создать сделку</Button></>}>
    <form id="mail-deal-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label="Название" className="field--wide"><input value={title} required maxLength={200} onChange={(event) => setTitle(event.target.value)} /></Field>
      <SelectField label="Воронка" value={funnelId} onChange={(event) => setFunnelId(event.target.value)}>{funnels.map((funnel) => <option key={funnel.id} value={funnel.id}>{funnel.name}</option>)}</SelectField>
      <Field label="Сумма, ₴"><input type="number" min="0" step="1000" value={value} onChange={(event) => setValue(event.target.value)} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

const emptyServer = { host: '', port: 993, security: 'SSL' as Security };

/** Choose Google, Microsoft or another provider; the IMAP/SMTP form tests the connection before saving. */
export function ConnectMailboxDialog({ account, onClose, onSaved }: { account?: MailAccount; onClose: () => void; onSaved: () => void }) {
  const { backend, providers, refresh } = useMail();
  const { session } = useAuth();
  const [step, setStep] = useState<'choose' | 'imap'>(account ? 'imap' : 'choose');
  const [email, setEmail] = useState(account?.email ?? '');
  const [displayName, setDisplayName] = useState(account?.displayName ?? session!.user.fullName);
  const [username, setUsername] = useState(account?.username ?? '');
  const [password, setPassword] = useState('');
  const [imap, setImap] = useState(account ? { host: account.imapHost, port: account.imapPort, security: account.imapSecurity } : emptyServer);
  const [smtp, setSmtp] = useState(account ? { host: account.smtpHost, port: account.smtpPort, security: account.smtpSecurity } : { host: '', port: 465, security: 'SSL' as Security });
  const [busy, setBusy] = useState<'test' | 'save' | 'oauth' | null>(null);
  const [error, setError] = useState('');
  const [tested, setTested] = useState(false);
  const input = useMemo<ImapAccountInput>(() => ({ email: email.trim(), displayName: displayName.trim() || null, imap, smtp, username: username.trim() || email.trim(), password }), [email, displayName, imap, smtp, username, password]);
  const fillPreset = (value: string) => {
    const preset = presetFor(value);
    if (preset && !account) { setImap(preset.imap); setSmtp(preset.smtp); }
  };
  const oauth = async (provider: 'google' | 'microsoft') => {
    setBusy('oauth'); setError('');
    try { window.location.assign(await backend.oauthStart(provider)); } catch (reason) { setError(mailErrorMessage(reason, 'Не удалось начать подключение')); setBusy(null); }
  };
  const test = async () => {
    setBusy('test'); setError(''); setTested(false);
    try { await backend.testAccount(input); setTested(true); } catch (reason) { setError(mailErrorMessage(reason, 'Подключение не удалось')); } finally { setBusy(null); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy('save'); setError('');
    try {
      if (account) await backend.updateAccount(account.id, { imap, smtp, username: input.username, ...(password ? { password } : {}) });
      else await backend.addAccount(input);
      await refresh(); onSaved();
    } catch (reason) { setError(mailErrorMessage(reason, 'Ящик не подключён')); } finally { setBusy(null); }
  };

  if (step === 'choose') {
    return <Dialog open title="Подключить почтовый ящик" description="Письма будут видны только вам, пока вы не привяжете переписку к клиенту" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Отмена</Button>}>
      <div className="dialog-rows">
        <button type="button" className="dialog-row" disabled={!providers.google || busy !== null} onClick={() => void oauth('google')}><span className="chat-icon"><Mail size={15} /></span><span><strong>Google</strong><small>{providers.google ? 'Gmail и Google Workspace — вход через Google' : 'Не настроено на сервере'}</small></span></button>
        <button type="button" className="dialog-row" disabled={!providers.microsoft || busy !== null} onClick={() => void oauth('microsoft')}><span className="chat-icon"><AtSign size={15} /></span><span><strong>Microsoft 365 / Outlook</strong><small>{providers.microsoft ? 'Вход через Microsoft' : 'Не настроено на сервере'}</small></span></button>
        <button type="button" className="dialog-row" disabled={!providers.imap} onClick={() => setStep('imap')}><span className="chat-icon"><Server size={15} /></span><span><strong>Другая почта</strong><small>{providers.imap ? 'IMAP и SMTP: ukr.net, i.ua, корпоративная почта, Gmail с паролем приложения' : 'Подключение почты не настроено на сервере'}</small></span></button>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
    </Dialog>;
  }

  const serverFields = (label: string, value: typeof imap, onChange: (next: typeof imap) => void, ports: number[]) => <>
    <Field label={`${label}: сервер`}><input value={value.host} required onChange={(event) => { onChange({ ...value, host: event.target.value.trim() }); setTested(false); }} placeholder={label === 'IMAP' ? 'imap.example.com' : 'smtp.example.com'} /></Field>
    <div className="form-pair">
      <SelectField label="Порт" value={String(value.port)} onChange={(event) => { onChange({ ...value, port: Number(event.target.value) }); setTested(false); }}>{ports.map((port) => <option key={port} value={port}>{port}</option>)}</SelectField>
      <SelectField label="Шифрование" value={value.security} onChange={(event) => { onChange({ ...value, security: event.target.value as Security }); setTested(false); }}><option value="SSL">SSL/TLS</option><option value="STARTTLS">STARTTLS</option></SelectField>
    </div>
  </>;
  return <Dialog open size="lg" title={account ? `Подключение ${account.email}` : 'Другая почта'} description="Для Gmail, Яндекса и других сервисов с двухэтапной проверкой используйте пароль приложения" onClose={onClose} footer={<>
    {!account && <Button variant="ghost" className="dialog-footer__start" onClick={() => setStep('choose')}>Назад</Button>}
    <Button variant="secondary" disabled={busy !== null || !input.email || !password || !imap.host || !smtp.host} onClick={() => void test()}>{busy === 'test' ? 'Проверяем…' : 'Проверить подключение'}</Button>
    <Button type="submit" form="imap-form" disabled={busy !== null || !input.email || (!account && !password) || !imap.host || !smtp.host}>{busy === 'save' ? 'Подключаем…' : account ? 'Сохранить' : 'Подключить'}</Button>
  </>}>
    <form id="imap-form" className="form-grid" onSubmit={(event) => void save(event)}>
      <Field label="Email"><input type="email" value={email} required disabled={Boolean(account)} onChange={(event) => { setEmail(event.target.value); setTested(false); }} onBlur={(event) => fillPreset(event.target.value)} autoFocus={!account} /></Field>
      <Field label="Имя отправителя"><input value={displayName} maxLength={200} disabled={Boolean(account)} onChange={(event) => setDisplayName(event.target.value)} /></Field>
      <Field label="Логин" hint="Обычно совпадает с email"><input value={username} onChange={(event) => { setUsername(event.target.value); setTested(false); }} placeholder={email} autoComplete="off" /></Field>
      <Field label={account ? 'Новый пароль' : 'Пароль'} hint={account ? 'Оставьте пустым, чтобы не менять' : 'Хранится зашифрованным и никому не показывается'}><input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setTested(false); }} autoComplete="new-password" /></Field>
      {serverFields('IMAP', imap, setImap, [993, 143])}
      {serverFields('SMTP', smtp, setSmtp, [465, 587, 25])}
      {tested && <div className="form-success field--wide" role="status">Подключение работает — можно сохранять</div>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function MailboxDialog({ account, onClose, onSaved }: { account: MailAccount; onClose: () => void; onSaved: () => void }) {
  const { backend, refresh } = useMail();
  const [displayName, setDisplayName] = useState(account.displayName ?? '');
  const [signature, setSignature] = useState(account.signature ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await backend.updateAccount(account.id, { displayName: displayName.trim() || null, signature: signature.trim() || null }); await refresh(); onSaved(); }
    catch (reason) { setError(mailErrorMessage(reason, 'Настройки не сохранены')); } finally { setSaving(false); }
  };
  return <Dialog open title={account.email} description="Имя отправителя и подпись для новых писем, ответов и пересылок" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="mailbox-form" disabled={saving}>Сохранить</Button></>}>
    <form id="mailbox-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label="Имя отправителя" className="field--wide"><input value={displayName} maxLength={200} onChange={(event) => setDisplayName(event.target.value)} /></Field>
      <Field label="Подпись" className="field--wide" hint={`${signature.length} / 2000`}><textarea rows={5} maxLength={2000} value={signature} onChange={(event) => setSignature(event.target.value)} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function MailConfirmDialog({ title, description, confirm, onClose, onConfirm }: { title: string; description: string; confirm: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setSaving(true); setError('');
    try { await onConfirm(); } catch (reason) { setError(mailErrorMessage(reason, 'Действие не выполнено')); setSaving(false); }
  };
  return <Dialog open size="sm" title={title} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button variant="danger" disabled={saving} onClick={() => void go()}>{confirm}</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : <p className="dialog-text">{description}</p>}
  </Dialog>;
}
