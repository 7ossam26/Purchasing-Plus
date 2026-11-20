import { api, ApiError } from './client.js';

export interface SessionProfile {
  user: { id: number; name: string; username: string };
  roleName: string | null;
  roleId: number | null;
  isSuperadmin: boolean;
  siteScope: 'ALL' | 'ASSIGNED';
  sites: { id: number; name: string; isActive: boolean }[];
  permissions: string[];
}
export const authApi = {
  async me(signal?: AbortSignal): Promise<SessionProfile | null> {
    try {
      return await api<SessionProfile>('/me', { signal });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  login: (body: { username: string; password: string }) =>
    api<void>('/auth/login', { method: 'POST', body }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api<void>('/me/password', { method: 'POST', body }),
};
