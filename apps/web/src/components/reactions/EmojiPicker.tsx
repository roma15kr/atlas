import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { searchEmoji } from '../../lib/reactions';

/** Searchable emoji grid by category (Russian names and keywords). */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const found = searchEmoji(query);
    const byCategory = new Map<string, typeof found>();
    for (const item of found) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
    return [...byCategory.entries()];
  }, [query]);
  return <div className="emoji-picker">
    <label className="emoji-picker__search"><Search size={14} aria-hidden /><input autoFocus aria-label="Найти эмодзи" placeholder="Найти: огонь, спасибо, готово…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="emoji-picker__groups">
      {groups.length ? groups.map(([category, items]) => <section key={category} aria-label={category}>
        <h4>{category}</h4>
        <div className="emoji-picker__grid">{items.map((item) => <button key={item.emoji} type="button" title={item.name} aria-label={item.name} onClick={() => onPick(item.emoji)}>{item.emoji}</button>)}</div>
      </section>) : <p className="emoji-picker__empty">Ничего не нашлось</p>}
    </div>
  </div>;
}
