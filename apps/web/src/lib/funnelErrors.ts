import { ApiError } from './api';
import { errorText } from './errorText';


export function funnelErrorMessage(error: unknown, fallback: string): string {
  const text = error instanceof ApiError ? errorText('funnel', error.code) : undefined;
  if (text) return text;
  return error instanceof Error && error.message ? error.message : fallback;
}
