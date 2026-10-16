import { apiRequest } from './api';
import { aggregateReactions, toggleDemoReaction, type Reaction, type ReactionRow } from './reactions';

export interface TaskComment { id: string; body: string; createdAt: string; author: { id: string; fullName: string; avatarUrl: string | null }; reactions?: Reaction[] }

/** Characters of Markdown in one task comment (the API limit). */
export const TASK_COMMENT_LIMIT = 5000;

export interface TaskCommentsBackend {
  list(taskId: string): Promise<TaskComment[]>;
  add(taskId: string, body: string): Promise<TaskComment>;
  /** Adds or removes the caller's reaction; resolves the comment's reactions. */
  react(commentId: string, emoji: string, add: boolean): Promise<Reaction[]>;
}

export const remoteTaskComments: TaskCommentsBackend = {
  list: (taskId) => apiRequest<TaskComment[]>(`/tasks/${taskId}/comments`),
  add: (taskId, body) => apiRequest<TaskComment>(`/tasks/${taskId}/comments`, { method: 'POST', body: { body } }),
  react: (commentId, emoji, add) => apiRequest<Reaction[]>(add ? `/tasks/comments/${commentId}/reactions` : `/tasks/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`,
    add ? { method: 'POST', body: { emoji } } : { method: 'DELETE' }),
};

/** Demo mode keeps comments in memory for the page's lifetime. */
const demoStore = new Map<string, TaskComment[]>();
let demoReactions: ReactionRow[] = [];
export const resetDemoTaskComments = () => { demoStore.clear(); demoReactions = []; };

export function demoTaskComments(author: TaskComment['author']): TaskCommentsBackend {
  return {
    list: async (taskId) => (demoStore.get(taskId) ?? []).map((comment) => ({ ...comment, reactions: aggregateReactions(demoReactions, comment.id) })),
    add: async (taskId, body) => {
      const comment: TaskComment = { id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, body: body.trim(), createdAt: new Date().toISOString(), author };
      demoStore.set(taskId, [...(demoStore.get(taskId) ?? []), comment]);
      return comment;
    },
    react: async (commentId, emoji, add) => {
      demoReactions = toggleDemoReaction(demoReactions, { targetId: commentId, userId: author.id, fullName: author.fullName, emoji }, add);
      return aggregateReactions(demoReactions, commentId);
    },
  };
}
