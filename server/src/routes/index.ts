import { Router, Request, Response, NextFunction } from 'express';
import * as ado from '../services/adoClient';
import * as boardsSvc from '../services/boards';
import * as reposSvc from '../services/repos';
import * as wikiSvc from '../services/wiki';
import * as pipelinesSvc from '../services/pipelines';
import * as engineersSvc from '../services/engineers';
import * as risksSvc from '../services/risks';
import * as aiSvc from '../services/aiInsights';
import * as cacheStore from '../services/cache';

const router = Router();

function wrap(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).then((data) => res.json(data)).catch(next);
  };
}

function proj(req: Request): string {
  const p = req.query.project as string;
  if (!p) throw new Error('Missing required query param: project');
  return p;
}

// ── Health / org ──────────────────────────────────────────────────────────────

router.get('/ping', wrap(async () => ado.ping()));

router.get('/projects', wrap(async () => {
  const list = await ado.getAll<{ id: string; name: string; state: string }>(
    ado.orgPaths.projects, { 'api-version': ado.API_VERSION }
  );
  return list.map((item) => ({ id: item.id, name: item.name, state: item.state }));
}));

router.post('/cache/flush', (_req, res) => {
  cacheStore.flush();
  res.json({ ok: true });
});

// ── Boards ────────────────────────────────────────────────────────────────────

router.get('/boards/teams', wrap(async (req) => boardsSvc.getTeams(proj(req))));

router.get('/boards/workitems', wrap(async (req) => {
  return boardsSvc.getWorkItems({
    project: proj(req),
    team: req.query.team as string | undefined,
    areaPath: req.query.areaPath as string,
    iterationPath: req.query.iterationPath as string,
    assignedTo: req.query.assignedTo as string,
    workItemType: req.query.workItemType as string,
    state: req.query.state as string,
    fromDate: req.query.fromDate as string,
    toDate: req.query.toDate as string,
  });
}));

router.get('/boards/workitems/:id', wrap(async (req) => {
  return boardsSvc.getWorkItemById(proj(req), parseInt(req.params.id, 10));
}));

router.get('/boards/iterations', wrap(async (req) => {
  return boardsSvc.getIterations(proj(req), req.query.team as string | undefined);
}));

router.get('/boards/sprint-stats', wrap(async (req) => {
  return boardsSvc.getSprintStats(proj(req), req.query.team as string | undefined);
}));

// ── Repos ─────────────────────────────────────────────────────────────────────

router.get('/repos', wrap(async (req) => reposSvc.getRepositories(proj(req))));

router.get('/repos/commits/all', wrap(async (req) => {
  return reposSvc.getAllCommits(proj(req), req.query.fromDate as string, req.query.toDate as string);
}));

router.get('/repos/prs/all', wrap(async (req) => {
  return reposSvc.getAllPullRequests(proj(req), (req.query.status as 'active' | 'completed' | 'all') ?? 'all');
}));

router.get('/repos/branches/all', wrap(async (req) => reposSvc.getAllBranches(proj(req))));

router.get('/repos/:repoId/commits', wrap(async (req) => {
  return reposSvc.getCommits({
    project: proj(req), repoId: req.params.repoId,
    fromDate: req.query.fromDate as string,
    toDate: req.query.toDate as string,
    top: req.query.top ? parseInt(req.query.top as string, 10) : undefined,
  });
}));

router.get('/repos/:repoId/prs', wrap(async (req) => {
  return reposSvc.getPullRequests({
    project: proj(req), repoId: req.params.repoId,
    status: req.query.status as 'active' | 'completed' | 'all',
  });
}));

// ── Wiki ──────────────────────────────────────────────────────────────────────

router.get('/wiki', wrap(async (req) => wikiSvc.getWikis(proj(req))));
router.get('/wiki/pages/all', wrap(async (req) => wikiSvc.getAllWikiPages(proj(req))));
router.get('/wiki/stats', wrap(async (req) => wikiSvc.getWikiStats(proj(req))));

// ── Pipelines ─────────────────────────────────────────────────────────────────

router.get('/pipelines', wrap(async (req) => pipelinesSvc.getPipelines(proj(req))));
router.get('/pipelines/stats', wrap(async (req) => pipelinesSvc.getPipelineStats(proj(req))));
router.get('/pipelines/runs/all', wrap(async (req) => pipelinesSvc.getAllRecentRuns(proj(req))));
router.get('/test/runs', wrap(async (req) => pipelinesSvc.getTestRuns(proj(req), req.query.fromDate as string)));

// ── Engineers ─────────────────────────────────────────────────────────────────

router.get('/engineers/activity', wrap(async (req) => {
  return engineersSvc.getEngineerActivity(proj(req), {
    fromDate: req.query.fromDate as string,
    toDate: req.query.toDate as string,
  });
}));

// Debug: shows all commits fetched via pushes API (all branches, all repos)
router.get('/engineers/debug-commits', wrap(async (req) => {
  const project  = proj(req);
  const fromDate = (req.query.fromDate as string) ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const toDate   = (req.query.toDate   as string) ?? new Date().toISOString().slice(0, 10);
  const allCommits = await reposSvc.getAllCommits(project, fromDate, toDate);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const samples = allCommits.slice(0, 50).map(c => {
    const d = new Date(c.author.date);
    return {
      repo:       c.repoName,
      commitId:   c.commitId.slice(0, 7),
      authorDate: c.author.date,
      authorName: c.author.name,
      dayLocal:   days[d.getDay()],
      dayUTC:     days[d.getUTCDay()],
      isWeekendLocal: d.getDay() === 0 || d.getDay() === 6,
      isWeekendUTC:   d.getUTCDay() === 0 || d.getUTCDay() === 6,
      changeCounts: (c as any).changeCounts ?? null,
      comment:    c.comment.split('\n')[0].slice(0, 60),
    };
  });
  const weekendLocal = allCommits.filter(c => { const d = new Date(c.author.date); return d.getDay() === 0 || d.getDay() === 6; });
  return {
    fromDate, toDate,
    totalCommits:   allCommits.length,
    weekendCommits: weekendLocal.length,
    uniqueAuthors:  new Set(allCommits.map(c => c.author.email)).size,
    samples,
  };
}));

// ── AI Insights ───────────────────────────────────────────────────────────────

router.get('/boards/ai-insights', wrap(async (req) => {
  const project = proj(req);
  const team = req.query.team as string | undefined ?? '';
  const iterationPath = req.query.iterationPath as string | undefined;

  const cacheKey = `ai:${project}:${team}:${iterationPath ?? ''}`;
  const cached = cacheStore.get(cacheKey);
  if (cached) return cached;

  const [items, sprints] = await Promise.all([
    boardsSvc.getWorkItems({
      project,
      team: team || undefined,
      iterationPath: iterationPath || undefined,
    }),
    boardsSvc.getSprintStats(project, team),
  ]);
  const result = await aiSvc.getAiInsights(project, team, items, sprints, iterationPath);
  cacheStore.set(cacheKey, result, 600); // cache AI result for 10 min
  return result;
}));

// ── Risks ─────────────────────────────────────────────────────────────────────

router.get('/risks', wrap(async (req) => {
  return risksSvc.getRisks(proj(req), {
    staleItemDays: req.query.staleItemDays ? parseInt(req.query.staleItemDays as string, 10) : undefined,
    stalePrDays: req.query.stalePrDays ? parseInt(req.query.stalePrDays as string, 10) : undefined,
    bugAgingDays: req.query.bugAgingDays ? parseInt(req.query.bugAgingDays as string, 10) : undefined,
  });
}));

export default router;
