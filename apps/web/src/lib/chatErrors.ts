import { ApiError } from './api';
import { errorText } from './errorText';
import { ChatError } from './chat';


export function chatErrorMessage(error: unknown, fallback: string): string {
  const code = error instanceof ApiError || error instanceof ChatError ? error.code : undefined;
  const text = errorText('chat', code);
  if (text) return text;
  return error instanceof Error && error.message ? error.message : fallback;
}
