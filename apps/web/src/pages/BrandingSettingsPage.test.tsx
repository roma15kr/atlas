import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';

// Canvas isn't available in jsdom: the icons are made by the browser, so here they are stand-in PNG blobs.
vi.mock('../lib/image', async (original) => ({
  ...(await original<typeof import('../lib/image')>()),
  prepareBrandIcons: vi.fn(async () => Object.fromEntries(['logo', 'icon192', 'icon512', 'maskable512', 'apple180', 'badge96'].map((name) => [name, new Blob(['png'], { type: 'image/png' })]))),
}));

const renderAs = (username: keyof typeof demoSessions, path = '/settings/appearance') => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions[username]));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};
const sidebar = () => document.querySelector('.sidebar__brand') as HTMLElement;
const root = () => document.documentElement.style;

beforeEach(() => { localStorage.clear(); root().cssText = ''; });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('appearance settings', () => {
  it('lets a director rename the app; the sidebar and the tab title follow', async () => {
    const user = userEvent.setup();
    renderAs('director');
    await user.click(await screen.findByRole('button', { name: 'Изменить название' }, { timeout: 5_000 }));
    const dialog = screen.getByRole('dialog', { name: 'Название приложения' });
    const field = within(dialog).getByLabelText(/Название/);
    await user.clear(field);
    expect(within(dialog).getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    await user.type(field, 'RDIM Office');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(within(sidebar()).getByText('RDIM Office')).toBeInTheDocument());
    expect(document.title).toBe('Оформление · RDIM Office');
    expect(within(sidebar()).getByText('R')).toBeInTheDocument();
  });

  it('keeps «Сохранить» unavailable for an unreadable accent and explains why', async () => {
    const user = userEvent.setup();
    renderAs('director');
    await user.click(await screen.findByRole('button', { name: 'Изменить цвета' }, { timeout: 5_000 }));
    const dialog = screen.getByRole('dialog', { name: 'Изменить цвета' });
    const code = within(dialog).getByLabelText('Код цвета: Акцентный цвет');
    await user.clear(code);
    await user.type(code, '#f5d90a');
    expect(within(dialog).getByText(/Белый текст на этом цвете трудно читать/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('applies a preset to the whole app without a reload, keeping status colours', async () => {
    const user = userEvent.setup();
    renderAs('director');
    await user.click(await screen.findByRole('button', { name: 'Изменить цвета' }, { timeout: 5_000 }));
    const dialog = screen.getByRole('dialog', { name: 'Изменить цвета' });
    await user.click(within(dialog).getByRole('radio', { name: 'Графит' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(root().getPropertyValue('--primary')).toBe('#37474f'));
    expect(root().getPropertyValue('--sidebar')).toBe('#f1f3f2');
    expect(root().getPropertyValue('--sidebar-text')).toBe('#202827');
    expect(root().getPropertyValue('--red')).toBe('');
    expect(screen.getByText('#37474f')).toBeInTheDocument();
  });

  it('shows an uploaded logo in the sidebar mark, and the letter again after removing it', async () => {
    const user = userEvent.setup();
    renderAs('director');
    await user.click(await screen.findByRole('button', { name: 'Загрузить логотип' }, { timeout: 5_000 }));
    const dialog = screen.getByRole('dialog', { name: 'Логотип компании' });
    await user.upload(within(dialog).getByLabelText('Файл логотипа'), new File(['wide'], 'rdim.png', { type: 'image/png' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Загрузить' }));
    await waitFor(() => expect(sidebar().querySelector('.brand-mark--logo img')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Убрать логотип' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Убрать логотип?' })).getByRole('button', { name: 'Убрать' }));
    await waitFor(() => expect(sidebar().querySelector('.brand-mark--logo')).toBeNull());
  });

  it('refuses an SVG logo before uploading anything', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderAs('director');
    await user.click(await screen.findByRole('button', { name: 'Загрузить логотип' }, { timeout: 5_000 }));
    const dialog = screen.getByRole('dialog', { name: 'Логотип компании' });
    await user.upload(within(dialog).getByLabelText('Файл логотипа'), new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Можно PNG, JPEG или WebP до 5 МБ');
    expect(within(dialog).getByRole('button', { name: 'Загрузить' })).toBeDisabled();
  });

  it('restores the standard look after confirmation', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.demoBranding', JSON.stringify({ appName: 'RDIM Office', accentColor: '#3949ab', sidebarColor: '#1f2540' }));
    renderAs('director');
    await waitFor(() => expect(within(sidebar()).getByText('RDIM Office')).toBeInTheDocument(), { timeout: 5_000 });
    await user.click(screen.getByRole('button', { name: /Вернуть стандартное оформление/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Вернуть стандартное оформление?' })).getByRole('button', { name: 'Вернуть' }));
    await waitFor(() => expect(within(sidebar()).getByText('Quorfield')).toBeInTheDocument());
    expect(root().getPropertyValue('--primary')).toBe('');
  });

  it('follows a change made elsewhere, without a reload', async () => {
    renderAs('employee', '/tasks');
    await screen.findByRole('heading', { name: 'Мои задачи' }, { timeout: 5_000 });
    act(() => { window.dispatchEvent(new CustomEvent('atlas:socket', { detail: { event: 'branding:changed', payload: { appName: 'RDIM Office', accentColor: '#3949ab', sidebarColor: '#1f2540', logoVersion: null, files: null } } })); });
    await waitFor(() => expect(within(sidebar()).getByText('RDIM Office')).toBeInTheDocument());
    expect(root().getPropertyValue('--primary')).toBe('#3949ab');
  });

  it('gives a manager no «Оформление» item and sends the address to the dashboard', async () => {
    renderAs('manager');
    expect(await screen.findByRole('heading', { name: /^Добрый день, / }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Оформление' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Оформление' })).not.toBeInTheDocument();
  });

  it('shows the saved title on the login screen before sign-in', async () => {
    localStorage.setItem('atlas.demoBranding', JSON.stringify({ appName: 'RDIM Office' }));
    render(<MemoryRouter initialEntries={['/login']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
    expect((await screen.findAllByText('RDIM Office', {}, { timeout: 5_000 })).length).toBeGreaterThan(0);
  });
});
