import { lazy, Suspense } from 'react';
import type { ChatPerson } from '../../lib/chat';

export interface RichTextEditorProps {
  /** Markdown. */
  value: string;
  onChange: (markdown: string) => void;
  /** Limit for the saved Markdown; the editor shows a counter near it and a message above it. */
  maxLength: number;
  label: string;
  placeholder?: string;
  /** Turns on `@` suggestions; picked people are saved as `@username`. */
  people?: ChatPerson[];
  /** Enter (outside lists, code and tables) and Ctrl/⌘+Enter call this with the current Markdown, as in a chat composer. */
  onSubmit?: (markdown: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  minRows?: number;
  /** Receives dropped or pasted files that aren't images (images go inline); without it they get a message. */
  onFiles?: (files: File[]) => void;
}

const Impl = lazy(() => import('./RichTextEditorImpl'));

/** Text is valid to save when it fits the field's limit. */
export const fitsLimit = (markdown: string, maxLength: number) => markdown.length <= maxLength;

/** WYSIWYG editor that reads and writes Markdown. The editor code loads on first use. */
export function RichTextEditor(props: RichTextEditorProps) {
  return <Suspense fallback={<div className="rich-editor rich-editor--loading" aria-busy="true"><div className="rich-editor__content">{props.value || props.placeholder}</div></div>}>
    <Impl {...props} />
  </Suspense>;
}
