import { useTranslation } from 'react-i18next';
import { emojiName, hasReacted, type Reaction } from '../../lib/reactions';

/** Reaction chips: emoji and count, highlighted when mine; a click toggles mine; the title names who reacted. */
export function ReactionBar({ reactions, meId, onToggle }: { reactions?: Reaction[]; meId: string; onToggle?: (emoji: string, add: boolean) => void }) {
  const { t } = useTranslation('common');
  if (!reactions?.length) return null;
  return <div className="reaction-bar" role="group" aria-label={t('reactions.label')}>
    {reactions.map((reaction) => {
      const mine = hasReacted(reaction, meId);
      const names = reaction.users.map((user) => user.id === meId ? t('reactions.you') : user.fullName);
      const more = reaction.count - reaction.users.length;
      const title = `${emojiName(reaction.emoji)}: ${names.join(', ')}${more > 0 ? t('reactions.andMore', { count: more }) : ''}`;
      return <button key={reaction.emoji} type="button" className={`reaction-chip${mine ? ' is-mine' : ''}`} aria-pressed={mine} title={title}
        aria-label={`${reaction.emoji} ${reaction.count}. ${title}`} disabled={!onToggle} onClick={() => onToggle?.(reaction.emoji, !mine)}>
        <span aria-hidden>{reaction.emoji}</span><b>{reaction.count}</b>
      </button>;
    })}
  </div>;
}
