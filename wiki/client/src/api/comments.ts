import { apiClient } from './client';
import type { Comment } from '../types';

export const commentsApi = {
  getAll: (pageId: string) =>
    apiClient.get<Comment[]>(`/pages/${pageId}/comments`).then((r) => r.data),

  create: (pageId: string, data: { body: string; parentId?: string; anchorText?: string }) =>
    apiClient.post<Comment>(`/pages/${pageId}/comments`, data).then((r) => r.data),

  update: (id: string, body: string) =>
    apiClient.put<Comment>(`/comments/${id}`, { body }).then((r) => r.data),

  delete: (id: string) => apiClient.delete(`/comments/${id}`).then((r) => r.data),

  resolve: (id: string) => apiClient.put<Comment>(`/comments/${id}/resolve`).then((r) => r.data),
};
