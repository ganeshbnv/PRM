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

async function ollamaChat(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      options: { temperature: 0.65, num_predict: 900 },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
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

  // ── Fetch context data per section ───────────────────────────────────────────
  try {
    const isBoards = section === 'boards' || section === 'bugs' || section === 'general';
    const isEngineers = section === 'engineers' || section === 'general';
    const isRepos = section === 'repos' || section === 'general';
    const isRisks = section === 'risks' || section === 'general';

    const fetches = await Promise.allSettled([
      isBoards ? boardsSvc.getWorkItems({ project }) : Promise.resolve(null),
      isEngineers ? engineersSvc.getEngineerActivity(project) : Promise.resolve(null),
      isRepos ? reposSvc.getRepositories(project) : Promise.resolve(null),
      isRisks ? risksSvc.getRisks(project) : Promise.resolve(null),
    ]);

    // Work items
    if (isBoards && fetches[0].status === 'fulfilled' && fetches[0].value) {
      const items = fetches[0].value as Awaited<ReturnType<typeof boardsSvc.getWorkItems>>;
      const bugs = items.filter(i => i.fields['System.WorkItemType'] === 'Bug');
      const active = items.filter(i => ['Active', 'In Progress', 'Committed'].includes(i.fields['System.State']));
      const done = items.filter(i => ['Resolved', 'Closed', 'Done'].includes(i.fields['System.State']));
      lines.push(`WORK ITEMS: ${items.length} total | ${active.length} active | ${done.length} done | ${bugs.length} bugs`);
      const sample = items.slice(0, 25).map(i =>
        `  [${i.id}] (${i.fields['System.WorkItemType']}) ${i.fields['System.Title']} — ${i.fields['System.State']} — ${i.fields['System.AssignedTo']?.displayName ?? 'unassigned'}`
      ).join('\n');
      lines.push(`ITEM DETAILS:\n${sample}`);
      sources.push('ADO Work Items');
    }

    // Engineers
    if (isEngineers && fetches[1].status === 'fulfilled' && fetches[1].value) {
      const engineers = fetches[1].value as Awaited<ReturnType<typeof engineersSvc.getEngineerActivity>>;
      const top = engineers.slice(0, 12).map(e =>
        `  ${e.displayName}: ${e.commits.length} commits, ${e.prsOpened?.length ?? 0} PRs opened, ${e.prsReviewed?.length ?? 0} reviewed`
      ).join('\n');
      lines.push(`TEAM ACTIVITY (${engineers.length} contributors):\n${top}`);
      sources.push('Team Activity');
    }

    // Repositories
    if (isRepos && fetches[2].status === 'fulfilled' && fetches[2].value) {
      const repos = fetches[2].value as Awaited<ReturnType<typeof reposSvc.getRepositories>>;
      lines.push(`REPOSITORIES (${repos.length}): ${repos.map(r => r.name).join(', ')}`);
      sources.push('Repositories');
    }

    // Risks
    if (isRisks && fetches[3].status === 'fulfilled' && fetches[3].value) {
      const risks = fetches[3].value as Awaited<ReturnType<typeof risksSvc.getRisks>>;
      const critical = risks.filter(r => r.severity === 'critical');
      const high = risks.filter(r => r.severity === 'high');
      lines.push(`RISKS: ${risks.length} total | ${critical.length} critical | ${high.length} high`);
      const topRisks = risks.slice(0, 8).map(r => `  [${r.severity.toUpperCase()}] ${r.title}`).join('\n');
      if (topRisks) lines.push(`TOP RISKS:\n${topRisks}`);
      sources.push('Risk Register');
    }
  } catch (err) {
    console.warn('[AI Chat] Data fetch error:', (err as Error).message);
  }

  const contextBlock = lines.length > 0 ? lines.join('\n\n') : 'No connector data available at this time.';
  const sectionLabel = {
    boards: 'Sprint Boards', bugs: 'Bug Tracker', engineers: 'Team Engineers',
    repos: 'Repositories', wiki: 'Wiki', risks: 'Risk Register', general: 'full project',
  }[section] ?? section;

  const prompt = `You are Healix AI, an intelligent assistant embedded in the Healix Engage PRM dashboard for Global HealthX (Patient Relationship Management system).

The user is currently in the **${sectionLabel}** section and asks:
"${question}"

LIVE DATA FROM CONNECTED SYSTEMS:
${contextBlock}

Response guidelines:
- Answer directly based on the data above. Name specific items, people, and numbers when available.
- If the data doesn't answer the question, say so and suggest what they should look for.
- Keep response under 350 words. Be concise and actionable.
- Format with short paragraphs. Use simple bullet points (- item) for lists, not markdown headers.
- Speak as a knowledgeable, direct healthcare project management assistant.
- Do not repeat the question back. Start with the answer immediately.`;

  let answer = '';
  try {
    answer = await ollamaChat(prompt);
  } catch (err) {
    console.warn('[AI Chat] Ollama error:', (err as Error).message);
    answer = "I'm having trouble reaching the AI service right now. Make sure Ollama is running (`ollama serve`) and try again.";
  }

  res.json({ answer, section, sources });
});

export default router;
