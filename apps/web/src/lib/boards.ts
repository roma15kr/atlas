import type { KindOptions, StageRecords } from '../components/stageSettings';
import i18n, { localeOf } from '../i18n';
import type { TaskBoard, TaskCategory, TaskStage, User, WorkTask } from '../types';

/** Counted words of the task screens, in the interface language. */
export const countTasks = (count: number) => i18n.t('tasks:count.tasks', { count });
export const countStages = (count: number) => i18n.t('tasks:count.stages', { count });
export const countBoards = (count: number) => i18n.t('tasks:count.boards', { count });
/** How the stage editor names tasks: «3 задачи», none of them, moving them. */
export const taskRecords = (): StageRecords => ({ count: countTasks, none: i18n.t('tasks:count.tasksNone'), move: i18n.t('tasks:count.tasksMove') });

const category = (key: TaskCategory, tone: KindOptions<TaskCategory>[TaskCategory]['tone']) => ({
  get label() { return i18n.t(`tasks:categories.${key}.label`); },
  tone,
  get hint() { return i18n.t(`tasks:categories.${key}.hint`); },
});
/** Task stage categories; labels and hints follow the interface language. */
export const categories: KindOptions<TaskCategory> = { TODO: category('TODO', 'neutral'), ACTIVE: category('ACTIVE', 'info'), DONE: category('DONE', 'success') };

export const categoryOrder: TaskCategory[] = ['TODO', 'ACTIVE', 'DONE'];

export const priorityLabels: Record<WorkTask['priority'], string> = {
  get HIGH() { return i18n.t('tasks:priority.HIGH'); },
  get NORMAL() { return i18n.t('tasks:priority.NORMAL'); },
  get LOW() { return i18n.t('tasks:priority.LOW'); },
};

/** Director boards have no department and are listed under «Керівництво» (in the interface language). */
export const boardGroupName = (board: Pick<TaskBoard, 'departmentName'>) => board.departmentName ?? i18n.t('tasks:board.leadership');

export function groupBoards(boards: TaskBoard[]): Array<{ label: string; boards: TaskBoard[] }> {
  const groups = new Map<string, TaskBoard[]>();
  for (const board of boards) groups.set(boardGroupName(board), [...(groups.get(boardGroupName(board)) ?? []), board]);
  return [...groups.entries()].map(([label, items]) => ({ label, boards: [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, localeOf())) }));
}

export const orderedStages = (board: Pick<TaskBoard, 'stages'>): TaskStage[] => [...board.stages].sort((a, b) => a.sortOrder - b.sortOrder);

/** A drop into a category column lands in the first stage of that category on the task's own board. */
export const firstStageOf = (board: Pick<TaskBoard, 'stages'> | undefined, category: TaskCategory): TaskStage | undefined =>
  board ? orderedStages(board).find((stage) => stage.category === category) : undefined;

export const isOverdue = (task: WorkTask) => task.stage.category !== 'DONE' && Boolean(task.dueAt) && new Date(task.dueAt).getTime() < Date.now();

/** Someone other than the author and directors works on the task: then it belongs on the board (as the server decides). */
export const involvesColleagues = (authorId: string, assigneeIds: string[], people: Array<{ id: string; role?: string }>) =>
  assigneeIds.some((id) => id !== authorId && people.find((person) => person.id === id)?.role !== 'DIRECTOR');

export const isAssignedTo = (task: WorkTask, userId: string) => task.assignees.some((assignee) => assignee.id === userId);

/** Default board for a new task: the remembered one, else the first board of the user's department. */
export function defaultBoard(boards: TaskBoard[], user: User, preferredId?: string | null): TaskBoard | undefined {
  return boards.find((board) => board.id === preferredId)
    ?? boards.find((board) => board.departmentId && board.departmentId === user.departmentId)
    ?? boards[0];
}

/** «на 1 дошці», «on 3 boards». */
export const onBoards = (count: number) => i18n.t('tasks:count.onBoards', { count });

const boardKey = (userId: string) => `atlas.tasks.board.${userId}`;

export function rememberedBoard(userId: string): string | null {
  try { return localStorage.getItem(boardKey(userId)); } catch { return null; }
}

export function rememberBoard(userId: string, boardId: string): void {
  try { localStorage.setItem(boardKey(userId), boardId); } catch { /* selection is a convenience only */ }
}
