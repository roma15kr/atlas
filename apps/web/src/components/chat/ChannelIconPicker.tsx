import { Check, Hash, Lock, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CHANNEL_ICON_COLORS, CHANNEL_ICON_GROUPS, parseChannelIcon, searchChannelIcons } from '../../lib/channelIcons';

/** A channel's tile: its library icon, white on its colour, or «#» (a lock for a private channel). */
export function ChannelIconTile({ icon, visibility }: { icon?: string | null; visibility?: string | null }) {
  const chosen = parseChannelIcon(icon);
  if (chosen) {
    const Icon = chosen.entry.Icon;
    return <span className="chat-icon chat-icon--custom" style={{ background: chosen.color.hex }} title={chosen.entry.name}><Icon size={15} aria-hidden="true" /></span>;
  }
  const Fallback = visibility === 'PRIVATE' ? Lock : Hash;
  return <span className="chat-icon"><Fallback size={15} aria-hidden="true" /></span>;
}

/**
 * The channel's tile as a button that opens the icon library, as in ClickUp: a colour row, search, icons by group and
 * «Убрать иконку». Picking an icon (or a colour for the current icon) calls `onChange` with `<icon>:<colour>`.
 */
export function ChannelIconPicker({ value, visibility, onChange, label = 'Иконка канала' }: {
  value?: string | null; visibility?: string | null; onChange: (icon: string | null) => void; label?: string;
}) {
  const current = parseChannelIcon(value);
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(current?.color.key ?? 'teal');
  const [query, setQuery] = useState('');
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (current) setColor(current.color.key); }, [current?.color.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('mousedown', outside); window.removeEventListener('keydown', escape, true); };
  }, [open]);
  const groups = useMemo(() => {
    const found = searchChannelIcons(query);
    return CHANNEL_ICON_GROUPS.map((group) => [group, found.filter((item) => item.group === group)] as const).filter(([, items]) => items.length);
  }, [query]);
  const hex = CHANNEL_ICON_COLORS.find((item) => item.key === color)?.hex;
  const pickColor = (key: string) => { setColor(key); if (current) onChange(`${current.entry.key}:${key}`); };
  const pick = (key: string) => { setOpen(false); setQuery(''); onChange(`${key}:${color}`); };

  return <span className="channel-icon-picker" ref={root}>
    <button type="button" className="channel-icon-picker__trigger" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <ChannelIconTile icon={value} visibility={visibility} />
    </button>
    {open && <div className="channel-icon-picker__panel" role="dialog" aria-label="Выбор иконки">
      <div className="channel-icon-picker__colors" role="radiogroup" aria-label="Цвет">
        {CHANNEL_ICON_COLORS.map((item) => <button key={item.key} type="button" role="radio" aria-checked={item.key === color} aria-label={item.name} title={item.name}
          style={{ background: item.hex }} onClick={() => pickColor(item.key)}>{item.key === color && <Check size={13} aria-hidden />}</button>)}
      </div>
      <label className="emoji-picker__search"><Search size={14} aria-hidden /><input autoFocus aria-label="Найти иконку" placeholder="Найти: склад, продажи, команда…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="channel-icon-picker__groups">
        {groups.length ? groups.map(([group, items]) => <section key={group} aria-label={group}>
          <h4>{group}</h4>
          <div className="channel-icon-picker__grid">{items.map(({ key, name, Icon }) => {
            const selected = current?.entry.key === key;
            return <button key={key} type="button" title={name} aria-label={name} aria-pressed={selected} style={selected ? { background: hex, color: '#fff' } : undefined} onClick={() => pick(key)}><Icon size={18} aria-hidden /></button>;
          })}</div>
        </section>) : <p className="emoji-picker__empty">Ничего не нашлось</p>}
      </div>
      {value && <button type="button" className="text-button channel-icon-picker__clear" onClick={() => { setOpen(false); onChange(null); }}><X size={14} aria-hidden /> Убрать иконку</button>}
    </div>}
  </span>;
}
