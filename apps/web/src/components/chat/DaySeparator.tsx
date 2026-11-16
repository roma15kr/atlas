/** The day above its first message in a conversation feed; it stays pinned at the top while that day scrolls past. */
export function DaySeparator({ label }: { label: string }) {
  return <div className="day-separator" role="separator" aria-label={label}><span>{label}</span></div>;
}
