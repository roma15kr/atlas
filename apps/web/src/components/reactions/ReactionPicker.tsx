import { Plus, SmilePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { QUICK_REACTIONS, emojiName } from '../../lib/reactions';
import { IconButton } from '../ui';
import { EmojiPicker } from './EmojiPicker';

/** «Добавить реакцию»: the quick row, and «+» for the full picker. Closes on a pick, Escape or a click outside. */
export function ReactionPicker({ onPick, label = 'Добавить реакцию' }: { onPick: (emoji: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('mousedown', outside); window.removeEventListener('keydown', escape, true); };
  }, [open]);
  const pick = (emoji: string) => { setOpen(false); setFull(false); onPick(emoji); };
  return <span className="reaction-picker" ref={root}>
    <IconButton label={label} icon={SmilePlus} aria-expanded={open} onClick={() => { setOpen((value) => !value); setFull(false); }} />
    {open && <div className="reaction-picker__panel" role="dialog" aria-label="Выбор реакции">
      <div className="reaction-picker__quick">
        {QUICK_REACTIONS.map((emoji) => <button key={emoji} type="button" aria-label={emojiName(emoji)} title={emojiName(emoji)} onClick={() => pick(emoji)}>{emoji}</button>)}
        <button type="button" aria-label="Все эмодзи" title="Все эмодзи" aria-pressed={full} onClick={() => setFull((value) => !value)}><Plus size={16} aria-hidden /></button>
      </div>
      {full && <EmojiPicker onPick={pick} />}
    </div>}
  </span>;
}
