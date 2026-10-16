/**
 * Channel icons: keys of the web's icon library (`apps/web/src/lib/channelIcons.ts`) and its tile colours.
 * A channel stores `<icon>:<colour>`; a web unit test keeps these lists equal to the web's.
 */
export const CHANNEL_ICON_KEYS = [
  "megaphone", "briefcase", "building", "landmark", "clipboard", "list-todo", "calendar", "clock", "target", "flag",
  "rocket", "lightbulb", "file", "folder", "archive", "book", "graduation", "award", "trophy", "star",
  "cart", "bag", "store", "tag", "percent", "receipt", "wallet", "card", "banknote", "chart-bar",
  "chart-line", "chart-pie", "trending", "handshake", "badge", "truck", "package", "package-check", "warehouse", "boxes",
  "forklift", "pin", "map", "route", "factory", "wrench", "hammer", "settings", "cog", "car",
  "plane", "chat", "chats", "mail", "phone", "headphones", "send", "bell", "radio", "hash",
  "users", "users-round", "user", "contact", "heart", "smile", "coffee", "party", "gift", "cake",
  "sun", "leaf", "globe", "shield", "lock", "zap", "flame", "camera", "palette", "brush",
  "music", "code", "laptop", "monitor", "smartphone", "sparkles", "home",
] as const;

export const CHANNEL_ICON_COLORS = ["slate", "teal", "green", "lime", "amber", "orange", "red", "pink", "violet", "blue"] as const;

/** True for `<icon>:<colour>` from the lists above. */
export function isChannelIcon(value: string): boolean {
  const [icon, color, ...rest] = value.split(":");
  return !rest.length && (CHANNEL_ICON_KEYS as readonly string[]).includes(icon ?? "") && (CHANNEL_ICON_COLORS as readonly string[]).includes(color ?? "");
}
