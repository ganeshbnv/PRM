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
  GitPullRequest, EngineerActivity, Risk, GlobalFilters,
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

  // AI Insights
  getAiInsights: (project: string, team: string, iterationPath?: string) =>
    client.get('/boards/ai-insights', { params: { project, team, iterationPath } }).then((r) => r.data),

  // Risks
  getRisks: (project: string, thresholds: Record<string, number> = {}) =>
    client.get<Risk[]>('/risks', { params: { project, ...thresholds } }).then((r) => r.data),
};
