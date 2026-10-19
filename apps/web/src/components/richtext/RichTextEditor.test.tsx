import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSessions } from '../../data/demo';
import { sessionStore } from '../../lib/api';
import { RichTextEditor } from './RichTextEditor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Harness({ initial = '', maxLength = 200, onChange, onSubmit }: { initial?: string; maxLength?: number; onChange?: (md: string) => void; onSubmit?: () => void }) {
  const [value, setValue] = useState(initial);
  return <RichTextEditor value={value} maxLength={maxLength} label="Описание" onSubmit={onSubmit} onChange={(md) => { setValue(md); onChange?.(md); }} />;
}

describe('RichTextEditor', () => {
  it('shows existing Markdown formatted', async () => {
    render(<Harness initial={'**Итог**\n\n- [x] КП\n- [ ] скидка'} />);
    const box = await screen.findByRole('textbox', { name: 'Описание' });
    expect(box.querySelector('strong')).toHaveTextContent('Итог');
    expect(box.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it('Ctrl+B makes the selection bold and emits **text**', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const box = await screen.findByRole('textbox', { name: 'Описание' });
    await user.click(box);
    await user.keyboard('слово');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('слово'));
    await user.keyboard('{Control>}a{/Control}{Control>}b{/Control}');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('**слово**'));
    expect(screen.getByRole('button', { name: 'Жирный' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('formats from the toolbar', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const box = await screen.findByRole('textbox', { name: 'Описание' });
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Чек-лист' }));
    await user.keyboard('отправить КП');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('- [ ] отправить КП'));
  });

  it('removes a table with a second press instead of putting a table into its cell', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const box = await screen.findByRole('textbox', { name: 'Описание' });
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Таблица' }));
    expect(box.querySelectorAll('table')).toHaveLength(1);
    await user.keyboard('Артикул');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('| Артикул |')));

    await user.click(screen.getByRole('button', { name: 'Удалить таблицу' }));
    expect(box.querySelectorAll('table')).toHaveLength(0);
    expect(onChange.mock.lastCall?.[0] ?? '').not.toContain('|');
    expect(onChange.mock.lastCall?.[0] ?? '').not.toContain('<br>');
    expect(screen.getByRole('button', { name: 'Таблица' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows how far over the limit the text is', async () => {
    render(<Harness initial={'а'.repeat(25)} maxLength={20} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Текст длиннее допустимого на 5 символов');
  });

  it('Enter submits outside lists, Shift+Enter does not', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const box = await screen.findByRole('textbox', { name: 'Описание' });
    await user.click(box);
    await user.keyboard('привет{Shift>}{Enter}{/Shift}');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // Drop, paste and the image button share one upload path; jsdom can't position a drop, so the button is used here.
  it('refuses a PDF with a message and inserts nothing', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await screen.findByRole('textbox', { name: 'Описание' });
    const pdf = new File(['%PDF-1.7'], 'price.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Изображение: Описание'), { target: { files: [pdf] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Можно добавить только изображение PNG, JPEG, GIF или WebP до 5 МБ');
    expect(onChange.mock.calls.every(([markdown]) => markdown === '')).toBe(true);
  });

  it('uploads a pasted screenshot and inserts it as an Atlas image', async () => {
    sessionStore.set(demoSessions.employee!);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:screenshot' }));
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const box = await screen.findByRole('textbox', { name: 'Описание' });
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'screen.png', { type: 'image/png' });
    fireEvent.paste(box, { clipboardData: { files: [png], types: ['Files'], getData: () => '' } });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^!\[screen\]\(\/api\/v1\/images\/[0-9a-f-]{36}\)$/)));
    expect(await screen.findByRole('img', { name: 'screen' })).toHaveAttribute('src', 'blob:screenshot');
  });
});
