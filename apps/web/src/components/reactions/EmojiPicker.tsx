import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { searchEmoji } from '../../lib/reactions';
import { isLanguage } from '../../i18n';

/** Searchable emoji grid by category (names and keywords in the interface language). */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const { t, i18n } = useTranslation('common');
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const found = searchEmoji(query, isLanguage(i18n.language) ? i18n.language : undefined);
    const byCategory = new Map<string, typeof found>();
    for (const item of found) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
    return [...byCategory.entries()];
  }, [query, i18n.language]);
  return <div className="emoji-picker">
    <label className="emoji-picker__search"><Search size={14} aria-hidden /><input autoFocus aria-label={t('reactions.search')} placeholder={t('reactions.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="emoji-picker__groups">
      {groups.length ? groups.map(([category, items]) => <section key={category} aria-label={category}>
        <h4>{category}</h4>
        <div className="emoji-picker__grid">{items.map((item) => <button key={item.emoji} type="button" title={item.name} aria-label={item.name} onClick={() => onPick(item.emoji)}>{item.emoji}</button>)}</div>
      </section>) : <p className="emoji-picker__empty">{t('reactions.nothing')}</p>}
    </div>
  </div>;
}
