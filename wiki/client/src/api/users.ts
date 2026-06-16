import { apiClient } from './client';

export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export const usersApi = {
  search: (q: string) =>
    apiClient.get<UserSearchResult[]>('/users/search', { params: { q } }).then((r) => r.data),
};
