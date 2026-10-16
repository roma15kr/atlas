import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoClientComments } from '../lib/clientComments';
import { phoneViewport } from '../test/phone';

const renderClient = () => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
  return render(<MemoryRouter initialEntries={['/crm/c1']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => { localStorage.clear(); resetDemoClientComments(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('client card', () => {
  it('edits notes in the editor and saves a ticked checklist item from the card', async () => {
    const user = userEvent.setup();
    renderClient();
    expect(await screen.findByText('Расширение лицензий в четвёртом квартале.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Редактировать/ }));
    const dialog = screen.getByRole('dialog', { name: 'Редактировать клиента' });
    const notes = await within(dialog).findByRole('textbox', { name: 'Заметка' });
    await user.click(notes);
    await user.keyboard('{Control>}a{/Control}подписать договор');
    await user.click(within(dialog).getByRole('button', { name: 'Чек-лист' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const box = await screen.findByRole('checkbox', { name: 'Не выполнено' });
    expect(box).toBeEnabled();
    await user.click(box);
    expect(await screen.findByRole('checkbox', { name: 'Выполнено' })).toBeChecked();
    expect(screen.getByText('подписать договор')).toBeInTheDocument();
    expect(screen.queryByText('Расширение лицензий в четвёртом квартале.')).not.toBeInTheDocument();
  }, 15_000);

  it('adds a formatted comment to the feed, newest first, with read-only checklists', async () => {
    const user = userEvent.setup();
    renderClient();
    const feed = await screen.findByRole('region', { name: 'Комментарии к клиенту' });
    expect(await within(feed).findByText('Комментариев пока нет')).toBeInTheDocument();
    await user.click(await within(feed).findByRole('textbox', { name: 'Новый комментарий к клиенту' }));
    await user.keyboard('Первый звонок');
    await user.click(within(feed).getByRole('button', { name: 'Добавить комментарий' }));
    await within(feed).findByText('Первый звонок');
    await user.click(within(feed).getByRole('textbox', { name: 'Новый комментарий к клиенту' }));
    await user.click(within(feed).getByRole('button', { name: 'Чек-лист' }));
    await user.keyboard('{Control>}b{/Control}выслать прайс{Control>}b{/Control}');
    await user.click(within(feed).getByRole('button', { name: 'Добавить комментарий' }));
    const newest = await within(feed).findByText('выслать прайс', { selector: 'strong' });
    const items = within(feed).getAllByRole('listitem').filter((item) => item.closest('.task-comments__list'));
    expect(items[0]).toContainElement(newest);
    expect(within(items[0]!).getByRole('checkbox')).toBeDisabled();
    expect(within(items[0]!).getByText('Елена Морозова')).toBeInTheDocument();
  });
});

describe('client card on a phone', () => {
  it('offers calling and writing to the client with large buttons', async () => {
    const restore = phoneViewport();
    try {
      renderClient();
      expect(await screen.findByRole('link', { name: 'Позвонить' })).toHaveAttribute('href', 'tel:+1555010220');
      expect(screen.getByRole('link', { name: 'Написать' })).toHaveAttribute('href', 'mailto:sofia@northstar.example');
    } finally { restore(); }
  });

  it('keeps the desktop card without them', async () => {
    renderClient();
    await screen.findAllByRole('heading', { name: 'Northstar Labs' });
    expect(screen.queryByRole('link', { name: 'Позвонить' })).not.toBeInTheDocument();
  });
});
