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

// ── All-branch commit fetch via push IDs ──────────────────────────────────────
//
// Strategy:
//   1. Pushes API (date-filtered) → push IDs covering ALL branches, all refs.
//      The pushes list only contains {pushId, date, pushedBy, refUpdates} —
//      commit entries are REFERENCES (commitId + url only, no author/comment).
//   2. For each push, re-query the commits API with searchCriteria.pushId —
//      this returns FULL GitCommit objects (author.date, changeCounts, etc.).
//   3. Deduplicate by commitId across repos and pushes.
//
// This is the only reliable way to get full commit data from all branches.

interface GitPushRef {
  pushId: number;
  date: string;
  pushedBy: { displayName: string; uniqueName: string };
}

function isoDate(d: string, endOfDay = false): string {
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
      // Step 1 — get push list (all branches, date-filtered by push date)
      const pushParams: Record<string, unknown> = { 'api-version': V };
      if (fromDate) pushParams['searchCriteria.fromDate'] = isoDate(fromDate);
      if (toDate)   pushParams['searchCriteria.toDate']   = isoDate(toDate, true);

      const pushCacheKey = `pushes:v3:${project}:${repo.id}:${fromDate ?? ''}:${toDate ?? ''}`;
      const pushes = await cache.cached(pushCacheKey, () =>
        ado.getAll<GitPushRef>(
          `/${project}/_apis/git/repositories/${repo.id}/pushes`,
          pushParams
        )
      );

      // Step 2 — fetch full commits per push in parallel
      await Promise.all(pushes.map(async (push) => {
        try {
          const commitCacheKey = `commits:push:${project}:${repo.id}:${push.pushId}`;
          const commits = await cache.cached(commitCacheKey, () =>
            ado.getAll<GitCommit>(
              ado.p(project).commits(repo.id),
              { 'api-version': V, 'searchCriteria.pushId': push.pushId }
            )
          );

          for (const c of commits) {
            if (c?.commitId && !seen.has(c.commitId)) {
              seen.add(c.commitId);
              results.push({ ...c, repoId: repo.id, repoName: repo.name });
            }
          }
        } catch (pushErr) {
          console.error(`[repos] push ${push.pushId} in "${repo.name}":`, (pushErr as Error).message);
        }
      }));

    } catch (err) {
      console.error(`[repos] getAllCommits: skipping "${repo.name}" —`, (err as Error).message);
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
