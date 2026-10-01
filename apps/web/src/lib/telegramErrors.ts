import { ApiError } from './api';
import { TelegramError } from './telegram';

const messages: Record<string, string> = {
  TELEGRAM_CONTACT_NOT_FOUND: 'Переписка недоступна',
  TELEGRAM_CONTACT_BLOCKED: 'Клиент заблокировал бота — сообщения ему не доходят',
  TELEGRAM_CONTACT_UNREACHABLE: 'Клиент ещё не писал этому боту. Отправьте ему ссылку-приглашение другим способом',
  TELEGRAM_SEND_FAILED: 'Telegram не принял сообщение — попробуйте ещё раз',
  TELEGRAM_FORBIDDEN: 'Недостаточно прав для этого действия',
  TELEGRAM_UNCONFIGURED: 'Telegram-бот не настроен на сервере',
  TELEGRAM_INVALID_RESPONSIBLE: 'Выберите активного сотрудника',
  TELEGRAM_EMPTY_MESSAGE: 'Напишите сообщение или прикрепите файл',
  TELEGRAM_CAPTION_TOO_LONG: 'Подпись к файлу — не больше 1024 символов',
  TELEGRAM_IMPORT_INVALID: 'В файле нет колонки telegram_id',
  TELEGRAM_IMPORT_TOO_LARGE: 'В одном файле — не больше 5000 строк',
  TELEGRAM_IMPORT_EXPIRED: 'Предпросмотр устарел — загрузите файл ещё раз',
  TELEGRAM_FILE_PENDING: 'Файл ещё загружается — попробуйте через минуту',
  TELEGRAM_CHECK_FAILED: 'Telegram не ответил — проверьте токен бота',
  CLIENT_NOT_FOUND: 'Клиент недоступен',
  CLIENT_REQUIRED: 'Сначала привяжите переписку к клиенту',
  FUNNEL_NOT_FOUND: 'Воронка недоступна',
};

export function telegramErrorMessage(error: unknown, fallback: string): string {
  const code = error instanceof ApiError || error instanceof TelegramError ? error.code : undefined;
  if (code && messages[code]) return messages[code]!;
  return error instanceof Error && error.message ? error.message : fallback;
}
