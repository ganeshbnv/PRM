import { apiClient } from './client';
import type { Space } from '../types';

export const spacesApi = {
  getAll: () => apiClient.get<Space[]>('/spaces').then((r) => r.data),

  getOne: (key: string) => apiClient.get<Space>(`/spaces/${key}`).then((r) => r.data),

  create: (data: { name: string; key: string; description?: string; iconEmoji?: string; isPrivate?: boolean }) =>
    apiClient.post<Space>('/spaces', data).then((r) => r.data),

  update: (key: string, data: Partial<Space>) =>
    apiClient.put<Space>(`/spaces/${key}`, data).then((r) => r.data),

  delete: (key: string) => apiClient.delete(`/spaces/${key}`).then((r) => r.data),
};
