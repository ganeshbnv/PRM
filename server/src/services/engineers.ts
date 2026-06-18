import * as repos from './repos';
import * as cache from './cache';
import type { GitCommit, GitPullRequest } from '../models/ado';

export interface EngineerActivity {
  displayName: string;
  uniqueName: string;
  commits: Array<GitCommit & { repoId: string; repoName: string }>;
  prsOpened: Array<GitPullRequest & { repoName: string }>;
  prsMerged: Array<GitPullRequest & { repoName: string }>;
  prsReviewed: Array<GitPullRequest & { repoName: string }>;
  lastActivity: string | null;
}

export async function getEngineerActivity(project: string, filters: { fromDate?: string; toDate?: string } = {}): Promise<EngineerActivity[]> {
  const cacheKey = `engineers:activity:v2:${project}:${JSON.stringify(filters)}`;
  return cache.cached(cacheKey, async () => {
    const [allCommits, allPrs] = await Promise.all([
      repos.getAllCommits(project, filters.fromDate, filters.toDate),
      repos.getAllPullRequests(project, 'all'),
    ]);

    const engineerMap = new Map<string, EngineerActivity>();

    function ensureEngineer(name: string, email: string): EngineerActivity {
      if (!engineerMap.has(email)) {
        engineerMap.set(email, {
          displayName: name, uniqueName: email,
          commits: [], prsOpened: [], prsMerged: [], prsReviewed: [],
          lastActivity: null,
        });
      }
      return engineerMap.get(email)!;
    }

    for (const commit of allCommits) {
      const eng = ensureEngineer(commit.author.name, commit.author.email);
      eng.commits.push(commit);
      if (!eng.lastActivity || commit.author.date > eng.lastActivity) eng.lastActivity = commit.author.date;
    }

    for (const pr of allPrs) {
      const eng = ensureEngineer(pr.createdBy.displayName, pr.createdBy.uniqueName);
      eng.prsOpened.push(pr);
      if (pr.status === 'completed') eng.prsMerged.push(pr);
      if (!eng.lastActivity || pr.creationDate > eng.lastActivity) eng.lastActivity = pr.creationDate;
      for (const reviewer of pr.reviewers) {
        if (reviewer.vote !== 0) {
          ensureEngineer(reviewer.displayName, reviewer.uniqueName).prsReviewed.push(pr);
        }
      }
    }

    return Array.from(engineerMap.values());
  });
}
