import * as ado from './adoClient';
import * as cache from './cache';
import type { WorkItem, WiqlResult, Iteration, AdoTeam } from '../models/ado';

const V = ado.API_VERSION;

const WORK_ITEM_FIELDS = [
  'System.Id', 'System.Title', 'System.State', 'System.WorkItemType',
  'System.AssignedTo', 'System.AreaPath', 'System.IterationPath',
  'System.CreatedDate', 'System.ChangedDate', 'System.Tags',
  'System.BoardColumn', 'System.Parent',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Common.Priority', 'Microsoft.VSTS.Common.Severity',
];

export interface WorkItemFilters {
  project: string;
  team?: string;
  areaPath?: string;
  iterationPath?: string;
  assignedTo?: string;
  workItemType?: string;
  state?: string;
  fromDate?: string;
  toDate?: string;
}

export async function getTeamAreaPaths(project: string, team: string): Promise<string[]> {
  return cache.cached(`teamareas:${project}:${team}`, async () => {
    try {
      const data = await ado.getOne<{ values: { value: string }[]; defaultValue: string }>(
        ado.p(project).teamFieldValues(encodeURIComponent(team)),
        { 'api-version': ado.API_VERSION }
      );
      return data.values.map((v) => v.value);
    } catch {
      return [];
    }
  });
}

// Escape single quotes in WIQL string literals (e.g. "Deepam's Last Sprint")
function esc(v: string): string {
  return v.replace(/'/g, "''");
}

function buildWhereClause(f: WorkItemFilters, teamAreaPaths: string[] = []): string {
  const c: string[] = [];
  if (teamAreaPaths.length === 1) {
    c.push(`[System.AreaPath] UNDER '${esc(teamAreaPaths[0])}'`);
  } else if (teamAreaPaths.length > 1) {
    c.push(`(${teamAreaPaths.map((ap) => `[System.AreaPath] UNDER '${esc(ap)}'`).join(' OR ')})`);
  } else if (f.areaPath) {
    c.push(`[System.AreaPath] UNDER '${esc(f.areaPath)}'`);
  }
  if (f.iterationPath) c.push(`[System.IterationPath] UNDER '${esc(f.iterationPath)}'`);
  if (f.assignedTo) c.push(`[System.AssignedTo] = '${esc(f.assignedTo)}'`);
  if (f.workItemType) c.push(`[System.WorkItemType] = '${esc(f.workItemType)}'`);
  if (f.state) c.push(`[System.State] = '${esc(f.state)}'`);
  if (f.fromDate) c.push(`[System.ChangedDate] >= '${f.fromDate}'`);
  if (f.toDate) c.push(`[System.ChangedDate] <= '${f.toDate}'`);
  return c.length ? `AND ${c.join(' AND ')}` : '';
}

export async function getWorkItems(filters: WorkItemFilters): Promise<WorkItem[]> {
  const cacheKey = `workitems:${JSON.stringify(filters)}`;
  return cache.cached(cacheKey, async () => {
    // When iterationPath is set the sprint already scopes to the team — skip area-path filter to keep counts consistent with sprint stats
    const resolvedTeam = (!filters.iterationPath && filters.team) ? await resolveTeam(filters.project, filters.team) : undefined;
    const teamAreaPaths = resolvedTeam ? await getTeamAreaPaths(filters.project, resolvedTeam) : [];
    const where = buildWhereClause(filters, teamAreaPaths);
    const wiql = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${esc(filters.project)}' ${where} ORDER BY [System.ChangedDate] DESC`,
    };
    const result = await ado.post<WiqlResult>(ado.p(filters.project).wiql, wiql, { 'api-version': V });
    const ids = result.workItems.map((r) => r.id);
    if (!ids.length) return [];
    return ado.fetchWorkItemsBatch(ids, WORK_ITEM_FIELDS);
  });
}

export async function getWorkItemById(project: string, id: number): Promise<WorkItem> {
  return cache.cached(`workitem:${id}`, () =>
    ado.getOne<WorkItem>(ado.p(project).workItem(id), { 'api-version': V, '$expand': 'all' })
  );
}

export async function getTeams(project: string): Promise<AdoTeam[]> {
  return cache.cached(`teams:${project}`, () =>
    ado.getAll<AdoTeam>(`/_apis/projects/${encodeURIComponent(project)}/teams`, { 'api-version': V })
  );
}

async function resolveTeam(project: string, team?: string): Promise<string> {
  if (team && team !== 'default') return team;
  const teams = await getTeams(project);
  // Prefer a team whose name matches the project or contains "main"/"default"
  const preferred = teams.find(
    (t) => t.name.toLowerCase().includes('main') ||
           t.name.toLowerCase() === project.toLowerCase() ||
           t.name.toLowerCase().includes('default')
  );
  return preferred?.name ?? teams[0]?.name ?? project;
}

export async function getIterations(project: string, team?: string): Promise<Iteration[]> {
  const resolvedTeam = await resolveTeam(project, team);
  return cache.cached(`iterations:${project}:${resolvedTeam}`, () =>
    ado.getAll<Iteration>(ado.p(project).iterations(encodeURIComponent(resolvedTeam)), { 'api-version': V })
  );
}

export async function getCurrentIteration(project: string, team?: string): Promise<Iteration | null> {
  const iterations = await getIterations(project, team);
  return iterations.find((i) => i.attributes.timeFrame === 'current') ?? null;
}

export interface SprintStats {
  iteration: Iteration;
  total: number; completed: number; active: number; notStarted: number;
  totalPoints: number; completedPoints: number; items: WorkItem[];
}

export async function getSprintStats(project: string, team?: string): Promise<SprintStats[]> {
  const resolvedTeam = await resolveTeam(project, team);
  return cache.cached(`sprintstats:${project}:${resolvedTeam}`, async () => {
    const iterations = await getIterations(project, resolvedTeam);

    // Fetch all iterations in parallel instead of sequentially
    return Promise.all(
      iterations.map(async (iter) => {
        try {
          const items = await getWorkItems({ project, iterationPath: iter.path });
          const completed = items.filter((i) => ['Resolved', 'Closed', 'Done'].includes(i.fields['System.State']));
          const active = items.filter((i) => ['Active', 'In Progress', 'Committed'].includes(i.fields['System.State']));
          const totalPoints = items.reduce((s, i) => s + (i.fields['Microsoft.VSTS.Scheduling.StoryPoints'] ?? 0), 0);
          const completedPoints = completed.reduce((s, i) => s + (i.fields['Microsoft.VSTS.Scheduling.StoryPoints'] ?? 0), 0);
          return { iteration: iter, total: items.length, completed: completed.length, active: active.length, notStarted: items.length - completed.length - active.length, totalPoints, completedPoints, items };
        } catch {
          // If one sprint fails (e.g. empty/deleted), return zeroed stats rather than failing all
          return { iteration: iter, total: 0, completed: 0, active: 0, notStarted: 0, totalPoints: 0, completedPoints: 0, items: [] };
        }
      })
    );
  });
}
