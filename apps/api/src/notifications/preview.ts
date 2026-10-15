/** One line of plain text from formatted (Markdown) text, for notification previews: no marks, at most `limit` characters. */
export function plainPreview(markdown: string | null | undefined, limit = 120): string {
  const text = (markdown ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[изображение]")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, "")
    .replace(/\|/g, " ")
    .replace(/(\*\*|__|~~|`+|\*|_)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
