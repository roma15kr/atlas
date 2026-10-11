import { apiRequest } from './api';

export interface TaskComment { id: string; body: string; createdAt: string; author: { id: string; fullName: string; avatarUrl: string | null } }

/** Characters of Markdown in one task comment (the API limit). */
export const TASK_COMMENT_LIMIT = 5000;

export interface TaskCommentsBackend {
  list(taskId: string): Promise<TaskComment[]>;
  add(taskId: string, body: string): Promise<TaskComment>;
}

export const remoteTaskComments: TaskCommentsBackend = {
  list: (taskId) => apiRequest<TaskComment[]>(`/tasks/${taskId}/comments`),
  add: (taskId, body) => apiRequest<TaskComment>(`/tasks/${taskId}/comments`, { method: 'POST', body: { body } })
};

/** Demo mode keeps comments in memory for the page's lifetime. */
const demoStore = new Map<string, TaskComment[]>();
export const resetDemoTaskComments = () => demoStore.clear();

export function demoTaskComments(author: TaskComment['author']): TaskCommentsBackend {
  return {
    list: async (taskId) => [...(demoStore.get(taskId) ?? [])],
    add: async (taskId, body) => {
      const comment: TaskComment = { id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, body: body.trim(), createdAt: new Date().toISOString(), author };
      demoStore.set(taskId, [...(demoStore.get(taskId) ?? []), comment]);
      return comment;
    }
  };
}
