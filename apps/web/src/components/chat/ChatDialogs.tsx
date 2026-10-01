import { Archive, ArchiveRestore, Hash, Lock, LogOut, Search, Shield, ShieldOff, UserMinus, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AppContext';
import { useChat } from '../../context/ChatContext';
import { canCreateChannels, conversationTitle, type ChatChannel, type ChatConversation, type ChatMember, type ChatMessage, type ChatPerson, type ChatVisibility } from '../../lib/chat';
import { chatErrorMessage } from '../../lib/chatErrors';
import { plural } from '../../lib/format';
import { Avatar, Badge, Button, Dialog, EmptyState, Field, IconButton, SelectField } from '../ui';

const MEMBERS: [string, string, string] = ['участник', 'участника', 'участников'];

/** Searchable checklist of colleagues. */
function PeoplePicker({ people, selected, onChange, exclude = [], legend }: { people: ChatPerson[]; selected: string[]; onChange: (ids: string[]) => void; exclude?: string[]; legend: string }) {
  const [query, setQuery] = useState('');
  const visible = people.filter((person) => !exclude.includes(person.id) && `${person.fullName} ${person.username} ${person.departmentName ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return <div className="field--wide people-picker">
    <label className="table-search"><Search size={16} /><input aria-label="Найти сотрудника" placeholder="Найти сотрудника" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <fieldset className="check-list"><legend>{legend}</legend>
      {visible.length ? visible.map((person) => <label key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} /><span>{person.fullName}<small>{[person.departmentName, person.jobTitle].filter(Boolean).join(' · ') || 'Без отдела'}</small></span></label>) : <small>Никого не найдено</small>}
    </fieldset>
  </div>;
}

export function NewMessageDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (conversation: ChatConversation) => void }) {
  const { session } = useAuth();
  const { backend, people, refresh } = useChat();
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const group = selected.length > 1;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected.length) return;
    setSaving(true); setError('');
    try {
      const conversation = group ? await backend.group(selected, name.trim() || null) : await backend.direct(selected[0]!);
      await refresh();
      onOpened(conversation);
    } catch (reason) { setError(chatErrorMessage(reason, 'Разговор не создан')); } finally { setSaving(false); }
  };
  return <Dialog open title="Новое сообщение" description="Один коллега — личный разговор, несколько — группа до 20 человек" onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>Отмена</Button>
    <Button type="submit" form="new-message-form" disabled={saving || !selected.length}>{group ? 'Создать группу' : 'Написать'}</Button>
  </>}>
    <form id="new-message-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <PeoplePicker people={people} selected={selected} onChange={setSelected} exclude={[session!.user.id]} legend="Кому" />
      {group && <Field label="Название группы" className="field--wide" hint="Необязательно"><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Например, «Запуск продукта»" /></Field>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function ChannelFormDialog({ channel, onClose, onSaved }: { channel?: Pick<ChatConversation, 'id' | 'name' | 'description' | 'visibility' | 'isDefault'>; onClose: () => void; onSaved: (id: string) => void }) {
  const { session } = useAuth();
  const { backend, people, refresh } = useChat();
  const [name, setName] = useState(channel?.name ?? '');
  const [description, setDescription] = useState(channel?.description ?? '');
  const [visibility, setVisibility] = useState<ChatVisibility>(channel?.visibility ?? 'PUBLIC');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError('');
    try {
      if (channel) {
        await backend.updateChannel(channel.id, channel.isDefault ? { description: description.trim() || null } : { name: name.trim(), description: description.trim() || null, visibility });
        await refresh(); onSaved(channel.id);
      } else {
        const created = await backend.createChannel({ name: name.trim(), description: description.trim() || null, visibility, memberIds });
        await refresh(); onSaved(created.id);
      }
    } catch (reason) { setError(chatErrorMessage(reason, 'Канал не сохранён')); } finally { setSaving(false); }
  };
  return <Dialog open title={channel ? 'Канал' : 'Новый канал'} description={channel ? undefined : 'Публичный канал видят все сотрудники, закрытый — только участники'} size={channel ? 'md' : 'lg'} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>Отмена</Button>
    <Button type="submit" form="channel-form" disabled={saving || !name.trim()}>{channel ? 'Сохранить' : 'Создать канал'}</Button>
  </>}>
    <form id="channel-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label="Название"><input value={name} maxLength={80} required disabled={channel?.isDefault} autoFocus onChange={(event) => setName(event.target.value)} placeholder="Например, «Маркетинг»" /></Field>
      <SelectField label="Доступ" value={visibility} disabled={channel?.isDefault} onChange={(event) => setVisibility(event.target.value as ChatVisibility)}><option value="PUBLIC">Публичный</option><option value="PRIVATE">Закрытый</option></SelectField>
      <Field label="Описание" className="field--wide"><textarea rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="О чём этот канал" /></Field>
      {!channel && <PeoplePicker people={people} selected={memberIds} onChange={setMemberIds} exclude={[session!.user.id]} legend="Участники" />}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function BrowseChannelsDialog({ onClose, onOpen, onCreate }: { onClose: () => void; onOpen: (channel: ChatChannel) => void; onCreate: () => void }) {
  const { session } = useAuth();
  const { backend } = useChat();
  const [archived, setArchived] = useState(false);
  const [channels, setChannels] = useState<ChatChannel[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setChannels(null);
    backend.channels(archived).then((items) => { if (active) setChannels(items); }).catch((reason) => { if (active) { setChannels([]); setError(chatErrorMessage(reason, 'Каналы не загружены')); } });
    return () => { active = false; };
  }, [backend, archived]);
  return <Dialog open title="Каналы" description="Публичные каналы компании и закрытые каналы, где вы участник" onClose={onClose} footer={<>
    <label className="dialog-footer__start inline-check"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />Показать архивные</label>
    <Button variant="secondary" onClick={onClose}>Закрыть</Button>
    {canCreateChannels(session!.user.role) && <Button onClick={onCreate}>Создать канал</Button>}
  </>}>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="dialog-rows">
      {channels?.map((channel) => <button key={channel.id} type="button" className="dialog-row" onClick={() => onOpen(channel)}>
        <span className="chat-icon">{channel.visibility === 'PRIVATE' ? <Lock size={15} /> : <Hash size={15} />}</span>
        <span><strong>{channel.name}</strong><small>{channel.description || (channel.visibility === 'PRIVATE' ? 'Закрытый канал' : 'Публичный канал')} · {plural(channel.memberCount, MEMBERS)}</small></span>
        {channel.archivedAt ? <Badge>Архив</Badge> : channel.isMember ? <Badge tone="success">Вы участник</Badge> : !channel.canRead ? <Badge tone="warning">Только управление</Badge> : null}
      </button>)}
      {channels && !channels.length && !error && <EmptyState title="Каналов нет" description="Создайте первый канал для команды" icon={Hash} />}
    </div>
  </Dialog>;
}

/** Channel or group settings: details, members and admins, leaving and archiving. */
export function ConversationSettingsDialog({ conversation, onClose, onLeft }: { conversation: ChatConversation; onClose: () => void; onLeft: () => void }) {
  const { session } = useAuth();
  const { backend, refresh } = useChat();
  const me = session!.user;
  const [members, setMembers] = useState<ChatMember[] | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'main' | 'edit' | 'add' | 'leave' | 'archive' | 'rename'>('main');
  const [version, setVersion] = useState(0);
  const isChannel = conversation.kind === 'CHANNEL';
  const canManage = Boolean(conversation.canManage);
  useEffect(() => {
    let active = true;
    backend.members(conversation.id).then((items) => { if (active) setMembers(items); }).catch((reason) => { if (active) setError(chatErrorMessage(reason, 'Участники не загружены')); });
    return () => { active = false; };
  }, [backend, conversation.id, version]);
  const run = async (action: () => Promise<void>, fallback: string) => {
    setError('');
    try { await action(); setVersion((value) => value + 1); await refresh(); } catch (reason) { setError(chatErrorMessage(reason, fallback)); }
  };
  const title = conversationTitle(conversation, me.id);

  if (mode === 'edit') return <ChannelFormDialog channel={conversation} onClose={() => setMode('main')} onSaved={() => { setMode('main'); onClose(); }} />;
  if (mode === 'rename') return <RenameGroupDialog conversation={conversation} onClose={() => setMode('main')} />;
  if (mode === 'add') return <AddMembersDialog conversation={conversation} existing={members?.map((member) => member.id) ?? []} onClose={() => { setMode('main'); setVersion((value) => value + 1); }} />;
  if (mode === 'leave') return <ConfirmDialog title={isChannel ? `Покинуть канал «${title}»?` : 'Выйти из группы?'} description={isChannel && conversation.visibility === 'PRIVATE' ? 'Вернуться сможете, только если администратор добавит вас снова.' : 'Разговор пропадёт из вашего списка.'} confirm="Выйти" onClose={() => setMode('main')} onConfirm={async () => { await backend.removeMember(conversation.id, me.id); await refresh(); onLeft(); }} />;
  if (mode === 'archive') return <ConfirmDialog title={`Архивировать канал «${title}»?`} description="Канал станет доступен только для чтения и пропадёт из списков. Его можно вернуть из архива." confirm="Архивировать" onClose={() => setMode('main')} onConfirm={async () => { await backend.archive(conversation.id, true); await refresh(); onLeft(); }} />;

  const admins = members?.filter((member) => member.role === 'ADMIN').length ?? 0;
  const canLeave = conversation.isMember && conversation.kind !== 'DM' && !conversation.isDefault;
  return <Dialog open size="lg" title={isChannel ? `Канал «${title}»` : title} description={isChannel ? 'Настройки, участники и администраторы' : 'Групповой разговор'} onClose={onClose} footer={<>
    {canLeave && <Button variant="ghost" icon={LogOut} className="dialog-footer__start" onClick={() => setMode('leave')}>{isChannel ? 'Покинуть канал' : 'Выйти из группы'}</Button>}
    {isChannel && canManage && !conversation.isDefault && (conversation.archivedAt
      ? <Button variant="secondary" icon={ArchiveRestore} onClick={() => void run(() => backend.archive(conversation.id, false), 'Канал не возвращён')}>Вернуть из архива</Button>
      : <Button variant="secondary" icon={Archive} onClick={() => setMode('archive')}>Архивировать</Button>)}
    {!isChannel && <Button variant="secondary" onClick={() => setMode('rename')}>Переименовать</Button>}
    <Button variant="secondary" onClick={onClose}>Закрыть</Button>
  </>}>
    {error && <div className="form-error" role="alert">{error}</div>}
    {isChannel && <>
      <div className="section-header dialog-section"><div className="section-title"><h2>О канале</h2></div>
        {canManage && !conversation.archivedAt && <Button variant="secondary" onClick={() => setMode('edit')}>Изменить</Button>}
      </div>
      <dl className="dialog-facts"><div><dt>Название</dt><dd>{title}</dd></div><div><dt>Доступ</dt><dd>{conversation.visibility === 'PRIVATE' ? 'Закрытый — только участники' : 'Публичный — все сотрудники'}</dd></div><div><dt>Описание</dt><dd>{conversation.description || '—'}</dd></div></dl>
    </>}
    {isChannel && canManage && !conversation.isMember && <p className="dialog-text">Вы управляете этим каналом, но не видите его сообщения, пока не станете участником.</p>}
    <div className="section-header dialog-section"><div className="section-title"><h2>Участники</h2>{members && <Badge>{members.length}</Badge>}</div>
      {((isChannel && canManage && !conversation.isDefault) || (!isChannel && conversation.isMember)) && !conversation.archivedAt && <Button variant="secondary" icon={UserPlus} onClick={() => setMode('add')}>Добавить</Button>}
    </div>
    <div className="dialog-rows">{members?.map((member) => <div key={member.id} className="dialog-row">
      <Avatar name={member.fullName} size="sm" />
      <span><strong>{member.fullName}{member.id === me.id ? ' (вы)' : ''}</strong><small>{[member.departmentName, member.jobTitle].filter(Boolean).join(' · ') || 'Без отдела'}</small></span>
      {isChannel && member.role === 'ADMIN' && <Badge tone="info">Администратор</Badge>}
      {isChannel && canManage && !conversation.isDefault && <>
        {member.role === 'ADMIN'
          ? <IconButton label={`Снять права администратора: ${member.fullName}`} icon={ShieldOff} disabled={admins <= 1} onClick={() => void run(() => backend.setRole(conversation.id, member.id, 'MEMBER'), 'Права не изменены')} />
          : <IconButton label={`Сделать администратором: ${member.fullName}`} icon={Shield} onClick={() => void run(() => backend.setRole(conversation.id, member.id, 'ADMIN'), 'Права не изменены')} />}
        {member.id !== me.id && <IconButton label={`Удалить из канала: ${member.fullName}`} icon={UserMinus} disabled={member.role === 'ADMIN' && admins <= 1} onClick={() => void run(() => backend.removeMember(conversation.id, member.id), 'Участник не удалён')} />}
      </>}
    </div>)}</div>
  </Dialog>;
}

function RenameGroupDialog({ conversation, onClose }: { conversation: ChatConversation; onClose: () => void }) {
  const { backend, refresh } = useChat();
  const [name, setName] = useState(conversation.name ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await backend.renameGroup(conversation.id, name.trim() || null); await refresh(); onClose(); } catch (reason) { setError(chatErrorMessage(reason, 'Название не сохранено')); } finally { setSaving(false); }
  };
  return <Dialog open title="Название группы" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="rename-group-form" disabled={saving}>Сохранить</Button></>}>
    <form id="rename-group-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label="Название" className="field--wide" hint="Без названия группа называется по именам участников"><input value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

function AddMembersDialog({ conversation, existing, onClose }: { conversation: ChatConversation; existing: string[]; onClose: () => void }) {
  const { backend, people, refresh } = useChat();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await backend.addMembers(conversation.id, selected); await refresh(); onClose(); } catch (reason) { setError(chatErrorMessage(reason, 'Участники не добавлены')); } finally { setSaving(false); }
  };
  return <Dialog open title="Добавить участников" description={conversation.kind === 'GROUP' ? 'Новые участники увидят всю историю группы' : undefined} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="add-members-form" disabled={saving || !selected.length}>Добавить</Button></>}>
    <form id="add-members-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <PeoplePicker people={people} selected={selected} onChange={setSelected} exclude={existing} legend="Сотрудники" />
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function EditMessageDialog({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const { backend, notify } = useChat();
  const [body, setBody] = useState(message.body ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { const updated = await backend.edit(message.id, body.trim()); notify({ type: 'message-updated', conversationId: updated.conversationId, message: updated }); onClose(); } catch (reason) { setError(chatErrorMessage(reason, 'Сообщение не изменено')); } finally { setSaving(false); }
  };
  return <Dialog open title="Изменить сообщение" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="edit-message-form" disabled={saving || !body.trim()}>Сохранить</Button></>}>
    <form id="edit-message-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label="Текст" className="field--wide"><textarea rows={4} maxLength={4000} value={body} autoFocus onChange={(event) => setBody(event.target.value)} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function ConfirmDialog({ title, description, confirm, onClose, onConfirm }: { title: string; description: string; confirm: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setSaving(true); setError('');
    try { await onConfirm(); } catch (reason) { setError(chatErrorMessage(reason, 'Действие не выполнено')); setSaving(false); }
  };
  return <Dialog open size="sm" title={title} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button variant="danger" disabled={saving} onClick={() => void go()}>{confirm}</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : <p className="dialog-text">{description}</p>}
  </Dialog>;
}

export const usePeopleByUsername = (people: ChatPerson[]) => useMemo(() => new Map(people.map((person) => [person.username.toLowerCase(), person])), [people]);
