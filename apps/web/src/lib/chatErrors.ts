import { ApiError } from './api';
import { ChatError } from './chat';

const messages: Record<string, string> = {
  CONVERSATION_NOT_FOUND: 'Разговор недоступен',
  CONVERSATION_ARCHIVED: 'Разговор закрыт для новых сообщений',
  CHAT_FORBIDDEN: 'Недостаточно прав для этого действия',
  CHAT_JOIN_REQUIRED: 'Вступите в канал, чтобы писать',
  CHAT_LAST_ADMIN: 'Сначала назначьте другого администратора',
  CHAT_DEFAULT_CHANNEL: 'Общий канал всегда включает всех сотрудников',
  CHAT_MEMBER_LIMIT: 'В группе может быть не больше 20 человек',
  CHAT_GROUP_TOO_SMALL: 'Для группы выберите минимум двух коллег',
  CHAT_INVALID_MEMBERS: 'Участниками могут быть только активные сотрудники',
  CHAT_INVALID_PARENT: 'Ответить можно только на сообщение этого разговора',
  CHAT_CANNOT_LEAVE_DM: 'Из личного разговора нельзя выйти',
  CHAT_CANNOT_ADD_TO_DM: 'Создайте группу, чтобы добавить людей',
  CHAT_MEMBER_NOT_FOUND: 'Сотрудник уже не участник',
  CHAT_MESSAGE_DELETED: 'Сообщение уже удалено',
  CHAT_RATE_LIMITED: 'Слишком много сообщений подряд — подождите минуту',
  CHANNEL_NAME_TAKEN: 'Канал с таким названием уже есть',
  MESSAGE_NOT_FOUND: 'Сообщение недоступно',
  USER_NOT_FOUND: 'Сотрудник не найден',
};

export function chatErrorMessage(error: unknown, fallback: string): string {
  const code = error instanceof ApiError || error instanceof ChatError ? error.code : undefined;
  if (code && messages[code]) return messages[code]!;
  return error instanceof Error && error.message ? error.message : fallback;
}
