import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DealStage } from '../types';
import { DeleteStageDialog, StageDialog, stageColorPresets } from './FunnelSettingsPage';

afterEach(cleanup);

const stages: DealStage[] = [
  { id: 'a', funnelId: 'f', name: 'Новая', color: '#111111', sortOrder: 10, outcome: 'OPEN', dealCount: 3 },
  { id: 'b', funnelId: 'f', name: 'В работе', color: '#222222', sortOrder: 20, outcome: 'OPEN', dealCount: 0 },
  { id: 'c', funnelId: 'f', name: 'Успех', color: '#333333', sortOrder: 30, outcome: 'WON', dealCount: 1 },
];

describe('delete stage dialog', () => {
  it('requires a target stage in the same funnel when the stage holds deals', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<DeleteStageDialog stage={stages[0]!} stages={stages} onClose={vi.fn()} onDelete={onDelete} />);
    expect(screen.getByText('В этапе 3 сделки. Выберите, куда их перенести.')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Перенести и удалить' });
    expect(submit).toBeDisabled();
    const target = screen.getByLabelText('Перенести сделки в этап');
    expect(screen.queryByRole('option', { name: 'Новая' })).not.toBeInTheDocument();
    await user.selectOptions(target, 'c');
    await user.click(submit);
    expect(onDelete).toHaveBeenCalledWith('c');
  });

  it('deletes an empty stage without asking for a target', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<DeleteStageDialog stage={stages[1]!} stages={stages} onClose={vi.fn()} onDelete={onDelete} />);
    expect(screen.queryByLabelText('Перенести сделки в этап')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onDelete).toHaveBeenCalledWith(undefined);
  });
});

describe('stage dialog', () => {
  it('edits only changed fields and keeps the dialog open on a server error', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Этап с таким названием уже есть в этой воронке')).mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<StageDialog stage={stages[0]!} onClose={onClose} onSubmit={onSubmit} />);
    const save = screen.getByRole('button', { name: 'Сохранить' });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: `Цвет ${stageColorPresets[2]}` }));
    await user.selectOptions(screen.getByLabelText('Итог этапа'), 'WON');
    await user.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent('Этап с таким названием уже есть');
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSubmit).toHaveBeenLastCalledWith({ name: 'Новая', color: stageColorPresets[2], outcome: 'WON' });
    expect(onClose).toHaveBeenCalled();
  });
});
