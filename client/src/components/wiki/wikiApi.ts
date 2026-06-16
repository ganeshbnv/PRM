import axios from 'axios';

export const wikiClient = axios.create({ baseURL: '/wiki-api' });

wikiClient.interceptors.request.use((config) => {
  const stored = localStorage.getItem('wiki-auth');
  if (stored) {
    try {
      const { accessToken } = JSON.parse(stored) as { accessToken?: string };
      if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
    } catch { /* ignore */ }
  }
  return config;
});

let refreshing = false;
wikiClient.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err?.response?.status === 401 && !refreshing) {
      refreshing = true;
      try {
        const stored = localStorage.getItem('wiki-auth');
        const { refreshToken } = stored ? (JSON.parse(stored) as { refreshToken?: string }) : {};
        if (refreshToken) {
          const { data } = await axios.post('/wiki-api/auth/refresh', { refreshToken });
          const parsed = stored ? JSON.parse(stored) : {};
          parsed.accessToken = (data as { accessToken: string }).accessToken;
          localStorage.setItem('wiki-auth', JSON.stringify(parsed));
        }
      } catch {
        localStorage.removeItem('wiki-auth');
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export interface WUser { id: string; name: string; email: string; avatarUrl?: string }
export interface WSpace { id: string; name: string; key: string; description?: string; iconEmoji: string; isPrivate: boolean; _count?: { pages: number } }
export interface WPageNode { id: string; title: string; emoji: string; parentId: string | null; position: number; children: WPageNode[] }
export interface WPage { id: string; title: string; content: string; emoji: string; status: string; createdAt: string; updatedAt: string; spaceId: string; parentId?: string; creator: Pick<WUser, 'id' | 'name' | 'avatarUrl'>; space?: Pick<WSpace, 'id' | 'name' | 'key'> }
export interface WComment { id: string; body: string; isResolved: boolean; createdAt: string; author: Pick<WUser, 'id' | 'name' | 'avatarUrl'>; replies?: WComment[] }
export interface WVersion { id: string; version: number; title: string; comment?: string; createdAt: string; author: Pick<WUser, 'id' | 'name'> }
export interface WVersionDetail extends WVersion { content: string }
export interface WAttachment { id: string; filename: string; storedName: string; mimeType: string; size: number; createdAt: string; uploader: Pick<WUser, 'id' | 'name'> }

export const wikiAuth = {
  login: (email: string, password: string) =>
    wikiClient.post<{ user: WUser; tokens: { accessToken: string; refreshToken: string } }>('/auth/login', { email, password }).then(r => r.data),
  register: (email: string, name: string, password: string) =>
    wikiClient.post<{ user: WUser; tokens: { accessToken: string; refreshToken: string } }>('/auth/register', { email, name, password }).then(r => r.data),
  me: () => wikiClient.get<WUser>('/auth/me').then(r => r.data),
};

export const wikiSpaces = {
  list: () => wikiClient.get<WSpace[]>('/spaces').then(r => r.data),
  create: (data: { name: string; key: string; description?: string; iconEmoji?: string }) =>
    wikiClient.post<WSpace>('/spaces', data).then(r => r.data),
};

export const wikiPages = {
  tree: (spaceKey: string) => wikiClient.get<WPageNode[]>(`/spaces/${spaceKey}/pages`).then(r => r.data),
  get: (id: string) => wikiClient.get<WPage>(`/pages/${id}`).then(r => r.data),
  create: (spaceKey: string, data: { parentId?: string; title?: string }) =>
    wikiClient.post<WPage>(`/spaces/${spaceKey}/pages`, data).then(r => r.data),
  update: (id: string, data: Partial<Pick<WPage, 'title' | 'content' | 'status' | 'emoji'>>) =>
    wikiClient.put<WPage>(`/pages/${id}`, data).then(r => r.data),
  delete: (id: string) => wikiClient.delete(`/pages/${id}`).then(r => r.data),
  move: (id: string, parentId: string | null, position: number) =>
    wikiClient.patch(`/pages/${id}/move`, { parentId, position }).then(r => r.data),
  versions: (id: string) => wikiClient.get<WVersion[]>(`/pages/${id}/versions`).then(r => r.data),
  version: (id: string, v: number) => wikiClient.get<WVersionDetail>(`/pages/${id}/versions/${v}`).then(r => r.data),
};

export const wikiAttachments = {
  list: (pageId: string) => wikiClient.get<WAttachment[]>(`/pages/${pageId}/attachments`).then(r => r.data),
  upload: (pageId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return wikiClient.post<WAttachment>(`/pages/${pageId}/attachments`, form).then(r => r.data);
  },
  delete: (id: string) => wikiClient.delete(`/attachments/${id}`).then(r => r.data),
};

export const wikiComments = {
  list: (pageId: string) => wikiClient.get<WComment[]>(`/pages/${pageId}/comments`).then(r => r.data),
  create: (pageId: string, body: string, parentId?: string) =>
    wikiClient.post<WComment>(`/pages/${pageId}/comments`, { body, parentId }).then(r => r.data),
  resolve: (id: string) => wikiClient.put(`/comments/${id}/resolve`).then(r => r.data),
  delete: (id: string) => wikiClient.delete(`/comments/${id}`).then(r => r.data),
};

export function getWikiAuth() {
  try {
    return localStorage.getItem('wiki-auth')
      ? (JSON.parse(localStorage.getItem('wiki-auth')!) as { accessToken?: string; refreshToken?: string; user?: WUser })
      : null;
  } catch { return null; }
}

export function setWikiAuth(tokens: { accessToken: string; refreshToken: string }, user: WUser) {
  localStorage.setItem('wiki-auth', JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user }));
}

export function clearWikiAuth() {
  localStorage.removeItem('wiki-auth');
}
