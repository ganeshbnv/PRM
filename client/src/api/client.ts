import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 120_000,
});

client.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('prm-auth');
    if (stored) {
      const { state } = JSON.parse(stored) as { state?: { token?: string } };
      if (state?.token) config.headers.Authorization = `Bearer ${state.token}`;
    }
  } catch { /* ignore */ }
  return config;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('prm-auth');
      window.location.reload();
    }
    const msg = err.response?.data?.error ?? err.message ?? 'Unknown error';
    return Promise.reject(new Error(msg));
  }
);

export default client;

import type {
  WorkItem, SprintStats, GitRepository, GitCommit,
  GitPullRequest, EngineerActivity, BranchSummary, Risk, GlobalFilters,
} from '../types';

type Filters = Partial<GlobalFilters>;

export const api = {
  ping: () => client.get<{ org: string; projectCount: number; projects: string[]; status: string }>('/ping').then((r) => r.data),
  flushCache: () => client.post('/cache/flush').then((r) => r.data),
  getProjects: () => client.get<{ id: string; name: string }[]>('/projects').then((r) => r.data),
  getTeams: (project: string) => client.get<{ id: string; name: string }[]>('/boards/teams', { params: { project } }).then((r) => r.data),

  // Boards — all require project param
  getWorkItems: (f: Filters & { team?: string }) =>
    client.get<WorkItem[]>('/boards/workitems', { params: f }).then((r) => r.data),
  getWorkItem: (project: string, id: number) =>
    client.get<WorkItem>(`/boards/workitems/${id}`, { params: { project } }).then((r) => r.data),
  getSprintStats: (project: string, team?: string) =>
    client.get<SprintStats[]>('/boards/sprint-stats', { params: { project, team } }).then((r) => r.data),

  // Repos
  getRepos: (project: string) =>
    client.get<GitRepository[]>('/repos', { params: { project } }).then((r) => r.data),
  getAllCommits: (f: Filters) =>
    client.get<GitCommit[]>('/repos/commits/all', { params: f }).then((r) => r.data),
  getAllPRs: (project: string, status = 'all') =>
    client.get<GitPullRequest[]>('/repos/prs/all', { params: { project, status } }).then((r) => r.data),

  // Wiki
  getWikiStats: (project: string) =>
    client.get('/wiki/stats', { params: { project } }).then((r) => r.data),

  // Pipelines
  getPipelineStats: (project: string) =>
    client.get('/pipelines/stats', { params: { project } }).then((r) => r.data),

  // Engineers
  getEngineerActivity: (f: Filters) =>
    client.get<EngineerActivity[]>('/engineers/activity', { params: f }).then((r) => r.data),
  getBranchSummaries: (project: string) =>
    client.get<BranchSummary[]>('/repos/branches/summaries', { params: { project } }).then((r) => r.data),

  // AI Insights (sprint boards)
  getAiInsights: (project: string, team: string, iterationPath?: string) =>
    client.get('/boards/ai-insights', { params: { project, team, iterationPath } }).then((r) => r.data),

  // AI Section Analysis (bugs / engineers / repos / risks / wiki)
  getAiAnalysis: (section: string, project: string) =>
    client.get<{ section: string; summary: string; keyFindings: string[]; recommendations: string[]; generatedAt: string; fromCache?: boolean }>(
      '/ai/analyze', { params: { section, project } }
    ).then((r) => r.data),

  // Risks
  getRisks: (project: string, thresholds: Record<string, number> = {}) =>
    client.get<Risk[]>('/risks', { params: { project, ...thresholds } }).then((r) => r.data),

  // Audit log (admin only)
  getAuditLog: (params: {
    limit?: number; offset?: number; userId?: string; action?: string;
    section?: string; fromTs?: string; toTs?: string; search?: string;
  }) => client.get<{ entries: AuditEntry[]; total: number }>('/audit', { params }).then((r) => r.data),
  getAuditStats: () => client.get<AuditStats>('/audit/stats').then((r) => r.data),

  // Auth
  getMe: () => client.get<{ id: string; email: string; name: string; role: 'user' | 'admin'; createdAt: string }>('/auth/me').then((r) => r.data),

  // User management (admin only)
  getUsers: () => client.get<ManagedUser[]>('/users').then((r) => r.data),
  inviteUser: (email: string, name: string) =>
    client.post<{ user: ManagedUser; tempPassword: string }>('/users/invite', { email, name }).then((r) => r.data),
  updateUserRole: (id: string, role: 'user' | 'admin') =>
    client.patch<ManagedUser>(`/users/${id}/role`, { role }).then((r) => r.data),
  deleteUser: (id: string) =>
    client.delete<{ ok: boolean }>(`/users/${id}`).then((r) => r.data),
};

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  ts: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  section: string;
  resource: string;
  ip: string;
  userAgent: string;
  status: number;
  detail?: string;
}

export interface AuditStats {
  total: number;
  todayCount: number;
  activeUsers: number;
  loginsFailed: number;
  loginsToday: number;
  sectionCounts: Record<string, number>;
  topUsers: { email: string; name: string; count: number; lastSeen: string }[];
  lastEntry: string | null;
}
