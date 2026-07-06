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
// Locked to the configured project — no auto-detect
async function resolveProject() {
  return PROJECT;
}

async function fetchAll() {
  const resolvedProject = PROJECT; // always Patient Engagement Platform
  const d = {
    project: resolvedProject,
    teams: [],
    iterations: [],
    sprint: null,       // canonical sprint (first found, for compat)
    allSprints: [],     // per-team: { teamName, sprint, items }
    items: [],          // open items within the active sprint (combined)
    sprintItems: [],    // ALL items across all sprints (incl. done) for completion %
    globalItems: [],    // ALL open items in project — for engineer workload view
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
  // Iterations / current sprint — collect per-team sprint data
  const allSprintIds = new Set();
  const teamSprintMeta = []; // { teamName, sprint, itemIds }
  for (const team of d.teams) {
    try {
      const iters = await adoList(`${BASE}/${encodeURIComponent(resolvedProject)}/${encodeURIComponent(team.name)}/_apis/work/teamsettings/iterations`);
      const cur = iters.find(i => i.attributes?.timeFrame === 'current') ?? null;
      if (!cur) continue;
      if (!d.sprint) { d.sprint = cur; d.iterations = iters; }
      const wi = await adoGet(
        `${BASE}/${encodeURIComponent(resolvedProject)}/${encodeURIComponent(team.name)}/_apis/work/teamsettings/iterations/${cur.id}/workitems`
      );
      const itemIds = (wi.workItemRelations ?? []).map(r => r.target?.id).filter(Boolean);
      itemIds.forEach(id => allSprintIds.add(id));
      teamSprintMeta.push({ teamName: team.name, sprint: cur, itemIds });
      console.log(`  ✓ team "${team.name}": sprint "${cur.name}"  items: ${itemIds.length}`);
    } catch (e) { /* team may not have iterations configured */ }
  }
  console.log(`  ✓ total unique sprint IDs: ${allSprintIds.size}`);

  // Batch-fetch all sprint work items (deduplicated across teams)
  if (allSprintIds.size > 0) {
    d.sprintItems = await batchFetch([...allSprintIds].slice(0, 500));
    console.log(`  ✓ sprint items: ${d.sprintItems.length}`);
    // Associate fetched items back to each team's sprint
    const itemById = Object.fromEntries(d.sprintItems.map(i => [i.id, i]));
    d.allSprints = teamSprintMeta.map(ts => ({
      teamName: ts.teamName,
      sprint: ts.sprint,
      items: ts.itemIds.map(id => itemById[id]).filter(Boolean),
    }));
    d.items = d.sprintItems.filter(i => !DONE_STATES.includes(i.fields['System.State']));
    console.log(`  ✓ open sprint items: ${d.items.length}`);
  } else {
    console.warn('  ⚠ No sprint items found across any team — falling back to global open items');
    try {
      const wiql = await adoPost(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/wit/wiql`, {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${resolvedProject}' AND [System.State] NOT IN ('Closed','Resolved','Done','Removed') ORDER BY [System.ChangedDate] DESC`,
      });
      const ids = (wiql.workItems ?? []).map(w => w.id).slice(0, 300);
      d.items = await batchFetch(ids);
      d.globalItems = d.items; // same as items when there's no sprint data
      console.log(`  ✓ work items (fallback global): ${d.items.length}`);
    } catch (e) { console.warn(`  ⚠ fallback items: ${e.message}`); }
  }

  // Global open items — always fetch for full engineer workload view
  if (d.globalItems.length === 0) {
    try {
      const wiql = await adoPost(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/wit/wiql`, {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${resolvedProject}' AND [System.State] NOT IN ('Closed','Resolved','Done','Removed') ORDER BY [System.AssignedTo] ASC`,
      });
      const ids = (wiql.workItems ?? []).map(w => w.id).slice(0, 400);
      d.globalItems = await batchFetch(ids);
      console.log(`  ✓ global items (for workload): ${d.globalItems.length}`);
    } catch (e) { console.warn(`  ⚠ global items: ${e.message}`); }
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

  // Commits — last 14 days, ALL branches, deduplicated by commitId
  const fromDate = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
  const seenCommitIds = new Set();
  await Promise.allSettled(d.repos.map(async repo => {
    try {
      // 1. list all branches in this repo
      const refs = await adoList(
        `${BASE}/${encodeURIComponent(resolvedProject)}/_apis/git/repositories/${repo.id}/refs`,
        { filter: 'heads/', '$top': '50' }
      );
      const branches = refs.map(r => r.name.replace('refs/heads/', '')).filter(Boolean);
      if (!branches.length) branches.push('main'); // fallback
      // 2. fetch commits per branch, deduplicate globally
      await Promise.allSettled(branches.map(async branch => {
        try {
          const commits = await adoList(
            `${BASE}/${encodeURIComponent(resolvedProject)}/_apis/git/repositories/${repo.id}/commits`,
            {
              'searchCriteria.fromDate': fromDate,
              'searchCriteria.$top': '100',
              'searchCriteria.itemVersion.version': branch,
              'searchCriteria.itemVersion.versionType': 'branch',
            }
          );
          for (const c of commits) {
            if (seenCommitIds.has(c.commitId)) continue;
            seenCommitIds.add(c.commitId);
            d.commits.push({
              repoName: repo.name,
              branch,
              author: c.author?.name ?? c.committer?.name ?? 'Unknown',
              email: (c.author?.email ?? c.committer?.email ?? '').toLowerCase(),
              date: c.author?.date ?? c.committer?.date ?? null,
              comment: (c.comment ?? '').split('\n')[0].slice(0, 100),
              commitId: (c.commitId ?? '').slice(0, 7),
            });
          }
        } catch {}
      }));
    } catch {}
  }));
  // Filter to software engineers only (exclude PM / non-coding roles by display name)
  const NON_ENGINEERS = ['ganesh', 'manushree', 'varun', 'meghana'];
  d.commits = d.commits.filter(c => !NON_ENGINEERS.some(n => c.author.toLowerCase().includes(n)));
  console.log(`  ✓ commits (14d, all branches, engineers only): ${d.commits.length}`);

  // Pipelines
  try {
    d.pipelines = await adoList(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/pipelines`);
    console.log(`  ✓ pipelines: ${d.pipelines.length}`);
  } catch (e) { console.warn(`  ⚠ pipelines: ${e.message}`); }

  return d;
}

// ── Ollama caller ─────────────────────────────────────────────────────────────
async function callOllama(prompt, maxTokens = 500) {
  const mkBody = (model, tokens) => JSON.stringify({
    model, prompt, stream: false,
    options: { temperature: 0.7, num_predict: tokens ?? maxTokens },
  });

  async function tryModel(model, tokens, timeoutMs) {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: mkBody(model, tokens), signal: AbortSignal.timeout(timeoutMs),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    const raw = j.response ?? '';
    // Strip think blocks; if thinking model left nothing, rescue text from inside <think>
    const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (stripped) return stripped;
    const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) return thinkMatch[1].trim();
    return '';
  }

  // Try primary model first
  try {
    const result = await tryModel(MODEL, maxTokens, 90000);
    if (result) return result;
    console.warn(`  ⚠ ${MODEL} returned empty — trying llama3`);
  } catch {
    console.warn(`  ⚠ ${MODEL} failed — trying llama3`);
  }

  // Fall back to llama3 (reliable prose output)
  try {
    return await tryModel('llama3:latest', maxTokens, 120000);
  } catch {
    console.warn('  ⚠ llama3 also failed');
    return '';
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

  // ── AI visual dashboard data ──────────────────────────────────────────────
  const bugDensity = d.items.length ? Math.round((openBugs.length / d.items.length) * 100) : 0;

  function aiHealthBadge(val, redThresh, amberThresh) {
    if (val >= redThresh)   return { label: 'CRITICAL', bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c', bar: '#dc2626' };
    if (val >= amberThresh) return { label: 'AT RISK',  bg: '#fef3c7', border: '#fde68a', text: '#92400e', bar: '#d97706' };
    return                         { label: 'HEALTHY',  bg: '#d1fae5', border: '#6ee7b7', text: '#065f46', bar: '#16a34a' };
  }

  const sprintHealth = sprintTotal > 0
    ? aiHealthBadge(100 - sprintPct, 70, 40)
    : { label: 'NO BOARD', bg: '#f1f5f9', border: '#e2e8f0', text: '#64748b', bar: '#94a3b8' };
  const bugLoadBadge  = aiHealthBadge(critBugs.length, 10, 3);
  const prBadge       = aiHealthBadge(stalePRs.length, 3, 1);
  const codeBadge     = d.commits.length > 10
    ? { label: 'ACTIVE',   bg: '#d1fae5', border: '#6ee7b7', text: '#065f46', bar: '#16a34a' }
    : d.commits.length > 3
      ? { label: 'MODERATE', bg: '#fef3c7', border: '#fde68a', text: '#92400e', bar: '#d97706' }
      : { label: 'LOW',      bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c', bar: '#dc2626' };

  const aiTiles = [
    { label: 'Sprint Health', value: sprintTotal > 0 ? sprintPct + '%' : '—', sub: sprintHealth.label + (spProg ? ' · ' + spProg.dLeft + 'd left' : ''), badge: sprintHealth },
    { label: 'Bug Load',      value: String(critBugs.length),   sub: bugLoadBadge.label + ' · ' + openBugs.length + ' open', badge: bugLoadBadge },
    { label: 'PR Flow',       value: String(d.prs.length),      sub: prBadge.label + (stalePRs.length > 0 ? ' · ' + stalePRs.length + ' stale' : ' · all fresh'), badge: prBadge },
    { label: 'Code Activity', value: String(d.commits.length),  sub: codeBadge.label + ' · 14 days', badge: codeBadge },
  ];

  // Risk radar
  const aiRisks = [];
  if (critBugs.length > 0) aiRisks.push({ sev: Math.min(100, critBugs.length * 4), level: 'HIGH', text: critBugs.length + ' critical/high bugs outstanding — blocking patient-facing features' });
  const overloaded = engineers.filter(([n, s]) => n !== 'Unassigned' && s.active > 10);
  overloaded.slice(0, 2).forEach(([n, s]) => aiRisks.push({ sev: Math.min(100, s.active * 3), level: 'HIGH', text: n + ' carrying ' + s.active + ' active items — burnout and quality risk' }));
  if (sprintTotal === 0 && d.sprint) aiRisks.push({ sev: 55, level: 'MEDIUM', text: 'Sprint boards unpopulated — velocity untracked across all teams' });
  if (stalePRs.length > 0) aiRisks.push({ sev: Math.min(100, stalePRs.length * 25), level: 'MEDIUM', text: stalePRs.length + ' stale PR' + (stalePRs.length > 1 ? 's' : '') + ' — code review bottleneck' });
  const oldBugs = openBugs.filter(b => daysOld(b.fields['System.CreatedDate']) > 30);
  if (oldBugs.length > 0) aiRisks.push({ sev: Math.min(100, oldBugs.length * 2), level: 'MEDIUM', text: oldBugs.length + ' bugs aged 30+ days — accumulating technical debt' });
  if (d.commits.length < 5) aiRisks.push({ sev: 40, level: 'LOW', text: 'Only ' + d.commits.length + ' commits in 14 days — delivery pace is low' });
  const topRisks = aiRisks.slice(0, 5);

  // Priority actions
  const aiActions = [];
  if (critBugs.length > 0) {
    const who = [...new Set(critBugs.slice(0, 3).map(b => b.fields['System.AssignedTo']?.displayName?.split(' ')[0] ?? 'TBD'))].join(', ');
    aiActions.push({ text: 'Resolve ' + Math.min(critBugs.length, 5) + ' critical/high bugs — longest open is ' + daysOld(critBugs[0]?.fields['System.CreatedDate']) + ' days old', who: who, badge: 'CRITICAL', bg: '#fee2e2', color: '#b91c1c' });
  }
  if (overloaded.length > 0) aiActions.push({ text: 'Redistribute ' + overloaded[0][0] + '\'s ' + overloaded[0][1].active + ' active items — rebalance before sprint ends', who: 'Team Lead', badge: 'HIGH', bg: '#fef3c7', color: '#92400e' });
  if (stalePRs.length > 0) aiActions.push({ text: 'Clear ' + stalePRs.length + ' stale PR' + (stalePRs.length > 1 ? 's' : '') + ' — unblock downstream merges today', who: 'All Devs', badge: 'HIGH', bg: '#fef3c7', color: '#92400e' });
  if (sprintTotal === 0 && d.sprint) aiActions.push({ text: 'Populate sprint boards in ADO — needed for velocity and completion tracking', who: 'Scrum Master', badge: 'MEDIUM', bg: '#eff6ff', color: '#1d4ed8' });
  if (aiActions.length < 3 && d.commits.length < 5) aiActions.push({ text: 'Increase commit frequency — ' + d.commits.length + ' commits/14d signals slow pace; aim for daily commits', who: 'All Devs', badge: 'MEDIUM', bg: '#eff6ff', color: '#1d4ed8' });
  const topActions = aiActions.slice(0, 4);

  // Engineer pulse — built from global items so ALL engineers appear regardless of sprint assignment
  const globalEngMap = {};
  for (const item of d.globalItems) {
    const name = item.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
    if (name === 'Unassigned') continue;
    if (!globalEngMap[name]) globalEngMap[name] = { active: 0, bugs: 0, p1p2: 0, blocked: 0 };
    globalEngMap[name].active++;
    if (item.fields['System.WorkItemType'] === 'Bug') globalEngMap[name].bugs++;
    if ((item.fields['Microsoft.VSTS.Common.Priority'] ?? 9) <= 2) globalEngMap[name].p1p2++;
    if (item.fields['System.State'] === 'Blocked') globalEngMap[name].blocked++;
  }
  // Merge sprint done-count from existing engMap
  for (const [name, s] of engineers) {
    if (globalEngMap[name]) globalEngMap[name].done = s.done;
    else if (name !== 'Unassigned') globalEngMap[name] = { active: 0, bugs: s.bugs, p1p2: s.p1p2, blocked: s.blocked, done: s.done };
  }
  const engPulse = Object.entries(globalEngMap).sort((a, b) => b[1].active - a[1].active);
  const maxEngTotal = Math.max(...engPulse.map(([, s]) => s.active + (s.done ?? 0)), 1);

  // Bug severity breakdown
  const p1Bugs = openBugs.filter(b => b.fields['Microsoft.VSTS.Common.Priority'] === 1).length;
  const p2Bugs = openBugs.filter(b => b.fields['Microsoft.VSTS.Common.Priority'] === 2).length;
  const p3Bugs = openBugs.filter(b => b.fields['Microsoft.VSTS.Common.Priority'] === 3).length;
  const p4Bugs = openBugs.filter(b => (b.fields['Microsoft.VSTS.Common.Priority'] ?? 0) >= 4 || !b.fields['Microsoft.VSTS.Common.Priority']).length;
  const maxBugSev = Math.max(p1Bugs, p2Bugs, p3Bugs, p4Bugs, 1);

  // AI narrative fallback (concise, shown in the AI Insight box)
  const fallback = [
    d.items.length + ' open items across the project' +
      (critBugs.length > 0 ? ', with ' + critBugs.length + ' critical/high bugs requiring immediate action.' : '.') +
      (sprintTotal > 0 ? ' Sprint is ' + sprintPct + '% complete with ' + (spProg?.dLeft ?? '?') + ' days remaining.' : ''),
    overloaded.length > 0
      ? overloaded[0][0] + ' is significantly overloaded (' + overloaded[0][1].active + ' active items). Recommend rebalancing before sprint close to maintain quality.'
      : 'Workload distribution looks manageable across the engineering team.',
    critBugs.length > 5
      ? 'Bug density (' + bugDensity + '%) is high for a healthcare platform — prioritise bug resolution over new feature work today.'
      : 'Continue current delivery pace and maintain code review velocity.',
    '(AI model: ' + MODEL + ')',
  ].join(' ');

  const renderAI = function(text) {
    return (text || fallback).replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      .split('\n').map(function(l) { return esc(l).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); }).join('<br>\n');
  };

  const codeFallback = d.commits.length
    ? 'CODE ACTIVITY — ' + d.commits.length + ' commits in the last 14 days across ' + d.repos.length + ' repositories. Top contributor: ' + (topCommitters[0]?.[0] ?? 'Unknown') + ' (' + (topCommitters[0]?.[1] ?? 0) + ' commits).'
    : 'No commit activity found in the last 14 days.';

  // ── CSS (light mode, email-safe — no pseudo-elements, full-width) ────────────
  const CSS = `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#ffffff;color:#1e293b;line-height:1.5}
    .w{width:100%;max-width:100%;background:#ffffff}
    .hdr{background:#1e3a8a;padding:24px 28px;width:100%}
    .hdr-title{font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-.4px}
    .hdr-sub{font-size:13px;color:#bfdbfe;margin-top:3px}
    .hdr-date{margin-top:12px;font-size:12px;color:#ffffff;background:#1d4ed8;display:inline-block;padding:5px 16px;border-radius:4px;font-weight:600}
    .ai-banner{background:#eff6ff;padding:24px 28px;border-top:4px solid #2563eb;border-bottom:1px solid #bfdbfe}
    .ai-banner-hdr{margin-bottom:12px}
    .ai-banner-title{font-size:18px;font-weight:800;color:#1e3a8a}
    .ai-banner-sub{font-size:11px;color:#3b82f6;text-transform:uppercase;letter-spacing:1.5px;margin-top:3px}
    .ai-banner-body{font-size:13.5px;line-height:1.85;color:#1e293b;background:#ffffff;border-radius:6px;padding:16px 18px;border:1px solid #bfdbfe;margin-top:12px}
    .sec{background:#ffffff;padding:20px 28px;border-bottom:8px solid #f1f5f9}
    .sec-h{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#1e3a8a;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #e2e8f0}
    .two-col{display:flex;gap:24px;align-items:flex-start}
    .two-col > .col{flex:1;min-width:0}
    .two-col > .col-wide{flex:1.4;min-width:0}
    .two-col > .col-narrow{flex:.7;min-width:0}
    .kpi-row{display:flex;gap:10px}
    .kpi{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-top:3px solid #2563eb;border-radius:6px;padding:14px 10px;text-align:center}
    .kpi-n{font-size:28px;font-weight:900;line-height:1;color:#1e3a8a}
    .kpi-l{font-size:10px;color:#64748b;margin-top:5px;text-transform:uppercase;letter-spacing:.6px}
    .kpi-s{font-size:10px;color:#94a3b8;margin-top:2px}
    .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:11px 14px;margin-bottom:6px}
    .card:last-child{margin-bottom:0}
    .card-row{display:flex;gap:10px;align-items:flex-start}
    .rtitle{font-size:13px;color:#1e293b;flex:1;font-weight:500}
    .rmeta{font-size:11px;color:#64748b;margin-top:3px}
    .pb-bg{height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin-top:6px}
    .pb-f{height:100%;border-radius:4px}
    .pb-lbl{display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#64748b}
    .state-row{display:flex;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;gap:8px}
    .state-row:last-child{border-bottom:none}
    .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .sn{font-size:12.5px;color:#334155;flex:1;min-width:0;word-break:break-word}
    .sc{font-size:12.5px;font-weight:700;color:#1e293b;width:32px;text-align:right}
    .sbar{width:90px;height:5px;background:#e2e8f0;border-radius:4px;overflow:hidden}
    .sbar-f{height:100%;border-radius:4px}
    .badge{font-size:10px;font-weight:800;text-transform:uppercase;padding:3px 8px;border-radius:4px;flex-shrink:0;letter-spacing:.3px}
    .p1{background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5}
    .p2{background:#ffedd5;color:#c2410c;border:1px solid #fdba74}
    .p3{background:#fef9c3;color:#a16207;border:1px solid #fde68a}
    .p4{background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0}
    .age-w{background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;flex-shrink:0;white-space:nowrap;border:1px solid #fbbf24}
    .age-ok{background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;flex-shrink:0;white-space:nowrap;border:1px solid #6ee7b7}
    .code-ai-box{background:#f0fdf4;padding:18px 20px;border-radius:6px;border:1px solid #86efac;border-left:4px solid #16a34a}
    .code-ai-label{font-size:11px;font-weight:800;color:#15803d;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px}
    .code-ai-body{font-size:13.5px;line-height:1.85;color:#14532d}
    .repo-tag{background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:4px 10px;font-size:12px;color:#475569;display:inline-block;margin:3px}
    .ftr{padding:16px 28px;text-align:center;background:#f8fafc;border-top:1px solid #e2e8f0}
    .ftr p{font-size:11px;color:#94a3b8;margin:2px 0}
    .c-blue{color:#2563eb}.c-red{color:#dc2626}.c-amber{color:#d97706}.c-green{color:#16a34a}.c-slate{color:#475569}.c-indigo{color:#4f46e5}
    .sp-grid{display:flex;gap:10px;margin-top:14px}
    .sp-tile{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 8px;text-align:center}
    .sp-tile-n{font-size:24px;font-weight:900;line-height:1}
    .sp-tile-l{font-size:9px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
    table.eng{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px}
    table.eng th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;padding:8px 10px;border-bottom:2px solid #1e3a8a;background:#f8fafc}
    table.eng td{padding:9px 10px;border-bottom:1px solid #f1f5f9;color:#1e293b;vertical-align:middle}
    table.eng tr:last-child td{border-bottom:none}
    table.eng tr:nth-child(even) td{background:#fafafa}
    .eng-name{font-weight:600;color:#1e293b;font-size:13px}
    .n{display:inline-block;min-width:26px;text-align:center;padding:2px 6px;border-radius:4px;font-weight:700;font-size:12px}
    .n-blue{background:#dbeafe;color:#1d4ed8}.n-green{background:#d1fae5;color:#065f46}
    .n-red{background:#fee2e2;color:#b91c1c}.n-amber{background:#fef3c7;color:#92400e}
    .n-gray{background:#f1f5f9;color:#64748b}
    .blocked-tag{font-size:10px;background:#fee2e2;color:#b91c1c;padding:2px 6px;border-radius:3px;font-weight:700;margin-left:4px}
    .bug-grid{display:flex;flex-wrap:wrap;gap:8px}
    .bug-grid .card{flex:1;min-width:280px}
    .chart-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.8px;font-weight:700;margin-bottom:8px}
    .legend-item{display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px;color:#475569}
    .legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .commit-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9}
    .commit-row:last-child{border-bottom:none}
    .commit-hash{font-size:10px;font-weight:700;color:#4f46e5;background:#ede9fe;padding:2px 6px;border-radius:4px;flex-shrink:0;font-family:monospace}
    .commit-msg{font-size:12.5px;color:#1e293b;flex:1}
    .commit-meta{font-size:10px;color:#64748b;margin-top:2px}
  `;

  // sec-h helper — inline span replaces ::before (email-safe)
  function secH(title) {
    return '<div class="sec-h"><span style="display:inline-block;width:4px;height:16px;background:#2563eb;border-radius:2px;vertical-align:middle;margin-right:10px"></span>' + title + '</div>';
  }

  // ── Assemble ────────────────────────────────────────────────────────────────
  let html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRM Morning Digest</title><style>' + CSS + '</style></head><body><div class="w">';

  // ── HEADER ──────────────────────────────────────────────────────────────────
  html += '<div class="hdr">';
  html += '<div style="font-size:13px;color:#93c5fd;font-weight:600;margin-bottom:4px">📊 &nbsp;Global HealthX Engineering Intelligence</div>';
  html += '<div class="hdr-title">PRM Morning Digest</div>';
  html += '<div class="hdr-sub">' + esc(d.project ?? PROJECT) + ' &nbsp;·&nbsp; Engineering Intelligence</div>';
  html += '<div class="hdr-date">📅 &nbsp;' + esc(IST) + '</div>';
  html += '</div>';

  // ── 🧠 AI MORNING INTELLIGENCE ──────────────────────────────────────────────
  const PH = '14px'; // panel header font size
  const CT = '13.5px'; // content text font size
  const SM = '12px';  // small label font size
  const XS = '11px';  // extra small (badges, sub-labels)

  html += '<div class="ai-banner">';
  html += '<div class="ai-banner-hdr"><div class="ai-banner-title">🧠 &nbsp;AI Morning Intelligence</div><div class="ai-banner-sub">Powered by ' + esc(MODEL) + ' &nbsp;·&nbsp; ' + esc(IST) + '</div></div>';

  // ══ TOP: Executive Summary (full width, pictorial) ═══════════════════════════
  // Pre-compute summary numbers
  const totalSprintDone  = d.sprintItems.filter(i => DONE_STATES.includes(i.fields['System.State'])).length;
  const totalSprintItems = d.sprintItems.length;
  const overallCompPct   = totalSprintItems ? Math.round((totalSprintDone / totalSprintItems) * 100) : 0;
  const compColor = overallCompPct >= 70 ? '#16a34a' : overallCompPct >= 40 ? '#d97706' : '#dc2626';
  const compBg    = overallCompPct >= 70 ? '#d1fae5' : overallCompPct >= 40 ? '#fef3c7' : '#fee2e2';
  let overallTimePct = 0; let daysLeft = 0;
  if (d.sprint?.attributes?.startDate && d.sprint?.attributes?.finishDate) {
    const st = new Date(d.sprint.attributes.startDate).getTime();
    const en = new Date(d.sprint.attributes.finishDate).getTime();
    overallTimePct = Math.round(Math.min(100, Math.max(0, (now.getTime() - st) / (en - st) * 100)));
    daysLeft = Math.max(0, Math.ceil((en - now.getTime()) / (1000 * 60 * 60 * 24)));
  }
  const timeColor = overallTimePct >= 80 ? '#dc2626' : overallTimePct >= 60 ? '#d97706' : '#2563eb';
  const timeBg    = overallTimePct >= 80 ? '#fee2e2' : overallTimePct >= 60 ? '#fef3c7' : '#eff6ff';
  // Gap signal: are we behind?
  const gapPct = overallTimePct - overallCompPct;
  const gapStatus = gapPct > 25 ? { icon: '🔴', label: 'At Risk', bg: '#fee2e2', c: '#b91c1c' }
                  : gapPct > 10 ? { icon: '🟡', label: 'Watch',   bg: '#fef3c7', c: '#92400e' }
                  :               { icon: '🟢', label: 'On Track', bg: '#d1fae5', c: '#065f46' };

  html += '<div style="background:#fff;border-radius:10px;border:1px solid #bfdbfe;overflow:hidden;margin-bottom:16px">';

  // — Header bar ——————————————————————————————————————————————————————————————
  html += '<table style="width:100%;border-collapse:collapse"><tr>';
  html += '<td style="background:#1e3a8a;padding:14px 20px"><span style="font-size:14px;font-weight:800;color:#fff;letter-spacing:.8px">📋 &nbsp;Executive Summary</span></td>';
  html += '<td style="background:#1e3a8a;text-align:right;padding:14px 20px"><span style="font-size:12px;color:#bfdbfe">' + esc(IST) + '</span></td>';
  html += '</tr></table>';

  // ── Row A: Sprint Health Meter ───────────────────────────────────────────────
  html += '<div style="padding:18px 20px;border-bottom:2px solid #f1f5f9">';
  html += '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;margin-bottom:14px">⚡ Sprint Pulse</div>';
  html += '<table style="width:100%;border-collapse:collapse"><tr>';

  // Completion column
  html += '<td style="width:44%;vertical-align:top;padding-right:16px">';
  html += '<div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:6px">🎯 &nbsp;Completion</div>';
  html += '<div style="background:#e2e8f0;height:26px;border-radius:13px;overflow:hidden;margin-bottom:8px">';
  html += '<div style="width:' + overallCompPct + '%;height:100%;background:' + compColor + ';border-radius:13px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px">';
  if (overallCompPct > 15) html += '<span style="font-size:11px;font-weight:800;color:#fff">' + overallCompPct + '%</span>';
  html += '</div></div>';
  html += '<table style="width:100%;border-collapse:collapse"><tr>';
  html += '<td style="text-align:center;padding:2px"><div style="background:' + compBg + ';border-radius:8px;padding:10px 4px"><div style="font-size:26px;font-weight:900;color:' + compColor + '">' + overallCompPct + '%</div><div style="font-size:11px;font-weight:700;color:' + compColor + ';margin-top:2px">Done</div></div></td>';
  html += '<td style="text-align:center;padding:2px"><div style="background:#f1f5f9;border-radius:8px;padding:10px 4px"><div style="font-size:26px;font-weight:900;color:#1e293b">' + totalSprintDone + '</div><div style="font-size:11px;font-weight:600;color:#475569;margin-top:2px">Closed</div></div></td>';
  html += '<td style="text-align:center;padding:2px"><div style="background:#f1f5f9;border-radius:8px;padding:10px 4px"><div style="font-size:26px;font-weight:900;color:#1e293b">' + (totalSprintItems - totalSprintDone) + '</div><div style="font-size:11px;font-weight:600;color:#475569;margin-top:2px">Remaining</div></div></td>';
  html += '</tr></table>';
  html += '</td>';

  // Divider
  html += '<td style="width:1px;background:#f1f5f9;padding:0"></td>';

  // Time elapsed column
  html += '<td style="width:44%;vertical-align:top;padding:0 16px">';
  html += '<div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:6px">⏱ &nbsp;Time Elapsed</div>';
  html += '<div style="background:#e2e8f0;height:26px;border-radius:13px;overflow:hidden;margin-bottom:8px">';
  html += '<div style="width:' + overallTimePct + '%;height:100%;background:' + timeColor + ';border-radius:13px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px">';
  if (overallTimePct > 15) html += '<span style="font-size:11px;font-weight:800;color:#fff">' + overallTimePct + '%</span>';
  html += '</div></div>';
  html += '<table style="width:100%;border-collapse:collapse"><tr>';
  html += '<td style="text-align:center;padding:2px"><div style="background:' + timeBg + ';border-radius:8px;padding:10px 4px"><div style="font-size:26px;font-weight:900;color:' + timeColor + '">' + overallTimePct + '%</div><div style="font-size:11px;font-weight:700;color:' + timeColor + ';margin-top:2px">Elapsed</div></div></td>';
  html += '<td style="text-align:center;padding:2px"><div style="background:#f1f5f9;border-radius:8px;padding:10px 4px"><div style="font-size:26px;font-weight:900;color:#1e293b">' + daysLeft + '</div><div style="font-size:11px;font-weight:600;color:#475569;margin-top:2px">Days Left</div></div></td>';
  html += '</tr></table>';
  html += '</td>';

  // Gap status column
  html += '<td style="width:12%;vertical-align:middle;padding-left:8px">';
  html += '<div style="background:' + gapStatus.bg + ';border-radius:10px;padding:14px 6px;text-align:center">';
  html += '<div style="font-size:28px;line-height:1">' + gapStatus.icon + '</div>';
  html += '<div style="font-size:13px;font-weight:900;color:' + gapStatus.c + ';margin-top:6px">' + gapStatus.label + '</div>';
  html += '<div style="font-size:11px;color:' + gapStatus.c + ';margin-top:3px;opacity:.8">Gap: ' + Math.abs(gapPct) + '%</div>';
  html += '</div>';
  html += '</td>';

  html += '</tr></table>';
  html += '</div>'; // end Row A

  // ── Row B: Team Sprint Status Cards ─────────────────────────────────────────
  html += '<div style="padding:16px 20px;border-bottom:2px solid #f1f5f9">';
  html += '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;margin-bottom:12px">🏃 Team Sprint Status</div>';
  html += '<table style="width:100%;border-collapse:collapse"><tr>';
  // Pad to at least 5 columns using all teams
  const teamStatuses = d.allSprints.map(function(ts) {
    const sDone = ts.items.filter(i => DONE_STATES.includes(i.fields['System.State'])).length;
    const sTotal = ts.items.length;
    const sPct = sTotal ? Math.round((sDone / sTotal) * 100) : 0;
    const sBl = ts.items.filter(i => i.fields['System.State'] === 'Blocked').length;
    const status = sTotal === 0 ? { icon: '⚪', bg: '#f1f5f9', border: '#cbd5e1', c: '#94a3b8', label: 'No Items' }
                 : sBl > 0   ? { icon: '🔴', bg: '#fee2e2', border: '#fca5a5', c: '#b91c1c', label: 'Blocked' }
                 : sPct >= 70 ? { icon: '🟢', bg: '#d1fae5', border: '#6ee7b7', c: '#065f46', label: 'Healthy' }
                 : sPct >= 40 ? { icon: '🟡', bg: '#fef3c7', border: '#fcd34d', c: '#92400e', label: 'Watch' }
                 :              { icon: '🔴', bg: '#fee2e2', border: '#fca5a5', c: '#b91c1c', label: 'Behind' };
    return { ts, sDone, sTotal, sPct, sBl, status };
  });
  teamStatuses.forEach(function(tm) {
    const shortName = tm.ts.teamName.split(' ')[0];
    html += '<td style="padding:4px;vertical-align:top">';
    html += '<div style="background:' + tm.status.bg + ';border:2px solid ' + tm.status.border + ';border-radius:10px;padding:12px 6px;text-align:center">';
    html += '<div style="font-size:24px;line-height:1;margin-bottom:4px">' + tm.status.icon + '</div>';
    html += '<div style="font-size:12px;font-weight:800;color:' + tm.status.c + ';margin-bottom:2px">' + esc(shortName) + '</div>';
    html += '<div style="font-size:22px;font-weight:900;color:' + tm.status.c + ';line-height:1">' + tm.sTotal + '</div>';
    html += '<div style="font-size:10px;font-weight:600;color:' + tm.status.c + ';opacity:.8;margin-bottom:6px">items</div>';
    if (tm.sTotal > 0) {
      html += '<div style="background:rgba(0,0,0,.08);height:8px;border-radius:4px;overflow:hidden;margin-bottom:4px">';
      html += '<div style="width:' + tm.sPct + '%;height:100%;background:' + tm.status.c + ';border-radius:4px"></div>';
      html += '</div>';
      html += '<div style="font-size:11px;font-weight:800;color:' + tm.status.c + '">' + tm.sPct + '%</div>';
    }
    html += '<div style="font-size:10px;font-weight:700;color:' + tm.status.c + ';background:rgba(255,255,255,.6);border-radius:4px;padding:2px 4px;margin-top:4px">' + tm.status.label + '</div>';
    html += '</div></td>';
  });
  html += '</tr></table>';
  html += '</div>'; // end Row B

  // ── Row C: 6 Key Metrics ─────────────────────────────────────────────────────
  html += '<div style="padding:16px 20px;border-bottom:2px solid #f1f5f9">';
  html += '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;margin-bottom:12px">📊 Project Vitals</div>';
  html += '<table style="width:100%;border-collapse:collapse"><tr>';
  const execMetrics = [
    { icon: '📦', value: d.items.length,    label: 'Open Items',   color: '#1d4ed8', bg: '#eff6ff',  sub: 'in sprint' },
    { icon: '🐛', value: openBugs.length,   label: 'Open Bugs',    color: critBugs.length > 5 ? '#b91c1c' : '#92400e', bg: critBugs.length > 5 ? '#fee2e2' : '#fef3c7', sub: critBugs.length + ' critical' },
    { icon: '🚨', value: critBugs.length,   label: 'P1/P2 Bugs',  color: '#b91c1c', bg: critBugs.length > 0 ? '#fee2e2' : '#f1f5f9', sub: 'high priority' },
    { icon: '👥', value: engPulse.length,   label: 'Engineers',    color: '#065f46', bg: '#d1fae5',  sub: 'active' },
    { icon: '💻', value: d.commits.length,  label: 'Commits',      color: '#4f46e5', bg: '#ede9fe',  sub: 'last 14 days' },
    { icon: '🔀', value: d.prs.length,      label: 'Active PRs',   color: '#0369a1', bg: '#e0f2fe',  sub: 'open' },
  ];
  execMetrics.forEach(function(m) {
    html += '<td style="text-align:center;padding:4px">';
    html += '<div style="background:' + m.bg + ';border-radius:10px;padding:14px 4px">';
    html += '<div style="font-size:26px;line-height:1">' + m.icon + '</div>';
    html += '<div style="font-size:28px;font-weight:900;color:' + m.color + ';line-height:1.15;margin-top:6px">' + m.value + '</div>';
    html += '<div style="font-size:12px;font-weight:700;color:' + m.color + ';margin-top:5px">' + m.label + '</div>';
    html += '<div style="font-size:10px;color:' + m.color + ';opacity:.7;margin-top:2px">' + m.sub + '</div>';
    html += '</div></td>';
  });
  html += '</tr></table>';
  html += '</div>'; // end Row C

  // ── Row D: Risk Traffic Lights ──────────────────────────────────────────────
  if (topRisks.length > 0) {
    html += '<div style="padding:14px 20px;border-bottom:2px solid #f1f5f9">';
    html += '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;margin-bottom:10px">⚠ Risk Signals</div>';
    html += '<table style="width:100%;border-collapse:collapse"><tr>';
    topRisks.slice(0, 3).forEach(function(r) {
      const dot = r.level === 'HIGH' ? '🔴' : r.level === 'MEDIUM' ? '🟡' : '🔵';
      const bg  = r.level === 'HIGH' ? '#fee2e2' : r.level === 'MEDIUM' ? '#fef3c7' : '#eff6ff';
      const bc  = r.level === 'HIGH' ? '#fca5a5' : r.level === 'MEDIUM' ? '#fcd34d' : '#bfdbfe';
      const tc  = r.level === 'HIGH' ? '#b91c1c' : r.level === 'MEDIUM' ? '#92400e' : '#1d4ed8';
      html += '<td style="padding:4px;vertical-align:top">';
      html += '<div style="background:' + bg + ';border:1px solid ' + bc + ';border-radius:8px;padding:12px">';
      html += '<div style="font-size:20px;line-height:1;margin-bottom:6px">' + dot + '</div>';
      html += '<div style="font-size:10px;font-weight:800;color:' + tc + ';text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">' + r.level + '</div>';
      html += '<div style="font-size:12px;color:#374151;line-height:1.5">' + esc(r.text) + '</div>';
      html += '</div></td>';
    });
    html += '</tr></table>';
    html += '</div>';
  }

  // ── Row E: AI Narrative ────────────────────────────────────────────────────
  html += '<div style="padding:16px 20px;background:#f8fafc">';
  html += '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;margin-bottom:8px">🤖 AI Insight</div>';
  html += '<div style="font-size:14px;line-height:1.9;color:#1e293b">' + renderAI(ai) + '</div>';
  html += '</div>';

  html += '</div>'; // end Executive Summary card

  // ══ Health Score Tiles (full width) ══════════════════════════════════════════
  html += '<table style="width:100%;border-collapse:collapse;margin-bottom:14px"><tr>';
  aiTiles.forEach(function(t) {
    html += '<td style="width:25%;padding:4px">';
    html += '<div style="background:' + t.badge.bg + ';border:1px solid ' + t.badge.border + ';border-radius:8px;padding:14px 8px;text-align:center">';
    html += '<div style="font-size:' + XS + ';font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:' + t.badge.text + ';margin-bottom:6px">' + esc(t.label) + '</div>';
    html += '<div style="font-size:28px;font-weight:900;color:' + t.badge.text + ';line-height:1">' + esc(t.value) + '</div>';
    html += '<div style="height:4px;background:' + t.badge.bar + ';border-radius:2px;margin:8px 0 6px;opacity:.5"></div>';
    html += '<div style="font-size:' + XS + ';font-weight:700;color:' + t.badge.text + ';opacity:.9">' + esc(t.sub) + '</div>';
    html += '</div></td>';
  });
  html += '</tr></table>';

  // ══ Two-column dashboard ══════════════════════════════════════════════════════
  html += '<table style="width:100%;border-collapse:collapse"><tr>';

  // ════ LHS (56%) ════
  html += '<td style="width:56%;vertical-align:top;padding-right:10px">';

  // LHS Panel 1: Sprint Overview
  html += '<div style="background:#fff;border-radius:8px;border:1px solid #bfdbfe;padding:16px;margin-bottom:10px">';
  html += '<div style="font-size:' + PH + ';font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1e3a8a;margin-bottom:12px">🏃 Sprint Overview</div>';
  if (d.allSprints.length > 0) {
    d.allSprints.forEach(function(ts, idx) {
      const sp = ts.sprint; const items = ts.items;
      const sDone = items.filter(i => DONE_STATES.includes(i.fields['System.State'])).length;
      const sTotal = items.length;
      const sPct  = sTotal ? Math.round((sDone / sTotal) * 100) : 0;
      const sAct  = items.filter(i => ['Active','In Progress','Committed'].includes(i.fields['System.State'])).length;
      const sNew  = items.filter(i => ['New','Proposed','To Do','Ready'].includes(i.fields['System.State'])).length;
      const sBl   = items.filter(i => i.fields['System.State'] === 'Blocked').length;
      const tProg = sp.attributes?.startDate && sp.attributes?.finishDate ? (() => {
        const st = new Date(sp.attributes.startDate).getTime();
        const en = new Date(sp.attributes.finishDate).getTime();
        return Math.round(Math.min(100, Math.max(0, (now.getTime() - st) / (en - st) * 100)));
      })() : null;
      const tCol = tProg !== null && tProg >= 80 ? '#dc2626' : tProg !== null && tProg >= 50 ? '#d97706' : '#2563eb';
      const cCol = sPct >= 70 ? '#16a34a' : sPct >= 40 ? '#d97706' : '#dc2626';
      if (idx > 0) html += '<div style="border-top:1px solid #f1f5f9;margin:12px 0"></div>';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
      html += '<span style="font-size:' + XS + ';font-weight:800;background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:3px 8px">' + esc(ts.teamName) + '</span>';
      html += '<span style="font-size:13px;font-weight:700;color:#1e293b">' + esc(sp.name) + '</span>';
      html += '</div>';
      if (tProg !== null) {
        html += '<div style="font-size:' + SM + ';color:#94a3b8;margin-bottom:3px">Time elapsed &nbsp;' + tProg + '%</div>';
        html += '<div style="background:#e2e8f0;height:8px;border-radius:4px;overflow:hidden;margin-bottom:6px"><div style="width:' + tProg + '%;height:100%;background:' + tCol + ';border-radius:4px"></div></div>';
      }
      if (sTotal > 0) {
        html += '<div style="font-size:' + SM + ';color:#94a3b8;margin-bottom:3px">Completion &nbsp;' + sDone + ' / ' + sTotal + ' &nbsp;(' + sPct + '%)</div>';
        html += '<div style="background:#e2e8f0;height:8px;border-radius:4px;overflow:hidden;margin-bottom:8px"><div style="width:' + sPct + '%;height:100%;background:' + cCol + ';border-radius:4px"></div></div>';
        html += '<table style="width:100%;border-collapse:collapse"><tr>';
        [
          { n: sDone, l: 'Done',      bg: '#d1fae5', c: '#065f46' },
          { n: sAct,  l: 'Active',    bg: '#dbeafe', c: '#1d4ed8' },
          { n: sNew,  l: 'New',       bg: '#f1f5f9', c: '#475569' },
          { n: sBl,   l: 'Blocked',   bg: sBl > 0 ? '#fee2e2' : '#f1f5f9', c: sBl > 0 ? '#b91c1c' : '#94a3b8' },
        ].forEach(function(tile) {
          html += '<td style="text-align:center;padding:2px">';
          html += '<div style="background:' + tile.bg + ';border-radius:6px;padding:6px 2px">';
          html += '<div style="font-size:16px;font-weight:900;color:' + tile.c + '">' + tile.n + '</div>';
          html += '<div style="font-size:10px;font-weight:600;color:' + tile.c + ';opacity:.8">' + tile.l + '</div>';
          html += '</div></td>';
        });
        html += '</tr></table>';
      } else {
        html += '<div style="font-size:' + SM + ';color:#94a3b8;font-style:italic;margin-top:4px">No items on board</div>';
      }
    });
  } else {
    html += '<div style="font-size:' + CT + ';color:#94a3b8">No active sprints found</div>';
  }
  html += '</div>';

  // LHS Panel 2: Engineer Workload bars
  if (engPulse.length > 0) {
    html += '<div style="background:#fff;border-radius:8px;border:1px solid #bfdbfe;padding:16px;margin-bottom:10px">';
    html += '<div style="font-size:' + PH + ';font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1e3a8a;margin-bottom:12px">👥 Engineer Workload</div>';
    engPulse.forEach(function(entry) {
      const name = entry[0]; const s = entry[1];
      const done = s.done ?? 0;
      const activePct = Math.round((s.active / maxEngTotal) * 100);
      const donePct   = Math.round((done      / maxEngTotal) * 100);
      const barCol = s.active > 15 ? '#dc2626' : s.active > 8 ? '#d97706' : '#2563eb';
      const firstName = name.split(' ')[0];
      html += '<div style="margin-bottom:9px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
      html += '<span style="font-size:13px;font-weight:700;color:#1e293b">' + esc(firstName) + (s.blocked > 0 ? ' <span style="font-size:11px;color:#b91c1c">⚠</span>' : '') + '</span>';
      html += '<span style="font-size:' + SM + ';color:#64748b"><span style="color:' + barCol + ';font-weight:700">' + s.active + ' active</span>' + (done > 0 ? ' &nbsp;· <span style="color:#16a34a;font-weight:700">' + done + ' done</span>' : '') + '</span>';
      html += '</div>';
      html += '<div style="background:#e2e8f0;height:10px;border-radius:5px;overflow:hidden;display:flex">';
      html += '<div style="width:' + donePct + '%;height:100%;background:#16a34a"></div>';
      html += '<div style="width:' + activePct + '%;height:100%;background:' + barCol + '"></div>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // LHS Panel 3: Bug Severity breakdown
  if (openBugs.length > 0) {
    html += '<div style="background:#fff;border-radius:8px;border:1px solid #bfdbfe;padding:16px">';
    html += '<div style="font-size:' + PH + ';font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1e3a8a;margin-bottom:12px">🐛 Bug Severity</div>';
    [
      { label: 'P1 · Critical', count: p1Bugs, color: '#b91c1c', bg: '#fee2e2', bar: '#dc2626' },
      { label: 'P2 · High',     count: p2Bugs, color: '#92400e', bg: '#fef3c7', bar: '#d97706' },
      { label: 'P3 · Medium',   count: p3Bugs, color: '#713f12', bg: '#fefce8', bar: '#ca8a04' },
      { label: 'P4 / Unset',    count: p4Bugs, color: '#475569', bg: '#f1f5f9', bar: '#64748b' },
    ].forEach(function(row) {
      const pct = Math.round((row.count / maxBugSev) * 100);
      html += '<div style="margin-bottom:10px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
      html += '<span style="font-size:13px;font-weight:700;color:' + row.color + '">' + row.label + '</span>';
      html += '<span style="font-size:14px;font-weight:900;color:' + row.color + '">' + row.count + '</span>';
      html += '</div>';
      html += '<div style="background:#e2e8f0;height:10px;border-radius:5px;overflow:hidden">';
      html += '<div style="width:' + pct + '%;height:100%;background:' + row.bar + ';border-radius:5px"></div>';
      html += '</div>';
      html += '</div>';
    });
    html += '<div style="margin-top:8px;font-size:' + SM + ';color:#64748b;border-top:1px solid #f1f5f9;padding-top:8px">Total open: <strong style="color:#1e293b">' + openBugs.length + '</strong> &nbsp;·&nbsp; Bug density: <strong style="color:' + (bugDensity > 30 ? '#dc2626' : '#1e293b') + '">' + bugDensity + '%</strong> of backlog</div>';
    html += '</div>';
  }

  html += '</td>'; // end LHS

  // ════ RHS (44%) ════
  html += '<td style="width:44%;vertical-align:top;padding-left:10px">';

  // RHS Panel 1: Risk Radar
  if (topRisks.length > 0) {
    html += '<div style="background:#fff;border-radius:8px;border:1px solid #bfdbfe;padding:16px;margin-bottom:10px">';
    html += '<div style="font-size:' + PH + ';font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1e3a8a;margin-bottom:12px">⚡ Risk Radar</div>';
    topRisks.forEach(function(r) {
      const barCol  = r.level === 'HIGH' ? '#dc2626' : r.level === 'MEDIUM' ? '#d97706' : '#2563eb';
      const badgeBg = r.level === 'HIGH' ? '#fee2e2' : r.level === 'MEDIUM' ? '#fef3c7' : '#eff6ff';
      const badgeCol= r.level === 'HIGH' ? '#b91c1c' : r.level === 'MEDIUM' ? '#92400e' : '#1d4ed8';
      html += '<div style="padding:8px 0;border-bottom:1px solid #f1f5f9">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">';
      html += '<span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:4px;background:' + badgeBg + ';color:' + badgeCol + ';white-space:nowrap">' + r.level + '</span>';
      html += '<div style="flex:1;height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden"><div style="width:' + r.sev + '%;height:100%;background:' + barCol + '"></div></div>';
      html += '</div>';
      html += '<div style="font-size:' + CT + ';color:#374151;line-height:1.5">' + esc(r.text) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // RHS Panel 2: Today's Priorities
  if (topActions.length > 0) {
    html += '<div style="background:#fff;border-radius:8px;border:1px solid #bfdbfe;padding:16px;margin-bottom:10px">';
    html += '<div style="font-size:' + PH + ';font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1e3a8a;margin-bottom:12px">🎯 Today\'s Priorities</div>';
    topActions.forEach(function(a, i) {
      html += '<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid #f1f5f9">';
      html += '<span style="font-size:15px;font-weight:900;color:#1e3a8a;min-width:20px;flex-shrink:0;line-height:1.4">' + (i + 1) + '.</span>';
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="font-size:' + CT + ';color:#1e293b;font-weight:500;margin-bottom:4px;line-height:1.45">' + esc(a.text) + '</div>';
      html += '<div style="font-size:' + SM + ';color:#64748b">→ ' + esc(a.who) + ' &nbsp;<span style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:4px;background:' + a.bg + ';color:' + a.color + '">' + a.badge + '</span></div>';
      html += '</div></div>';
    });
    html += '</div>';
  }

  html += '</td></tr></table>'; // end two-col table
  html += '</div>'; // end ai-banner

  html += '<div class="body">';

  // ── SPRINT STATUS — all team boards ─────────────────────────────────────────
  html += '<div class="sec">' + secH('Active Sprints &nbsp;·&nbsp; All Boards');

  if (d.allSprints.length > 0) {
    // Helper: compute time progress for a sprint object
    function sprintProg(s) {
      if (!s.attributes?.startDate || !s.attributes?.finishDate) return null;
      const st = new Date(s.attributes.startDate).getTime();
      const en = new Date(s.attributes.finishDate).getTime();
      const pct = Math.round(Math.min(100, Math.max(0, (now.getTime() - st) / (en - st) * 100)));
      const dLeft = Math.max(0, Math.ceil((en - now.getTime()) / 86400000));
      return { pct, dLeft };
    }

    d.allSprints.forEach(function(ts, idx) {
      const sp = ts.sprint;
      const items = ts.items;
      const sDone    = items.filter(i => DONE_STATES.includes(i.fields['System.State'])).length;
      const sTotal   = items.length;
      const sPct     = sTotal ? Math.round((sDone / sTotal) * 100) : 0;
      const sActive  = items.filter(i => ['Active','In Progress','Committed'].includes(i.fields['System.State'])).length;
      const sBlocked = items.filter(i => i.fields['System.State'] === 'Blocked').length;
      const sNew     = items.filter(i => ['New','Proposed','To Do','Ready'].includes(i.fields['System.State'])).length;
      const prog     = sprintProg(sp);
      const timeCol  = prog && prog.pct >= 80 ? '#dc2626' : prog && prog.pct >= 50 ? '#d97706' : '#2563eb';
      const compCol  = sPct >= 70 ? '#16a34a' : sPct >= 40 ? '#d97706' : '#dc2626';

      const cardBorder = idx > 0 ? 'margin-top:12px;' : '';
      html += '<div style="' + cardBorder + 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px">';

      // Team chip + sprint name
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">';
      html += '<span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#1d4ed8;background:#dbeafe;border-radius:4px;padding:3px 8px">' + esc(ts.teamName) + '</span>';
      html += '<span style="font-size:15px;font-weight:800;color:#1e293b">🏃 ' + esc(sp.name) + '</span>';
      html += '</div>';

      // Date range
      if (sp.attributes?.startDate) {
        html += '<div style="font-size:12px;color:#64748b;margin-bottom:10px">' + fmt(sp.attributes.startDate) + ' &rarr; ' + fmt(sp.attributes.finishDate) + (prog ? ' &nbsp;·&nbsp; <strong style="color:#1d4ed8">' + prog.dLeft + ' days left</strong>' : '') + '</div>';
      }

      // Time elapsed bar
      if (prog) {
        html += '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Time elapsed</div>';
        html += '<div class="pb-bg"><div class="pb-f" style="width:' + prog.pct + '%;background:' + timeCol + '"></div></div>';
        html += '<div class="pb-lbl"><span>' + prog.pct + '% elapsed</span><span>' + (100 - prog.pct) + '% remaining</span></div>';
      }

      if (sTotal > 0) {
        // Completion bar
        html += '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin:10px 0 3px">Completion (' + sDone + ' / ' + sTotal + ' items)</div>';
        html += '<div class="pb-bg"><div class="pb-f" style="width:' + sPct + '%;background:' + compCol + '"></div></div>';
        html += '<div class="pb-lbl"><span>' + sPct + '% done</span><span>' + (sTotal - sDone) + ' remaining</span></div>';
        // Status tiles
        html += '<div class="sp-grid">';
        html += '<div class="sp-tile"><div class="sp-tile-n c-green">' + sDone + '</div><div class="sp-tile-l">Done</div></div>';
        html += '<div class="sp-tile"><div class="sp-tile-n c-blue">' + sActive + '</div><div class="sp-tile-l">In Progress</div></div>';
        html += '<div class="sp-tile"><div class="sp-tile-n c-slate">' + sNew + '</div><div class="sp-tile-l">Not Started</div></div>';
        html += '<div class="sp-tile"><div class="sp-tile-n c-red">' + sBlocked + '</div><div class="sp-tile-l">Blocked</div></div>';
        html += '</div>';
      } else {
        html += '<div style="margin-top:8px;font-size:11px;color:#94a3b8">No items on this sprint board in ADO.</div>';
      }

      html += '</div>'; // end card
    });
  } else if (d.sprint) {
    // Fallback: just show the canonical sprint with no items
    html += '<div style="font-size:14px;color:#64748b">Active sprint found but no items on any team board. Items tracked in project backlog below.</div>';
  } else {
    html += '<p style="color:#64748b;font-size:13px">No active sprint found — check Azure DevOps team settings.</p>';
  }

  // Sprint workload per person (combined across all boards)
  if (sprintPeople.length > 0) {
    html += '<div style="margin-top:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:8px">Sprint Workload · All Boards Combined</div>';
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

  // ── PROJECT KPIs ─────────────────────────────────────────────────────────────
  html += '<div class="sec">' + secH('Project At-a-Glance') + '<div class="kpi-row">';
  html += '<div class="kpi" style="border-top-color:#2563eb"><div class="kpi-n" style="color:#2563eb">' + d.items.length + '</div><div class="kpi-l">Work Items</div><div class="kpi-s">open / active</div></div>';
  html += '<div class="kpi" style="border-top-color:#dc2626"><div class="kpi-n" style="color:#dc2626">' + openBugs.length + '</div><div class="kpi-l">Open Bugs</div><div class="kpi-s">' + critBugs.length + ' critical/high</div></div>';
  html += '<div class="kpi" style="border-top-color:#d97706"><div class="kpi-n" style="color:#d97706">' + d.prs.length + '</div><div class="kpi-l">Active PRs</div><div class="kpi-s">' + stalePRs.length + ' stale</div></div>';
  html += '<div class="kpi" style="border-top-color:#4f46e5"><div class="kpi-n" style="color:#4f46e5">' + d.commits.length + '</div><div class="kpi-l">Commits</div><div class="kpi-s">last 14 days</div></div>';
  html += '<div class="kpi" style="border-top-color:#16a34a"><div class="kpi-n" style="color:#16a34a">' + d.repos.length + '</div><div class="kpi-l">Repos</div><div class="kpi-s">' + d.teams.length + ' team' + (d.teams.length !== 1 ? 's' : '') + '</div></div>';
  html += '</div></div>';

  // ── WORK DISTRIBUTION ────────────────────────────────────────────────────────
  if (stateEntries.length || typeSlices.length) {
    const distLabel = d.sprintItems.length > 0 ? 'Work Distribution (Active Sprint)' : 'Work Distribution (Project Backlog)';
    html += '<div class="sec">' + secH(distLabel);

    // Items by State
    if (stateEntries.length > 0) {
      html += '<div class="chart-label" style="margin-bottom:8px">Items by State</div>';
      stateEntries.forEach(function(entry) {
        const state = entry[0], count = entry[1];
        const col = STATE_COLOR[state] ?? '#6366f1';
        const pct = Math.round((count / maxState) * 100);
        html += '<div class="state-row"><div class="dot" style="background:' + col + '"></div><div class="sn">' + esc(state) + '</div><div class="sbar"><div class="sbar-f" style="width:' + pct + '%;background:' + col + '"></div></div><div class="sc">' + count + '</div></div>';
      });
    }

    // Items by Type — horizontal bars
    if (typeSlices.length > 0) {
      const maxType = Math.max(...typeSlices.map(s => s.value), 1);
      html += '<div class="chart-label" style="margin-top:20px;margin-bottom:8px">Items by Type</div>';
      typeSlices.forEach(function(sl) {
        const pct = Math.round((sl.value / maxType) * 100);
        html += '<div class="state-row"><div class="dot" style="background:' + sl.color + '"></div><div class="sn">' + esc(sl.label) + '</div><div class="sbar"><div class="sbar-f" style="width:' + pct + '%;background:' + sl.color + '"></div></div><div class="sc">' + sl.value + '</div></div>';
      });
    }

    // Active items by engineer — horizontal bars
    if (engSlices.length > 0) {
      const maxEng = Math.max(...engSlices.map(s => s.value), 1);
      html += '<div class="chart-label" style="margin-top:20px;margin-bottom:8px">Active Items by Engineer</div>';
      engSlices.forEach(function(sl) {
        const pct = Math.round((sl.value / maxEng) * 100);
        html += '<div class="state-row"><div class="dot" style="background:' + sl.color + '"></div><div class="sn">' + esc(sl.label) + '</div><div class="sbar"><div class="sbar-f" style="width:' + pct + '%;background:' + sl.color + '"></div></div><div class="sc">' + sl.value + '</div></div>';
      });
    }

    html += '</div>'; // end sec
  }

  // ── TEAM & ENGINEER SUMMARY ──────────────────────────────────────────────────
  if (engineers.length > 0) {
    html += '<div class="sec">' + secH('Team &amp; Engineer Summary');
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

  // ── OPEN BUGS ────────────────────────────────────────────────────────────────
  if (openBugs.length) {
    const sortedBugs = [...openBugs].sort((a, b) => (a.fields['Microsoft.VSTS.Common.Priority'] ?? 9) - (b.fields['Microsoft.VSTS.Common.Priority'] ?? 9));
    html += '<div class="sec">' + secH('Open Bugs (' + openBugs.length + ')') + '<div class="bug-grid">';
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

  // ── ACTIVE PRs ───────────────────────────────────────────────────────────────
  if (d.prs.length) {
    const sortedPRs = [...d.prs].sort((a, b) => new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime());
    html += '<div class="sec">' + secH('Active Pull Requests (' + d.prs.length + ')');
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

  // ── REPOSITORY ACTIVITY ──────────────────────────────────────────────────────
  if (d.commits.length || d.repos.length) {
    html += '<div class="sec">' + secH('Repository Activity &nbsp;·&nbsp; Last 14 Days') + '<div class="two-col">';

    // Left: recent commits
    html += '<div class="col-wide">';
    html += '<div class="chart-label">Recent Commits</div>';
    if (recentCommits.length) {
      recentCommits.forEach(function(c) {
        const dateStr = c.date ? new Date(c.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
        html += '<div class="commit-row"><span class="commit-hash">' + esc(c.commitId) + '</span><div style="flex:1"><div class="commit-msg">' + esc(c.comment) + '</div><div class="commit-meta">' + esc(c.repoName) + ' &nbsp;·&nbsp; ' + esc(c.author) + ' &nbsp;·&nbsp; ' + esc(dateStr) + '</div></div></div>';
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
  html += '<div class="sec">' + secH('Code Intelligence &nbsp;·&nbsp; Last 14 Days');
  html += '<div class="code-ai-box"><div class="code-ai-label">⚡ AI Code Analysis &nbsp;·&nbsp; ' + esc(MODEL) + '</div>';
  html += '<div class="code-ai-body">' + renderAI(codeAi || codeFallback) + '</div></div></div>';

  // ── REPOSITORIES ─────────────────────────────────────────────────────────────
  if (d.repos.length) {
    html += '<div class="sec">' + secH('Repositories (' + d.repos.length + ')') + '<div style="display:flex;flex-wrap:wrap;gap:6px">';
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
const TEST_MODE = process.argv.includes('--test');

const ALL_RECIPIENTS = [
  { name: 'Ganesh Bandi',        address: 'ganesh.bandi@globalhealthx.co' },
  { name: 'Varun M',             address: 'varun.m@globalhealthx.co' },
  { name: 'Manushree Enuganti',  address: 'manushree.enuganti@globalhealthx.co' },
];
const RECIPIENTS = TEST_MODE
  ? ALL_RECIPIENTS.slice(0, 1)   // only Ganesh in test mode
  : ALL_RECIPIENTS;

function sendEmail(subject, htmlPath) {
  const safeSubject = subject.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const recipientLines = RECIPIENTS
    .map(r => `    make new to recipient at end of to recipients of newMsg with properties {email address:{name:"${r.name}", address:"${r.address}"}}`)
    .join('\n');
  const script = `set htmlPath to "${htmlPath}"
set htmlContent to (do shell script "cat " & quoted form of htmlPath)
tell application "Microsoft Outlook" to activate
delay 2
with timeout of 90 seconds
  tell application "Microsoft Outlook"
    set newMsg to make new outgoing message with properties {subject:"${safeSubject}"}
    set content of newMsg to htmlContent
${recipientLines}
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
  // Skip weekends — no one needs a digest on Saturday or Sunday
  const dayIST = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });
  if (dayIST === 'Saturday' || dayIST === 'Sunday') {
    console.log(`\n⏭️  Skipping digest — today is ${dayIST} (weekend).`);
    return;
  }

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

  console.log('\n📧  Sending via Microsoft Outlook…' + (TEST_MODE ? '  [TEST MODE — only to Ganesh]' : ''));
  const result = sendEmail(subject, htmlPath);
  console.log(`✅  ${result} → ${RECIPIENTS.map(r => r.address).join(', ')}`);
  console.log(`    Subject: ${subject}\n`);
}

main().catch(err => {
  console.error('\n❌  Fatal error:', err.message);
  process.exit(1);
});
