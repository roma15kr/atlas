import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';

/** Images are shown only from Atlas's own storage. */
const ATLAS_IMAGE = /^\/api\/v1\/images\/[0-9a-f-]{36}$/i;
const SAFE_LINK = /^(https?:|mailto:)/i;

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Raw HTML is shown as text, never interpreted.
    html({ text }: Tokens.HTML | Tokens.Tag) { return escapeHtml(text); },
    link({ href, tokens }: Tokens.Link) {
      const label = this.parser.parseInline(tokens);
      return SAFE_LINK.test(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    },
    // A placeholder the sanitizer keeps; real checkboxes are built after sanitizing.
    checkbox({ checked }: Tokens.Checkbox) { return `<span data-task="${checked ? 'x' : ' '}"></span>`; },
    image({ href, text }: Tokens.Image) {
      return ATLAS_IMAGE.test(href) ? `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}">` : escapeHtml(text || href);
    }
  }
});

const purify = typeof window === 'undefined' ? null : DOMPurify(window);
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'del', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr', 'span'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'start', 'align', 'data-task'];

/** Markdown to HTML that contains only the supported formatting; task checkboxes get `data-task-index`. */
export function renderMarkdown(markdown: string): string {
  if (!purify) return escapeHtml(markdown);
  const html = marked.parse(markdown, { async: false });
  // A string result keeps every node in this document (a DOM fragment would come from DOMPurify's own document).
  const box = document.createElement('div');
  box.innerHTML = purify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP: /^(https?:|mailto:|\/api\/v1\/images\/)/i });
  box.querySelectorAll('span').forEach((span) => {
    const mark = span.getAttribute('data-task');
    if (mark === null) { span.replaceWith(...span.childNodes); return; }
    const input = document.createElement('input');
    input.type = 'checkbox';
    if (mark === 'x') input.setAttribute('checked', '');
    input.setAttribute('disabled', '');
    span.replaceWith(input);
  });
  box.querySelectorAll('input').forEach((input, index) => input.setAttribute('data-task-index', String(index)));
  box.querySelectorAll('img').forEach((img) => { if (!ATLAS_IMAGE.test(img.getAttribute('src') ?? '')) img.replaceWith(img.getAttribute('alt') ?? ''); });
  box.querySelectorAll('a').forEach((a) => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); });
  return box.innerHTML;
}

/** One line of plain text for previews: no formatting marks, images as «[изображение]». */
export function markdownToPlain(markdown: string): string {
  if (typeof document === 'undefined') return markdown.replace(/\s+/g, ' ').trim();
  const box = document.createElement('div');
  box.innerHTML = renderMarkdown(markdown);
  box.querySelectorAll('img').forEach((img) => img.replaceWith(' [изображение] '));
  box.querySelectorAll('input').forEach((input) => input.remove());
  box.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th, br, tr').forEach((node) => node.append(' '));
  return (box.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const TASK = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])(?=\s|$)/;
const FENCE = /^\s*(```|~~~)/;

/** Flips the `index`-th checklist item (counted as rendered, so items inside code fences don't count). */
export function toggleTask(markdown: string, index: number): string {
  let seen = 0;
  let fence: string | null = null;
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const opener = FENCE.exec(line)?.[1];
    if (opener) { fence = fence === null ? opener : fence === opener ? null : fence; continue; }
    if (fence) continue;
    const match = TASK.exec(line);
    if (!match) continue;
    if (seen++ === index) {
      lines[i] = line.replace(TASK, (_, before: string, mark: string, after: string) => `${before}${mark === ' ' ? 'x' : ' '}${after}`);
      return lines.join('\n');
    }
  }
  return markdown;
}
