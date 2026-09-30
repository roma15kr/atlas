import { ApiError } from './api';

const messages: Record<string, string> = {
  BOARD_MANAGER_ONLY: 'Настраивать доску может директор или руководитель её отдела',
  BOARD_NAME_TAKEN: 'В отделе уже есть доска с таким названием',
  BOARD_NOT_FOUND: 'Доска недоступна',
  BOARD_NOT_EMPTY: 'На доске есть задачи — сначала перенесите или удалите их',
  STAGE_NAME_TAKEN: 'Этап с таким названием уже есть на доске',
  STAGE_NOT_FOUND: 'Этап уже удалён — обновите страницу',
  STAGE_CATEGORY_REQUIRED: 'На доске должны остаться этапы «Не начато» и «Готово»',
  LAST_STAGE: 'Нельзя удалить последний этап доски',
  TARGET_STAGE_REQUIRED: 'Выберите этап, в который перенести задачи',
  INVALID_TARGET_STAGE: 'Выберите другой этап этой же доски',
  INVALID_STAGE_ORDER: 'Порядок этапов устарел — обновите страницу',
  INVALID_STAGE: 'Этап не относится к выбранной доске',
  INVALID_MEMBER: 'Участником может быть только активный сотрудник компании',
  INVALID_DEPARTMENT: 'Отдел не найден',
  TASK_NOT_FOUND: 'Задача недоступна',
  TASK_DELETE_FORBIDDEN: 'Удалить задачу может её автор или руководитель отдела доски',
  ASSIGNEE_BOARD_ACCESS_REQUIRED: 'Исполнитель не имеет доступа к этой доске',
  DEAL_NOT_FOUND: 'Сделка недоступна',
  CONFLICT_RETRY: 'Задачи изменились во время сохранения — попробуйте ещё раз',
};

export function boardErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code && messages[error.code]) return messages[error.code]!;
  return error instanceof Error && error.message ? error.message : fallback;
}
