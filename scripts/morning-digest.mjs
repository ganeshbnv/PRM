#!/usr/bin/env node
/**
 * PRM Morning Digest — fetches ADO data, runs Ollama AI analysis,
 * sends a rich HTML email via Microsoft Outlook.
 * Scheduled daily at 7:00 AM IST via LaunchAgent.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── .env loader ───────────────────────────────────────────────────────────────
function loadEnv() {
  const vars = {};
  fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z_0-9]*)\s*=\s*"?([^"#\n\r]*?)"?\s*$/);
    if (m) vars[m[1]] = m[2].trim();
  });
  return vars;
}

const env = loadEnv();
const ORG     = env.ADO_ORG;
const PROJECT = env.ADO_PROJECT;
const PAT     = env.ADO_PAT;
const OLLAMA  = env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL   = env.OLLAMA_MODEL || 'qwen3.5:4b';

if (!ORG || !PROJECT || !PAT) throw new Error('ADO_ORG, ADO_PROJECT, ADO_PAT are required in .env');

// ── ADO client helpers ────────────────────────────────────────────────────────
const AUTH_HDR = { Authorization: `Basic ${Buffer.from(':' + PAT).toString('base64')}`, 'Content-Type': 'application/json', Accept: 'application/json' };
const BASE = `https://dev.azure.com/${ORG}`;
const V = '7.1';

function addQS(url, params) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  return u.toString();
}

async function adoGet(url, params = {}) {
  const full = addQS(url, { 'api-version': V, ...params });
  const r = await fetch(full, { headers: AUTH_HDR });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return r.json();
}

async function adoPost(url, body, params = {}) {
  const full = addQS(url, { 'api-version': V, ...params });
  const r = await fetch(full, { method: 'POST', headers: AUTH_HDR, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${url} → ${r.status}`);
  return r.json();
}

async function adoList(url, params = {}) {
  const d = await adoGet(url, params);
  return d.value ?? (Array.isArray(d) ? d : []);
}

async function batchFetch(ids) {
  if (!ids.length) return [];
  const FIELDS = [
    'System.Id', 'System.Title', 'System.State', 'System.WorkItemType',
    'System.AssignedTo', 'System.CreatedDate', 'System.ChangedDate',
    'Microsoft.VSTS.Common.Priority', 'Microsoft.VSTS.Scheduling.StoryPoints',
    'System.IterationPath', 'System.BoardColumn', 'System.Tags',
  ];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  const results = await Promise.all(chunks.map(chunk =>
    adoPost(`${BASE}/_apis/wit/workitemsbatch`, { ids: chunk, fields: FIELDS })
      .then(r => r.value ?? [])
      .catch(() => [])
  ));
  return results.flat();
}

// ── ADO data fetcher ──────────────────────────────────────────────────────────
async function resolveProject() {
  try {
    const teams = await adoList(`${BASE}/_apis/projects/${encodeURIComponent(PROJECT)}/teams`);
    if (teams.length) return PROJECT;
  } catch {}

  const allProjects = await adoList(`${BASE}/_apis/projects`);
  let best = null, bestCount = 0;
  for (const proj of allProjects.slice(0, 10)) {
    try {
      const r = await adoPost(`${BASE}/${encodeURIComponent(proj.name)}/_apis/wit/wiql`, {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.Id] DESC`,
      });
      const cnt = (r.workItems ?? []).length;
      if (cnt > bestCount) { bestCount = cnt; best = proj.name; }
    } catch {}
  }
  if (!best) throw new Error('No accessible ADO project found');
  return best;
}

async function fetchAll() {
  const resolvedProject = await resolveProject();
  const d = {
    project: resolvedProject,
    teams: [],
    iterations: [],
    sprint: null,
    items: [],
    sprintItems: [],
    repos: [],
    prs: [],
    pipelines: [],
    commits: [],
  };

  // Teams
  try {
    d.teams = await adoList(`${BASE}/_apis/projects/${encodeURIComponent(resolvedProject)}/teams`);
    console.log(`  ✓ teams: ${d.teams.length}`);
  } catch (e) { console.warn(`  ⚠ teams: ${e.message}`); }

  const primaryTeam = d.teams.find(t =>
    t.name.toLowerCase().includes('main') ||
    t.name.toLowerCase() === resolvedProject.toLowerCase() ||
    t.name.toLowerCase().includes('default')
  )?.name ?? d.teams[0]?.name ?? resolvedProject;

  // Iterations / current sprint
  try {
    d.iterations = await adoList(`${BASE}/${encodeURIComponent(resolvedProject)}/${encodeURIComponent(primaryTeam)}/_apis/work/teamsettings/iterations`);
    d.sprint = d.iterations.find(i => i.attributes?.timeFrame === 'current') ?? null;
    console.log(`  ✓ iterations: ${d.iterations.length}  sprint: ${d.sprint?.name ?? 'none'}`);
  } catch (e) { console.warn(`  ⚠ iterations: ${e.message}`); }

  // All open work items
  try {
    const wiql = await adoPost(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/wit/wiql`, {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${resolvedProject}' AND [System.State] NOT IN ('Closed','Resolved','Done','Removed') ORDER BY [System.ChangedDate] DESC`,
    });
    const ids = (wiql.workItems ?? []).map(w => w.id).slice(0, 500);
    d.items = await batchFetch(ids);
    console.log(`  ✓ work items: ${d.items.length}`);
  } catch (e) { console.warn(`  ⚠ work items: ${e.message}`); }

  // All sprint items (including completed)
  if (d.sprint?.path) {
    try {
      const wiql = await adoPost(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/wit/wiql`, {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${resolvedProject}' AND [System.IterationPath] UNDER '${d.sprint.path}' ORDER BY [System.State] ASC`,
      });
      const ids = (wiql.workItems ?? []).map(w => w.id).slice(0, 500);
      d.sprintItems = await batchFetch(ids);
      console.log(`  ✓ sprint items: ${d.sprintItems.length}`);
    } catch (e) { console.warn(`  ⚠ sprint items: ${e.message}`); }
  }

  // Repositories
  try {
    d.repos = await adoList(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/git/repositories`);
    console.log(`  ✓ repos: ${d.repos.length}`);
  } catch (e) { console.warn(`  ⚠ repos: ${e.message}`); }

  // Active PRs
  await Promise.allSettled(d.repos.map(async repo => {
    try {
      const prs = await adoList(
        `${BASE}/${encodeURIComponent(resolvedProject)}/_apis/git/repositories/${repo.id}/pullrequests`,
        { 'searchCriteria.status': 'active' }
      );
      d.prs.push(...prs.map(pr => ({ ...pr, repoName: repo.name })));
    } catch {}
  }));
  console.log(`  ✓ active PRs: ${d.prs.length}`);

  // Commits — last 14 days
  const fromDate = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
  await Promise.allSettled(d.repos.map(async repo => {
    try {
      const commits = await adoList(
        `${BASE}/${encodeURIComponent(resolvedProject)}/_apis/git/repositories/${repo.id}/commits`,
        { 'searchCriteria.fromDate': fromDate, 'searchCriteria.$top': '50' }
      );
      d.commits.push(...commits.map(c => ({
        repoName: repo.name,
        author: c.author?.name ?? c.committer?.name ?? 'Unknown',
        date: c.author?.date ?? c.committer?.date ?? null,
        comment: (c.comment ?? '').split('\n')[0].slice(0, 100),
        commitId: (c.commitId ?? '').slice(0, 7),
      })));
    } catch {}
  }));
  console.log(`  ✓ commits (14d): ${d.commits.length}`);

  // Pipelines
  try {
    d.pipelines = await adoList(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/pipelines`);
    console.log(`  ✓ pipelines: ${d.pipelines.length}`);
  } catch (e) { console.warn(`  ⚠ pipelines: ${e.message}`); }

  return d;
}

// ── Ollama caller ─────────────────────────────────────────────────────────────
async function callOllama(prompt, maxTokens = 400) {
  const mkBody = (model) => JSON.stringify({
    model, prompt, stream: false,
    options: { temperature: 0.7, num_predict: maxTokens },
  });
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: mkBody(MODEL), signal: AbortSignal.timeout(90000),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return (j.response ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } catch {
    console.warn(`  ⚠ ${MODEL} timed out — falling back to gemma:latest`);
    const r2 = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: mkBody('gemma:latest'), signal: AbortSignal.timeout(120000),
    });
    const j2 = await r2.json();
    return (j2.response ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }
}

// ── Project AI analysis ───────────────────────────────────────────────────────
async function getAI(d) {
  const DONE = ['Resolved','Closed','Done','Removed','Verified','Cannot Reproduce'];
  const openBugs   = d.items.filter(w => w.fields['System.WorkItemType'] === 'Bug' && !DONE.includes(w.fields['System.State']));
  const critBugs   = openBugs.filter(b => (b.fields['Microsoft.VSTS.Common.Priority'] ?? 4) <= 2);
  const active     = d.items.filter(w => ['Active','In Progress','Committed'].includes(w.fields['System.State']));
  const stalePRs   = d.prs.filter(pr => Math.floor((Date.now() - new Date(pr.creationDate).getTime()) / 86400000) >= 5);
  const sprintDone  = d.sprintItems.filter(i => DONE.includes(i.fields['System.State'])).length;
  const sprintTotal = d.sprintItems.length;
  const sprintPct   = sprintTotal ? Math.round((sprintDone / sprintTotal) * 100) : 0;

  const engMap = {};
  for (const item of [...d.items, ...d.sprintItems.filter(i => DONE.includes(i.fields['System.State']))]) {
    const name = item.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
    if (!engMap[name]) engMap[name] = { active: 0, done: 0, bugs: 0, p1: 0 };
    if (DONE.includes(item.fields['System.State'])) engMap[name].done++;
    else engMap[name].active++;
    if (item.fields['System.WorkItemType'] === 'Bug' && !DONE.includes(item.fields['System.State'])) engMap[name].bugs++;
    if ((item.fields['Microsoft.VSTS.Common.Priority'] ?? 9) === 1 && !DONE.includes(item.fields['System.State'])) engMap[name].p1++;
  }
  const topEngineers = Object.entries(engMap)
    .filter(([n]) => n !== 'Unassigned')
    .sort((a, b) => b[1].active - a[1].active)
    .slice(0, 8);

  const now = new Date();
  const spProg = d.sprint?.attributes?.startDate && d.sprint?.attributes?.finishDate ? (() => {
    const s = new Date(d.sprint.attributes.startDate).getTime();
    const e = new Date(d.sprint.attributes.finishDate).getTime();
    return { dLeft: Math.max(0, Math.ceil((e - now.getTime()) / 86400000)) };
  })() : null;

  const lines = [
    'You are a senior engineering manager at a healthcare tech company. Give a sharp morning standup analysis.',
    '',
    `SPRINT: ${d.sprint?.name ?? 'No active sprint'}  |  ${spProg ? spProg.dLeft + ' days remaining' : ''}`,
    `TEAMS: ${d.teams.map(t => t.name).join(', ') || 'Unknown'}`,
    `SPRINT PROGRESS: ${sprintDone}/${sprintTotal} done (${sprintPct}%)  |  Active: ${active.length}  |  Open bugs: ${openBugs.length} (${critBugs.length} critical)  |  Stale PRs: ${stalePRs.length}/${d.prs.length}`,
    '',
    'ENGINEER WORKLOAD:',
    ...topEngineers.map(([name, s]) => `  - ${name}: ${s.active} active, ${s.done} done, ${s.bugs} bugs, ${s.p1} P1`),
    '',
    'TOP ACTIVE ITEMS:',
    ...active.slice(0, 5).map(w => `  - [${w.fields['System.WorkItemType']}${w.fields['Microsoft.VSTS.Common.Priority'] ? ' P' + w.fields['Microsoft.VSTS.Common.Priority'] : ''}] ${w.fields['System.Title']} → ${w.fields['System.AssignedTo']?.displayName ?? 'Unassigned'}`),
    '',
    'TOP OPEN BUGS:',
    ...openBugs.slice(0, 4).map(b => `  - P${b.fields['Microsoft.VSTS.Common.Priority'] ?? '?'} (${Math.floor((Date.now() - new Date(b.fields['System.CreatedDate']).getTime()) / 86400000)}d) ${b.fields['System.Title']} → ${b.fields['System.AssignedTo']?.displayName ?? 'UNASSIGNED'}`),
    '',
    'Write exactly 4 sections:',
    '1. EXECUTIVE SUMMARY: 2-3 sentences on sprint health',
    '2. KEY RISKS: top 3 specific risks with data',
    '3. TODAY\'S PRIORITIES: top 3 actions naming specific people/items',
    '4. TEAM PULSE: flag overloaded engineers or at-risk items',
    'Be specific and data-driven. Under 400 words.',
  ];

  try {
    return await callOllama(lines.join('\n'), 400);
  } catch (e) {
    console.warn(`  ⚠ Ollama AI: ${e.message}`);
    return '';
  }
}

// ── Code AI analysis ──────────────────────────────────────────────────────────
async function getCodeAI(d) {
  if (!d.commits.length) return '';

  const byAuthor = {};
  const byRepo = {};
  for (const c of d.commits) {
    byAuthor[c.author] = (byAuthor[c.author] ?? 0) + 1;
    byRepo[c.repoName] = (byRepo[c.repoName] ?? 0) + 1;
  }
  const topContributors = Object.entries(byAuthor).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topRepos = Object.entries(byRepo).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const recentCommits = [...d.commits]
    .filter(c => c.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const stalePRs = d.prs.filter(pr => Math.floor((Date.now() - new Date(pr.creationDate).getTime()) / 86400000) >= 5);

  const lines = [
    'You are a senior engineering manager at a healthcare tech company. Analyze the code activity from the last 14 days.',
    '',
    `TOTAL COMMITS (14 days): ${d.commits.length}  |  ACTIVE PRs: ${d.prs.length}  |  STALE PRs (5+ days): ${stalePRs.length}`,
    '',
    'TOP CONTRIBUTORS:',
    ...topContributors.map(([name, cnt]) => `  - ${name}: ${cnt} commits`),
    '',
    'MOST ACTIVE REPOS:',
    ...topRepos.map(([repo, cnt]) => `  - ${repo}: ${cnt} commits`),
    '',
    'RECENT COMMIT MESSAGES:',
    ...recentCommits.map(c => `  - [${c.repoName}] ${c.comment}`),
    '',
    'Analyze in 4 sections:',
    '1. CODE VELOCITY: team momentum and commit patterns',
    '2. QUALITY SIGNALS: what commit messages reveal about technical debt or progress',
    '3. COLLABORATION: bottlenecks, single points of failure, PR review health',
    '4. RECOMMENDATIONS: 2 specific coding process improvements',
    'Under 300 words.',
  ];

  try {
    return await callOllama(lines.join('\n'), 350);
  } catch (e) {
    console.warn(`  ⚠ Code AI: ${e.message}`);
    return '';
  }
}

// ── SVG helpers ───────────────────────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function daysOld(date) { return Math.floor((Date.now() - new Date(date).getTime()) / 86400000); }
function fmt(iso) { return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

const DONE_STATES = ['Resolved','Closed','Done','Removed','Verified','Cannot Reproduce'];
const STATE_COLOR = {
  'Active': '#2563eb', 'In Progress': '#2563eb', 'Committed': '#2563eb',
  'New': '#64748b', 'Proposed': '#64748b', 'Ready': '#64748b', 'To Do': '#64748b',
  'Resolved': '#16a34a', 'Closed': '#16a34a', 'Done': '#16a34a', 'Verified': '#16a34a',
  'Blocked': '#dc2626', 'On Hold': '#ea580c',
  'In Testing': '#7c3aed', 'Ready for Testing': '#7c3aed',
  'Design In Progress': '#0891b2',
  'Cannot Reproduce': '#64748b', 'Discarded': '#94a3b8', 'Reopened': '#f59e0b',
};
const PIE_PAL = ['#6366f1','#38bdf8','#34d399','#f59e0b','#ef4444','#a78bfa','#fb923c','#60a5fa','#f472b6','#4ade80'];

function pieSVG(slices, size) {
  size = size || 150;
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) return '<svg width="' + size + '" height="' + size + '"><text x="' + (size/2) + '" y="' + (size/2) + '" text-anchor="middle" fill="#94a3b8" font-size="11">No data</text></svg>';
  let paths = '';
  let angle = -Math.PI / 2;
  const cx = size / 2, cy = size / 2, r = size / 2 - 5;
  for (const sl of slices) {
    if (!sl.value) continue;
    const sweep = (sl.value / total) * 2 * Math.PI;
    const end = angle + sweep;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const lg = sweep > Math.PI ? 1 : 0;
    paths += '<path d="M' + cx.toFixed(1) + ',' + cy.toFixed(1) + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' A' + r + ',' + r + ' 0 ' + lg + ',1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' Z" fill="' + sl.color + '" stroke="#fff" stroke-width="1.5"/>';
    angle = end;
  }
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">' + paths + '</svg>';
}

function burndownSVG(sprint, sprintItems, W, H) {
  W = W || 380; H = H || 175;
  if (!sprint || !sprint.attributes || !sprint.attributes.startDate || !sprint.attributes.finishDate || !sprintItems.length) {
    return '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg"><text x="' + (W/2) + '" y="' + (H/2) + '" text-anchor="middle" fill="#94a3b8" font-size="12">No sprint data available</text></svg>';
  }
  const PAD = { t: 18, r: 16, b: 32, l: 38 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;
  const startMs = new Date(sprint.attributes.startDate).getTime();
  const endMs = new Date(sprint.attributes.finishDate).getTime();
  const nowMs = Date.now();
  const totalMs = endMs - startMs;
  const totalDays = Math.max(1, Math.ceil(totalMs / 86400000));
  const total = sprintItems.length;
  const doneItems = sprintItems.filter(i => DONE_STATES.includes(i.fields['System.State']));
  const xS = function(day) { return PAD.l + (day / totalDays) * iW; };
  const yS = function(val) { return PAD.t + (1 - val / total) * iH; };
  const todayDay = Math.min(totalDays, Math.max(0, Math.ceil((nowMs - startMs) / 86400000)));
  const pts = [];
  for (let day = 0; day <= todayDay; day++) {
    const dayEndMs = startMs + day * 86400000 + 86399999;
    const doneCount = doneItems.filter(i => new Date(i.fields['System.ChangedDate']).getTime() <= dayEndMs).length;
    pts.push([xS(day), yS(total - doneCount)]);
  }

  let svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="font-family:-apple-system,sans-serif">';
  // Grid
  const ticks = [0, Math.round(total * 0.5), total];
  for (const v of ticks) {
    const y = yS(v).toFixed(1);
    svg += '<line x1="' + PAD.l + '" y1="' + y + '" x2="' + (PAD.l + iW) + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="0.5"/>';
    svg += '<text x="' + (PAD.l - 5) + '" y="' + y + '" text-anchor="end" dominant-baseline="middle" font-size="9" fill="#94a3b8">' + v + '</text>';
  }
  // Axes
  svg += '<line x1="' + PAD.l + '" y1="' + PAD.t + '" x2="' + PAD.l + '" y2="' + (PAD.t + iH) + '" stroke="#cbd5e1" stroke-width="1"/>';
  svg += '<line x1="' + PAD.l + '" y1="' + (PAD.t + iH) + '" x2="' + (PAD.l + iW) + '" y2="' + (PAD.t + iH) + '" stroke="#cbd5e1" stroke-width="1"/>';
  // X labels
  for (const d of [0, Math.round(totalDays / 2), totalDays]) {
    const x = xS(d).toFixed(1);
    svg += '<text x="' + x + '" y="' + (PAD.t + iH + 16) + '" text-anchor="middle" font-size="9" fill="#94a3b8">Day ' + d + '</text>';
  }
  // Ideal line (dashed)
  svg += '<line x1="' + xS(0).toFixed(1) + '" y1="' + yS(total).toFixed(1) + '" x2="' + xS(totalDays).toFixed(1) + '" y2="' + yS(0).toFixed(1) + '" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5,4"/>';
  // Today marker
  if (todayDay > 0 && todayDay < totalDays) {
    const tx = xS(todayDay).toFixed(1);
    svg += '<line x1="' + tx + '" y1="' + PAD.t + '" x2="' + tx + '" y2="' + (PAD.t + iH) + '" stroke="#ef4444" stroke-width="1" stroke-dasharray="3,3" opacity="0.7"/>';
    svg += '<text x="' + tx + '" y="' + (PAD.t - 4) + '" text-anchor="middle" font-size="9" fill="#ef4444" font-weight="600">Today</text>';
  }
  // Actual area + line
  if (pts.length >= 2) {
    const last = pts[pts.length - 1];
    const areaD = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') +
      ' L' + last[0].toFixed(1) + ',' + (PAD.t + iH).toFixed(1) +
      ' L' + xS(0).toFixed(1) + ',' + (PAD.t + iH).toFixed(1) + ' Z';
    svg += '<path d="' + areaD + '" fill="#6366f1" opacity="0.1"/>';
    const lineD = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    svg += '<path d="' + lineD + '" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4" fill="#6366f1" stroke="#fff" stroke-width="1.5"/>';
    const remaining = total - doneItems.filter(i => new Date(i.fields['System.ChangedDate']).getTime() <= nowMs).length;
    const labelX = Math.min(last[0] + 8, PAD.l + iW - 32);
    svg += '<text x="' + labelX.toFixed(1) + '" y="' + (last[1] - 3).toFixed(1) + '" font-size="9" fill="#6366f1" font-weight="700">' + remaining + ' left</text>';
  }
  // Legend
  const ly = PAD.t + iH + 27;
  svg += '<circle cx="' + (PAD.l + 8) + '" cy="' + ly + '" r="3.5" fill="#6366f1"/>';
  svg += '<text x="' + (PAD.l + 16) + '" y="' + (ly + 1) + '" dominant-baseline="middle" font-size="9" fill="#475569">Actual</text>';
  svg += '<line x1="' + (PAD.l + 56) + '" y1="' + ly + '" x2="' + (PAD.l + 68) + '" y2="' + ly + '" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,3"/>';
  svg += '<text x="' + (PAD.l + 72) + '" y="' + (ly + 1) + '" dominant-baseline="middle" font-size="9" fill="#475569">Ideal</text>';
  svg += '</svg>';
  return svg;
}

// ── HTML email builder ────────────────────────────────────────────────────────
function buildHtml(d, ai, codeAi) {
  const now = new Date();
  const IST = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ── Derived data ────────────────────────────────────────────────────────────
  const openBugs   = d.items.filter(w => w.fields['System.WorkItemType'] === 'Bug' && !DONE_STATES.includes(w.fields['System.State']));
  const critBugs   = openBugs.filter(b => (b.fields['Microsoft.VSTS.Common.Priority'] ?? 4) <= 2);
  const stalePRs   = d.prs.filter(pr => daysOld(pr.creationDate) >= 5);
  const sprintDone = d.sprintItems.filter(i => DONE_STATES.includes(i.fields['System.State'])).length;
  const sprintTotal = d.sprintItems.length;
  const sprintPct   = sprintTotal ? Math.round((sprintDone / sprintTotal) * 100) : 0;
  const sprintActive  = d.sprintItems.filter(i => ['Active','In Progress','Committed'].includes(i.fields['System.State'])).length;
  const sprintBlocked = d.sprintItems.filter(i => i.fields['System.State'] === 'Blocked').length;
  const sprintNew     = d.sprintItems.filter(i => ['New','Proposed','To Do','Ready'].includes(i.fields['System.State'])).length;

  const spProg = d.sprint?.attributes?.startDate && d.sprint?.attributes?.finishDate ? (() => {
    const s = new Date(d.sprint.attributes.startDate).getTime();
    const e = new Date(d.sprint.attributes.finishDate).getTime();
    const pct = Math.round(Math.min(100, Math.max(0, (now.getTime() - s) / (e - s) * 100)));
    const dLeft = Math.max(0, Math.ceil((e - now.getTime()) / 86400000));
    return { pct, dLeft };
  })() : null;

  // Work item type distribution
  const typeCounts = {};
  d.items.forEach(w => { const t = w.fields['System.WorkItemType']; typeCounts[t] = (typeCounts[t] ?? 0) + 1; });
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const typeSlices = typeEntries.map((e, i) => ({ label: e[0], value: e[1], color: PIE_PAL[i % PIE_PAL.length] }));

  // State distribution
  const stateCounts = {};
  d.items.forEach(w => { const s = w.fields['System.State']; stateCounts[s] = (stateCounts[s] ?? 0) + 1; });
  const stateEntries = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]);
  const maxState = Math.max(...stateEntries.map(e => e[1]), 1);

  // Engineer summary
  const engMap = {};
  const sprintDoneItems = d.sprintItems.filter(i => DONE_STATES.includes(i.fields['System.State']));
  for (const item of [...d.items, ...sprintDoneItems]) {
    const name = item.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
    const isDone = DONE_STATES.includes(item.fields['System.State']);
    const isBlocked = item.fields['System.State'] === 'Blocked';
    if (!engMap[name]) engMap[name] = { active: 0, done: 0, bugs: 0, p1p2: 0, blocked: 0 };
    if (isDone) engMap[name].done++;
    else { engMap[name].active++; if (isBlocked) engMap[name].blocked++; }
    if (item.fields['System.WorkItemType'] === 'Bug' && !isDone) engMap[name].bugs++;
    if ((item.fields['Microsoft.VSTS.Common.Priority'] ?? 9) <= 2 && !isDone) engMap[name].p1p2++;
  }
  const prsByEng = {};
  for (const pr of d.prs) { const n = pr.createdBy?.displayName ?? 'Unknown'; prsByEng[n] = (prsByEng[n] ?? 0) + 1; }
  const engineers = Object.entries(engMap).sort((a, b) => b[1].active - a[1].active).slice(0, 15);

  // Engineer pie (top 7 by active)
  const topEngForPie = engineers.filter(([n]) => n !== 'Unassigned').slice(0, 7);
  const engSlices = topEngForPie.map(([name, s], i) => ({ label: name.split(' ')[0], value: s.active, color: PIE_PAL[i % PIE_PAL.length] }));

  // Sprint workload per person
  const sprintEngMap = {};
  for (const item of d.sprintItems) {
    const name = item.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
    if (!sprintEngMap[name]) sprintEngMap[name] = { done: 0, active: 0, notStarted: 0, blocked: 0 };
    const state = item.fields['System.State'];
    if (DONE_STATES.includes(state))                              sprintEngMap[name].done++;
    else if (['Active','In Progress','Committed'].includes(state)) sprintEngMap[name].active++;
    else if (state === 'Blocked')                                  sprintEngMap[name].blocked++;
    else                                                           sprintEngMap[name].notStarted++;
  }
  const sprintPeople = Object.entries(sprintEngMap).sort((a, b) => (b[1].active + b[1].done) - (a[1].active + a[1].done));

  // Commits aggregation
  const commitsByAuthor = {};
  const commitsByRepo = {};
  for (const c of d.commits) {
    commitsByAuthor[c.author] = (commitsByAuthor[c.author] ?? 0) + 1;
    commitsByRepo[c.repoName] = (commitsByRepo[c.repoName] ?? 0) + 1;
  }
  const topCommitters = Object.entries(commitsByAuthor).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const recentCommits = [...d.commits].filter(c => c.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);

  // AI text rendering
  const fallback = [
    'SPRINT PROGRESS — ' + sprintPct + '% of ' + sprintTotal + ' sprint items done' + (d.sprint ? ' with ' + (spProg?.dLeft ?? '?') + ' days remaining in ' + d.sprint.name : '') + '.',
    'QUALITY — ' + openBugs.length + ' open bugs (' + critBugs.length + ' critical/high). Bug density: ' + (d.items.length ? Math.round((openBugs.length / d.items.length) * 100) : 0) + '% of active backlog.',
    'ACTIVE WORK — ' + d.items.length + ' open items; ' + sprintActive + ' in progress within sprint.',
    stalePRs.length > 0 ? 'PULL REQUESTS — ' + stalePRs.length + ' of ' + d.prs.length + ' PRs stale (5+ days).' : 'PULL REQUESTS — ' + d.prs.length + ' active PRs, none stale.',
    'NOTE — AI model (' + MODEL + ') unavailable. Run: ollama serve',
  ].join('\n');

  const renderAI = function(text) {
    return (text || fallback).split('\n').map(function(l) { return esc(l).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); }).join('<br>\n');
  };

  const codeFallback = d.commits.length
    ? 'CODE ACTIVITY — ' + d.commits.length + ' commits in the last 14 days across ' + d.repos.length + ' repositories. Top contributor: ' + (topCommitters[0]?.[0] ?? 'Unknown') + ' (' + (topCommitters[0]?.[1] ?? 0) + ' commits).'
    : 'No commit activity found in the last 14 days.';

  // ── CSS ─────────────────────────────────────────────────────────────────────
  const CSS = `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f0f4f8;color:#1e293b;line-height:1.5}
    .w{max-width:800px;margin:0 auto;background:#f0f4f8}
    .hdr{background:linear-gradient(135deg,#1a1857 0%,#2d2f9a 50%,#1e3a8a 100%);padding:28px 32px;width:100%}
    .hdr-row{display:flex;align-items:center;gap:16px}
    .logo{width:52px;height:52px;background:rgba(255,255,255,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0}
    .hdr-title{font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-.5px;line-height:1.1}
    .hdr-sub{font-size:13px;color:#e0e7ff;margin-top:4px;font-weight:500}
    .hdr-date{margin-top:14px;font-size:12px;color:#ffffff;background:#4338ca;display:inline-block;padding:6px 18px;border-radius:100px;font-weight:700;letter-spacing:.2px}
    .ai-banner{background:linear-gradient(135deg,#1e1b4b 0%,#3730a3 50%,#312e81 100%);padding:26px 32px;border-bottom:3px solid #6366f1}
    .ai-banner-hdr{display:flex;align-items:center;gap:12px;margin-bottom:14px}
    .ai-banner-icon{font-size:28px}
    .ai-banner-title{font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-.3px}
    .ai-banner-sub{font-size:11px;color:#a5b4fc;text-transform:uppercase;letter-spacing:2px;margin-top:2px}
    .ai-banner-body{font-size:14px;line-height:1.8;color:#e0e7ff;background:rgba(0,0,0,.25);border-radius:10px;padding:18px 20px;border:1px solid rgba(255,255,255,.1)}
    .body{background:#f0f4f8;padding:12px 0 24px}
    .sec{background:#fff;margin:10px 16px;border-radius:12px;padding:20px 24px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.05)}
    .sec-h{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#1d4ed8;margin-bottom:14px;display:flex;align-items:center;gap:8px}
    .sec-h::before{content:'';width:3px;height:14px;background:linear-gradient(to bottom,#1d4ed8,#0ea5e9);border-radius:2px;flex-shrink:0}
    .two-col{display:flex;gap:20px;align-items:flex-start}
    .two-col > .col{flex:1;min-width:0}
    .two-col > .col-wide{flex:1.4;min-width:0}
    .two-col > .col-narrow{flex:.7;min-width:0}
    .kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 10px;text-align:center}
    .kpi-n{font-size:28px;font-weight:900;line-height:1}
    .kpi-l{font-size:10px;color:#64748b;margin-top:5px;text-transform:uppercase;letter-spacing:.6px}
    .kpi-s{font-size:10px;color:#94a3b8;margin-top:2px}
    .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:11px 14px;margin-bottom:6px}
    .card:last-child{margin-bottom:0}
    .card-row{display:flex;gap:10px;align-items:flex-start}
    .rtitle{font-size:13px;color:#1e293b;flex:1;font-weight:500}
    .rmeta{font-size:11px;color:#64748b;margin-top:3px}
    .pb-bg{height:7px;background:#e2e8f0;border-radius:100px;overflow:hidden;margin-top:6px}
    .pb-f{height:100%;border-radius:100px}
    .pb-lbl{display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#64748b}
    .state-row{display:flex;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9;gap:8px}
    .state-row:last-child{border-bottom:none}
    .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
    .sn{font-size:12px;color:#334155;flex:1}
    .sc{font-size:12px;font-weight:700;color:#1e293b;width:28px;text-align:right}
    .sbar{width:80px;height:4px;background:#e2e8f0;border-radius:100px;overflow:hidden}
    .sbar-f{height:100%;border-radius:100px}
    .badge{font-size:10px;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:5px;flex-shrink:0;letter-spacing:.3px}
    .p1{background:#fee2e2;color:#b91c1c}
    .p2{background:#ffedd5;color:#c2410c}
    .p3{background:#fef9c3;color:#a16207}
    .p4{background:#f1f5f9;color:#64748b}
    .age-w{background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;flex-shrink:0;white-space:nowrap;border:1px solid #fbbf24}
    .age-ok{background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;flex-shrink:0;white-space:nowrap}
    .code-ai-box{background:linear-gradient(135deg,#0c1a2e 0%,#0f3460 100%);padding:20px 22px;border-radius:10px;border:1px solid #22d3ee}
    .code-ai-label{font-size:11px;font-weight:800;color:#22d3ee;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .code-ai-body{font-size:13.5px;line-height:1.8;color:#e0f2fe}
    .repo-tag{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;font-size:12px;color:#475569;display:inline-block;margin:3px}
    .ftr{padding:14px 22px;text-align:center;border-top:1px solid #e2e8f0;margin:0 16px 14px}
    .ftr p{font-size:11px;color:#94a3b8;margin:2px 0}
    .c-blue{color:#2563eb}.c-red{color:#dc2626}.c-amber{color:#d97706}.c-green{color:#16a34a}.c-slate{color:#475569}.c-indigo{color:#4f46e5}
    .sp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
    .sp-tile{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px;text-align:center}
    .sp-tile-n{font-size:24px;font-weight:900;line-height:1}
    .sp-tile-l{font-size:9px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
    table.eng{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
    table.eng th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;padding:6px 8px;border-bottom:2px solid #e2e8f0;background:#f8fafc}
    table.eng td{padding:8px 8px;border-bottom:1px solid #f1f5f9;color:#1e293b;vertical-align:middle}
    table.eng tr:last-child td{border-bottom:none}
    .eng-name{font-weight:600;color:#1e293b;font-size:12.5px}
    .n{display:inline-block;min-width:24px;text-align:center;padding:2px 5px;border-radius:4px;font-weight:700;font-size:11px}
    .n-blue{background:#dbeafe;color:#1d4ed8}.n-green{background:#d1fae5;color:#065f46}
    .n-red{background:#fee2e2;color:#b91c1c}.n-amber{background:#fef3c7;color:#92400e}
    .n-gray{background:#f1f5f9;color:#64748b}
    .blocked-tag{font-size:10px;background:#fee2e2;color:#b91c1c;padding:1px 5px;border-radius:3px;font-weight:700;margin-left:4px}
    .bug-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .chart-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.8px;font-weight:700;margin-bottom:8px}
    .legend-item{display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px;color:#475569}
    .legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .commit-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9}
    .commit-row:last-child{border-bottom:none}
    .commit-hash{font-size:10px;font-weight:700;color:#6366f1;background:#ede9fe;padding:2px 6px;border-radius:4px;flex-shrink:0;font-family:monospace}
    .commit-repo{font-size:10px;color:#94a3b8;flex-shrink:0}
    .commit-msg{font-size:12px;color:#1e293b;flex:1}
    .commit-author{font-size:10px;color:#64748b}
  `;

  // ── Assemble ────────────────────────────────────────────────────────────────
  let html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRM Morning Digest</title><style>' + CSS + '</style></head><body><div class="w">';

  // ── HEADER ──────────────────────────────────────────────────────────────────
  html += '<div class="hdr">';
  html += '<div class="hdr-row"><div class="logo">📊</div><div><div class="hdr-title">PRM Morning Digest</div><div class="hdr-sub">Global HealthX &nbsp;·&nbsp; ' + esc(d.project ?? PROJECT) + ' &nbsp;·&nbsp; Engineering Intelligence</div></div></div>';
  html += '<div class="hdr-date">📅 &nbsp;' + esc(IST) + '</div>';
  html += '</div>';

  // ── 🧠 AI MORNING INTELLIGENCE (TOP — PROMINENT) ───────────────────────────
  html += '<div class="ai-banner">';
  html += '<div class="ai-banner-hdr"><div class="ai-banner-icon">🧠</div><div><div class="ai-banner-title">AI Morning Intelligence</div><div class="ai-banner-sub">Powered by ' + esc(MODEL) + ' &nbsp;·&nbsp; Generated ' + esc(IST) + '</div></div></div>';
  html += '<div class="ai-banner-body">' + renderAI(ai) + '</div>';
  html += '</div>';

  html += '<div class="body">';

  // ── SPRINT STATUS (2-col: left info + right burndown) ──────────────────────
  html += '<div class="sec"><div class="sec-h">Sprint Status &amp; Burndown</div>';
  if (d.sprint) {
    html += '<div class="two-col">';
    // Left col: sprint info
    html += '<div class="col">';
    html += '<div style="font-size:16px;font-weight:800;color:#1e293b;margin-bottom:4px">🏃 ' + esc(d.sprint.name) + '</div>';
    html += '<div style="font-size:12px;color:#64748b;margin-bottom:12px">' + fmt(d.sprint.attributes?.startDate) + ' &rarr; ' + fmt(d.sprint.attributes?.finishDate) + (spProg ? ' &nbsp;·&nbsp; <strong style="color:#1d4ed8">' + spProg.dLeft + ' days left</strong>' : '') + '</div>';

    if (spProg) {
      const timeCol = spProg.pct >= 80 ? '#dc2626' : spProg.pct >= 50 ? '#d97706' : '#2563eb';
      html += '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Time elapsed</div>';
      html += '<div class="pb-bg"><div class="pb-f" style="width:' + spProg.pct + '%;background:' + timeCol + '"></div></div>';
      html += '<div class="pb-lbl"><span>' + spProg.pct + '% elapsed</span><span>' + (100 - spProg.pct) + '% remaining</span></div>';
    }

    if (sprintTotal > 0) {
      const compCol = sprintPct >= 70 ? '#16a34a' : sprintPct >= 40 ? '#d97706' : '#dc2626';
      html += '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 3px">Completion (' + sprintDone + ' / ' + sprintTotal + ' items)</div>';
      html += '<div class="pb-bg"><div class="pb-f" style="width:' + sprintPct + '%;background:' + compCol + '"></div></div>';
      html += '<div class="pb-lbl"><span>' + sprintPct + '% done</span><span>' + (sprintTotal - sprintDone) + ' remaining</span></div>';
      html += '<div class="sp-grid">';
      html += '<div class="sp-tile"><div class="sp-tile-n c-green">' + sprintDone + '</div><div class="sp-tile-l">Done</div></div>';
      html += '<div class="sp-tile"><div class="sp-tile-n c-blue">' + sprintActive + '</div><div class="sp-tile-l">In Progress</div></div>';
      html += '<div class="sp-tile"><div class="sp-tile-n c-slate">' + sprintNew + '</div><div class="sp-tile-l">Not Started</div></div>';
      html += '<div class="sp-tile"><div class="sp-tile-n c-red">' + sprintBlocked + '</div><div class="sp-tile-l">Blocked</div></div>';
      html += '</div>';
    }
    html += '</div>'; // end left col

    // Right col: burndown chart
    html += '<div class="col" style="display:flex;flex-direction:column;align-items:stretch">';
    html += '<div class="chart-label">Burndown Chart</div>';
    html += burndownSVG(d.sprint, d.sprintItems, 360, 180);
    html += '</div>';
    html += '</div>'; // end two-col
  } else {
    html += '<p style="color:#64748b;font-size:13px">No active sprint found — check Azure DevOps team settings.</p>';
  }

  // Sprint workload per person
  if (sprintPeople.length > 0) {
    html += '<div style="margin-top:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:8px">Sprint workload per person</div>';
    html += '<table class="eng"><thead><tr><th>Engineer</th><th style="text-align:center">Done</th><th style="text-align:center">Active</th><th style="text-align:center">Not Started</th><th style="text-align:center">Blocked</th></tr></thead><tbody>';
    for (const [name, s] of sprintPeople) {
      const total2 = s.done + s.active + s.notStarted + s.blocked;
      const dp = total2 ? Math.round((s.done / total2) * 100) : 0;
      html += '<tr>';
      html += '<td><div class="eng-name">' + esc(name) + '</div><div style="font-size:10px;color:#94a3b8">' + total2 + ' items · ' + dp + '% done</div></td>';
      html += '<td style="text-align:center"><span class="n n-green">' + s.done + '</span></td>';
      html += '<td style="text-align:center"><span class="n n-blue">' + s.active + '</span></td>';
      html += '<td style="text-align:center"><span class="n n-gray">' + s.notStarted + '</span></td>';
      html += '<td style="text-align:center">' + (s.blocked > 0 ? '<span class="n n-red">' + s.blocked + '</span>' : '<span style="color:#cbd5e1">—</span>') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  html += '</div>'; // end sprint sec

  // ── PROJECT KPIs (5 tiles) ──────────────────────────────────────────────────
  html += '<div class="sec"><div class="sec-h">Project At-a-Glance</div><div class="kpi-grid">';
  html += '<div class="kpi"><div class="kpi-n c-blue">' + d.items.length + '</div><div class="kpi-l">Work Items</div><div class="kpi-s">open / active</div></div>';
  html += '<div class="kpi"><div class="kpi-n c-red">' + openBugs.length + '</div><div class="kpi-l">Open Bugs</div><div class="kpi-s">' + critBugs.length + ' critical/high</div></div>';
  html += '<div class="kpi"><div class="kpi-n c-amber">' + d.prs.length + '</div><div class="kpi-l">Active PRs</div><div class="kpi-s">' + stalePRs.length + ' stale</div></div>';
  html += '<div class="kpi"><div class="kpi-n c-indigo">' + d.commits.length + '</div><div class="kpi-l">Commits</div><div class="kpi-s">last 14 days</div></div>';
  html += '<div class="kpi"><div class="kpi-n c-green">' + d.repos.length + '</div><div class="kpi-l">Repos</div><div class="kpi-s">' + d.teams.length + ' team' + (d.teams.length !== 1 ? 's' : '') + '</div></div>';
  html += '</div></div>';

  // ── WORK DISTRIBUTION (2-col: state bars | pie charts) ─────────────────────
  if (stateEntries.length || typeSlices.length) {
    html += '<div class="sec"><div class="sec-h">Work Distribution</div><div class="two-col">';

    // Left: state bars
    html += '<div class="col-wide">';
    html += '<div class="chart-label">Items by State</div>';
    stateEntries.forEach(function(entry) {
      const state = entry[0], count = entry[1];
      const col = STATE_COLOR[state] ?? '#6366f1';
      const pct = Math.round((count / maxState) * 100);
      html += '<div class="state-row"><div class="dot" style="background:' + col + '"></div><div class="sn">' + esc(state) + '</div><div class="sbar"><div class="sbar-f" style="width:' + pct + '%;background:' + col + '"></div></div><div class="sc">' + count + '</div></div>';
    });
    html += '</div>'; // end left col

    // Right: two pie charts stacked
    html += '<div class="col">';

    // Work item type pie
    if (typeSlices.length > 0) {
      html += '<div class="chart-label">Items by Type</div>';
      html += '<div style="display:flex;gap:14px;align-items:center;margin-bottom:18px">';
      html += pieSVG(typeSlices, 130);
      html += '<div>';
      typeSlices.slice(0, 6).forEach(function(sl) {
        html += '<div class="legend-item"><div class="legend-dot" style="background:' + sl.color + '"></div><span>' + esc(sl.label) + ' <strong>(' + sl.value + ')</strong></span></div>';
      });
      html += '</div></div>';
    }

    // Engineer active items pie
    if (engSlices.length > 0) {
      html += '<div class="chart-label" style="margin-top:4px">Active Items by Engineer</div>';
      html += '<div style="display:flex;gap:14px;align-items:center">';
      html += pieSVG(engSlices, 130);
      html += '<div>';
      engSlices.forEach(function(sl) {
        html += '<div class="legend-item"><div class="legend-dot" style="background:' + sl.color + '"></div><span>' + esc(sl.label) + ' <strong>(' + sl.value + ')</strong></span></div>';
      });
      html += '</div></div>';
    }

    html += '</div>'; // end right col
    html += '</div></div>'; // end two-col + sec
  }

  // ── TEAM & ENGINEER SUMMARY ─────────────────────────────────────────────────
  if (engineers.length > 0) {
    html += '<div class="sec"><div class="sec-h">Team &amp; Engineer Summary</div>';
    html += '<table class="eng"><thead><tr>';
    html += '<th>Engineer</th>';
    html += '<th style="text-align:center">Active</th>';
    html += '<th style="text-align:center">Done (Sprint)</th>';
    html += '<th style="text-align:center">Open Bugs</th>';
    html += '<th style="text-align:center">P1 / P2</th>';
    html += '<th style="text-align:center">Open PRs</th>';
    html += '</tr></thead><tbody>';
    for (const [name, s] of engineers) {
      const prs = prsByEng[name] ?? 0;
      html += '<tr>';
      html += '<td><span class="eng-name">' + esc(name) + '</span>' + (s.blocked > 0 ? '<span class="blocked-tag">⚠ BLOCKED</span>' : '') + '</td>';
      html += '<td style="text-align:center"><span class="n ' + (s.active > 5 ? 'n-amber' : 'n-blue') + '">' + s.active + '</span></td>';
      html += '<td style="text-align:center"><span class="n n-green">' + s.done + '</span></td>';
      html += '<td style="text-align:center">' + (s.bugs > 0 ? '<span class="n n-red">' + s.bugs + '</span>' : '<span style="color:#cbd5e1">—</span>') + '</td>';
      html += '<td style="text-align:center">' + (s.p1p2 > 0 ? '<span class="n n-amber">' + s.p1p2 + '</span>' : '<span style="color:#cbd5e1">—</span>') + '</td>';
      html += '<td style="text-align:center">' + (prs > 0 ? '<span class="n n-blue">' + prs + '</span>' : '<span style="color:#cbd5e1">—</span>') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  }

  // ── OPEN BUGS (2-column grid) ───────────────────────────────────────────────
  if (openBugs.length) {
    const sortedBugs = [...openBugs].sort((a, b) => (a.fields['Microsoft.VSTS.Common.Priority'] ?? 9) - (b.fields['Microsoft.VSTS.Common.Priority'] ?? 9));
    html += '<div class="sec"><div class="sec-h">Open Bugs (' + openBugs.length + ')</div><div class="bug-grid">';
    sortedBugs.slice(0, 12).forEach(function(bug) {
      const pri = bug.fields['Microsoft.VSTS.Common.Priority'] ?? 4;
      const cls = pri <= 1 ? 'p1' : pri === 2 ? 'p2' : pri === 3 ? 'p3' : 'p4';
      const who = bug.fields['System.AssignedTo']?.displayName ?? '⚠ Unassigned';
      const age = daysOld(bug.fields['System.CreatedDate']);
      html += '<div class="card"><div class="card-row"><span class="badge ' + cls + '">P' + pri + '</span></div><div class="rtitle" style="margin-top:5px">' + esc(bug.fields['System.Title']) + '</div><div class="rmeta">' + esc(bug.fields['System.State']) + ' &nbsp;·&nbsp; ' + esc(who) + ' &nbsp;·&nbsp; ' + age + 'd old</div></div>';
    });
    if (openBugs.length > 12) {
      html += '<div style="font-size:11px;color:#94a3b8;text-align:center;padding:8px;grid-column:1/-1">+ ' + (openBugs.length - 12) + ' more open bugs in ADO</div>';
    }
    html += '</div></div>';
  }

  // ── ACTIVE PRs ──────────────────────────────────────────────────────────────
  if (d.prs.length) {
    const sortedPRs = [...d.prs].sort((a, b) => new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime());
    html += '<div class="sec"><div class="sec-h">Active Pull Requests (' + d.prs.length + ')</div>';
    sortedPRs.slice(0, 8).forEach(function(pr) {
      const age = daysOld(pr.creationDate);
      const cls = age >= 5 ? 'age-w' : 'age-ok';
      const creator = pr.createdBy?.displayName ?? 'Unknown';
      const reviewers = (pr.reviewers ?? []).map(r => r.displayName || r.uniqueName || '?').join(', ') || 'No reviewers assigned';
      html += '<div class="card card-row"><span class="' + cls + '">' + age + 'd</span><div style="flex:1"><div class="rtitle">' + esc(pr.title) + '</div><div class="rmeta">' + esc(pr.repoName) + ' &nbsp;·&nbsp; by ' + esc(creator) + ' &nbsp;·&nbsp; ' + esc(reviewers) + '</div></div></div>';
    });
    if (d.prs.length > 8) html += '<p style="font-size:11px;color:#94a3b8;text-align:center;padding-top:8px">+ ' + (d.prs.length - 8) + ' more active PRs</p>';
    html += '</div>';
  }

  // ── REPOSITORY ACTIVITY (2-col: recent commits | contributor table) ─────────
  if (d.commits.length || d.repos.length) {
    html += '<div class="sec"><div class="sec-h">Repository Activity &nbsp;·&nbsp; Last 14 Days</div><div class="two-col">';

    // Left: recent commits
    html += '<div class="col-wide">';
    html += '<div class="chart-label">Recent Commits</div>';
    if (recentCommits.length) {
      recentCommits.forEach(function(c) {
        const dateStr = c.date ? new Date(c.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
        html += '<div class="commit-row"><span class="commit-hash">' + esc(c.commitId) + '</span><div style="flex:1"><div class="commit-msg">' + esc(c.comment) + '</div><div style="display:flex;gap:8px;margin-top:2px"><span class="commit-repo">' + esc(c.repoName) + '</span><span class="commit-author">' + esc(c.author) + '</span><span style="font-size:10px;color:#94a3b8">' + esc(dateStr) + '</span></div></div></div>';
      });
    } else {
      html += '<p style="font-size:12px;color:#94a3b8">No commits found in the last 14 days.</p>';
    }
    html += '</div>';

    // Right: contributor table
    html += '<div class="col-narrow">';
    html += '<div class="chart-label">Top Contributors</div>';
    if (topCommitters.length) {
      html += '<table class="eng" style="font-size:11px"><thead><tr><th>Developer</th><th style="text-align:center">Commits</th></tr></thead><tbody>';
      topCommitters.forEach(function(entry) {
        const name = entry[0], cnt = entry[1];
        html += '<tr><td><span class="eng-name" style="font-size:11px">' + esc(name) + '</span></td><td style="text-align:center"><span class="n n-indigo" style="background:#ede9fe;color:#4f46e5">' + cnt + '</span></td></tr>';
      });
      html += '</tbody></table>';
      html += '<div style="margin-top:14px">';
      Object.entries(commitsByRepo).sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(function(entry) {
        const repo = entry[0], cnt = entry[1];
        const pct = Math.round((cnt / d.commits.length) * 100);
        html += '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:3px"><span>📁 ' + esc(repo) + '</span><span>' + cnt + '</span></div><div class="pb-bg"><div class="pb-f" style="width:' + pct + '%;background:#6366f1"></div></div></div>';
      });
      html += '</div>';
    } else {
      html += '<p style="font-size:12px;color:#94a3b8">No commit data available.</p>';
    }
    html += '</div>';
    html += '</div></div>'; // end two-col + sec
  }

  // ── ⚡ AI CODE INTELLIGENCE ──────────────────────────────────────────────────
  html += '<div class="sec"><div class="sec-h" style="color:#0891b2">Code Intelligence &nbsp;·&nbsp; Last 14 Days</div>';
  html += '<div class="code-ai-box"><div class="code-ai-label">⚡ AI Code Analysis &nbsp;·&nbsp; ' + esc(MODEL) + '</div>';
  html += '<div class="code-ai-body">' + renderAI(codeAi || codeFallback) + '</div></div></div>';

  // ── REPOSITORIES ────────────────────────────────────────────────────────────
  if (d.repos.length) {
    html += '<div class="sec"><div class="sec-h">Repositories (' + d.repos.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:4px">';
    d.repos.forEach(function(r) { html += '<span class="repo-tag">📁 ' + esc(r.name) + '</span>'; });
    html += '</div></div>';
  }

  // Footer
  html += '<div class="ftr"><p>PRM &nbsp;·&nbsp; Global HealthX Engineering Intelligence</p><p>Automated digest · 7:00 AM IST &nbsp;·&nbsp; ' + esc(IST) + '</p></div>';

  html += '</div>'; // .body
  html += '</div></body></html>';
  return html;
}

// ── Send via Microsoft Outlook (osascript) ────────────────────────────────────
function sendEmail(subject, htmlPath) {
  const safeSubject = subject.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `set htmlPath to "${htmlPath}"
set htmlContent to (do shell script "cat " & quoted form of htmlPath)
tell application "Microsoft Outlook" to activate
delay 2
with timeout of 90 seconds
  tell application "Microsoft Outlook"
    set newMsg to make new outgoing message with properties {subject:"${safeSubject}"}
    set content of newMsg to htmlContent
    make new to recipient at end of to recipients of newMsg with properties {email address:{name:"Ganesh Bandi", address:"ganesh.bandi@globalhealthx.co"}}
    send newMsg
  end tell
end timeout
return "sent"`;

  const appath = '/tmp/prm-send-email.applescript';
  fs.writeFileSync(appath, script, 'utf8');
  const out = execSync(`osascript "${appath}"`, { timeout: 120000, encoding: 'utf8' });
  return out.trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌅  PRM Morning Digest starting…');
  console.log(`    Org: ${ORG}  Project: ${PROJECT}  Model: ${MODEL}\n`);

  console.log('📡  Fetching ADO data…');
  const data = await fetchAll();

  console.log('\n🤖  Running AI analysis via Ollama…');
  const [ai, codeAi] = await Promise.all([
    getAI(data).catch(e => { console.warn('  ⚠ AI:', e.message); return ''; }),
    getCodeAI(data).catch(e => { console.warn('  ⚠ Code AI:', e.message); return ''; }),
  ]);

  console.log('\n🖊️   Building HTML email…');
  const html = buildHtml(data, ai, codeAi);

  const htmlPath = '/tmp/prm-morning-digest.html';
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`    ✓ HTML saved → ${htmlPath} (${(html.length / 1024).toFixed(1)} KB)`);

  const IST = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const subject = `PRM Morning Digest — ${IST}`;

  console.log('\n📧  Sending via Microsoft Outlook…');
  const result = sendEmail(subject, htmlPath);
  console.log(`✅  ${result} → ganesh.bandi@globalhealthx.co`);
  console.log(`    Subject: ${subject}\n`);
}

main().catch(err => {
  console.error('\n❌  Fatal error:', err.message);
  process.exit(1);
});
