import { api, ApiError, apiRequest } from './api';
import { attachmentProblem, type ChatAttachment } from './chatAttachments';
import { aggregateReactions, toggleDemoReaction, type Reaction, type ReactionRow } from './reactions';

export interface TaskComment { id: string; body: string; createdAt: string; author: { id: string; fullName: string; avatarUrl: string | null }; reactions?: Reaction[]; attachments?: ChatAttachment[] }

/** Characters of Markdown in one task comment (the API limit). */
export const TASK_COMMENT_LIMIT = 5000;

export interface TaskCommentsBackend {
  list(taskId: string): Promise<TaskComment[]>;
  add(taskId: string, body: string, attachmentIds?: string[]): Promise<TaskComment>;
  /** Uploads one file for a comment about to be posted on this task. */
  uploadAttachment(taskId: string, file: File): Promise<ChatAttachment>;
  downloadAttachment(id: string): Promise<Blob>;
  /** Adds or removes the caller's reaction; resolves the comment's reactions. */
  react(commentId: string, emoji: string, add: boolean): Promise<Reaction[]>;
}

export const remoteTaskComments: TaskCommentsBackend = {
  list: (taskId) => apiRequest<TaskComment[]>(`/tasks/${taskId}/comments`),
  add: (taskId, body, attachmentIds = []) => apiRequest<TaskComment>(`/tasks/${taskId}/comments`, { method: 'POST', body: { body, attachmentIds } }),
  uploadAttachment: (taskId, file) => {
    const form = new FormData();
    form.set('file', file);
    return apiRequest<ChatAttachment>(`/tasks/${taskId}/attachments`, { method: 'POST', body: form });
  },
  downloadAttachment: (id) => api.download(`/tasks/attachments/${id}`),
  react: (commentId, emoji, add) => apiRequest<Reaction[]>(add ? `/tasks/comments/${commentId}/reactions` : `/tasks/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`,
    add ? { method: 'POST', body: { emoji } } : { method: 'DELETE' }),
};

/** Demo mode keeps comments in memory for the page's lifetime. */
const demoStore = new Map<string, TaskComment[]>();
let demoReactions: ReactionRow[] = [];
/** Demo files, kept in memory with the task they were uploaded to and, once posted, their comment. */
let demoFiles: Array<ChatAttachment & { taskId: string; commentId: string | null; blob: Blob }> = [];
export const resetDemoTaskComments = () => { demoStore.clear(); demoReactions = []; demoFiles = []; };
const withFiles = (comment: TaskComment): TaskComment => ({ ...comment, attachments: demoFiles.filter((file) => file.commentId === comment.id).map(({ id, fileName, mimeType, size }) => ({ id, fileName, mimeType, size })) });

export function demoTaskComments(author: TaskComment['author']): TaskCommentsBackend {
  return {
    list: async (taskId) => (demoStore.get(taskId) ?? []).map((comment) => withFiles({ ...comment, reactions: aggregateReactions(demoReactions, comment.id) })),
    add: async (taskId, body, attachmentIds = []) => {
      const files = attachmentIds.map((id) => demoFiles.find((file) => file.id === id && file.taskId === taskId && !file.commentId));
      if (files.some((file) => !file)) throw new ApiError('Файл не прикреплён — загрузите его ещё раз', 400, undefined, 'TASK_INVALID_ATTACHMENT');
      const comment: TaskComment = { id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, body: body.trim(), createdAt: new Date().toISOString(), author };
      files.forEach((file) => { file!.commentId = comment.id; });
      demoStore.set(taskId, [...(demoStore.get(taskId) ?? []), comment]);
      return withFiles(comment);
    },
    uploadAttachment: async (taskId, file) => {
      const problem = attachmentProblem(file);
      if (problem) throw new ApiError(problem, 400, undefined, 'UNSUPPORTED_FILE_TYPE');
      const stored = { id: crypto.randomUUID(), fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, taskId, commentId: null, blob: file };
      demoFiles.push(stored);
      return { id: stored.id, fileName: stored.fileName, mimeType: stored.mimeType, size: stored.size };
    },
    downloadAttachment: async (id) => {
      const file = demoFiles.find((item) => item.id === id);
      if (!file) throw new ApiError('Файл недоступен', 404, undefined, 'ATTACHMENT_NOT_FOUND');
      return file.blob;
    },
    react: async (commentId, emoji, add) => {
      demoReactions = toggleDemoReaction(demoReactions, { targetId: commentId, userId: author.id, fullName: author.fullName, emoji }, add);
      return aggregateReactions(demoReactions, commentId);
    },
  };
}
