import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RichTextEditor } from './RichTextEditor';

afterEach(cleanup);

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
});
