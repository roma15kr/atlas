import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '../lib/api';
import { FeedbackButton } from './FeedbackDialog';

const captured = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
let nextCapture: Blob | null = captured;
vi.mock('../lib/screenshot', () => ({ captureScreen: vi.fn(async () => nextCapture) }));

const sent: FormData[] = [];
beforeEach(() => {
  sent.length = 0; nextCapture = captured;
  sessionStore.set({ accessToken: 'real-token', user: { id: 'u-1' } } as never);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => undefined }));
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(init?.body as FormData);
    return new Response(JSON.stringify({ data: { id: 'f-1', status: 'PENDING' } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStore.set(null); });

const open = async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/crm']}><FeedbackButton /></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: 'Сообщить о проблеме' }));
  return { user, dialog: await screen.findByRole('dialog', { name: 'Сообщить о проблеме' }) };
};
const describeAndSend = async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => {
  await user.type(within(dialog).getByLabelText(/Что случилось/), 'Таблиця клієнтів не завантажується');
  await user.click(within(dialog).getByRole('button', { name: 'Отправить' }));
  await screen.findByRole('dialog', { name: 'Обращение отправлено' });
};

describe('report screenshot', () => {
  it('shows a preview and sends the picture with the report', async () => {
    const { user, dialog } = await open();
    expect(within(dialog).getByRole('img', { name: 'Предпросмотр снимка экрана' })).toHaveAttribute('src', 'blob:preview');
    await describeAndSend(user, dialog);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.get('screenshot')).toBeInstanceOf(Blob);
    expect(JSON.parse(String(sent[0]!.get('report')))).toMatchObject({ page: '/crm', kind: 'PROBLEM' });
  });

  it('sends no picture after «Не прикладывать снимок»', async () => {
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Не прикладывать снимок' }));
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Приложить снимок' })).toBeInTheDocument();
    await describeAndSend(user, dialog);
    expect(sent[0]!.get('screenshot')).toBeNull();
  });

  it('still lets the report be sent when no picture could be taken', async () => {
    nextCapture = null;
    const { user, dialog } = await open();
    expect(within(dialog).getByText('Снимок экрана не удалось сделать')).toBeInTheDocument();
    await describeAndSend(user, dialog);
    expect(sent[0]!.get('screenshot')).toBeNull();
  });
});
