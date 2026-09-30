import { ApiError } from './api';

const messages: Record<string, string> = {
  DIRECTOR_ONLY: 'Настраивать воронки может только директор',
  FUNNEL_NAME_TAKEN: 'Воронка с таким названием уже есть',
  STAGE_NAME_TAKEN: 'Этап с таким названием уже есть в этой воронке',
  FUNNEL_NOT_EMPTY: 'В воронке есть сделки — сначала перенесите или удалите их',
  LAST_FUNNEL: 'Нельзя удалить последнюю воронку компании',
  LAST_STAGE: 'Нельзя удалить последний этап воронки',
  TARGET_STAGE_REQUIRED: 'Выберите этап, в который перенести сделки',
  INVALID_TARGET_STAGE: 'Выберите другой этап этой же воронки',
  OPEN_STAGE_REQUIRED: 'В воронке должен остаться хотя бы один открытый этап',
  INVALID_STAGE_ORDER: 'Порядок этапов устарел — обновите страницу',
  INVALID_ACCESS_GRANT: 'Выбран отдел или сотрудник не из вашей компании',
  OWNER_FUNNEL_ACCESS_REQUIRED: 'У ответственного нет доступа к этой воронке',
  FUNNEL_NOT_FOUND: 'Воронка недоступна',
  INVALID_DEAL_STAGE: 'Этап не относится к выбранной воронке',
  CONFLICT_RETRY: 'Сделки изменились во время удаления этапа — попробуйте ещё раз',
};

export function funnelErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code && messages[error.code]) return messages[error.code]!;
  return error instanceof Error && error.message ? error.message : fallback;
}
