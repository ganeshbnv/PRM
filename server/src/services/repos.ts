import * as ado from './adoClient';
import * as cache from './cache';
import type { GitRepository, GitCommit, GitPullRequest, GitBranch } from '../models/ado';

const V = ado.API_VERSION;

export async function getRepositories(project: string): Promise<GitRepository[]> {
  return cache.cached(`repos:${project}`, () =>
    ado.getAll<GitRepository>(ado.p(project).repos, { 'api-version': V })
  );
}

// ── Single-repo commit fetch (used by per-repo routes and debug endpoint) ─────

export interface CommitFilters {
  project: string;
  repoId: string;
  fromDate?: string;
  toDate?: string;
  author?: string;
  branchName?: string;
  top?: number;
}

export async function getCommits(filters: CommitFilters): Promise<GitCommit[]> {
  const cacheKey = `commits:${JSON.stringify(filters)}`;
  return cache.cached(cacheKey, () => {
    const params: Record<string, unknown> = { 'api-version': V };
    if (filters.fromDate) params['searchCriteria.fromDate'] = filters.fromDate;
    if (filters.toDate)   params['searchCriteria.toDate']   = filters.toDate;
    if (filters.author)   params['searchCriteria.author']   = filters.author;
    if (filters.top)      params['searchCriteria.$top']     = filters.top;
    if (filters.branchName) {
      params['searchCriteria.itemVersion.version']     = filters.branchName;
      params['searchCriteria.itemVersion.versionType'] = 'branch';
    }
    return ado.getAll<GitCommit>(ado.p(filters.project).commits(filters.repoId), params);
  });
}

// ── Push-based all-branch commit fetch ────────────────────────────────────────
//
// ADO's commit API with itemVersion only queries ONE branch at a time.
// The pushes API covers ALL branches — every push to any ref is recorded with
// the full commit objects (author.date, committer.date, changeCounts).
// We filter by push date (searchCriteria.fromDate/toDate) so we get 90 days
// of pushes across all branches, then deduplicate commits by commitId.

interface GitPush {
  pushId: number;
  date: string;
  pushedBy: { displayName: string; uniqueName: string };
  commits: GitCommit[];
  refUpdates?: { name: string; oldObjectId: string; newObjectId: string }[];
}

function isoDate(d: string, endOfDay = false): string {
  // Ensure ADO receives a full ISO-8601 datetime, not a bare yyyy-MM-dd
  if (d.includes('T')) return d;
  return endOfDay ? `${d}T23:59:59Z` : `${d}T00:00:00Z`;
}

export async function getAllCommits(
  project: string, fromDate?: string, toDate?: string
): Promise<Array<GitCommit & { repoId: string; repoName: string }>> {
  const repos = await getRepositories(project);
  const seen    = new Set<string>();
  const results: Array<GitCommit & { repoId: string; repoName: string }> = [];

  await Promise.all(repos.map(async (repo) => {
    try {
      const params: Record<string, unknown> = { 'api-version': V };
      if (fromDate) params['searchCriteria.fromDate'] = isoDate(fromDate);
      if (toDate)   params['searchCriteria.toDate']   = isoDate(toDate, true);

      const cacheKey = `pushes:v2:${project}:${repo.id}:${fromDate ?? ''}:${toDate ?? ''}`;
      const pushes = await cache.cached(cacheKey, () =>
        ado.getAll<GitPush>(
          `/${project}/_apis/git/repositories/${repo.id}/pushes`,
          params
        )
      );

      for (const push of pushes) {
        for (const c of (push.commits ?? [])) {
          if (c?.commitId && !seen.has(c.commitId)) {
            seen.add(c.commitId);
            results.push({ ...c, repoId: repo.id, repoName: repo.name });
          }
        }
      }
    } catch (err) {
      // One inaccessible repo should not break the entire request
      console.error(`[repos] getAllCommits: skipping repo "${repo.name}" —`, (err as Error).message);
    }
  }));

  return results;
}

// ── Pull requests ─────────────────────────────────────────────────────────────

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

// ── Branches ──────────────────────────────────────────────────────────────────

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
