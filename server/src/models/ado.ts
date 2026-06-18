// Azure DevOps REST API v7.1 response types

export interface AdoProject {
  id: string;
  name: string;
  description?: string;
  state: string;
  visibility: string;
  lastUpdateTime: string;
}

export interface AdoTeam {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  projectName: string;
}

// ── Work Items ────────────────────────────────────────────────────────────────

export interface WorkItemReference {
  id: number;
  url: string;
}

export interface WorkItemFieldValue {
  [field: string]: unknown;
}

export interface WorkItem {
  id: number;
  rev: number;
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
    'System.BoardColumn'?: string;
    'System.Parent'?: number;
    [key: string]: unknown;
  };
  url: string;
}

export interface WiqlResult {
  queryType: string;
  queryResultType: string;
  asOf: string;
  workItems: WorkItemReference[];
  workItemRelations?: Array<{
    rel: string | null;
    source: WorkItemReference | null;
    target: WorkItemReference;
  }>;
}

// ── Iterations / Sprints ──────────────────────────────────────────────────────

export interface Iteration {
  id: string;
  name: string;
  path: string;
  attributes: {
    startDate?: string;
    finishDate?: string;
    timeFrame?: 'past' | 'current' | 'future';
  };
  url: string;
}

// ── Git / Repos ───────────────────────────────────────────────────────────────

export interface GitRepository {
  id: string;
  name: string;
  defaultBranch?: string;
  size: number;
  remoteUrl: string;
  sshUrl: string;
  webUrl: string;
  project: { id: string; name: string };
}

export interface GitCommit {
  commitId: string;
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
  comment: string;
  changeCounts?: { Add?: number; Edit?: number; Delete?: number; add?: number; edit?: number; delete?: number };
  url: string;
  remoteUrl: string;
}

export interface GitPullRequest {
  pullRequestId: number;
  title: string;
  description?: string;
  status: 'active' | 'abandoned' | 'completed' | 'all';
  creationDate: string;
  closedDate?: string;
  targetRefName: string;
  sourceRefName: string;
  createdBy: { displayName: string; uniqueName: string; id: string };
  reviewers: Array<{
    displayName: string;
    uniqueName: string;
    id: string;
    vote: number;
    isRequired?: boolean;
  }>;
  repository: { id: string; name: string };
  url: string;
}

export interface GitBranch {
  name: string;
  objectId: string;
  creator: { displayName: string; uniqueName: string };
  url: string;
  statuses?: unknown[];
}

// ── Wiki ──────────────────────────────────────────────────────────────────────

export interface Wiki {
  id: string;
  name: string;
  type: 'projectWiki' | 'codeWiki';
  url: string;
  remoteUrl: string;
  mappedPath?: string;
  projectId: string;
}

export interface WikiPage {
  id: number;
  path: string;
  order?: number;
  isParentPage?: boolean;
  gitItemPath?: string;
  subPages?: WikiPage[];
  url: string;
  remoteUrl: string;
  lastUpdatedBy?: { displayName: string; uniqueName: string };
  lastUpdatedDate?: string;
  content?: string;
}

// ── Pipelines / Builds ────────────────────────────────────────────────────────

export interface Pipeline {
  id: number;
  name: string;
  folder: string;
  url: string;
  revision: number;
}

export interface PipelineRun {
  id: number;
  name: string;
  state: 'inProgress' | 'canceling' | 'completed';
  result?: 'succeeded' | 'failed' | 'canceled' | 'partiallySucceeded';
  createdDate: string;
  finishedDate?: string;
  pipeline: { id: number; name: string };
  url: string;
}

// ── Test ──────────────────────────────────────────────────────────────────────

export interface TestRun {
  id: number;
  name: string;
  state: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  incompleteTests: number;
  startedDate: string;
  completedDate?: string;
  buildConfiguration?: { buildDefinitionId: number; buildId: number };
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PagedList<T> {
  value: T[];
  count: number;
  continuationToken?: string;
}
