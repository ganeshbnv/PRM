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

// ── All-branch commit fetch ────────────────────────────────────────────────────
//
// Strategy:
//   1. For each repo, enumerate all branches.
//   2. For each branch, query the commits API with itemVersion.version=<branch>
//      + date range filter → returns full GitCommit objects.
//   3. Also query default branch (no itemVersion) to catch commits not on any
//      named branch ref.
//   4. Deduplicate by commitId across all repos and branches.
//
// This catches commits on feature branches, hotfix branches, and main.

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

  const dateParams: Record<string, unknown> = { 'api-version': V };
  if (fromDate) dateParams['searchCriteria.fromDate'] = isoDate(fromDate);
  if (toDate)   dateParams['searchCriteria.toDate']   = isoDate(toDate, true);

  await Promise.all(repos.map(async (repo) => {
    try {
      const branches = await getBranches(project, repo.id);

      // Build list of queries: one per branch + one without itemVersion (default branch)
      type BranchQuery = { name: string; params: Record<string, unknown> };
      const queries: BranchQuery[] = [];

      // Default-branch query (no itemVersion) — catches anything not under named refs
      queries.push({ name: '_default', params: { ...dateParams } });

      // Per-branch queries
      for (const branch of branches) {
        const shortName = branch.name.replace(/^refs\/heads\//, '');
        queries.push({
          name: shortName,
          params: {
            ...dateParams,
            'searchCriteria.itemVersion.version': shortName,
            'searchCriteria.itemVersion.versionType': 'branch',
          },
        });
      }

      await Promise.all(queries.map(async (q) => {
        const cacheKey = `commits:br2:${project}:${repo.id}:${q.name}:${fromDate ?? ''}:${toDate ?? ''}`;
        try {
          const commits = await cache.cached(cacheKey, () =>
            ado.getAll<GitCommit>(ado.p(project).commits(repo.id), q.params)
          );
          for (const c of commits) {
            if (c?.commitId && !seen.has(c.commitId)) {
              seen.add(c.commitId);
              results.push({ ...c, repoId: repo.id, repoName: repo.name });
            }
          }
        } catch (branchErr) {
          console.error(`[repos] branch "${q.name}" in "${repo.name}":`, (branchErr as Error).message);
        }
      }));

    } catch (err) {
      console.error(`[repos] getAllCommits: skipping "${repo.name}" —`, (err as Error).message);
    }
  }));

  console.log(`[repos] getAllCommits: ${results.length} commits from ${repos.length} repos (${fromDate ?? '*'} → ${toDate ?? '*'})`);
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
