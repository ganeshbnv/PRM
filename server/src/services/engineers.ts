import * as boards from './boards';
import * as repos from './repos';
import * as cache from './cache';
import type { WorkItem, GitCommit, GitPullRequest } from '../models/ado';

export interface EngineerActivity {
  displayName: string;
  uniqueName: string;
  assignedItems: WorkItem[];
  completedItems: WorkItem[];
  activeItems: WorkItem[];
  staleItems: WorkItem[];
  commits: Array<GitCommit & { repoId: string; repoName: string }>;
  prsOpened: Array<GitPullRequest & { repoName: string }>;
  prsMerged: Array<GitPullRequest & { repoName: string }>;
  prsReviewed: Array<GitPullRequest & { repoName: string }>;
  storyPointsCompleted: number;
  lastActivity: string | null;
}

const STALE_DAYS = 7;

function isStale(date: string): boolean {
  return Date.now() - new Date(date).getTime() > STALE_DAYS * 86_400_000;
}

export async function getEngineerActivity(project: string, filters: { fromDate?: string; toDate?: string } = {}): Promise<EngineerActivity[]> {
  const cacheKey = `engineers:activity:${project}:${JSON.stringify(filters)}`;
  return cache.cached(cacheKey, async () => {
    const [allItems, allCommits, allPrs] = await Promise.all([
      boards.getWorkItems({ project, fromDate: filters.fromDate, toDate: filters.toDate }),
      repos.getAllCommits(project, filters.fromDate, filters.toDate),
      repos.getAllPullRequests(project, 'all'),
    ]);

    const engineerMap = new Map<string, EngineerActivity>();

    function ensureEngineer(name: string, email: string): EngineerActivity {
      if (!engineerMap.has(email)) {
        engineerMap.set(email, {
          displayName: name, uniqueName: email,
          assignedItems: [], completedItems: [], activeItems: [], staleItems: [],
          commits: [], prsOpened: [], prsMerged: [], prsReviewed: [],
          storyPointsCompleted: 0, lastActivity: null,
        });
      }
      return engineerMap.get(email)!;
    }

    for (const item of allItems) {
      const a = item.fields['System.AssignedTo'];
      if (!a) continue;
      const eng = ensureEngineer(a.displayName, a.uniqueName);
      eng.assignedItems.push(item);
      const state = item.fields['System.State'];
      const changed = item.fields['System.ChangedDate'];
      if (['Resolved', 'Closed', 'Done'].includes(state)) {
        eng.completedItems.push(item);
        eng.storyPointsCompleted += item.fields['Microsoft.VSTS.Scheduling.StoryPoints'] ?? 0;
      } else if (['Active', 'In Progress', 'Committed'].includes(state)) {
        eng.activeItems.push(item);
        if (changed && isStale(changed)) eng.staleItems.push(item);
      }
      if (changed && (!eng.lastActivity || changed > eng.lastActivity)) eng.lastActivity = changed;
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
