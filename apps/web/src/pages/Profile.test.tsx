import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { sessionStore } from '../lib/api';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { changedProfileFields, formatBirthday, latestBirthDate, profileFormOf, validateProfile } from '../lib/profile';
import type { User } from '../types';

vi.mock('socket.io-client', () => ({ io: () => ({ onAny: vi.fn(), on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));
const prepared = new Blob(['prepared-jpeg'], { type: 'image/jpeg' });
vi.mock('../lib/image', () => ({
  ImagePreparationError: class extends Error {},
  prepareAvatar: vi.fn(async () => prepared),
}));

const base = { id: 'u-1', username: 'anna', fullName: 'Анна Соколова', role: 'EMPLOYEE', departmentName: 'Продажи', rating: 0, kpis: [], specialty: 'B2B', showBirthday: true } as Record<string, unknown>;
let user = { ...base };
const patches: Array<Record<string, unknown>> = [];
const uploads: FormData[] = [];

beforeEach(() => {
  patches.length = 0; uploads.length = 0;
  user = { ...base };
  sessionStore.set({ accessToken: 'real-token', user } as never);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url === '/api/v1/team/me' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      patches.push(body);
      user = { ...user, ...Object.fromEntries(Object.entries(body).map(([key, value]) => [key, value === '' ? null : value])) };
      if (typeof user.birthDate === 'string') user.birthday = user.birthDate.slice(5);
      return json({ data: user });
    }
    if (url === '/api/v1/team/me/avatar' && init?.method === 'POST') {
      uploads.push(init.body as FormData);
      user = { ...user, avatarUrl: '/api/v1/avatars/new-id' };
      return json({ data: { avatarUrl: '/api/v1/avatars/new-id' } }, 201);
    }
    if (url === '/api/v1/team/me/avatar' && init?.method === 'DELETE') {
      user = { ...user, avatarUrl: null };
      return json({ data: { avatarUrl: null } });
    }
    if (url.startsWith('/api/v1/team')) return json({ data: [user] });
    return json({ data: [], meta: { total: 0 } });
  }));
});

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

const renderProfile = () => render(<MemoryRouter initialEntries={['/profile']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);

describe('profile', () => {
  it('saves only the changed fields and shows the new name in the sidebar', async () => {
    const actor = userEvent.setup();
    renderProfile();
    const name = await screen.findByLabelText('Полное имя');
    await actor.clear(name);
    await actor.type(name, 'Анна Коваль');
    await actor.type(screen.getByLabelText('Город'), 'Київ');
    await actor.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(patches).toEqual([{ fullName: 'Анна Коваль', city: 'Київ' }]));
    expect(await screen.findByRole('heading', { name: 'Анна Коваль' })).toBeInTheDocument();
    expect(within(document.querySelector('.sidebar__user') as HTMLElement).getByText('Анна Коваль')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранено' })).toBeDisabled();
  });

  it('saves a birth date and the birthday visibility, and shows the birthday without the year', async () => {
    const actor = userEvent.setup();
    renderProfile();
    const birth = await screen.findByLabelText(/Дата рождения/);
    await actor.type(birth, '1994-03-12');
    await actor.click(screen.getByRole('checkbox', { name: /Показывать коллегам день рождения/ }));
    await actor.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(patches).toEqual([{ birthDate: '1994-03-12', showBirthday: false }]));
    expect(await screen.findByText('12 марта')).toBeInTheDocument();
    expect(screen.getByText(/скрыт от коллег/)).toBeInTheDocument();
  });

  it('shows Russian field errors and sends nothing for an invalid email', async () => {
    const actor = userEvent.setup();
    renderProfile();
    await actor.type(await screen.findByLabelText('Email для связи'), 'anna@');
    await actor.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Укажите корректный email')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email для связи/)).toHaveAttribute('aria-invalid', 'true');
    expect(patches).toEqual([]);
  });

  it('uploads the prepared photo, shows it in the sidebar and removes it', async () => {
    const actor = userEvent.setup();
    renderProfile();
    await screen.findByLabelText('Полное имя');
    await actor.upload(screen.getByLabelText('Файл фото'), new File(['raw'], 'me.png', { type: 'image/png' }));
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]!.get('file')).toBeInstanceOf(Blob);
    expect(await (uploads[0]!.get('file') as Blob).text()).toBe('prepared-jpeg');
    await waitFor(() => expect(document.querySelector('.sidebar__user img')).toHaveAttribute('src', '/api/v1/avatars/new-id'));
    await actor.click(screen.getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(document.querySelector('.sidebar__user img')).toBeNull());
    expect(screen.getByRole('button', { name: 'Загрузить фото' })).toBeInTheDocument();
  });

  it('offers no controls for settings Atlas does not have', async () => {
    renderProfile();
    await screen.findByLabelText('Полное имя');
    expect(screen.queryByText('Двухфакторная аутентификация')).not.toBeInTheDocument();
    expect(screen.queryByText('Уведомления в интерфейсе')).not.toBeInTheDocument();
  });
});

describe('profile rules', () => {
  const today = new Date('2026-10-02T12:00:00Z');
  const form = (patch: Partial<ReturnType<typeof profileFormOf>> = {}) => ({ ...profileFormOf({ fullName: 'Анна', showBirthday: true } as User), ...patch });

  it('matches the API birth-date and contact rules', () => {
    expect(validateProfile(form({ birthDate: '2026-10-03' }), today).birthDate).toBe('Дата рождения не может быть в будущем');
    expect(validateProfile(form({ birthDate: '1899-12-31' }), today).birthDate).toMatch(/1900/);
    expect(validateProfile(form({ birthDate: '2012-10-03' }), today).birthDate).toMatch(/14 лет/);
    expect(validateProfile(form({ birthDate: latestBirthDate(today) }), today)).toEqual({});
    expect(validateProfile(form({ phone: '12-34' }), today).phone).toBeDefined();
    expect(validateProfile(form({ phone: '+380 (67) 123-45-67' }), today)).toEqual({});
  });

  it('trims text and clears with an empty string', () => {
    const saved = form({ city: 'Київ', phone: '+380671234567' });
    expect(changedProfileFields({ ...saved, city: '  ', phone: '+380671234567 ' }, saved)).toEqual({ city: '' });
  });

  it('formats birthdays without the year', () => {
    expect(formatBirthday('03-12')).toBe('12 марта');
    expect(formatBirthday('1994-12-01')).toBe('1 декабря');
    expect(formatBirthday(undefined)).toBeUndefined();
  });
});
