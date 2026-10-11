import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatPerson } from '../../lib/chat';
import { RichTextView } from './RichTextView';

const people = new Map<string, ChatPerson>([['semenets', { id: 'u9', username: 'semenets', fullName: 'Семенець Максим', jobTitle: null, departmentName: 'Отдел DIY' }]]);

afterEach(cleanup);

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
});
