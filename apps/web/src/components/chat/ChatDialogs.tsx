import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, Hash, LogOut, Search, Shield, ShieldOff, UserMinus, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AppContext';
import { useChat } from '../../context/ChatContext';
import { canCreateChannels, conversationTitle, type ChatChannel, type ChatConversation, type ChatMember, type ChatMessage, type ChatPerson, type ChatVisibility } from '../../lib/chat';
import { chatErrorMessage } from '../../lib/chatErrors';
import { fitsLimit, RichTextEditor } from '../richtext/RichTextEditor';
import { Avatar, Badge, Button, Dialog, EmptyState, Field, IconButton, SelectField } from '../ui';
import { ChannelIconPicker, ChannelIconTile } from './ChannelIconPicker';
import { CHAT_MESSAGE_LIMIT } from './ChatParts';


/** Searchable checklist of colleagues. */
function PeoplePicker({ people, selected, onChange, exclude = [], legend }: { people: ChatPerson[]; selected: string[]; onChange: (ids: string[]) => void; exclude?: string[]; legend: string }) {
  const { t } = useTranslation(['chat', 'common']);
  const [query, setQuery] = useState('');
  const { reloadPeople } = useChat();
  useEffect(() => { void reloadPeople(); }, [reloadPeople]);
  const visible = people.filter((person) => !exclude.includes(person.id) && `${person.fullName} ${person.username} ${person.departmentName ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return <div className="field--wide people-picker">
    <label className="table-search"><Search size={16} /><input aria-label={t('dialogs.findPerson')} placeholder={t('dialogs.findPerson')} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <fieldset className="check-list"><legend>{legend}</legend>
      {visible.length ? visible.map((person) => <label key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} /><span>{person.fullName}<small>{[person.departmentName, person.jobTitle].filter(Boolean).join(' · ') || t('dialogs.noDepartment')}</small></span></label>) : <small>{t('dialogs.nobody')}</small>}
    </fieldset>
  </div>;
}

export function NewMessageDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (conversation: ChatConversation) => void }) {
  const { t } = useTranslation(['chat', 'common']);
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
    } catch (reason) { setError(chatErrorMessage(reason, t('dialogs.createFailed'))); } finally { setSaving(false); }
  };
  return <Dialog open title={t('dialogs.newTitle')} description={t('dialogs.newDescription')} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
    <Button type="submit" form="new-message-form" disabled={saving || !selected.length}>{group ? t('dialogs.createGroup') : t('dialogs.write')}</Button>
  </>}>
    <form id="new-message-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <PeoplePicker people={people} selected={selected} onChange={setSelected} exclude={[session!.user.id]} legend={t('dialogs.to')} />
      {group && <Field label={t('dialogs.groupName')} className="field--wide" hint={t('common:optional')}><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t('dialogs.groupPlaceholder')} /></Field>}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function ChannelFormDialog({ channel, onClose, onSaved }: { channel?: Pick<ChatConversation, 'id' | 'name' | 'description' | 'visibility' | 'isDefault' | 'icon'>; onClose: () => void; onSaved: (id: string) => void }) {
  const { t } = useTranslation(['chat', 'common']);
  const { session } = useAuth();
  const { backend, people, refresh } = useChat();
  const [name, setName] = useState(channel?.name ?? '');
  const [description, setDescription] = useState(channel?.description ?? '');
  const [visibility, setVisibility] = useState<ChatVisibility>(channel?.visibility ?? 'PUBLIC');
  const [icon, setIcon] = useState<string | null>(channel?.icon ?? null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError('');
    try {
      if (channel) {
        await backend.updateChannel(channel.id, channel.isDefault ? { description: description.trim() || null, icon } : { name: name.trim(), description: description.trim() || null, visibility, icon });
        await refresh(); onSaved(channel.id);
      } else {
        const created = await backend.createChannel({ name: name.trim(), description: description.trim() || null, visibility, memberIds });
        await refresh(); onSaved(created.id);
      }
    } catch (reason) { setError(chatErrorMessage(reason, t('dialogs.channelFailed'))); } finally { setSaving(false); }
  };
  return <Dialog open title={channel ? t('dialogs.channelTitle') : t('dialogs.newChannel')} description={channel ? undefined : t('dialogs.newChannelDescription')} size={channel ? 'md' : 'lg'} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
    <Button type="submit" form="channel-form" disabled={saving || !name.trim()}>{channel ? t('common:actions.save') : t('dialogs.createChannel')}</Button>
  </>}>
    <form id="channel-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label={t('dialogs.name')}><input value={name} maxLength={80} required disabled={channel?.isDefault} autoFocus onChange={(event) => setName(event.target.value)} placeholder={t('dialogs.channelPlaceholder')} /></Field>
      <SelectField label={t('dialogs.access')} value={visibility} disabled={channel?.isDefault} onChange={(event) => setVisibility(event.target.value as ChatVisibility)}><option value="PUBLIC">{t('dialogs.public')}</option><option value="PRIVATE">{t('dialogs.private')}</option></SelectField>
      {channel && <div className="field field--wide channel-icon-field"><span>{t('dialogs.icon')}</span><div><ChannelIconPicker value={icon} visibility={visibility} onChange={setIcon} /><small>{icon ? t('dialogs.iconChange') : t('dialogs.iconChoose')}</small></div></div>}
      <Field label={t('dialogs.description')} className="field--wide"><textarea rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('dialogs.descriptionPlaceholder')} /></Field>
      {!channel && <PeoplePicker people={people} selected={memberIds} onChange={setMemberIds} exclude={[session!.user.id]} legend={t('dialogs.members')} />}
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function BrowseChannelsDialog({ onClose, onOpen, onCreate }: { onClose: () => void; onOpen: (channel: ChatChannel) => void; onCreate: () => void }) {
  const { t } = useTranslation(['chat', 'common']);
  const { session } = useAuth();
  const { backend } = useChat();
  const [archived, setArchived] = useState(false);
  const [channels, setChannels] = useState<ChatChannel[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setChannels(null);
    backend.channels(archived).then((items) => { if (active) setChannels(items); }).catch((reason) => { if (active) { setChannels([]); setError(chatErrorMessage(reason, t('dialogs.channelsFailed'))); } });
    return () => { active = false; };
  }, [backend, archived, t]);
  return <Dialog open title={t('dialogs.channels')} description={t('dialogs.channelsDescription')} onClose={onClose} footer={<>
    <label className="dialog-footer__start inline-check"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />{t('dialogs.showArchived')}</label>
    <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
    {canCreateChannels(session!.user.role) && <Button onClick={onCreate}>{t('dialogs.createChannel')}</Button>}
  </>}>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="dialog-rows">
      {channels?.map((channel) => <button key={channel.id} type="button" className="dialog-row" onClick={() => onOpen(channel)}>
        <ChannelIconTile icon={channel.icon} visibility={channel.visibility} />
        <span><strong>{channel.name}</strong><small>{channel.description || (channel.visibility === 'PRIVATE' ? t('view.private') : t('view.public'))} · {t('count.members', { count: channel.memberCount })}</small></span>
        {channel.archivedAt ? <Badge>{t('dialogs.archived')}</Badge> : channel.isMember ? <Badge tone="success">{t('dialogs.youMember')}</Badge> : !channel.canRead ? <Badge tone="warning">{t('dialogs.manageOnly')}</Badge> : null}
      </button>)}
      {channels && !channels.length && !error && <EmptyState title={t('dialogs.noChannelsTitle')} description={t('dialogs.noChannelsText')} icon={Hash} />}
    </div>
  </Dialog>;
}

/** Channel or group settings: details, members and admins, leaving and archiving. */
export function ConversationSettingsDialog({ conversation, onClose, onLeft }: { conversation: ChatConversation; onClose: () => void; onLeft: () => void }) {
  const { t } = useTranslation(['chat', 'common']);
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
    backend.members(conversation.id).then((items) => { if (active) setMembers(items); }).catch((reason) => { if (active) setError(chatErrorMessage(reason, t('dialogs.membersFailed'))); });
    return () => { active = false; };
  }, [backend, conversation.id, version, t]);
  const run = async (action: () => Promise<void>, fallback: string) => {
    setError('');
    try { await action(); setVersion((value) => value + 1); await refresh(); } catch (reason) { setError(chatErrorMessage(reason, fallback)); }
  };
  const title = conversationTitle(conversation, me.id);

  if (mode === 'edit') return <ChannelFormDialog channel={conversation} onClose={() => setMode('main')} onSaved={() => { setMode('main'); onClose(); }} />;
  if (mode === 'rename') return <RenameGroupDialog conversation={conversation} onClose={() => setMode('main')} />;
  if (mode === 'add') return <AddMembersDialog conversation={conversation} existing={members?.map((member) => member.id) ?? []} onClose={() => { setMode('main'); setVersion((value) => value + 1); }} />;
  if (mode === 'leave') return <ConfirmDialog title={isChannel ? t('dialogs.leaveChannelTitle', { title }) : t('dialogs.leaveGroupTitle')} description={isChannel && conversation.visibility === 'PRIVATE' ? t('dialogs.leavePrivate') : t('dialogs.leaveOther')} confirm={t('dialogs.leave')} onClose={() => setMode('main')} onConfirm={async () => { await backend.removeMember(conversation.id, me.id); await refresh(); onLeft(); }} />;
  if (mode === 'archive') return <ConfirmDialog title={t('dialogs.archiveTitle', { title })} description={t('dialogs.archiveText')} confirm={t('dialogs.archive')} onClose={() => setMode('main')} onConfirm={async () => { await backend.archive(conversation.id, true); await refresh(); onLeft(); }} />;

  const admins = members?.filter((member) => member.role === 'ADMIN').length ?? 0;
  const canLeave = conversation.isMember && conversation.kind !== 'DM' && !conversation.isDefault;
  return <Dialog open size="lg" title={isChannel ? t('dialogs.channelNamed', { title }) : title} description={isChannel ? t('dialogs.channelSettings') : t('dialogs.groupConversation')} onClose={onClose} footer={<>
    {canLeave && <Button variant="ghost" icon={LogOut} className="dialog-footer__start" onClick={() => setMode('leave')}>{isChannel ? t('dialogs.leaveChannel') : t('dialogs.leaveGroup')}</Button>}
    {isChannel && canManage && !conversation.isDefault && (conversation.archivedAt
      ? <Button variant="secondary" icon={ArchiveRestore} onClick={() => void run(() => backend.archive(conversation.id, false), t('dialogs.unarchiveFailed'))}>{t('dialogs.unarchive')}</Button>
      : <Button variant="secondary" icon={Archive} onClick={() => setMode('archive')}>{t('dialogs.archive')}</Button>)}
    {!isChannel && <Button variant="secondary" onClick={() => setMode('rename')}>{t('dialogs.rename')}</Button>}
    <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
  </>}>
    {error && <div className="form-error" role="alert">{error}</div>}
    {isChannel && <>
      <div className="section-header dialog-section"><div className="section-title"><h2>{t('dialogs.about')}</h2></div>
        {canManage && !conversation.archivedAt && <Button variant="secondary" onClick={() => setMode('edit')}>{t('dialogs.edit')}</Button>}
      </div>
      <dl className="dialog-facts"><div><dt>{t('dialogs.name')}</dt><dd>{title}</dd></div><div><dt>{t('dialogs.access')}</dt><dd>{conversation.visibility === 'PRIVATE' ? t('dialogs.accessPrivate') : t('dialogs.accessPublic')}</dd></div><div><dt>{t('dialogs.description')}</dt><dd>{conversation.description || '—'}</dd></div></dl>
    </>}
    {isChannel && canManage && !conversation.isMember && <p className="dialog-text">{t('dialogs.manageNotMember')}</p>}
    <div className="section-header dialog-section"><div className="section-title"><h2>{t('dialogs.members')}</h2>{members && <Badge>{members.length}</Badge>}</div>
      {((isChannel && canManage && !conversation.isDefault) || (!isChannel && conversation.isMember)) && !conversation.archivedAt && <Button variant="secondary" icon={UserPlus} onClick={() => setMode('add')}>{t('dialogs.add')}</Button>}
    </div>
    <div className="dialog-rows">{members?.map((member) => <div key={member.id} className="dialog-row">
      <Avatar name={member.fullName} size="sm" />
      <span><strong>{member.fullName}{member.id === me.id ? t('dialogs.you') : ''}</strong><small>{[member.departmentName, member.jobTitle].filter(Boolean).join(' · ') || t('dialogs.noDepartment')}</small></span>
      {isChannel && member.role === 'ADMIN' && <Badge tone="info">{t('dialogs.admin')}</Badge>}
      {isChannel && canManage && !conversation.isDefault && <>
        {member.role === 'ADMIN'
          ? <IconButton label={t('dialogs.revokeAdmin', { name: member.fullName })} icon={ShieldOff} disabled={admins <= 1} onClick={() => void run(() => backend.setRole(conversation.id, member.id, 'MEMBER'), t('dialogs.rightsFailed'))} />
          : <IconButton label={t('dialogs.makeAdmin', { name: member.fullName })} icon={Shield} onClick={() => void run(() => backend.setRole(conversation.id, member.id, 'ADMIN'), t('dialogs.rightsFailed'))} />}
        {member.id !== me.id && <IconButton label={t('dialogs.removeMember', { name: member.fullName })} icon={UserMinus} disabled={member.role === 'ADMIN' && admins <= 1} onClick={() => void run(() => backend.removeMember(conversation.id, member.id), t('dialogs.removeFailed'))} />}
      </>}
    </div>)}</div>
  </Dialog>;
}

function RenameGroupDialog({ conversation, onClose }: { conversation: ChatConversation; onClose: () => void }) {
  const { t } = useTranslation(['chat', 'common']);
  const { backend, refresh } = useChat();
  const [name, setName] = useState(conversation.name ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await backend.renameGroup(conversation.id, name.trim() || null); await refresh(); onClose(); } catch (reason) { setError(chatErrorMessage(reason, t('dialogs.renameFailed'))); } finally { setSaving(false); }
  };
  return <Dialog open title={t('dialogs.groupNameTitle')} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="rename-group-form" disabled={saving}>{t('common:actions.save')}</Button></>}>
    <form id="rename-group-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label={t('dialogs.name')} className="field--wide" hint={t('dialogs.groupNameHint')}><input value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

function AddMembersDialog({ conversation, existing, onClose }: { conversation: ChatConversation; existing: string[]; onClose: () => void }) {
  const { t } = useTranslation(['chat', 'common']);
  const { backend, people, refresh } = useChat();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await backend.addMembers(conversation.id, selected); await refresh(); onClose(); } catch (reason) { setError(chatErrorMessage(reason, t('dialogs.addFailed'))); } finally { setSaving(false); }
  };
  return <Dialog open title={t('dialogs.addMembers')} description={conversation.kind === 'GROUP' ? t('dialogs.addMembersHint') : undefined} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="add-members-form" disabled={saving || !selected.length}>{t('dialogs.add')}</Button></>}>
    <form id="add-members-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <PeoplePicker people={people} selected={selected} onChange={setSelected} exclude={existing} legend={t('dialogs.people')} />
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function EditMessageDialog({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const { t } = useTranslation(['chat', 'common']);
  const { backend, notify } = useChat();
  const [body, setBody] = useState(message.body ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { const updated = await backend.edit(message.id, body.trim()); notify({ type: 'message-updated', conversationId: updated.conversationId, message: updated }); onClose(); } catch (reason) { setError(chatErrorMessage(reason, t('dialogs.editFailed'))); } finally { setSaving(false); }
  };
  const { people } = useChat();
  return <Dialog open title={t('dialogs.editTitle')} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="edit-message-form" disabled={saving || !body.trim() || !fitsLimit(body.trim(), CHAT_MESSAGE_LIMIT)}>{t('common:actions.save')}</Button></>}>
    <form id="edit-message-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <div className="field--wide"><RichTextEditor value={body} onChange={setBody} maxLength={CHAT_MESSAGE_LIMIT} label={t('dialogs.messageText')} people={people} autoFocus minRows={4} /></div>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function ConfirmDialog({ title, description, confirm, onClose, onConfirm }: { title: string; description: string; confirm: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const { t } = useTranslation(['chat', 'common']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setSaving(true); setError('');
    try { await onConfirm(); } catch (reason) { setError(chatErrorMessage(reason, t('dialogs.actionFailed'))); setSaving(false); }
  };
  return <Dialog open size="sm" title={title} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button variant="danger" disabled={saving} onClick={() => void go()}>{confirm}</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : <p className="dialog-text">{description}</p>}
  </Dialog>;
}

export const usePeopleByUsername = (people: ChatPerson[]) => useMemo(() => new Map(people.map((person) => [person.username.toLowerCase(), person])), [people]);
