import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import * as boardsSvc from '../services/boards';
import * as engineersSvc from '../services/engineers';
import * as reposSvc from '../services/repos';
import * as risksSvc from '../services/risks';

const router = Router();

const OLLAMA_HOST  = process.env.OLLAMA_HOST  ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3.5:4b';
const DEFAULT_PROJECT = process.env.ADO_PROJECT ?? 'Patient Engagment Platform';

// 120 s — must survive queued background AI insight requests ahead of it
const OLLAMA_TIMEOUT_MS = 120_000;
// 8 s max per ADO data fetch — use cache hits; don't block Ollama window
const DATA_FETCH_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

async function ollamaChat(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      options: { temperature: 0.55, num_predict: 500 },
    }),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const json = await res.json() as { message?: { content?: string } };
  const text = json.message?.content?.trim() ?? '';
  if (!text) throw new Error('empty response');
  return text;
}

router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { question, section = 'general', project = DEFAULT_PROJECT } = req.body as {
    question?: string;
    section?: string;
    project?: string;
  };

  if (!question?.trim()) {
    res.status(400).json({ error: 'Question is required.' });
    return;
  }

  const lines: string[] = [];
  const sources: string[] = [];

  // ── Fetch context with a hard deadline so ADO latency doesn't eat Ollama time ─
  const isBoards    = section === 'boards' || section === 'bugs' || section === 'general';
  const isEngineers = section === 'engineers' || section === 'general';
  const isRepos     = section === 'repos'     || section === 'general';
  const isRisks     = section === 'risks'     || section === 'general';

  const [workItems, engineers, repos, risks] = await Promise.all([
    isBoards    ? withTimeout(boardsSvc.getWorkItems({ project }), DATA_FETCH_TIMEOUT_MS)           : Promise.resolve(null),
    isEngineers ? withTimeout(engineersSvc.getEngineerActivity(project), DATA_FETCH_TIMEOUT_MS)     : Promise.resolve(null),
    isRepos     ? withTimeout(reposSvc.getRepositories(project), DATA_FETCH_TIMEOUT_MS)             : Promise.resolve(null),
    isRisks     ? withTimeout(risksSvc.getRisks(project), DATA_FETCH_TIMEOUT_MS)                    : Promise.resolve(null),
  ]);

  // Work items — top 10 only to keep prompt lean
  if (workItems) {
    const bugs   = workItems.filter(i => i.fields['System.WorkItemType'] === 'Bug');
    const active = workItems.filter(i => ['Active', 'In Progress', 'Committed'].includes(i.fields['System.State']));
    const done   = workItems.filter(i => ['Resolved', 'Closed', 'Done'].includes(i.fields['System.State']));
    lines.push(`WORK ITEMS: ${workItems.length} total | ${active.length} active | ${done.length} done | ${bugs.length} bugs`);
    const top10 = active.slice(0, 10).map(i =>
      `  [${i.id}] ${i.fields['System.WorkItemType']} | ${i.fields['System.Title'].slice(0, 60)} | ${i.fields['System.AssignedTo']?.displayName ?? 'unassigned'}`
    ).join('\n');
    if (top10) lines.push(`ACTIVE ITEMS:\n${top10}`);
    sources.push('ADO Work Items');
  }

  // Engineers — top 8
  if (engineers?.length) {
    const top = engineers.slice(0, 8).map(e =>
      `  ${e.displayName}: ${e.commits.length} commits, ${e.prsOpened?.length ?? 0} PRs`
    ).join('\n');
    lines.push(`TEAM (${engineers.length} contributors):\n${top}`);
    sources.push('Team Activity');
  }

  // Repos
  if (repos?.length) {
    lines.push(`REPOS (${repos.length}): ${repos.map(r => r.name).join(', ')}`);
    sources.push('Repositories');
  }

  // Risks — top 6
  if (risks?.length) {
    const hi = risks.filter(r => r.severity === 'critical' || r.severity === 'high');
    lines.push(`RISKS: ${risks.length} total | ${hi.length} critical/high`);
    const topRisks = risks.slice(0, 6).map(r => `  [${r.severity.toUpperCase()}] ${r.title}`).join('\n');
    if (topRisks) lines.push(topRisks);
    sources.push('Risk Register');
  }

  const contextBlock = lines.length > 0 ? lines.join('\n\n') : 'No connector data available.';

  const sectionLabel = ({
    boards: 'Sprint Boards', bugs: 'Bug Tracker', engineers: 'Team Engineers',
    repos: 'Repositories', wiki: 'Wiki', risks: 'Risk Register', general: 'full project',
  } as Record<string, string>)[section] ?? section;

  const prompt =
`You are a sharp engineering PM assistant inside the Healix Engage PRM dashboard (Global HealthX).
The user is asking about: ${sectionLabel}
Their question: "${question}"

LIVE DATA:
${contextBlock}

Your job is to INTERPRET and ANALYSE — not restate the numbers. Be opinionated, direct, and specific.
- Name specific people, item IDs, and quantities when relevant
- Call out risks, bottlenecks, or anomalies you see in the data
- If the data is healthy, say so and why — don't hedge
- Keep response under 220 words. Use bullet points for lists. No markdown headers or bold.`;

  let answer = '';
  try {
    answer = await ollamaChat(prompt);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    console.warn('[AI Chat] Ollama error:', msg);
    const isUnreachable = msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('ENOTFOUND');
    if (isUnreachable) {
      answer = `AI service is not reachable (${OLLAMA_HOST}). Make sure Ollama is running on the server.\n\nRaw data:\n\n${contextBlock}`;
    } else if (lines.length > 0) {
      answer = `AI is unavailable (${msg}). Raw data:\n\n${contextBlock}`;
    } else {
      answer = `AI service unavailable: ${msg}`;
    }
  }

  res.json({ answer, section, sources });
});

export default router;
