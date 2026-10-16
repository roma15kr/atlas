import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../ui';
import { RichTextView } from './RichTextView';

// Images come through the API with the session token; here the network answers, and a broken one is 404.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('deadbeef')
    ? new Response(JSON.stringify({ error: { code: 'IMAGE_NOT_FOUND', message: 'Not found' } }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    : new Response('png-bytes', { status: 200, headers: { 'Content-Type': 'image/png' } })));
  URL.createObjectURL = vi.fn(() => `blob:atlas/${Math.random().toString(36).slice(2)}`);
});

const text = 'Инструкция\n\n![Профиль](/api/v1/images/11111111-1111-4111-8111-111111111111)\n\nДалее ![Кнопка](/api/v1/images/22222222-2222-4222-8222-222222222222) и ![Разрешить](/api/v1/images/33333333-3333-4333-8333-333333333333)';

afterEach(() => { cleanup(); document.body.style.overflow = ''; vi.unstubAllGlobals(); });

describe('image thumbnails and viewer', () => {
  it('opens a thumbnail enlarged and pages through the images of the text', async () => {
    const user = userEvent.setup();
    render(<RichTextView markdown={text} />);
    const thumbnails = await screen.findAllByRole('button', { name: /^Открыть изображение/ });
    expect(thumbnails).toHaveLength(3);
    await user.click(thumbnails[1]!);
    const viewer = screen.getByRole('dialog', { name: 'Просмотр изображения' });
    expect(within(viewer).getByText('2 из 3')).toBeInTheDocument();
    expect((await within(viewer).findByRole('img', { name: 'Кнопка' })).getAttribute('src')).toMatch(/^blob:/);
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{ArrowRight}');
    expect(within(viewer).getByText('3 из 3')).toBeInTheDocument();
    await user.click(within(viewer).getByRole('button', { name: 'Следующее изображение' }));
    expect(within(viewer).getByText('1 из 3')).toBeInTheDocument();
    await user.click(within(viewer).getByRole('button', { name: 'Предыдущее изображение' }));
    expect(within(viewer).getByText('3 из 3')).toBeInTheDocument();
    expect(within(viewer).getByRole('link', { name: 'Скачать' })).toHaveAttribute('download');
  });

  it('closes with Escape, «×» or a click outside, returning focus to the thumbnail', async () => {
    const user = userEvent.setup();
    render(<RichTextView markdown={text} />);
    const [first] = await screen.findAllByRole('button', { name: /^Открыть изображение/ });
    await user.click(first!);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Просмотр изображения' })).not.toBeInTheDocument();
    expect(first).toHaveFocus();
    expect(document.body.style.overflow).toBe('');

    await user.click(first!);
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog', { name: 'Просмотр изображения' })).not.toBeInTheDocument();

    await user.click(first!);
    await user.click(screen.getByRole('dialog', { name: 'Просмотр изображения' }));
    expect(screen.queryByRole('dialog', { name: 'Просмотр изображения' })).not.toBeInTheDocument();
  });

  it('shows a single image without paging', async () => {
    const user = userEvent.setup();
    render(<RichTextView markdown={'![Схема](/api/v1/images/44444444-4444-4444-8444-444444444444)'} />);
    await user.click(await screen.findByRole('button', { name: 'Открыть изображение: Схема' }));
    expect(screen.getByRole('dialog', { name: 'Просмотр изображения' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Следующее изображение' })).not.toBeInTheDocument();
    expect(screen.queryByText(/из \d/)).not.toBeInTheDocument();
  });

  it('shows an unavailable image without a way to open it', async () => {
    render(<RichTextView markdown={'![](/api/v1/images/deadbeef-0000-4000-8000-000000000000)'} />);
    expect(await screen.findByText('[изображение недоступно]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Открыть изображение/ })).not.toBeInTheDocument();
  });

  it('closes only the viewer when Escape is pressed inside a dialog', async () => {
    const user = userEvent.setup();
    const closeDialog = vi.fn();
    render(<Dialog open title="Задача" onClose={closeDialog}><RichTextView markdown={text} /></Dialog>);
    await user.click((await screen.findAllByRole('button', { name: /^Открыть изображение/ }))[0]!);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Просмотр изображения' })).not.toBeInTheDocument();
    expect(closeDialog).not.toHaveBeenCalled();
  });
});
