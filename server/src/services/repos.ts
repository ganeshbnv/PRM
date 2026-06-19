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
// Strategy: for every branch in every repo, fetch commits with
//   searchCriteria.itemVersion.version=<branch> + date range.
// $top=5000 overrides the 100-commit default so high-activity branches
// are fully covered. Skip-based pagination handles repos > 5000 commits.
// All results are deduplicated by commitId.

function isoDate(d: string, endOfDay = false): string {
  if (d.includes('T')) return d;
  return endOfDay ? `${d}T23:59:59Z` : `${d}T00:00:00Z`;
}

const COMMIT_PAGE = 5000;

async function fetchAllCommitsForBranch(
  project: string,
  repoId: string,
  baseParams: Record<string, unknown>
): Promise<GitCommit[]> {
  const all: GitCommit[] = [];
  let skip = 0;

  while (true) {
    const params = { ...baseParams, 'searchCriteria.$top': COMMIT_PAGE, 'searchCriteria.$skip': skip };
    const resp = await ado.getAll<GitCommit>(ado.p(project).commits(repoId), params);
    all.push(...resp);
    if (resp.length < COMMIT_PAGE) break;   // last page
    skip += COMMIT_PAGE;
  }

  return all;
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
      console.log(`[repos] "${repo.name}": ${branches.length} branches`);

      // One query per branch — each returns commits reachable from that branch tip
      // within the date window. Dedup by commitId handles overlap with main.
      const branchQueries = branches.map(b => ({
        branchRef: b.name,
        shortName: b.name.replace(/^refs\/heads\//, ''),
      }));

      // Always include a "no-itemVersion" pass that hits the repo default branch
      // in case any branch ref is missing from the list.
      const allQueries = [
        { branchRef: '_default', shortName: '_default', params: { ...dateParams } },
        ...branchQueries.map(b => ({
          branchRef: b.branchRef,
          shortName: b.shortName,
          params: {
            ...dateParams,
            'searchCriteria.itemVersion.version':     b.shortName,
            'searchCriteria.itemVersion.versionType': 'branch',
          },
        })),
      ];

      await Promise.all(allQueries.map(async (q) => {
        const cacheKey = `commits:br3:${project}:${repo.id}:${q.shortName}:${fromDate ?? ''}:${toDate ?? ''}`;
        try {
          const commits = await cache.cached(cacheKey, () =>
            fetchAllCommitsForBranch(project, repo.id, q.params)
          );
          let added = 0;
          for (const c of commits) {
            if (c?.commitId && !seen.has(c.commitId)) {
              seen.add(c.commitId);
              results.push({ ...c, repoId: repo.id, repoName: repo.name });
              added++;
            }
          }
          if (commits.length > 0) {
            console.log(`[repos]   "${repo.name}" / "${q.shortName}": ${commits.length} raw → ${added} new`);
          }
        } catch (branchErr) {
          console.error(`[repos] SKIP "${repo.name}" branch "${q.shortName}":`, (branchErr as Error).message);
        }
      }));

    } catch (err) {
      console.error(`[repos] getAllCommits: skipping "${repo.name}" —`, (err as Error).message);
    }
  }));

  console.log(`[repos] getAllCommits TOTAL: ${results.length} unique commits from ${repos.length} repos`);
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
  await Promise.all(repos.map(async (repo) => {
    try {
      const prs = await getPullRequests({ project, repoId: repo.id, status });
      console.log(`[repos] PRs "${repo.name}": ${prs.length}`);
      results.push(...prs.map((pr) => ({ ...pr, repoName: repo.name })));
    } catch (err) {
      console.error(`[repos] PRs skipping "${repo.name}":`, (err as Error).message);
    }
  }));
  console.log(`[repos] getAllPullRequests TOTAL: ${results.length}`);
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

// ── Branch summaries (last commit per branch, lightweight $top=1) ─────────────

export interface BranchSummary {
  repoId:     string;
  repoName:   string;
  branchName: string;
  lastCommit: (GitCommit & { repoId: string; repoName: string }) | null;
}

export async function getBranchSummaries(project: string): Promise<BranchSummary[]> {
  const repos = await getRepositories(project);
  const results: BranchSummary[] = [];

  await Promise.all(repos.map(async (repo) => {
    try {
      const branches = await getBranches(project, repo.id);
      await Promise.all(branches.map(async (branch) => {
        const shortName = branch.name.replace(/^refs\/heads\//, '');
        const cacheKey  = `branch-summary:v1:${project}:${repo.id}:${shortName}`;
        try {
          const commits = await cache.cached(cacheKey, () =>
            ado.getAll<GitCommit>(ado.p(project).commits(repo.id), {
              'api-version': V,
              'searchCriteria.$top': 1,
              'searchCriteria.itemVersion.version':     shortName,
              'searchCriteria.itemVersion.versionType': 'branch',
            })
          );
          results.push({
            repoId:     repo.id,
            repoName:   repo.name,
            branchName: shortName,
            lastCommit: commits[0] ? { ...commits[0], repoId: repo.id, repoName: repo.name } : null,
          });
        } catch {
          results.push({ repoId: repo.id, repoName: repo.name, branchName: shortName, lastCommit: null });
        }
      }));
    } catch (err) {
      console.error(`[repos] getBranchSummaries: skipping "${repo.name}" —`, (err as Error).message);
    }
  }));

  results.sort((a, b) => {
    const repoC = a.repoName.localeCompare(b.repoName);
    if (repoC !== 0) return repoC;
    return a.branchName.localeCompare(b.branchName);
  });

  console.log(`[repos] getBranchSummaries: ${results.length} branches across ${repos.length} repos`);
  return results;
}
