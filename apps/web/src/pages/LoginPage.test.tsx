import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AppContext';
import { LoginPage } from './LoginPage';

const answer = (status: number, code: string, headers: Record<string, string> = {}) => vi.fn(async () => new Response(
  JSON.stringify({ error: { code, message: 'server text' } }), { status, headers: { 'Content-Type': 'application/json', ...headers } }));

const renderLogin = () => render(<MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>);
const signIn = async (username: string, password = 'Some-Password-1') => {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/^Логин/));
  await user.type(screen.getByLabelText(/^Логин/), username);
  await user.clear(screen.getByLabelText(/^Пароль/));
  await user.type(screen.getByLabelText(/^Пароль/), password);
  await user.click(screen.getByRole('button', { name: /Войти/ }));
  return user;
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe('login screen', () => {
  it('explains a wrong login or password in Russian, with the lockout rule', async () => {
    vi.stubGlobal('fetch', answer(401, 'INVALID_CREDENTIALS'));
    renderLogin();
    await signIn('kovalchuk');
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный логин или пароль. После 5 неудачных попыток вход блокируется на 15 минут.');
  });

  it('says in how many minutes to retry after too many attempts', async () => {
    vi.stubGlobal('fetch', answer(429, 'LOGIN_RATE_LIMITED', { RateLimit: 'limit=12, remaining=0, reset=400' }));
    renderLogin();
    await signIn('kovalchuk');
    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много попыток входа. Повторите через 7 мин.');
  });

  it('asks for the login instead of a phone number or an email', async () => {
    renderLogin();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/^Логин/));
    await user.type(screen.getByLabelText(/^Логин/), '+38 (067) 445-38-58');
    expect(screen.getByText(/Входите по логину .* а не по телефону или email/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Логин/));
    await user.type(screen.getByLabelText(/^Логин/), 'n.denysiuk@rdim.ua');
    expect(screen.getByText(/а не по телефону или email/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Логин/));
    await user.type(screen.getByLabelText(/^Логин/), 'denysiuk');
    expect(screen.queryByText(/а не по телефону или email/)).not.toBeInTheDocument();
  });

  it('asks to switch the layout when the login is typed in Cyrillic', async () => {
    renderLogin();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/^Логин/));
    await user.type(screen.getByLabelText(/^Логин/), 'лщмфдсргл');
    expect(screen.getByText('Логин вводится латиницей — переключите раскладку.')).toBeInTheDocument();
  });

  it('warns while Caps Lock is on in the password field', async () => {
    renderLogin();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/^Пароль/));
    await user.keyboard('{CapsLock}A');
    expect(screen.getByText('Включён Caps Lock')).toBeInTheDocument();
    await user.keyboard('{CapsLock}a');
    expect(screen.queryByText('Включён Caps Lock')).not.toBeInTheDocument();
  });
});
