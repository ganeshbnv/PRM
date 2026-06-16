import * as ado from './adoClient';
import * as cache from './cache';
import type { GitRepository, GitCommit, GitPullRequest, GitBranch } from '../models/ado';

const V = ado.API_VERSION;

export async function getRepositories(project: string): Promise<GitRepository[]> {
  return cache.cached(`repos:${project}`, () =>
    ado.getAll<GitRepository>(ado.p(project).repos, { 'api-version': V })
  );
}

export interface CommitFilters {
  project: string;
  repoId: string;
  fromDate?: string;
  toDate?: string;
  author?: string;
  top?: number;
}

export async function getCommits(filters: CommitFilters): Promise<GitCommit[]> {
  const cacheKey = `commits:${JSON.stringify(filters)}`;
  return cache.cached(cacheKey, () => {
    const params: Record<string, unknown> = { 'api-version': V };
    if (filters.fromDate) params['searchCriteria.fromDate'] = filters.fromDate;
    if (filters.toDate) params['searchCriteria.toDate'] = filters.toDate;
    if (filters.author) params['searchCriteria.author'] = filters.author;
    if (filters.top) params['searchCriteria.$top'] = filters.top;
    return ado.getAll<GitCommit>(ado.p(filters.project).commits(filters.repoId), params);
  });
}

export async function getAllCommits(
  project: string, fromDate?: string, toDate?: string
): Promise<Array<GitCommit & { repoId: string; repoName: string }>> {
  const repos = await getRepositories(project);
  const results: Array<GitCommit & { repoId: string; repoName: string }> = [];
  for (const repo of repos) {
    const commits = await getCommits({ project, repoId: repo.id, fromDate, toDate, top: 500 });
    results.push(...commits.map((c) => ({ ...c, repoId: repo.id, repoName: repo.name })));
  }
  return results;
}

export interface PrFilters {
  project: string;
  repoId: string;
  status?: 'active' | 'abandoned' | 'completed' | 'all';
}

export async function getPullRequests(filters: PrFilters): Promise<GitPullRequest[]> {
  const cacheKey = `prs:${JSON.stringify(filters)}`;
  return cache.cached(cacheKey, () => {
    const params: Record<string, unknown> = {
      'api-version': V,
      'searchCriteria.status': filters.status ?? 'all',
    };
    return ado.getAll<GitPullRequest>(ado.p(filters.project).pullRequests(filters.repoId), params);
  });
}

export async function getAllPullRequests(
  project: string, status: 'active' | 'completed' | 'all' = 'all'
): Promise<Array<GitPullRequest & { repoName: string }>> {
  const repos = await getRepositories(project);
  const results: Array<GitPullRequest & { repoName: string }> = [];
  for (const repo of repos) {
    const prs = await getPullRequests({ project, repoId: repo.id, status });
    results.push(...prs.map((pr) => ({ ...pr, repoName: repo.name })));
  }
  return results;
}

export async function getBranches(project: string, repoId: string): Promise<GitBranch[]> {
  return cache.cached(`branches:${project}:${repoId}`, () =>
    ado.getAll<GitBranch>(ado.p(project).branches(repoId), { 'api-version': V, filter: 'heads/' })
  );
}

export async function getAllBranches(project: string): Promise<Array<GitBranch & { repoId: string; repoName: string }>> {
  const repos = await getRepositories(project);
  const results: Array<GitBranch & { repoId: string; repoName: string }> = [];
  for (const repo of repos) {
    const branches = await getBranches(project, repo.id);
    results.push(...branches.map((b) => ({ ...b, repoId: repo.id, repoName: repo.name })));
  }
  return results;
}
