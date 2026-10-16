import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetInstallPrompt, watchInstallPrompt } from '../lib/install';
import { AppInstall } from './AppInstall';

const userAgent = navigator.userAgent;
const setUserAgent = (value: string) => Object.defineProperty(navigator, 'userAgent', { configurable: true, value });
const setStandalone = (standalone: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: standalone && query.includes('standalone'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));

beforeAll(() => watchInstallPrompt());
afterEach(() => { cleanup(); resetInstallPrompt(); setUserAgent(userAgent); vi.unstubAllGlobals(); });

describe('app install', () => {
  it('offers Chrome\'s install dialog and shows the app as installed afterwards', async () => {
    const user = userEvent.setup();
    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    act(() => { window.dispatchEvent(event); });
    render(<AppInstall />);
    await user.click(screen.getByRole('button', { name: 'Установить приложение' }));
    expect(prompt).toHaveBeenCalled();
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    expect(await screen.findByText('Установлено')).toBeInTheDocument();
  });

  it('explains the two steps on an iPhone', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1');
    render(<AppInstall />);
    expect(screen.getByText('Выберите «На экран Домой» и нажмите «Добавить».')).toBeInTheDocument();
    expect(screen.getByText(/Уведомления на iPhone работают только в установленном приложении/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Установить приложение' })).not.toBeInTheDocument();
  });

  it('says so when Atlas already runs as an installed app', () => {
    setStandalone(true);
    render(<AppInstall />);
    expect(screen.getByText('Установлено')).toBeInTheDocument();
  });

  it('suggests Chrome where installing is not available', () => {
    setStandalone(false);
    render(<AppInstall />);
    expect(screen.getByText(/Откройте Atlas в Google Chrome/)).toBeInTheDocument();
  });
});
