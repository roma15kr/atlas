import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, Segmented } from './ui';

describe('shared UI controls', () => {
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
});
