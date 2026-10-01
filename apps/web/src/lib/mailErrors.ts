import { ApiError } from './api';
import { MailError } from './mail';

const messages: Record<string, string> = {
  MAIL_NOT_FOUND: 'Письмо или ящик недоступны',
  MAIL_ACCOUNT_EXISTS: 'Этот ящик уже подключён',
  MAIL_ACCOUNT_LIMIT: 'Можно подключить не больше 5 ящиков',
  MAIL_ACCOUNT_UNAVAILABLE: 'Подключите ящик заново, чтобы отправлять письма',
  MAIL_ENCRYPTION_UNCONFIGURED: 'Подключение почты не настроено на сервере — обратитесь к администратору',
  MAIL_PROVIDER_UNAVAILABLE: 'Этот способ подключения не настроен на сервере',
  MAIL_HOST_NOT_ALLOWED: 'Этот адрес сервера нельзя использовать',
  MAIL_PORT_NOT_ALLOWED: 'Используйте стандартный порт почтового сервера',
  MAIL_OAUTH_STATE_INVALID: 'Ссылка для входа устарела — начните подключение заново',
  MAIL_OAUTH_FAILED: 'Почтовый сервис не дал доступ — попробуйте ещё раз и разрешите все права',
  MAIL_OAUTH_REVOKED: 'Доступ к почте отозван — подключите ящик заново',
  MAIL_RATE_LIMITED: 'Достигнут лимит отправки — попробуйте через час',
  MAIL_RECIPIENT_REQUIRED: 'Добавьте хотя бы одного получателя',
  MAIL_ACTION_FAILED: 'Почтовый сервер не выполнил действие — попробуйте ещё раз',
  MAIL_FOLDER_MISSING: 'В этом ящике нет такой папки',
  MAIL_ATTACHMENTS_TOO_LARGE: 'Вложения слишком большие',
  MAIL_ATTACHMENT_UNAVAILABLE: 'Вложение больше недоступно на почтовом сервере',
  MAIL_OAUTH_SETTINGS: 'Этот ящик подключён через Google или Microsoft — переподключите его там',
  CLIENT_NOT_FOUND: 'Клиент недоступен',
  CLIENT_REQUIRED: 'Сначала привяжите переписку к клиенту',
  DEAL_NOT_FOUND: 'Сделка недоступна',
  FUNNEL_NOT_FOUND: 'Воронка недоступна',
};

/** Connection and send failures already carry a Russian reason from the server. */
export function mailErrorMessage(error: unknown, fallback: string): string {
  const code = error instanceof ApiError || error instanceof MailError ? error.code : undefined;
  if (code === 'MAIL_CONNECTION_FAILED' || code === 'MAIL_SEND_FAILED') return (error as Error).message;
  if (code && messages[code]) return messages[code]!;
  return error instanceof Error && error.message ? error.message : fallback;
}
