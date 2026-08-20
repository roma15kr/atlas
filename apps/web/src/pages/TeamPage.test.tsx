import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUsers } from '../data/demo';
import { generateTemporaryPassword, OnboardingDialog } from './TeamPage';

afterEach(cleanup);

describe('team onboarding dialog', () => {
  it('generates a password that satisfies the server policy', () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(14);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^a-zA-Z0-9]/);
  });

  it('shows a server error and restores the submit action', async () => {
    const user = userEvent.setup();
    const createMember = vi.fn().mockRejectedValue(new Error('Этот логин уже занят'));
    render(<OnboardingDialog actor={demoUsers[1]} departments={['Продажи']} createMember={createMember} onCreated={vi.fn()} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('ФИО'), 'Ирина Ларина');
    await user.type(screen.getByLabelText('Логин'), 'i.larina');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Добавить сотрудника' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Этот логин уже занят');
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Добавить сотрудника' })).toBeEnabled();
  });
});
