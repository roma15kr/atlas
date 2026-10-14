import { apiRequest, sessionStore } from './api';
import type { User } from '../types';

export interface DepartmentSummary { id: string; name: string; parentId: string | null; head: { id: string; fullName: string } | null; memberCount: number }

export interface DepartmentsBackend {
  list(): Promise<DepartmentSummary[]>;
  setParent(id: string, parentId: string | null): Promise<DepartmentSummary>;
}

export const remoteDepartments: DepartmentsBackend = {
  list: () => apiRequest<DepartmentSummary[]>('/departments'),
  setParent: (id, parentId) => apiRequest<DepartmentSummary>(`/departments/${id}`, { method: 'PATCH', body: { parentId } })
};

/** Demo mode builds departments from the demo team and keeps parents in memory. */
const demoParents = new Map<string, string | null>();
export const resetDemoDepartments = () => demoParents.clear();

export function demoDepartments(users: User[]): DepartmentsBackend {
  const build = (): DepartmentSummary[] => {
    const byId = new Map<string, DepartmentSummary>();
    for (const user of users) {
      if (!user.departmentId) continue;
      const row = byId.get(user.departmentId) ?? { id: user.departmentId, name: user.department, parentId: demoParents.get(user.departmentId) ?? null, head: null, memberCount: 0 };
      row.memberCount += 1;
      if (user.role === 'MANAGER' && !row.head) row.head = { id: user.id, fullName: user.fullName };
      byId.set(user.departmentId, row);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  };
  return {
    list: async () => build(),
    setParent: async (id, parentId) => {
      demoParents.set(id, parentId);
      return build().find((row) => row.id === id)!;
    }
  };
}

export const departmentsBackend = (users: User[]): DepartmentsBackend =>
  sessionStore.get()?.accessToken.startsWith('demo-') ? demoDepartments(users) : remoteDepartments;

/** Parents a department may get: none if it has sub-departments; otherwise any top-level department but itself. */
export function parentOptions(departments: DepartmentSummary[], id: string): DepartmentSummary[] {
  if (departments.some((row) => row.parentId === id)) return [];
  return departments.filter((row) => row.id !== id && !row.parentId);
}
