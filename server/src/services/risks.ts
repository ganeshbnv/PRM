import * as boards from './boards';
import * as repos from './repos';
import * as wiki from './wiki';

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Risk {
  id: string;
  severity: RiskSeverity;
  category: 'board' | 'bug' | 'pr' | 'wiki' | 'engineer' | 'pipeline';
  title: string;
  description: string;
  artifactId?: string | number;
  artifactType?: string;
  detectedAt: string;
}

const MS_DAY = 86_400_000;
function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / MS_DAY);
}

export interface RiskThresholds {
  staleItemDays: number; stalePrDays: number; staleWikiDays: number;
  bugAgingDays: number; inactiveEngineerDays: number;
}

const DEFAULTS: RiskThresholds = {
  staleItemDays: 7, stalePrDays: 5, staleWikiDays: 30,
  bugAgingDays: 14, inactiveEngineerDays: 10,
};

export async function getRisks(project: string, thresholds: Partial<RiskThresholds> = {}): Promise<Risk[]> {
  const t = { ...DEFAULTS, ...thresholds };
  const risks: Risk[] = [];
  const now = new Date().toISOString();

  const items = await boards.getWorkItems({ project });
  const activeItems = items.filter((i) => ['Active', 'In Progress', 'Committed'].includes(i.fields['System.State']));

  for (const item of activeItems) {
    const days = daysSince(item.fields['System.ChangedDate']);
    if (days >= t.staleItemDays) {
      risks.push({
        id: `stale-item-${item.id}`,
        severity: days >= t.staleItemDays * 3 ? 'critical' : days >= t.staleItemDays * 2 ? 'high' : 'medium',
        category: 'board',
        title: `Stale: ${item.fields['System.Title']}`,
        description: `No activity for ${days} days`,
        artifactId: item.id, artifactType: item.fields['System.WorkItemType'], detectedAt: now,
      });
    }
  }

  const bugs = items.filter((i) => i.fields['System.WorkItemType'] === 'Bug');
  for (const bug of bugs.filter((b) => !b.fields['System.AssignedTo'] && (b.fields['Microsoft.VSTS.Common.Priority'] ?? 4) <= 2)) {
    risks.push({
      id: `unassigned-bug-${bug.id}`, severity: 'high', category: 'bug',
      title: `Unassigned P${bug.fields['Microsoft.VSTS.Common.Priority'] ?? '?'} bug: ${bug.fields['System.Title']}`,
      description: 'High-priority bug with no assignee', artifactId: bug.id, artifactType: 'Bug', detectedAt: now,
    });
  }

  for (const bug of bugs.filter((b) => !['Resolved', 'Closed', 'Done'].includes(b.fields['System.State']))) {
    const days = daysSince(bug.fields['System.CreatedDate']);
    if (days >= t.bugAgingDays) {
      risks.push({
        id: `aging-bug-${bug.id}`,
        severity: days >= 60 ? 'critical' : days >= 30 ? 'high' : 'medium',
        category: 'bug',
        title: `Aging bug (${days}d): ${bug.fields['System.Title']}`,
        description: `Open for ${days} days`, artifactId: bug.id, artifactType: 'Bug', detectedAt: now,
      });
    }
  }

  const allPrs = await repos.getAllPullRequests(project, 'active');
  for (const pr of allPrs.filter((p) => daysSince(p.creationDate) >= t.stalePrDays)) {
    const days = daysSince(pr.creationDate);
    risks.push({
      id: `stale-pr-${pr.pullRequestId}`,
      severity: pr.reviewers.length === 0 ? 'high' : days >= t.stalePrDays * 4 ? 'high' : 'medium',
      category: 'pr',
      title: `Stale PR (${days}d): ${pr.title}`,
      description: pr.reviewers.length === 0 ? 'No reviewers assigned' : `Open ${days} days without merge`,
      artifactId: pr.pullRequestId, artifactType: 'PullRequest', detectedAt: now,
    });
  }

  const wikiStats = await wiki.getWikiStats(project);
  for (const page of wikiStats.stalePages.slice(0, 30)) {
    risks.push({
      id: `stale-wiki-${page.id}`, severity: 'low', category: 'wiki',
      title: `Stale wiki: ${page.path}`,
      description: `Not updated in over ${t.staleWikiDays} days`,
      artifactId: page.id, artifactType: 'WikiPage', detectedAt: now,
    });
  }

  const order: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  risks.sort((a, b) => order[a.severity] - order[b.severity]);
  return risks;
}
