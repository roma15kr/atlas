import { ApiError } from './api';
import { errorText } from './errorText';
import { TelegramError } from './telegram';


export function telegramErrorMessage(error: unknown, fallback: string): string {
  const code = error instanceof ApiError || error instanceof TelegramError ? error.code : undefined;
  const text = errorText('telegram', code);
  if (text) return text;
  return error instanceof Error && error.message ? error.message : fallback;
}
