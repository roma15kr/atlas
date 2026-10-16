import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationIcon } from './chat/ChatParts';
import { Dialog, Segmented } from './ui';

describe('shared UI controls', () => {
  afterEach(cleanup);

  it('closes a dialog with Escape', () => {
    const close = vi.fn();
    render(<Dialog open title="Новая задача" onClose={close}><p>Форма</p></Dialog>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('changes a segmented mode', () => {
    const change = vi.fn();
    render(<Segmented value="all" label="Статус" options={[{ value: 'all', label: 'Все' }, { value: 'online', label: 'В сети' }]} onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'В сети' }));
    expect(change).toHaveBeenCalledWith('online');
  });
  it('puts a dialog on the page root, outside a sticky bar that would cover it on phones', () => {
    render(<header className="topbar" data-testid="bar"><Dialog open title="Сообщить о проблеме" onClose={() => undefined}><p>Форма</p></Dialog></header>);
    const dialog = screen.getByRole('dialog', { name: 'Сообщить о проблеме' });
    expect(screen.getByTestId('bar')).not.toContainElement(dialog);
    expect(dialog.closest('.dialog-backdrop')?.parentElement).toBe(document.body);
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
  });

  it('shows a colleague\'s photo for a direct conversation', () => {
    const person = (id: string, fullName: string, avatarUrl: string | null) => ({ id, fullName, username: id, active: true, avatarUrl });
    const { container } = render(<ConversationIcon myId="me" conversation={{
      id: 'c1', kind: 'DM', name: null, description: null, visibility: null, isDefault: false, archivedAt: null, myRole: 'MEMBER', muted: false,
      unread: 0, mentions: 0, memberCount: 2, participants: [person('me', 'Пономаренко Роман', null), person('semenets', 'Семенець Максим', '/api/v1/avatars/a1')],
    }} />);
    expect(screen.getByLabelText('Семенець Максим')).toHaveClass('avatar--photo');
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/v1/avatars/a1');
  });
});
