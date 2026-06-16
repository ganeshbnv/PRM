import { apiClient } from './client';
import type { AuthResponse, User } from '../types';

export const authApi = {
  register: (email: string, name: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/register', { email, name, password }).then((r) => r.data),

  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data),

  logout: () => apiClient.post('/auth/logout').then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient.post<{ accessToken: string }>('/auth/refresh', { refreshToken }).then((r) => r.data),

  me: () => apiClient.get<User>('/auth/me').then((r) => r.data),
};
