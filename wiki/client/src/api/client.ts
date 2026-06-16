import axios, { AxiosError } from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const stored = localStorage.getItem('wiki-auth');
  if (stored) {
    try {
      const { accessToken } = JSON.parse(stored) as { accessToken?: string };
      if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
    } catch {
      // ignore
    }
  }
  return config;
});

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config;
    if (error.response?.status !== 401 || !original) return Promise.reject(error);

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(apiClient(original));
        });
      });
    }

    isRefreshing = true;
    try {
      const stored = localStorage.getItem('wiki-auth');
      const { refreshToken } = stored ? (JSON.parse(stored) as { refreshToken?: string }) : {};
      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await axios.post<{ accessToken: string }>(
        `${import.meta.env.VITE_API_URL ?? '/api'}/auth/refresh`,
        { refreshToken }
      );

      const parsed = stored ? (JSON.parse(stored) as Record<string, unknown>) : {};
      parsed.accessToken = data.accessToken;
      localStorage.setItem('wiki-auth', JSON.stringify(parsed));

      refreshQueue.forEach((cb) => cb(data.accessToken));
      refreshQueue = [];

      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(original);
    } catch {
      localStorage.removeItem('wiki-auth');
      window.location.href = '/login';
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);
