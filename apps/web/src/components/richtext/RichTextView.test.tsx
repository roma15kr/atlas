import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatPerson } from '../../lib/chat';
import { demoSessions } from '../../data/demo';
import { sessionStore } from '../../lib/api';
import { uploadImage } from '../../lib/images';
import { RichTextView } from './RichTextView';

const people = new Map<string, ChatPerson>([['semenets', { id: 'u9', username: 'semenets', fullName: 'Семенець Максим', jobTitle: null, departmentName: 'Отдел DIY' }]]);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('RichTextView', () => {
  it('wraps mentions outside code only', () => {
    const { container } = render(<RichTextView markdown={'- согласовать @semenets\n\n`@semenets` и @channel'} people={people} myUsername="director" />);
    expect(screen.getByText('@Семенець Максим')).toHaveClass('mention');
    expect(screen.getByText('@канал')).toHaveClass('mention--all');
    expect(container.querySelector('code')).toHaveTextContent('@semenets');
    expect(container.querySelectorAll('.mention')).toHaveLength(2);
  });

  it('ticking a box calls onChange with the toggled markdown', async () => {
    const onChange = vi.fn(() => Promise.resolve());
    render(<RichTextView markdown={'- [ ] отправить КП\n- [x] собрать остатки'} onChange={onChange} />);
    const [first] = screen.getAllByRole('checkbox');
    expect(first).toBeEnabled();
    await userEvent.setup().click(first!);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('- [x] отправить КП\n- [x] собрать остатки'));
  });

  it('checkboxes are disabled without onChange', () => {
    render(<RichTextView markdown={'- [x] готово\n- [ ] нет'} />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    boxes.forEach((box) => expect(box).toBeDisabled());
    expect(boxes[0]).toBeChecked();
  });

  it('shows tables and links, and raw HTML as text', () => {
    const { container } = render(<RichTextView markdown={'| a | b |\n|---|---|\n| 1 | 2 |\n\n[сайт](https://rdim.ua) <b onclick="x()">жирный</b>'} />);
    expect(container.querySelector('table td')).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: 'сайт' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.querySelector('b, [onclick]')).toBeNull();
    expect(container).toHaveTextContent('<b onclick="x()">жирный</b>');
  });

  it('shows Atlas images through AuthImage and other images as text', async () => {
    sessionStore.set(demoSessions.employee!);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:price' }));
    const url = await uploadImage(new File([new Uint8Array([0x89, 0x50])], 'price.png', { type: 'image/png' }));
    const { container } = render(<RichTextView markdown={`![прайс](${url})\n\n![чужое](https://evil.example/x.png)`} />);
    expect(await screen.findByRole('img', { name: 'прайс' })).toHaveAttribute('src', 'blob:price');
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container).toHaveTextContent('чужое');
  });
});
