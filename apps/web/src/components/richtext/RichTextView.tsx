import { createElement, Fragment, useMemo, useState, type ReactNode } from 'react';
import type { ChatPerson } from '../../lib/chat';
import { renderMarkdown, toggleTask } from '../../lib/markdown';
import { AuthImage } from './AuthImage';

/** Same rule as chat mentions: `@username` not inside a word or an email address. */
const MENTION = /(^|[^\p{L}\p{N}._@-])@([a-z0-9._-]{2,50})/giu;

/** Tags the sanitizer lets through; anything else is dropped with its text kept. */
const TAGS = new Set(['p', 'br', 'strong', 'em', 'del', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr', 'input']);

interface Context { people?: Map<string, ChatPerson>; myUsername?: string; interactive: boolean; onToggle: (index: number) => void }

function mentionChip(username: string, key: number, context: Context): ReactNode {
  if (username === 'channel') return <span key={key} className="mention mention--all">@канал</span>;
  const name = context.people?.get(username)?.fullName ?? username;
  return <span key={key} className={`mention${username === context.myUsername ? ' mention--me' : ''}`}>@{name}</span>;
}

/** Plain text, with `@username` turned into chips when people are known. */
function textNodes(text: string, inCode: boolean, context: Context): ReactNode {
  if (inCode || !context.people || !text.includes('@')) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    const start = (match.index ?? 0) + match[1]!.length;
    const username = match[2]!.replace(/[.-]+$/, '').toLowerCase();
    if (start > last) parts.push(text.slice(last, start));
    parts.push(mentionChip(username, parts.length, context));
    last = start + 1 + username.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <Fragment>{parts}</Fragment>;
}

/** Builds React elements from sanitized HTML, so nothing is injected as raw markup. */
function toReact(node: Node, key: number, context: Context, inCode: boolean): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return textNodes(node.textContent ?? '', inCode, context);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const childCode = inCode || tag === 'code' || tag === 'pre' || tag === 'a';
  const children = [...element.childNodes].map((child, index) => toReact(child, index, context, childCode));
  if (!TAGS.has(tag)) return <Fragment key={key}>{children}</Fragment>;
  if (tag === 'input') {
    const index = Number(element.getAttribute('data-task-index'));
    return <input key={key} type="checkbox" checked={element.hasAttribute('checked')} disabled={!context.interactive}
      aria-label={element.hasAttribute('checked') ? 'Выполнено' : 'Не выполнено'} onChange={() => context.onToggle(index)} />;
  }
  if (tag === 'a') return <a key={key} href={element.getAttribute('href') ?? undefined} target="_blank" rel="noopener noreferrer">{children}</a>;
  if (tag === 'img') return <AuthImage key={key} src={element.getAttribute('src') ?? ''} alt={element.getAttribute('alt') ?? ''} />;
  const props: Record<string, unknown> = { key };
  if (tag === 'ol' && element.getAttribute('start')) props.start = Number(element.getAttribute('start'));
  if ((tag === 'th' || tag === 'td') && element.getAttribute('align')) props.style = { textAlign: element.getAttribute('align') };
  return tag === 'br' || tag === 'hr' ? createElement(tag, props) : createElement(tag, props, ...children);
}

/**
 * Formatted text, sanitized. With `onChange`, checklist items can be ticked in place and each tick is saved
 * through it; without, the checkboxes are read-only. `people` turns `@username` into mention chips.
 */
export function RichTextView({ markdown, people, myUsername, onChange, className }: {
  markdown: string; people?: Map<string, ChatPerson>; myUsername?: string; onChange?: (markdown: string) => Promise<void>; className?: string;
}) {
  const [saving, setSaving] = useState(false);
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);
  const content = useMemo(() => {
    const box = document.createElement('div');
    box.innerHTML = html;
    const context: Context = {
      people, myUsername, interactive: Boolean(onChange) && !saving,
      onToggle: (index) => {
        if (!onChange) return;
        setSaving(true);
        void onChange(toggleTask(markdown, index)).finally(() => setSaving(false));
      }
    };
    return [...box.childNodes].map((child, index) => toReact(child, index, context, false));
  }, [html, markdown, people, myUsername, onChange, saving]);
  return <div className={`rich-text${className ? ` ${className}` : ''}`}>{content}</div>;
}
