import type { SprintStats } from './boards';
import type { WorkItem } from '../models/ado';

const OLLAMA_HOST  = process.env.OLLAMA_HOST  ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3';

export interface AiInsight {
  healthScore: number;
  healthLabel: 'On Track' | 'At Risk' | 'Critical';
  velocityPoints: number[];
  predictedCompletion: number;
  alerts: Alert[];
  summary: string;
  generatedAt: string;
  // richer metrics
  completionRate: number;
  staleCount: number;
  unassignedCount: number;
  bugCount: number;
  topAssignees: { name: string; count: number; active: number; resolved: number }[];
  stateCounts: Record<string, number>;
  sprintName: string | null;
  sprintDaysLeft: number | null;
  sprintDaysTotal: number | null;
  sprintElapsedPct: number | null;
  avgVelocity: number | null;
}

export interface Alert {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
}

function computeAlerts(items: WorkItem[], sprints: SprintStats[], iterationPath?: string): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();
  const resolvedStates = ['Resolved', 'Closed', 'Done', 'Completed', 'Verified'];

  // Current sprint
  const currentSprint = iterationPath
    ? sprints.find((s) => s.iteration.path === iterationPath)
    : sprints.find((s) => s.iteration.attributes.timeFrame === 'current');

  // P1 risks past midpoint
  if (currentSprint) {
    const { startDate, finishDate } = currentSprint.iteration.attributes;
    if (startDate && finishDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(finishDate).getTime();
      const mid = start + (end - start) / 2;
      if (now > mid) {
        const unresolvedP1 = items.filter(
          (i) => i.fields['Microsoft.VSTS.Common.Priority'] === 1 &&
                 !resolvedStates.includes(i.fields['System.State'])
        );
        if (unresolvedP1.length > 0) {
          alerts.push({
            severity: 'critical',
            title: `${unresolvedP1.length} P1 item${unresolvedP1.length > 1 ? 's' : ''} unresolved past sprint midpoint`,
            detail: unresolvedP1.map((i) => i.fields['System.Title']).slice(0, 3).join(', ') +
                    (unresolvedP1.length > 3 ? ` +${unresolvedP1.length - 3} more` : ''),
          });
        }
      }
    }
  }

  // Stale items (active but not updated in 3+ days)
  const staleThreshold = 3 * 24 * 60 * 60 * 1000;
  const stale = items.filter((i) => {
    const active = ['Active', 'In Progress', 'Committed'].includes(i.fields['System.State']);
    const lastChanged = new Date(i.fields['System.ChangedDate']).getTime();
    return active && (now - lastChanged) > staleThreshold;
  });
  if (stale.length > 0) {
    alerts.push({
      severity: 'warning',
      title: `${stale.length} item${stale.length > 1 ? 's' : ''} stale for 3+ days`,
      detail: stale.map((i) => i.fields['System.Title']).slice(0, 3).join(', ') +
              (stale.length > 3 ? ` +${stale.length - 3} more` : ''),
    });
  }

  // Unassigned items
  const unassigned = items.filter((i) => !i.fields['System.AssignedTo'] && !resolvedStates.includes(i.fields['System.State']));
  if (unassigned.length > 0) {
    alerts.push({
      severity: 'warning',
      title: `${unassigned.length} unassigned open item${unassigned.length > 1 ? 's' : ''}`,
      detail: 'Assign these to avoid delivery gaps',
    });
  }

  // Bottleneck: any state with >40% of open items
  const openItems = items.filter((i) => !resolvedStates.includes(i.fields['System.State']));
  if (openItems.length > 0) {
    const stateCounts: Record<string, number> = {};
    for (const i of openItems) {
      const s = i.fields['System.State'];
      stateCounts[s] = (stateCounts[s] ?? 0) + 1;
    }
    for (const [state, count] of Object.entries(stateCounts)) {
      if (count / openItems.length > 0.4 && openItems.length >= 5) {
        alerts.push({
          severity: 'info',
          title: `Bottleneck: ${Math.round(count / openItems.length * 100)}% of items stuck in "${state}"`,
          detail: `${count} of ${openItems.length} open items are in this state`,
        });
      }
    }
  }

  return alerts;
}

function computeHealthScore(items: WorkItem[], sprints: SprintStats[], iterationPath?: string): number {
  const resolvedStates = ['Resolved', 'Closed', 'Done', 'Completed', 'Verified'];
  const now = Date.now();
  const sprint = iterationPath
    ? sprints.find((s) => s.iteration.path === iterationPath)
    : sprints.find((s) => s.iteration.attributes.timeFrame === 'current');

  if (!items.length) return 70;

  let score = 60;
  const resolved = items.filter((i) => resolvedStates.includes(i.fields['System.State'])).length;
  const completionRate = resolved / items.length;
  score += Math.round(completionRate * 25);

  // Stale penalty
  const staleThreshold = 3 * 24 * 60 * 60 * 1000;
  const stale = items.filter((i) => {
    const active = ['Active', 'In Progress', 'Committed'].includes(i.fields['System.State']);
    return active && (now - new Date(i.fields['System.ChangedDate']).getTime()) > staleThreshold;
  });
  score -= Math.min(stale.length * 5, 20);

  // P1 risk penalty
  if (sprint) {
    const { startDate, finishDate } = sprint.iteration.attributes;
    if (startDate && finishDate) {
      const mid = new Date(startDate).getTime() + (new Date(finishDate).getTime() - new Date(startDate).getTime()) / 2;
      if (now > mid) {
        const unresolvedP1 = items.filter(
          (i) => i.fields['Microsoft.VSTS.Common.Priority'] === 1 && !resolvedStates.includes(i.fields['System.State'])
        ).length;
        score -= Math.min(unresolvedP1 * 10, 30);
      }
    }
  }

  return Math.max(0, Math.min(100, score));
}

export async function getAiInsights(
  project: string,
  team: string,
  items: WorkItem[],
  sprints: SprintStats[],
  iterationPath?: string
): Promise<AiInsight> {
  const resolvedStates = ['Resolved', 'Closed', 'Done', 'Completed', 'Verified'];
  const healthScore = computeHealthScore(items, sprints, iterationPath);
  const healthLabel = healthScore >= 70 ? 'On Track' : healthScore >= 45 ? 'At Risk' : 'Critical';
  const alerts = computeAlerts(items, sprints, iterationPath);

  const velocityPoints = sprints
    .filter((s) => s.iteration.attributes.timeFrame === 'past')
    .slice(-4)
    .map((s) => s.completedPoints);

  const resolved = items.filter((i) => resolvedStates.includes(i.fields['System.State'])).length;
  const predictedCompletion = items.length
    ? Math.min(100, Math.round((resolved / items.length) * 100 * 1.1))
    : 0;

  // AI summary via Claude
  const sprint = iterationPath
    ? sprints.find((s) => s.iteration.path === iterationPath)
    : sprints.find((s) => s.iteration.attributes.timeFrame === 'current');

  const stateCounts: Record<string, number> = {};
  for (const i of items) {
    const s = i.fields['System.State'];
    stateCounts[s] = (stateCounts[s] ?? 0) + 1;
  }

  const assigneeMap: Record<string, { count: number; active: number; resolved: number }> = {};
  for (const i of items) {
    const name = i.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
    if (!assigneeMap[name]) assigneeMap[name] = { count: 0, active: 0, resolved: 0 };
    assigneeMap[name].count++;
    if (resolvedStates.includes(i.fields['System.State'])) assigneeMap[name].resolved++;
    else if (['Active','In Progress','Committed'].includes(i.fields['System.State'])) assigneeMap[name].active++;
  }
  const topAssignees = Object.entries(assigneeMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([name, v]) => ({ name, ...v }));

  const bugCount = items.filter((i) => i.fields['System.WorkItemType'] === 'Bug').length;

  const staleCount = items.filter((i) => {
    const active = ['Active','In Progress','Committed'].includes(i.fields['System.State']);
    return active && (Date.now() - new Date(i.fields['System.ChangedDate']).getTime()) > 3 * 86400000;
  }).length;

  const unassignedCount = items.filter(
    (i) => !i.fields['System.AssignedTo'] && !resolvedStates.includes(i.fields['System.State'])
  ).length;

  // Sprint timing
  let sprintName: string | null = null;
  let sprintDaysLeft: number | null = null;
  let sprintDaysTotal: number | null = null;
  let sprintElapsedPct: number | null = null;
  if (sprint) {
    sprintName = sprint.iteration.name;
    const { startDate, finishDate } = sprint.iteration.attributes;
    if (startDate && finishDate) {
      const startDay = new Date(startDate); startDay.setHours(0, 0, 0, 0);
      const endDay   = new Date(finishDate); endDay.setHours(0, 0, 0, 0);
      const today    = new Date(); today.setHours(0, 0, 0, 0);
      const total    = Math.round((endDay.getTime() - startDay.getTime()) / 86400000);
      const elapsed  = Math.min(Math.max(0, Math.round((today.getTime() - startDay.getTime()) / 86400000)), total);
      sprintDaysTotal  = total;
      sprintDaysLeft   = Math.max(0, Math.round((endDay.getTime() - today.getTime()) / 86400000));
      sprintElapsedPct = Math.round((elapsed / total) * 100);
    }
  }

  const pastVelocities = sprints
    .filter((s) => s.iteration.attributes.timeFrame === 'past')
    .slice(-6)
    .map((s) => s.completedPoints);
  const avgVelocity = pastVelocities.length
    ? Math.round(pastVelocities.reduce((a, b) => a + b, 0) / pastVelocities.length)
    : null;

  const completionRate = items.length ? Math.round((resolved / items.length) * 100) : 0;

  const p1Count = items.filter((i) => i.fields['Microsoft.VSTS.Common.Priority'] === 1).length;
  const p1Resolved = items.filter((i) => i.fields['Microsoft.VSTS.Common.Priority'] === 1 && resolvedStates.includes(i.fields['System.State'])).length;

  // Additional metrics for the richer prompt
  const itemsByType: Record<string, number> = {};
  for (const i of items) {
    const t = i.fields['System.WorkItemType'] ?? 'Unknown';
    itemsByType[t] = (itemsByType[t] ?? 0) + 1;
  }

  const p1Unresolved = items.filter(
    (i) => i.fields['Microsoft.VSTS.Common.Priority'] === 1 && !resolvedStates.includes(i.fields['System.State'])
  );
  const p2Unresolved = items.filter(
    (i) => i.fields['Microsoft.VSTS.Common.Priority'] === 2 && !resolvedStates.includes(i.fields['System.State'])
  );

  const staleItems = items.filter((i) => {
    const active = ['Active','In Progress','Committed'].includes(i.fields['System.State']);
    return active && (Date.now() - new Date(i.fields['System.ChangedDate']).getTime()) > 3 * 86400000;
  });

  const openBugs = items.filter(
    (i) => i.fields['System.WorkItemType'] === 'Bug' && !resolvedStates.includes(i.fields['System.State'])
  );
  const bugDensityPct = items.length > 0 ? Math.round((openBugs.length / items.length) * 100) : 0;

  const velocityTrend = pastVelocities.length >= 2
    ? (pastVelocities[pastVelocities.length - 1] > pastVelocities[pastVelocities.length - 2] ? 'improving' : 'declining')
    : 'unknown';

  const daysElapsed = (sprintDaysTotal !== null && sprintDaysLeft !== null)
    ? Math.max(1, sprintDaysTotal - sprintDaysLeft) : null;
  const throughputPerDay = (daysElapsed && resolved > 0) ? +(resolved / daysElapsed).toFixed(1) : 0;
  const neededPerDay = (sprintDaysLeft && sprintDaysLeft > 0)
    ? +((items.length - resolved) / sprintDaysLeft).toFixed(1) : null;

  const prompt = `You are a sharp, opinionated engineering PM embedded in a live sprint dashboard. Your job is to interpret the data and give genuine insight — not restate the numbers. Be direct and specific.

PROJECT: ${project} | TEAM: ${team}
SPRINT: ${sprintName ?? 'Current'} | ${sprintDaysLeft ?? '?'}d left of ${sprintDaysTotal ?? '?'}d (${sprintElapsedPct ?? '?'}% elapsed)
HEALTH: ${healthScore}/100 — ${healthLabel}
COMPLETION: ${resolved}/${items.length} done (${completionRate}%) | Throughput: ${throughputPerDay} items/day actual vs ${neededPerDay ?? '?'} needed
WORK MIX: ${Object.entries(itemsByType).map(([t,c]) => `${t}:${c}`).join(', ')}
STATES: ${Object.entries(stateCounts).map(([s,c]) => `${s}:${c}`).join(', ')}
QUALITY: ${openBugs.length} open bugs (${bugDensityPct}% density) | P1 open: ${p1Unresolved.length} | P2 open: ${p2Unresolved.length}
RISKS: ${staleCount} stale items | ${unassignedCount} unassigned | Alerts: ${alerts.map(a => a.title).join('; ') || 'none'}
TEAM: ${topAssignees.map(a => `${a.name.split(' ')[0]}(${a.resolved}done/${a.active}wip)`).join(', ')}
VELOCITY: avg ${avgVelocity ?? 'n/a'} pts | trend ${velocityTrend} | history: ${pastVelocities.join(',')||'none'}

Output rules — follow exactly or the UI will break:
- Start your response immediately with "SPRINT PROGRESS —". No preamble, no introduction, no "Here is the output".
- Exactly 6 lines total, one per section, no blank lines between them.
- Each line: SECTION TITLE IN CAPS — your analysis. Nothing else on that line.
- No markdown, no bullet points, no bold, no line breaks within a section.
- Each section must be 1–2 sentences of genuine insight, NOT a restatement of the numbers.

SPRINT PROGRESS — <what the completion rate means given time elapsed; ahead/behind/on-track and why>
VELOCITY & PACE — <is throughput enough to finish; what the declining/improving trend signals>
QUALITY & TESTING — <interpret bug density and P1/P2 backlog; risk to release if unchecked>
TEAM WORKLOAD — <who is carrying the sprint; concentration risk or idle capacity; name names>
RISKS & BLOCKERS — <the single biggest threat to sprint success; be direct and specific>
RECOMMENDED ACTIONS — <three concrete prioritised actions the PM should take today>`;

  let summary = '';
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.4, num_predict: 1024 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const json = await res.json() as { message?: { content?: string }; error?: string };
    summary = json.message?.content?.trim() ?? '';
    if (!summary) throw new Error('empty response');
  } catch (err) {
    console.warn('[AI] Ollama unavailable:', (err as Error).message);
    summary = `SPRINT PROGRESS — ${completionRate}% done with ${sprintElapsedPct ?? '?'}% of sprint elapsed; ${completionRate >= (sprintElapsedPct ?? 0) ? 'on track' : 'behind pace'}.
VELOCITY & PACE — Throughput ${throughputPerDay} items/day vs ${neededPerDay ?? '?'} needed; ${neededPerDay && throughputPerDay >= neededPerDay ? 'sufficient to finish' : 'needs to accelerate'}.
QUALITY & TESTING — ${bugDensityPct}% bug density with ${p1Unresolved.length} P1 items unresolved${p1Unresolved.length > 0 ? '; P1s must be cleared before sprint close' : ''}.
TEAM WORKLOAD — ${topAssignees[0] ? `${topAssignees[0].name.split(' ')[0]} leads with ${topAssignees[0].resolved} resolved` : 'No assignee data'}; ${unassignedCount > 0 ? `${unassignedCount} items unassigned` : 'all items assigned'}.
RISKS & BLOCKERS — ${alerts[0]?.title ?? 'No critical alerts at this time'}.
RECOMMENDED ACTIONS — 1) Clear P1 backlog. 2) Assign unowned items. 3) Review stale items with owners.`;
  }

  return {
    healthScore,
    healthLabel,
    velocityPoints,
    predictedCompletion,
    alerts,
    summary,
    generatedAt: new Date().toISOString(),
    completionRate,
    staleCount,
    unassignedCount,
    bugCount,
    topAssignees,
    stateCounts,
    sprintName,
    sprintDaysLeft,
    sprintDaysTotal,
    sprintElapsedPct,
    avgVelocity,
  };
}
