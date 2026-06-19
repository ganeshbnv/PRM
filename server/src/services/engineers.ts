import * as repos from './repos';
import * as cache from './cache';
import type { GitCommit, GitPullRequest } from '../models/ado';

// Known git identity aliases → canonical { name, email }
// Add rows here whenever the same person commits under multiple git identities.
const IDENTITY_ALIASES: Record<string, { name: string; email: string }> = {
  'moulichand16@gmail.com':             { name: 'Mouli Chand Birudugadda', email: 'moulichand@globalhealthx.co' },
  'moulichand16':                       { name: 'Mouli Chand Birudugadda', email: 'moulichand@globalhealthx.co' },
};

function canonical(name: string, email: string): { name: string; email: string } {
  return IDENTITY_ALIASES[email.toLowerCase()]
      ?? IDENTITY_ALIASES[name.toLowerCase()]
      ?? { name, email };
}

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
  const cacheKey = `engineers:activity:v3:${project}:${JSON.stringify(filters)}`;
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
      const id = canonical(commit.author.name, commit.author.email);
      const eng = ensureEngineer(id.name, id.email);
      eng.commits.push(commit);
      if (!eng.lastActivity || commit.author.date > eng.lastActivity) eng.lastActivity = commit.author.date;
    }

    for (const pr of allPrs) {
      const id = canonical(pr.createdBy.displayName, pr.createdBy.uniqueName);
      const eng = ensureEngineer(id.name, id.email);
      eng.prsOpened.push(pr);
      if (pr.status === 'completed') eng.prsMerged.push(pr);
      if (!eng.lastActivity || pr.creationDate > eng.lastActivity) eng.lastActivity = pr.creationDate;
      for (const reviewer of pr.reviewers) {
        if (reviewer.vote !== 0) {
          ensureEngineer(reviewer.displayName, reviewer.uniqueName).prsReviewed.push(pr);
        }
      }
    }

    const engineers = Array.from(engineerMap.values());
    console.log(`[engineers] ${engineers.length} people found, ${allCommits.length} commits, ${allPrs.length} PRs`);
    engineers
      .filter(e => e.commits.length > 0)
      .sort((a, b) => b.commits.length - a.commits.length)
      .forEach(e => console.log(`[engineers]   ${e.displayName} <${e.uniqueName}>: ${e.commits.length} commits, ${e.prsOpened.length} PRs`));
    return engineers;
  });
}
