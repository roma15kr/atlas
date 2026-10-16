import { emojiName, hasReacted, type Reaction } from '../../lib/reactions';

/** Reaction chips: emoji and count, highlighted when mine; a click toggles mine; the title names who reacted. */
export function ReactionBar({ reactions, meId, onToggle }: { reactions?: Reaction[]; meId: string; onToggle?: (emoji: string, add: boolean) => void }) {
  if (!reactions?.length) return null;
  return <div className="reaction-bar" role="group" aria-label="Реакции">
    {reactions.map((reaction) => {
      const mine = hasReacted(reaction, meId);
      const names = reaction.users.map((user) => user.id === meId ? 'Вы' : user.fullName);
      const more = reaction.count - reaction.users.length;
      const title = `${emojiName(reaction.emoji)}: ${names.join(', ')}${more > 0 ? ` и ещё ${more}` : ''}`;
      return <button key={reaction.emoji} type="button" className={`reaction-chip${mine ? ' is-mine' : ''}`} aria-pressed={mine} title={title}
        aria-label={`${reaction.emoji} ${reaction.count}. ${title}`} disabled={!onToggle} onClick={() => onToggle?.(reaction.emoji, !mine)}>
        <span aria-hidden>{reaction.emoji}</span><b>{reaction.count}</b>
      </button>;
    })}
  </div>;
}
