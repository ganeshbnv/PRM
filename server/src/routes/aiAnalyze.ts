import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import * as boardsSvc from '../services/boards';
import * as engineersSvc from '../services/engineers';
import * as reposSvc from '../services/repos';
import * as risksSvc from '../services/risks';
import * as wikiSvc from '../services/wiki';

const router = Router();

const OLLAMA_HOST  = process.env.OLLAMA_HOST  ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3.5:4b';
const DEFAULT_PROJECT = process.env.ADO_PROJECT ?? 'Patient Engagment Platform';
const OLLAMA_TIMEOUT_MS  = 90_000;
const DATA_FETCH_TIMEOUT = 8_000;
const CACHE_TTL = 600_000; // 10 min

export interface AnalysisResult {
  section: string;
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  generatedAt: string;
  fromCache?: boolean;
}

const resultCache = new Map<string, { data: AnalysisResult; ts: number }>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);
}

async function callOllama(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      options: { temperature: 0.35, num_predict: 650 },
    }),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const json = await res.json() as { message?: { content?: string } };
  const text = json.message?.content?.trim() ?? '';
  if (!text) throw new Error('empty response');
  return text;
}

function parseStructured(text: string): { summary: string; keyFindings: string[]; recommendations: string[] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let summary = '';
  const keyFindings: string[] = [];
  const recommendations: string[] = [];

  for (const line of lines) {
    if (line.startsWith('SUMMARY:'))       { summary = line.replace('SUMMARY:', '').trim(); continue; }
    if (line.match(/^FINDING\s*\d+:/i))    { keyFindings.push(line.replace(/^FINDING\s*\d+:/i, '').trim()); continue; }
    if (line.match(/^ACTION\s*\d+:/i))     { recommendations.push(line.replace(/^ACTION\s*\d+:/i, '').trim()); continue; }
  }

  // Fallback: if format wasn't followed, use the whole text as summary
  if (!summary && text.length > 0) summary = text.split('\n').slice(0, 2).join(' ');

  return { summary, keyFindings, recommendations };
}

const PROMPT_SUFFIX = `

Output EXACTLY in this format (no preamble, no extra text, nothing before SUMMARY):
SUMMARY: <2-3 sentences interpreting the overall health — not restating numbers, but what they MEAN>
FINDING 1: <most important insight with specific names, counts, or item titles>
FINDING 2: <second most important pattern or anomaly in the data>
FINDING 3: <third finding — trend, concentration risk, or systemic issue>
ACTION 1: <most urgent concrete action for the PM today — specific, not generic>
ACTION 2: <second recommended action>
ACTION 3: <third recommended action>`;

// ── Bugs ───────────────────────────────────────────────────────────────────────

async function buildBugsPrompt(project: string): Promise<{ prompt: string; fallback: AnalysisResult }> {
  const RESOLVED = ['Resolved', 'Closed', 'Done', 'Verified', 'Cannot Reproduce'];

  const items = await withTimeout(boardsSvc.getWorkItems({ project, workItemType: 'Bug' }), DATA_FETCH_TIMEOUT);
  const bugs = items ?? [];

  const open     = bugs.filter(b => !RESOLVED.includes(b.fields['System.State']));
  const p1open   = open.filter(b => b.fields['Microsoft.VSTS.Common.Priority'] === 1);
  const p2open   = open.filter(b => b.fields['Microsoft.VSTS.Common.Priority'] === 2);
  const inTest   = open.filter(b => ['Ready for Testing','In Testing','Under Review'].includes(b.fields['System.State']));
  const stale    = open.filter(b => Date.now() - new Date(b.fields['System.ChangedDate']).getTime() > 3 * 86400000);
  const unassign = open.filter(b => !b.fields['System.AssignedTo']);

  // Per-engineer bug counts
  const engBugs: Record<string, number> = {};
  for (const b of open) {
    const name = b.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
    engBugs[name] = (engBugs[name] ?? 0) + 1;
  }
  const topOwners = Object.entries(engBugs).sort((a,b) => b[1]-a[1]).slice(0,5).map(([n,c]) => `${n.split(' ')[0]}(${c})`).join(', ');

  // Oldest open P1/P2
  const critical = [...p1open, ...p2open].sort((a,b) =>
    new Date(a.fields['System.CreatedDate']).getTime() - new Date(b.fields['System.CreatedDate']).getTime()
  ).slice(0,3);

  const dataBlock = [
    `TOTAL BUGS: ${bugs.length} | OPEN: ${open.length} | CLOSED: ${bugs.length - open.length}`,
    `SEVERITY OPEN: P1=${p1open.length}, P2=${p2open.length}, P3=${open.filter(b=>b.fields['Microsoft.VSTS.Common.Priority']===3).length}, P4=${open.filter(b=>b.fields['Microsoft.VSTS.Common.Priority']===4).length}`,
    `PIPELINE: ${inTest.length} in test/review | ${stale.length} stale (3d+) | ${unassign.length} unassigned`,
    `TOP OWNERS: ${topOwners || 'none'}`,
    critical.length ? `CRITICAL ITEMS: ${critical.map(b=>`"${b.fields['System.Title'].slice(0,55)}" (P${b.fields['Microsoft.VSTS.Common.Priority'] ?? '?'})`).join(' | ')}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a senior engineering PM. Analyse the bug health for project: ${project}\n\n${dataBlock}${PROMPT_SUFFIX}`;

  const fallback: AnalysisResult = {
    section: 'bugs',
    summary: `${open.length} open bugs: ${p1open.length} P1, ${p2open.length} P2. ${stale.length > 0 ? `${stale.length} have gone stale (no update in 3+ days).` : 'No stale bugs.'} ${unassign.length > 0 ? `${unassign.length} are unassigned.` : ''}`,
    keyFindings: [
      p1open.length > 0 ? `${p1open.length} P1 bug${p1open.length > 1 ? 's' : ''} need immediate attention` : 'No P1 bugs — healthy priority baseline',
      topOwners ? `Bug concentration: ${topOwners}` : 'No per-engineer bug data',
      `${inTest.length} bugs in testing/review pipeline`,
    ],
    recommendations: [
      p1open.length > 0 ? `Triage and assign all ${p1open.length} P1 bugs today` : 'Continue monitoring P1 queue',
      stale.length > 0 ? `Chase ${stale.length} stale bugs with their owners for status update` : 'Maintain current triage cadence',
      unassign.length > 0 ? `Assign ${unassign.length} unowned bugs before next standup` : 'All bugs are assigned — good hygiene',
    ],
    generatedAt: new Date().toISOString(),
  };

  return { prompt, fallback };
}

// ── Engineers ─────────────────────────────────────────────────────────────────

async function buildEngineersPrompt(project: string): Promise<{ prompt: string; fallback: AnalysisResult }> {
  const engineers = await withTimeout(engineersSvc.getEngineerActivity(project), DATA_FETCH_TIMEOUT);
  const engs = engineers ?? [];

  const sorted = [...engs].sort((a,b) => b.commits.length - a.commits.length);
  const engLines = sorted.slice(0, 10).map(e => {
    const wkCommits = e.commits.filter(c => { const d = new Date(c.author.date).getDay(); return d === 0 || d === 6; }).length;
    const recentCommit = e.commits.length ? e.commits.sort((a,b) => b.author.date.localeCompare(a.author.date))[0].author.date.slice(0,10) : 'never';
    return `  ${e.displayName}: commits=${e.commits.length} prs=${e.prsOpened?.length??0} weekendWork=${wkCommits} lastCommit=${recentCommit}`;
  }).join('\n');

  const totalCommits = engs.reduce((s,e) => s+e.commits.length, 0);
  const totalPRs     = engs.reduce((s,e) => s+(e.prsOpened?.length??0), 0);
  const inactive     = engs.filter(e => e.commits.length === 0).map(e => e.displayName.split(' ')[0]).join(', ');
  const top3         = sorted.slice(0,3).map(e=>`${e.displayName.split(' ')[0]}(${e.commits.length})`).join(', ');

  const dataBlock = [
    `TEAM SIZE: ${engs.length} contributors | TOTAL COMMITS: ${totalCommits} | TOTAL PRs: ${totalPRs}`,
    `TOP CONTRIBUTORS: ${top3 || 'none'}`,
    inactive ? `INACTIVE (0 commits): ${inactive}` : 'All engineers have commits',
    `DETAIL PER ENGINEER:\n${engLines}`,
  ].join('\n');

  const prompt = `You are a senior engineering PM. Analyse team productivity and workload balance for project: ${project}\n\n${dataBlock}${PROMPT_SUFFIX}`;

  const heaviest = sorted[0];
  const fallback: AnalysisResult = {
    section: 'engineers',
    summary: `Team of ${engs.length} with ${totalCommits} total commits and ${totalPRs} PRs. ${heaviest ? `${heaviest.displayName.split(' ')[0]} leads with ${heaviest.commits.length} commits.` : ''} ${inactive ? `${engs.filter(e=>e.commits.length===0).length} engineers show no recent commit activity.` : ''}`,
    keyFindings: [
      heaviest ? `${heaviest.displayName} is carrying the most work: ${heaviest.commits.length} commits, ${heaviest.prsOpened?.length ?? 0} PRs` : 'No commit data available',
      inactive ? `${inactive} show zero commits — possible blockers or context-switching` : 'Good distribution across the team',
      `Average ${engs.length > 0 ? Math.round(totalCommits/engs.length) : 0} commits per engineer`,
    ],
    recommendations: [
      inactive ? `Check in with ${inactive} — zero commits may indicate blockers` : 'All engineers are active, maintain cadence',
      heaviest ? `Review if ${heaviest.displayName.split(' ')[0]} is overloaded — high commit count may indicate concentration risk` : 'Monitor workload distribution',
      'Ensure PRs have reviewers assigned to avoid merge bottlenecks',
    ],
    generatedAt: new Date().toISOString(),
  };

  return { prompt, fallback };
}

// ── Repos ──────────────────────────────────────────────────────────────────────

async function buildReposPrompt(project: string): Promise<{ prompt: string; fallback: AnalysisResult }> {
  const [repos, prs, commits] = await Promise.all([
    withTimeout(reposSvc.getRepositories(project), DATA_FETCH_TIMEOUT),
    withTimeout(reposSvc.getAllPullRequests(project), DATA_FETCH_TIMEOUT),
    withTimeout(reposSvc.getAllCommits(project), DATA_FETCH_TIMEOUT),
  ]);

  const allPRs    = prs ?? [];
  const allCommits = commits ?? [];
  const allRepos   = repos ?? [];

  const activePRs  = allPRs.filter(p => p.status === 'active');
  const stalePRs   = activePRs.filter(p => Date.now() - new Date(p.creationDate).getTime() > 5 * 86400000);
  const noReviewer = activePRs.filter(p => p.reviewers.length === 0);

  const commitsByRepo: Record<string,number> = {};
  for (const c of allCommits) commitsByRepo[c.repoName] = (commitsByRepo[c.repoName] ?? 0) + 1;
  const topRepos = Object.entries(commitsByRepo).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>`${n}(${c})`).join(', ');

  const dataBlock = [
    `REPOS: ${allRepos.length} | COMMITS (period): ${allCommits.length} | PRs: active=${activePRs.length} stale=${stalePRs.length} noReviewer=${noReviewer.length}`,
    topRepos ? `TOP BY COMMITS: ${topRepos}` : '',
    stalePRs.length > 0 ? `STALE PRs (5d+): ${stalePRs.slice(0,5).map(p=>`"${p.title.slice(0,45)}" by ${p.createdBy?.displayName?.split(' ')[0]??'unknown'}`).join(' | ')}` : 'No stale PRs',
    noReviewer.length > 0 ? `PRs WITHOUT REVIEWERS: ${noReviewer.slice(0,3).map(p=>`"${p.title.slice(0,40)}"`).join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a senior engineering PM. Analyse repository and code delivery health for project: ${project}\n\n${dataBlock}${PROMPT_SUFFIX}`;

  const fallback: AnalysisResult = {
    section: 'repos',
    summary: `${allRepos.length} repos, ${allCommits.length} commits in period. ${activePRs.length} active PRs — ${stalePRs.length} stale (5d+), ${noReviewer.length} without reviewers.`,
    keyFindings: [
      topRepos ? `Most active repos: ${topRepos}` : 'No commit data for this period',
      stalePRs.length > 0 ? `${stalePRs.length} PRs stalled for 5+ days risk merge conflicts` : 'PR turnaround is healthy',
      noReviewer.length > 0 ? `${noReviewer.length} PRs have no reviewer assigned — merge blocked` : 'All active PRs have reviewers',
    ],
    recommendations: [
      stalePRs.length > 0 ? `Review ${stalePRs.length} stale PRs with authors — reassign or close if abandoned` : 'Maintain current PR review pace',
      noReviewer.length > 0 ? `Assign reviewers to ${noReviewer.length} open PRs immediately` : 'PR coverage looks good',
      'Check repos with zero commits this period for abandoned branches',
    ],
    generatedAt: new Date().toISOString(),
  };

  return { prompt, fallback };
}

// ── Risks ──────────────────────────────────────────────────────────────────────

async function buildRisksPrompt(project: string): Promise<{ prompt: string; fallback: AnalysisResult }> {
  const risks = await withTimeout(risksSvc.getRisks(project), DATA_FETCH_TIMEOUT) ?? [];

  const critical = risks.filter(r => r.severity === 'critical');
  const high     = risks.filter(r => r.severity === 'high');
  const medium   = risks.filter(r => r.severity === 'medium');
  const low      = risks.filter(r => r.severity === 'low');

  const byCat: Record<string,number> = {};
  for (const r of risks) byCat[r.category] = (byCat[r.category] ?? 0) + 1;
  const catSummary = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${c}(${n})`).join(', ');

  const topCritical = [...critical, ...high].slice(0,5).map(r => `  [${r.severity.toUpperCase()}] ${r.title.slice(0,70)}`).join('\n');

  const dataBlock = [
    `TOTAL RISKS: ${risks.length} | CRITICAL: ${critical.length} | HIGH: ${high.length} | MEDIUM: ${medium.length} | LOW: ${low.length}`,
    catSummary ? `BY CATEGORY: ${catSummary}` : '',
    topCritical ? `TOP RISKS:\n${topCritical}` : 'No critical/high risks',
  ].filter(Boolean).join('\n');

  const prompt = `You are a senior engineering PM. Analyse the project risk register for project: ${project}\n\n${dataBlock}${PROMPT_SUFFIX}`;

  const fallback: AnalysisResult = {
    section: 'risks',
    summary: `${risks.length} tracked risks: ${critical.length} critical, ${high.length} high, ${medium.length} medium, ${low.length} low. ${critical.length > 0 ? `Immediate attention needed on ${critical.length} critical item${critical.length > 1?'s':''}.` : 'No critical risks at this time.'}`,
    keyFindings: [
      critical.length > 0 ? `${critical.length} critical risk${critical.length>1?'s':''}: ${critical.slice(0,2).map(r=>r.title.slice(0,50)).join('; ')}` : 'No critical risks identified',
      `High+Critical concentration: ${critical.length + high.length} of ${risks.length} risks are severe`,
      catSummary ? `Risk categories: ${catSummary}` : 'No category breakdown available',
    ],
    recommendations: [
      critical.length > 0 ? `Escalate ${critical.length} critical risk${critical.length>1?'s':''} to stakeholders this sprint` : 'Monitor high risks for escalation triggers',
      high.length > 0 ? `Review and assign mitigations for ${high.length} high-severity risks` : 'Continue risk monitoring cadence',
      'Update risk register with latest mitigation status before next sprint review',
    ],
    generatedAt: new Date().toISOString(),
  };

  return { prompt, fallback };
}

// ── Wiki ───────────────────────────────────────────────────────────────────────

async function buildWikiPrompt(project: string): Promise<{ prompt: string; fallback: AnalysisResult }> {
  const wikis = await withTimeout(wikiSvc.getWikis(project), DATA_FETCH_TIMEOUT) ?? [];
  const statsRaw = await withTimeout(wikiSvc.getWikiStats(project), DATA_FETCH_TIMEOUT) as {
    totalPages: number; stalePages: unknown[]; recentlyUpdated: unknown[]; byAuthor: Record<string,number>
  } | null;

  const pageCount   = statsRaw?.totalPages ?? 0;
  const recentEdits = statsRaw?.recentlyUpdated?.length ?? 0;
  const stalePages  = statsRaw?.stalePages?.length ?? 0;

  const dataBlock = [
    `WIKIS: ${wikis.length} | TOTAL PAGES: ${pageCount} | RECENT EDITS (7d): ${recentEdits} | STALE PAGES: ${stalePages}`,
    wikis.length > 0 ? `WIKI NAMES: ${wikis.map(w=>w.name).join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a senior engineering PM. Analyse the knowledge base health for project: ${project}\n\n${dataBlock}${PROMPT_SUFFIX}`;

  const fallback: AnalysisResult = {
    section: 'wiki',
    summary: `${wikis.length} wiki${wikis.length!==1?'s':''} with ${pageCount} pages total. ${recentEdits} edits in the last 7 days. ${stalePages > 0 ? `${stalePages} pages may be out of date.` : ''}`,
    keyFindings: [
      recentEdits === 0 ? 'No wiki edits in the last 7 days — documentation may be falling behind' : `${recentEdits} recent edits shows active documentation`,
      stalePages > 0 ? `${stalePages} pages flagged as potentially stale — review for accuracy` : 'No stale pages detected',
      `Knowledge base spans ${pageCount} pages across ${wikis.length} wiki${wikis.length!==1?'s':''}`,
    ],
    recommendations: [
      recentEdits < 3 ? 'Schedule a documentation sprint or assign wiki owners per team area' : 'Maintain current documentation cadence',
      stalePages > 0 ? `Audit ${stalePages} stale pages and archive or update before next release` : 'Keep monitoring page freshness',
      'Ensure sprint retrospectives, runbooks, and onboarding guides are up to date',
    ],
    generatedAt: new Date().toISOString(),
  };

  return { prompt, fallback };
}

// ── Route handler ──────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const section = ((req.query.section as string) ?? 'bugs').toLowerCase();
  const project = (req.query.project as string) ?? DEFAULT_PROJECT;

  const cacheKey = `${section}:${project}`;
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.json({ ...cached.data, fromCache: true });
    return;
  }

  let promptData: { prompt: string; fallback: AnalysisResult };

  try {
    switch (section) {
      case 'engineers': promptData = await buildEngineersPrompt(project); break;
      case 'repos':     promptData = await buildReposPrompt(project);     break;
      case 'risks':     promptData = await buildRisksPrompt(project);     break;
      case 'wiki':      promptData = await buildWikiPrompt(project);      break;
      default:          promptData = await buildBugsPrompt(project);      break;
    }
  } catch (err) {
    console.warn('[aiAnalyze] data fetch error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to fetch project data' });
    return;
  }

  let result: AnalysisResult;
  try {
    const text = await callOllama(promptData.prompt);
    const parsed = parseStructured(text);
    result = {
      section,
      ...parsed,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[aiAnalyze] Ollama error:', (err as Error).message);
    result = promptData.fallback;
  }

  resultCache.set(cacheKey, { data: result, ts: Date.now() });
  res.json(result);
});

export default router;
