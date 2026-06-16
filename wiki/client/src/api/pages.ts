import { apiClient } from './client';
import type { Page, PageAccessEntry, PageTreeNode, PageVersion, SearchResult } from '../types';

export const pagesApi = {
  getTree: (spaceKey: string) =>
    apiClient.get<PageTreeNode[]>(`/spaces/${spaceKey}/pages`).then((r) => r.data),

  create: (spaceKey: string, data: { parentId?: string; title?: string; content?: string }) =>
    apiClient.post<Page>(`/spaces/${spaceKey}/pages`, data).then((r) => r.data),

  getOne: (id: string) => apiClient.get<Page>(`/pages/${id}`).then((r) => r.data),

  update: (id: string, data: Partial<Pick<Page, 'title' | 'content' | 'status' | 'emoji' | 'isPrivate'> & { parentId?: string }>) =>
    apiClient.put<Page>(`/pages/${id}`, data).then((r) => r.data),

  delete: (id: string) => apiClient.delete(`/pages/${id}`).then((r) => r.data),

  rename: (id: string, title: string) =>
    apiClient.put<Page>(`/pages/${id}`, { title }).then((r) => r.data),

  recent: () => apiClient.get<(Page & { viewedAt: string })[]>('/pages/recent').then((r) => r.data),

  getVersions: (id: string) =>
    apiClient.get<PageVersion[]>(`/pages/${id}/versions`).then((r) => r.data),

  getVersion: (id: string, version: number) =>
    apiClient.get<PageVersion>(`/pages/${id}/versions/${version}`).then((r) => r.data),

  search: (q: string, spaceId?: string) =>
    apiClient
      .get<SearchResult[]>('/search', { params: { q, ...(spaceId ? { spaceId } : {}) } })
      .then((r) => r.data),

  getAccess: (id: string) =>
    apiClient.get<PageAccessEntry[]>(`/pages/${id}/access`).then((r) => r.data),

  grantAccess: (id: string, userId: string) =>
    apiClient.post<PageAccessEntry>(`/pages/${id}/access`, { userId }).then((r) => r.data),

  revokeAccess: (id: string, userId: string) =>
    apiClient.delete(`/pages/${id}/access/${userId}`).then((r) => r.data),
};
