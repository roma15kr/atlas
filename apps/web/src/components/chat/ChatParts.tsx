import { ReactionBar } from '../reactions/ReactionBar';
import { ReactionPicker } from '../reactions/ReactionPicker';
import { Hash, Lock, MessageSquareReply, Pencil, Send, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { conversationTitle, type ChatConversation, type ChatMessage, type ChatPerson } from '../../lib/chat';
import { formatDateTime, plural } from '../../lib/format';
import { fitsLimit, RichTextEditor } from '../richtext/RichTextEditor';
import { RichTextView } from '../richtext/RichTextView';
import { Avatar, IconButton } from '../ui';

/** Characters of Markdown in one chat message (the API limit). */
export const CHAT_MESSAGE_LIMIT = 4000;

const REPLIES: [string, string, string] = ['ответ', 'ответа', 'ответов'];
const time = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function ConversationIcon({ conversation, myId }: { conversation: ChatConversation; myId: string }) {
  if (conversation.kind === 'DM') return <Avatar name={conversationTitle(conversation, myId)} size="sm" />;
  const Icon = conversation.kind === 'GROUP' ? Users : conversation.visibility === 'PRIVATE' ? Lock : Hash;
  return <span className="chat-icon"><Icon size={15} aria-hidden="true" /></span>;
}

/** Message text as plain text, links and named mentions; nothing from the message is rendered as HTML. */
export function MessageText({ body, people, myUsername }: { body: string; people: Map<string, ChatPerson>; myUsername: string }) {
  return <RichTextView markdown={body} people={people} myUsername={myUsername} />;
}

export function MessageItem({ message, people, me, canModerate, onReply, onEdit, onDelete, onOpenThread, onReact }: {
  message: ChatMessage; people: Map<string, ChatPerson>; me: { id: string; username: string }; canModerate: boolean;
  onReply?: () => void; onEdit: () => void; onDelete: () => void; onOpenThread?: () => void;
  /** Present when the viewer may react (a member of an active conversation). */
  onReact?: (emoji: string, add: boolean) => void;
}) {
  const own = message.author.id === me.id;
  const deleted = Boolean(message.deletedAt);
  return <article className={`chat-message ${message.mentionedUserIds.includes(me.id) ? 'chat-message--mentioned' : ''}`} aria-label={`Сообщение ${message.author.fullName}`}>
    <Avatar name={message.author.fullName} src={message.author.avatarUrl ?? undefined} size="sm" />
    <div className="chat-message__main">
      <header><strong>{message.author.fullName}{!message.author.active && <small> · деактивирован</small>}</strong><time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>{time(message.createdAt)}</time>{message.editedAt && !deleted && <small>изменено</small>}</header>
      <div className={`chat-message__text${deleted ? ' chat-message__deleted' : ''}`}>{deleted ? 'Сообщение удалено' : <MessageText body={message.body ?? ''} people={people} myUsername={me.username} />}</div>
      {!deleted && <ReactionBar reactions={message.reactions} meId={me.id} onToggle={onReact} />}
      {onOpenThread && message.replyCount > 0 && <button type="button" className="text-button chat-message__thread" onClick={onOpenThread}><MessageSquareReply size={13} />{plural(message.replyCount, REPLIES)}{message.lastReplyAt && <span> · {time(message.lastReplyAt)}</span>}</button>}
    </div>
    {!deleted && (onReply || own || canModerate || onReact) && <div className="chat-message__actions">
      {onReact && <ReactionPicker onPick={(emoji) => onReact(emoji, !message.reactions?.some((reaction) => reaction.emoji === emoji && reaction.users.some((user) => user.id === me.id)))} />}
      {onReply && <IconButton label="Ответить в обсуждении" icon={MessageSquareReply} onClick={onReply} />}
      {own && <IconButton label="Изменить сообщение" icon={Pencil} onClick={onEdit} />}
      {(own || canModerate) && <IconButton label="Удалить сообщение" icon={Trash2} onClick={onDelete} />}
    </div>}
  </article>;
}

/** Text input with Enter to send, Shift+Enter for a new line, and `@` autocomplete from `people`. */
export function Composer({ people, placeholder, onSend, disabled, label = 'Сообщение', autoFocus }: {
  people: ChatPerson[]; placeholder: string; onSend: (body: string) => Promise<void>; disabled?: boolean; label?: string; autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const send = async (markdown = text) => {
    const body = markdown.trim();
    if (!body || sending || disabled || !fitsLimit(body, CHAT_MESSAGE_LIMIT)) return;
    setSending(true);
    try { await onSend(body); setText(''); } finally { setSending(false); }
  };
  return <div className="chat-composer">
    <RichTextEditor value={text} onChange={setText} maxLength={CHAT_MESSAGE_LIMIT} label={label} placeholder={placeholder} people={people}
      onSubmit={(markdown) => void send(markdown)} autoFocus={autoFocus} disabled={disabled} minRows={1} />
    <IconButton label="Отправить" icon={Send} className="chat-composer__send" disabled={disabled || sending || !text.trim() || !fitsLimit(text.trim(), CHAT_MESSAGE_LIMIT)} onClick={() => void send()} />
  </div>;
}
