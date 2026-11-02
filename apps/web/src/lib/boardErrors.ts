import { ApiError } from './api';
import { errorText } from './errorText';


export function boardErrorMessage(error: unknown, fallback: string): string {
  const text = error instanceof ApiError ? errorText('board', error.code) : undefined;
  if (text) return text;
  return error instanceof Error && error.message ? error.message : fallback;
}
