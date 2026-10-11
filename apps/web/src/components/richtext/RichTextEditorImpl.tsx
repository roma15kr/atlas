import { Markdown } from '@tiptap/markdown';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Code, Heading2, Italic, Link2, List, ListChecks, ListOrdered, Quote, Strikethrough, Table2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { mentionQuery, type ChatPerson } from '../../lib/chat';
import { Avatar } from '../ui';
import type { RichTextEditorProps } from './RichTextEditor';

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

/** Text of the current block up to the cursor, for `@` suggestions. */
function textBeforeCursor(editor: Editor): string {
  const { $from } = editor.state.selection;
  return $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
}

/** Lists, code blocks and tables keep Enter for a new line or item instead of sending. */
const insideStructure = (editor: Editor) => ['bulletList', 'orderedList', 'taskList', 'codeBlock', 'table'].some((name) => editor.isActive(name));

export default function RichTextEditorImpl({ value, onChange, maxLength, label, placeholder, people, onSubmit, autoFocus, disabled, minRows = 3 }: RichTextEditorProps) {
  // Values this editor emitted that the parent may still pass back (possibly an older one while typing fast).
  const pending = useRef<string[]>([value]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [mention, setMention] = useState<{ query: string; highlight: number; dismissed: boolean } | null>(null);
  const live = useRef({ onSubmit, onChange, people, mention, setLinkOpen });
  live.current = { onSubmit, onChange, people, mention, setLinkOpen };

  const suggestions = useMemo(() => {
    if (!mention || mention.dismissed || !people) return [];
    const needle = mention.query;
    return people.filter((person) => person.username.toLowerCase().startsWith(needle) || person.fullName.toLowerCase().split(' ').some((word) => word.startsWith(needle))).slice(0, 6);
  }, [mention, people]);
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;

  const editor = useEditor({
    immediatelyRender: true,
    editable: !disabled,
    autofocus: autoFocus ? 'end' : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        underline: false,
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], defaultProtocol: 'https', isAllowedUri: (url) => SAFE_LINK.test(url) }
      }),
      TaskList, TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Markdown
    ],
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: { 'aria-label': label, 'aria-multiline': 'true', role: 'textbox', class: 'rich-editor__content', style: `min-height: ${minRows * 1.5}em` },
      handleKeyDown: (_view, event) => {
        const { onSubmit: submit, setLinkOpen: openLink } = live.current;
        const list = suggestionsRef.current;
        if (list.length) {
          const current = live.current.mention!;
          if (event.key === 'ArrowDown') { setMention({ ...current, highlight: (current.highlight + 1) % list.length }); return true; }
          if (event.key === 'ArrowUp') { setMention({ ...current, highlight: (current.highlight - 1 + list.length) % list.length }); return true; }
          if (event.key === 'Enter' || event.key === 'Tab') { insertMention(list[current.highlight] ?? list[0]!); return true; }
          if (event.key === 'Escape') { setMention({ ...current, dismissed: true }); return true; }
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { openLink(true); return true; }
        if (event.key === 'Enter' && submit && ((event.ctrlKey || event.metaKey) || (!event.shiftKey && editorRef.current && !insideStructure(editorRef.current)))) {
          const current = editorRef.current!;
          submit(current.isEmpty ? '' : current.getMarkdown().replace(/\s+$/, ''));
          return true;
        }
        return false;
      }
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.isEmpty ? '' : current.getMarkdown().replace(/\s+$/, '');
      pending.current = [...pending.current.slice(-30), markdown];
      live.current.onChange(markdown);
    },
    onSelectionUpdate: ({ editor: current }) => updateMention(current),
    onTransaction: ({ editor: current }) => updateMention(current)
  }, []); // Created once; editable state and outside content changes are synced below.
  const editorRef = useRef<Editor | null>(editor);
  editorRef.current = editor;

  function updateMention(current: Editor) {
    if (!live.current.people) return;
    // Code never mentions anyone, so it gets no suggestions either.
    if (current.isActive('code') || current.isActive('codeBlock')) { setMention(null); return; }
    const before = textBeforeCursor(current);
    const found = mentionQuery(before, before.length);
    setMention((previous) => found ? { query: found.query, highlight: previous?.query === found.query ? previous.highlight : 0, dismissed: previous?.query === found.query ? previous.dismissed : false } : null);
  }

  function insertMention(person: ChatPerson) {
    const current = editorRef.current;
    const query = live.current.mention;
    if (!current || !query) return;
    const to = current.state.selection.from;
    current.chain().focus().deleteRange({ from: to - query.query.length - 1, to }).insertContent(`@${person.username} `).run();
    setMention(null);
  }

  // Outside changes (a sent message clears the composer) replace the content.
  useEffect(() => {
    if (!editor) return;
    const seen = pending.current.lastIndexOf(value);
    if (seen >= 0) { pending.current = pending.current.slice(seen); return; }
    pending.current = [value];
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'), italic: current.isActive('italic'), strike: current.isActive('strike'), heading: current.isActive('heading'),
      bullet: current.isActive('bulletList'), ordered: current.isActive('orderedList'), task: current.isActive('taskList'),
      quote: current.isActive('blockquote'), code: current.isActive('code') || current.isActive('codeBlock'), link: current.isActive('link'), table: current.isActive('table')
    })
  });

  const length = value.length;
  const over = length - maxLength;
  const tools: Array<{ label: string; icon: typeof Bold; active: boolean; run: () => void }> = [
    { label: 'Жирный', icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Курсив', icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Зачёркнутый', icon: Strikethrough, active: state.strike, run: () => editor.chain().focus().toggleStrike().run() },
    { label: 'Заголовок', icon: Heading2, active: state.heading, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Маркированный список', icon: List, active: state.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: 'Нумерованный список', icon: ListOrdered, active: state.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: 'Чек-лист', icon: ListChecks, active: state.task, run: () => editor.chain().focus().toggleTaskList().run() },
    { label: 'Цитата', icon: Quote, active: state.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: 'Код', icon: Code, active: state.code, run: () => editor.chain().focus().toggleCode().run() },
    { label: 'Ссылка', icon: Link2, active: state.link, run: () => setLinkOpen(true) },
    { label: 'Таблица', icon: Table2, active: state.table, run: () => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run() }
  ];

  return <div className={`rich-editor${over > 0 ? ' is-invalid' : ''}${disabled ? ' is-disabled' : ''}`}>
    <div className="rich-editor__toolbar" role="toolbar" aria-label={`Форматирование: ${label}`}>
      {tools.map((tool) => <button key={tool.label} type="button" className="rich-editor__tool" aria-label={tool.label} title={tool.label} aria-pressed={tool.active} disabled={disabled}
        onMouseDown={(event) => event.preventDefault()} onClick={tool.run}><tool.icon size={15} /></button>)}
    </div>
    {linkOpen && <LinkForm initial={editor.getAttributes('link').href as string | undefined} onClose={() => { setLinkOpen(false); editor.commands.focus(); }}
      onApply={(href) => { if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run(); else editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkOpen(false); }} />}
    {suggestions.length > 0 && <ul className="mention-suggestions" role="listbox" aria-label="Упомянуть">{suggestions.map((person, index) => <li key={person.id} role="option" aria-selected={index === (mention?.highlight ?? 0)}>
      <button type="button" onMouseDown={(event) => { event.preventDefault(); insertMention(person); }}><Avatar name={person.fullName} size="sm" /><span><strong>{person.fullName}</strong><small>@{person.username}{person.departmentName ? ` · ${person.departmentName}` : ''}</small></span></button>
    </li>)}</ul>}
    <EditorContent editor={editor} />
    {(over > 0 || length > maxLength * 0.8) && <div className={`rich-editor__counter${over > 0 ? ' is-over' : ''}`} role={over > 0 ? 'alert' : undefined}>
      {over > 0 ? `Текст длиннее допустимого на ${over} ${over === 1 ? 'символ' : 'символов'}` : `${length} / ${maxLength}`}
    </div>}
  </div>;
}

function LinkForm({ initial, onApply, onClose }: { initial?: string; onApply: (href: string) => void; onClose: () => void }) {
  const [href, setHref] = useState(initial ?? 'https://');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = href.trim();
    if (value && value !== 'https://' && !SAFE_LINK.test(value)) { setError('Ссылка должна начинаться с https://, http:// или mailto:'); return; }
    onApply(value === 'https://' ? '' : value);
  };
  return <form className="rich-editor__link" onSubmit={submit}>
    <input aria-label="Адрес ссылки" value={href} autoFocus onChange={(event) => { setHref(event.target.value); setError(''); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }} />
    <button type="submit" className="text-button">Применить</button>
    <button type="button" className="text-button" onClick={onClose}>Отмена</button>
    {error && <small role="alert">{error}</small>}
  </form>;
}
