import { ReactionBar } from '../reactions/ReactionBar';
import { ReactionPicker } from '../reactions/ReactionPicker';
import { Copy, Hash, Lock, MessageSquareReply, Pencil, Plus, Send, Trash2, Users } from 'lucide-react';
import { useRef, useState, type TouchEvent } from 'react';
import { conversationTitle, type ChatConversation, type ChatMessage, type ChatPerson } from '../../lib/chat';
import { formatDateTime, plural } from '../../lib/format';
import { fitsLimit, RichTextEditor } from '../richtext/RichTextEditor';
import { RichTextView } from '../richtext/RichTextView';
import { Avatar, Dialog, IconButton } from '../ui';
import { EmojiPicker } from '../reactions/EmojiPicker';
import { emojiName, QUICK_REACTIONS } from '../../lib/reactions';
import { markdownToPlain } from '../../lib/markdown';

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
  const hasActions = !deleted && Boolean(onReply || own || canModerate || onReact);
  const mine = (emoji: string) => Boolean(message.reactions?.some((reaction) => reaction.emoji === emoji && reaction.users.some((user) => user.id === me.id)));
  // Touch screens have no hover: a long press opens the message's actions in a sheet (taps on links and buttons work as usual).
  const [sheet, setSheet] = useState(false);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const pressed = useRef(false);
  const cancelPress = () => { if (press.current) window.clearTimeout(press.current.timer); press.current = null; };
  // Lifting the finger after a long press must not count as a tap on the sheet that just opened under it.
  const endPress = (event: TouchEvent<HTMLElement>) => { cancelPress(); if (pressed.current) { pressed.current = false; if (event.cancelable) event.preventDefault(); } };
  const startPress = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!hasActions || !touch || event.touches.length > 1 || (event.target as Element).closest('a, button, input, label')) return;
    cancelPress();
    press.current = { x: touch.clientX, y: touch.clientY, timer: window.setTimeout(() => { press.current = null; pressed.current = true; setSheet(true); navigator.vibrate?.(10); }, LONG_PRESS_MS) };
  };
  const movePress = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (press.current && touch && Math.hypot(touch.clientX - press.current.x, touch.clientY - press.current.y) > 10) cancelPress();
  };
  const act = (run: () => void) => () => { setSheet(false); run(); };
  return <article className={`chat-message ${message.mentionedUserIds.includes(me.id) ? 'chat-message--mentioned' : ''}${sheet ? ' is-pressed' : ''}`} aria-label={`Сообщение ${message.author.fullName}`}
    onTouchStart={startPress} onTouchMove={movePress} onTouchEnd={endPress} onTouchCancel={cancelPress}
    onContextMenu={(event) => { if (hasActions && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches) event.preventDefault(); }}>
    <Avatar name={message.author.fullName} src={message.author.avatarUrl ?? undefined} size="sm" />
    <div className="chat-message__main">
      <header><strong>{message.author.fullName}{!message.author.active && <small> · деактивирован</small>}</strong><time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>{time(message.createdAt)}</time>{message.editedAt && !deleted && <small>изменено</small>}</header>
      <div className={`chat-message__text${deleted ? ' chat-message__deleted' : ''}`}>{deleted ? 'Сообщение удалено' : <MessageText body={message.body ?? ''} people={people} myUsername={me.username} />}</div>
      {!deleted && <ReactionBar reactions={message.reactions} meId={me.id} onToggle={onReact} />}
      {onOpenThread && message.replyCount > 0 && <button type="button" className="text-button chat-message__thread" onClick={onOpenThread}><MessageSquareReply size={13} />{plural(message.replyCount, REPLIES)}{message.lastReplyAt && <span> · {time(message.lastReplyAt)}</span>}</button>}
    </div>
    {hasActions && <div className="chat-message__actions">
      {onReact && <ReactionPicker onPick={(emoji) => onReact(emoji, !mine(emoji))} />}
      {onReply && <IconButton label="Ответить в обсуждении" icon={MessageSquareReply} onClick={onReply} />}
      {own && <IconButton label="Изменить сообщение" icon={Pencil} onClick={onEdit} />}
      {(own || canModerate) && <IconButton label="Удалить сообщение" icon={Trash2} onClick={onDelete} />}
    </div>}
    {sheet && <MessageSheet onClose={() => setSheet(false)} onReact={onReact ? (emoji) => { setSheet(false); onReact(emoji, !mine(emoji)); } : undefined} mine={mine}
      onReply={onReply && act(onReply)} onCopy={act(() => void navigator.clipboard?.writeText(markdownToPlain(message.body ?? '')).catch(() => undefined))}
      onEdit={own ? act(onEdit) : undefined} onDelete={own || canModerate ? act(onDelete) : undefined} />}
  </article>;
}

/** How long a finger rests on a message before its actions open. */
export const LONG_PRESS_MS = 450;

/** A message's actions on a touch screen: reactions first, then reply, copy, edit and delete. */
function MessageSheet({ onClose, onReact, mine, onReply, onCopy, onEdit, onDelete }: {
  onClose: () => void; onReact?: (emoji: string) => void; mine: (emoji: string) => boolean;
  onReply?: () => void; onCopy: () => void; onEdit?: () => void; onDelete?: () => void;
}) {
  const [all, setAll] = useState(false);
  return <Dialog open title="Сообщение" size="sm" onClose={onClose}>
    {onReact && <div className="message-sheet__reactions" role="group" aria-label="Реакции">
      {QUICK_REACTIONS.map((emoji) => <button key={emoji} type="button" aria-label={emojiName(emoji)} aria-pressed={mine(emoji)} onClick={() => onReact(emoji)}>{emoji}</button>)}
      <button type="button" aria-label="Все эмодзи" aria-pressed={all} onClick={() => setAll((value) => !value)}><Plus size={18} aria-hidden /></button>
    </div>}
    {onReact && all && <EmojiPicker onPick={onReact} />}
    <div className="message-sheet__actions">
      {onReply && <button type="button" onClick={onReply}><MessageSquareReply size={18} aria-hidden />Ответить в обсуждении</button>}
      <button type="button" onClick={onCopy}><Copy size={18} aria-hidden />Копировать текст</button>
      {onEdit && <button type="button" onClick={onEdit}><Pencil size={18} aria-hidden />Изменить</button>}
      {onDelete && <button type="button" className="is-danger" onClick={onDelete}><Trash2 size={18} aria-hidden />Удалить</button>}
    </div>
  </Dialog>;
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
