import { apiRequest } from './api';

export interface ClientComment { id: string; body: string; createdAt: string; author: { id: string; fullName: string } }

/** Characters of Markdown in one client comment (the API limit). */
export const CLIENT_COMMENT_LIMIT = 5000;

export interface ClientCommentsBackend {
  /** Newest first. */
  list(clientId: string): Promise<ClientComment[]>;
  add(clientId: string, body: string): Promise<ClientComment>;
}

export function remoteClientComments(me: ClientComment['author']): ClientCommentsBackend {
  return {
    list: (clientId) => apiRequest<ClientComment[]>(`/clients/${clientId}/comments`),
    // The API answers without the author; it is the caller.
    add: async (clientId, body) => ({ ...(await apiRequest<Omit<ClientComment, 'author'>>(`/clients/${clientId}/comments`, { method: 'POST', body: { body } })), author: me })
  };
}

/** Demo mode keeps comments in memory for the page's lifetime. */
const demoStore = new Map<string, ClientComment[]>();
export const resetDemoClientComments = () => demoStore.clear();

export function demoClientComments(me: ClientComment['author']): ClientCommentsBackend {
  return {
    list: async (clientId) => [...(demoStore.get(clientId) ?? [])],
    add: async (clientId, body) => {
      const comment: ClientComment = { id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, body: body.trim(), createdAt: new Date().toISOString(), author: me };
      demoStore.set(clientId, [comment, ...(demoStore.get(clientId) ?? [])]);
      return comment;
    }
  };
}
