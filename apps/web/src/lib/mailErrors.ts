import { ApiError } from './api';
import { errorText } from './errorText';
import { MailError } from './mail';


/** Connection and send failures already carry the server's own reason. */
export function mailErrorMessage(error: unknown, fallback: string): string {
  const code = error instanceof ApiError || error instanceof MailError ? error.code : undefined;
  if (code === 'MAIL_CONNECTION_FAILED' || code === 'MAIL_SEND_FAILED') return (error as Error).message;
  const text = errorText('mail', code);
  if (text) return text;
  return error instanceof Error && error.message ? error.message : fallback;
}
