// Mirror of server-side ADO models (subset used by the UI)

export interface WorkItem {
  id: number;
  url?: string;
  fields: {
    'System.Title': string;
    'System.State': string;
    'System.WorkItemType': string;
    'System.AssignedTo'?: { displayName: string; uniqueName: string; id: string };
    'System.AreaPath': string;
    'System.IterationPath': string;
    'System.CreatedDate': string;
    'System.ChangedDate': string;
    'Microsoft.VSTS.Scheduling.StoryPoints'?: number;
    'Microsoft.VSTS.Common.Priority'?: number;
    'Microsoft.VSTS.Common.Severity'?: string;
    'System.Tags'?: string;
    [key: string]: unknown;
  };
}

export interface Iteration {
  id: string;
  name: string;
  path: string;
  attributes: {
    startDate?: string;
    finishDate?: string;
    timeFrame?: 'past' | 'current' | 'future';
  };
}

export interface SprintStats {
  iteration: Iteration;
  total: number;
  completed: number;
  active: number;
  notStarted: number;
  totalPoints: number;
  completedPoints: number;
  items: WorkItem[];
}

export interface GitRepository {
  id: string;
  name: string;
  defaultBranch?: string;
  size: number;
  remoteUrl: string;
  webUrl: string;
}

export interface GitCommit {
  commitId: string;
  author: { name: string; email: string; date: string };
  comment: string;
  changeCounts?: { Add: number; Edit: number; Delete: number };
  repoId: string;
  repoName: string;
}

export interface GitPullRequest {
  pullRequestId: number;
  title: string;
  status: string;
  creationDate: string;
  closedDate?: string;
  targetRefName: string;
  createdBy: { displayName: string; uniqueName: string; id: string };
  reviewers: Array<{ displayName: string; uniqueName: string; vote: number }>;
  repoName: string;
}

export interface WikiPage {
  id: number;
  path: string;
  lastUpdatedDate?: string;
  lastUpdatedBy?: { displayName: string; uniqueName: string };
  wikiId: string;
  wikiName: string;
}

export interface PipelineRun {
  id: number;
  name: string;
  state: string;
  result?: string;
  createdDate: string;
  finishedDate?: string;
  pipelineName: string;
}

export interface BranchSummary {
  repoId:     string;
  repoName:   string;
  branchName: string;
  lastCommit: (GitCommit & { repoId: string; repoName: string }) | null;
}

export interface EngineerActivity {
  displayName: string;
  uniqueName: string;
  commits: GitCommit[];
  prsOpened: GitPullRequest[];
  prsMerged: GitPullRequest[];
  prsReviewed: GitPullRequest[];
  lastActivity: string | null;
}

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

// ── Global filter state ───────────────────────────────────────────────────────

export interface GlobalFilters {
  project: string;
  fromDate: string;
  toDate: string;
  assignedTo: string;
  workItemType: string;
  areaPath: string;
  iterationPath: string;
  team: string;
}
