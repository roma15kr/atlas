import type { KindOptions } from '../components/stageSettings';
import type { TaskBoard, TaskCategory, TaskStage, User, WorkTask } from '../types';

export const TASKS: [string, string, string] = ['задача', 'задачи', 'задач'];
export const STAGES: [string, string, string] = ['этап', 'этапа', 'этапов'];
export const BOARDS: [string, string, string] = ['доска', 'доски', 'досок'];

export const categories: KindOptions<TaskCategory> = {
  TODO: { label: 'Не начато', tone: 'neutral', hint: 'Задачи ещё не взяты в работу. Сюда попадают новые задачи.' },
  ACTIVE: { label: 'В работе', tone: 'info', hint: 'Задачи в процессе выполнения.' },
  DONE: { label: 'Готово', tone: 'success', hint: 'Выполненные задачи: в отчётах и на дашборде считаются завершёнными.' },
};

export const categoryOrder: TaskCategory[] = ['TODO', 'ACTIVE', 'DONE'];

export const priorityLabels: Record<WorkTask['priority'], string> = { HIGH: 'Высокий', NORMAL: 'Обычный', LOW: 'Низкий' };

/** Director boards have no department and are listed under "Руководство". */
export const boardGroupName = (board: Pick<TaskBoard, 'departmentName'>) => board.departmentName ?? 'Руководство';

export function groupBoards(boards: TaskBoard[]): Array<{ label: string; boards: TaskBoard[] }> {
  const groups = new Map<string, TaskBoard[]>();
  for (const board of boards) groups.set(boardGroupName(board), [...(groups.get(boardGroupName(board)) ?? []), board]);
  return [...groups.entries()].map(([label, items]) => ({ label, boards: [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')) }));
}

export const orderedStages = (board: TaskBoard): TaskStage[] => [...board.stages].sort((a, b) => a.sortOrder - b.sortOrder);

/** A drop into a category column lands in the first stage of that category on the task's own board. */
export const firstStageOf = (board: TaskBoard | undefined, category: TaskCategory): TaskStage | undefined =>
  board ? orderedStages(board).find((stage) => stage.category === category) : undefined;

export const isOverdue = (task: WorkTask) => task.stage.category !== 'DONE' && Boolean(task.dueAt) && new Date(task.dueAt).getTime() < Date.now();

export const isAssignedTo = (task: WorkTask, userId: string) => task.assignees.some((assignee) => assignee.id === userId);

/** Default board for a new task: the remembered one, else the first board of the user's department. */
export function defaultBoard(boards: TaskBoard[], user: User, preferredId?: string | null): TaskBoard | undefined {
  return boards.find((board) => board.id === preferredId)
    ?? boards.find((board) => board.departmentId && board.departmentId === user.departmentId)
    ?? boards[0];
}

/** "на 1 доске", "на 3 досках". */
export const onBoards = (count: number) => `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'доске' : 'досках'}`;

const boardKey = (userId: string) => `atlas.tasks.board.${userId}`;

export function rememberedBoard(userId: string): string | null {
  try { return localStorage.getItem(boardKey(userId)); } catch { return null; }
}

export function rememberBoard(userId: string, boardId: string): void {
  try { localStorage.setItem(boardKey(userId), boardId); } catch { /* selection is a convenience only */ }
}
