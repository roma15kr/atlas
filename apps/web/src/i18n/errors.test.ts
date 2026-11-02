import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../lib/api';
import { boardErrorMessage } from '../lib/boardErrors';
import { chatErrorMessage } from '../lib/chatErrors';
import { funnelErrorMessage } from '../lib/funnelErrors';
import i18n from '.';

afterEach(async () => { await i18n.changeLanguage('ru'); });

describe('API error codes in each language', () => {
  it('names the same code differently per area, in Ukrainian', async () => {
    await i18n.changeLanguage('uk');
    const lastStage = new ApiError('x', 409, undefined, 'LAST_STAGE');
    expect(boardErrorMessage(lastStage, 'fallback')).toBe('Не можна видалити останній етап дошки');
    expect(funnelErrorMessage(lastStage, 'fallback')).toBe('Не можна видалити останній етап воронки');
  });

  it('explains a chat error in English and keeps the fallback for an unknown code', async () => {
    await i18n.changeLanguage('en');
    expect(chatErrorMessage(new ApiError('x', 403, undefined, 'CHAT_JOIN_REQUIRED'), 'fallback')).toBe('Join the channel to write');
    expect(chatErrorMessage(new ApiError('', 500, undefined, 'SOMETHING_NEW'), 'Could not send')).toBe('Could not send');
    expect(chatErrorMessage(new ApiError('x', 500, undefined, 'toString'), 'fallback')).toBe('x');
  });
});
