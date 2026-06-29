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
const ORG    = env.ADO_ORG;
const PROJECT = env.ADO_PROJECT;
const PAT    = env.ADO_PAT;
const OLLAMA = env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL  = env.OLLAMA_MODEL || 'qwen3.5:4b';

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

// Batch-fetch work items in 200-id chunks
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

  console.log(`  ℹ Project "${PROJECT}" not found in ADO. Auto-detecting…`);
  const allProjects = await adoList(`${BASE}/_apis/projects`);
  let best = null, bestCount = 0;
  for (const proj of allProjects.slice(0, 10)) {
    try {
      const r = await adoPost(`${BASE}/${encodeURIComponent(proj.name)}/_apis/wit/wiql`, {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.Id] DESC`,
      });
      const cnt = (r.workItems ?? []).length;
      console.log(`  ℹ ${proj.name}: ${cnt} items`);
      if (cnt > bestCount) { bestCount = cnt; best = proj.name; }
    } catch {}
  }
  if (!best) throw new Error('No accessible ADO project found with the given PAT');
  console.log(`  ✓ Auto-selected project: "${best}" (${bestCount} items)`);
  return best;
}

async function fetchAll() {
  const resolvedProject = await resolveProject();
  const d = {
    project: resolvedProject,
    teams: [],
    iterations: [],
    sprint: null,
    items: [],        // all open/active items globally
    sprintItems: [],  // ALL items in current sprint (incl. completed) for real completion %
    repos: [],
    prs: [],
    pipelines: [],
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

  // All open work items (global backlog, excludes done)
  try {
    const wiql = await adoPost(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/wit/wiql`, {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${resolvedProject}' AND [System.State] NOT IN ('Closed','Resolved','Done','Removed') ORDER BY [System.ChangedDate] DESC`,
    });
    const ids = (wiql.workItems ?? []).map(w => w.id).slice(0, 500);
    d.items = await batchFetch(ids);
    console.log(`  ✓ active work items: ${d.items.length}`);
  } catch (e) { console.warn(`  ⚠ work items: ${e.message}`); }

  // ALL items in current sprint (including completed) — for true sprint completion %
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

  // Active PRs per repo
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

  // Pipelines
  try {
    d.pipelines = await adoList(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/pipelines`);
    console.log(`  ✓ pipelines: ${d.pipelines.length}`);
  } catch (e) { console.warn(`  ⚠ pipelines: ${e.message}`); }

  return d;
}

// ── Ollama AI analysis ────────────────────────────────────────────────────────
async function getAI(d) {
  const DONE = ['Resolved','Closed','Done','Removed','Verified','Cannot Reproduce'];
  const openBugs  = d.items.filter(w => w.fields['System.WorkItemType'] === 'Bug' && !DONE.includes(w.fields['System.State']));
  const critBugs  = openBugs.filter(b => (b.fields['Microsoft.VSTS.Common.Priority'] ?? 4) <= 2);
  const active    = d.items.filter(w => ['Active','In Progress','Committed'].includes(w.fields['System.State']));
  const stalePRs  = d.prs.filter(pr => Math.floor((Date.now() - new Date(pr.creationDate).getTime()) / 86400000) >= 5);
  const sprintDone  = d.sprintItems.filter(i => DONE.includes(i.fields['System.State'])).length;
  const sprintTotal = d.sprintItems.length;
  const sprintPct   = sprintTotal ? Math.round((sprintDone / sprintTotal) * 100) : 0;

  // Per-engineer summary for AI context
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

  const lines = [
    'You are a senior engineering manager at a healthcare tech company. Give a sharp morning standup analysis for the PRM project.',
    '',
    `DATE: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    `SPRINT: ${d.sprint?.name ?? 'No active sprint'}`,
    `TEAMS: ${d.teams.map(t => t.name).join(', ') || 'Unknown'}`,
    '',
    'SPRINT PROGRESS:',
    `- Completion: ${sprintDone}/${sprintTotal} items done (${sprintPct}%)`,
    `- Active (in progress): ${active.length}`,
    `- Open bugs: ${openBugs.length} (${critBugs.length} critical/high)`,
    `- Stale PRs (>5 days): ${stalePRs.length} of ${d.prs.length}`,
    '',
    'ENGINEER WORKLOAD:',
    ...topEngineers.map(([name, s]) =>
      `  - ${name}: ${s.active} active, ${s.done} done in sprint, ${s.bugs} open bugs, ${s.p1} P1 items`
    ),
    '',
    'TOP ACTIVE ITEMS:',
    ...active.slice(0, 6).map(w => {
      const pri = w.fields['Microsoft.VSTS.Common.Priority'];
      const who = w.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
      return `  - [${w.fields['System.WorkItemType']}${pri ? ` P${pri}` : ''}] ${w.fields['System.Title']} (${w.fields['System.State']}) → ${who}`;
    }),
    '',
    'TOP OPEN BUGS:',
    ...openBugs.slice(0, 5).map(b => {
      const pri = b.fields['Microsoft.VSTS.Common.Priority'] ?? '?';
      const who = b.fields['System.AssignedTo']?.displayName ?? 'UNASSIGNED';
      const age = Math.floor((Date.now() - new Date(b.fields['System.CreatedDate']).getTime()) / 86400000);
      return `  - P${pri} (${age}d old) ${b.fields['System.Title']} → ${who}`;
    }),
    '',
    'Write exactly 4 sections:',
    '1. EXECUTIVE SUMMARY: 2-3 sentences on overall sprint health',
    '2. KEY RISKS: top 3 specific risks with data evidence',
    '3. TODAY\'S PRIORITIES: top 3 recommended actions, naming specific people/items',
    '4. TEAM PULSE: flag any engineer overloaded or at risk; note momentum',
    '',
    'Be specific and data-driven. Name people and items. Under 400 words.',
  ];

  try {
    const mkBody = (model, prompt) => JSON.stringify({
      model, prompt, stream: false,
      options: { temperature: 0.7, num_predict: 400 },
    });
    const fullPrompt = lines.join('\n');

    let resp;
    try {
      const r = await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: mkBody(MODEL, fullPrompt),
        signal: AbortSignal.timeout(90000),
      });
      resp = await r.json();
    } catch {
      console.warn(`  ⚠ ${MODEL} timed out (>90s) — falling back to gemma:latest`);
      const r2 = await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: mkBody('gemma:latest', fullPrompt),
        signal: AbortSignal.timeout(120000),
      });
      resp = await r2.json();
    }

    if (resp.error) throw new Error(`Ollama model error: ${resp.error}`);
    // Qwen3 thinking models wrap reasoning in <think>…</think> — strip it
    const text = (resp.response ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!text) throw new Error('empty response after stripping think blocks');
    return text;
  } catch (e) {
    console.warn(`  ⚠ Ollama: ${e.message}`);
    return '';
  }
}

// ── HTML email builder (light mode) ──────────────────────────────────────────
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

function buildHtml(d, ai) {
  const now = new Date();
  const IST = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ── Derived data ──────────────────────────────────────────────────────────
  const openBugs = d.items.filter(w =>
    w.fields['System.WorkItemType'] === 'Bug' && !DONE_STATES.includes(w.fields['System.State'])
  );
  const critBugs = openBugs.filter(b => (b.fields['Microsoft.VSTS.Common.Priority'] ?? 4) <= 2);

  // Sprint timing
  const spProg = d.sprint?.attributes?.startDate && d.sprint?.attributes?.finishDate ? (() => {
    const s = new Date(d.sprint.attributes.startDate).getTime();
    const e = new Date(d.sprint.attributes.finishDate).getTime();
    const pct = Math.round(Math.min(100, Math.max(0, (now.getTime() - s) / (e - s) * 100)));
    const dLeft = Math.max(0, Math.ceil((e - now.getTime()) / 86400000));
    return { pct, dLeft };
  })() : null;

  // Sprint item counts
  const sprintDone    = d.sprintItems.filter(i => DONE_STATES.includes(i.fields['System.State'])).length;
  const sprintTotal   = d.sprintItems.length;
  const sprintPct     = sprintTotal ? Math.round((sprintDone / sprintTotal) * 100) : 0;
  const sprintActive  = d.sprintItems.filter(i => ['Active','In Progress','Committed'].includes(i.fields['System.State'])).length;
  const sprintBlocked = d.sprintItems.filter(i => i.fields['System.State'] === 'Blocked').length;
  const sprintNew     = d.sprintItems.filter(i => ['New','Proposed','To Do','Ready'].includes(i.fields['System.State'])).length;

  // Sprint workload per person
  const sprintEngMap = {};
  for (const item of d.sprintItems) {
    const name = item.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
    if (!sprintEngMap[name]) sprintEngMap[name] = { done: 0, active: 0, notStarted: 0, blocked: 0 };
    const state = item.fields['System.State'];
    if (DONE_STATES.includes(state))                                    sprintEngMap[name].done++;
    else if (['Active','In Progress','Committed'].includes(state))       sprintEngMap[name].active++;
    else if (state === 'Blocked')                                        sprintEngMap[name].blocked++;
    else                                                                  sprintEngMap[name].notStarted++;
  }
  const sprintPeople = Object.entries(sprintEngMap)
    .sort((a, b) => (b[1].active + b[1].done) - (a[1].active + a[1].done));

  // Global state breakdown
  const stateCounts = {};
  d.items.forEach(w => { const s = w.fields['System.State']; stateCounts[s] = (stateCounts[s] ?? 0) + 1; });
  const stateEntries = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]);
  const maxState = Math.max(...stateEntries.map(e => e[1]), 1);

  // Team & engineer summary (active items + sprint done items)
  const engMap = {};
  const sprintDoneItems = d.sprintItems.filter(i => DONE_STATES.includes(i.fields['System.State']));
  for (const item of [...d.items, ...sprintDoneItems]) {
    const name = item.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
    const isDone    = DONE_STATES.includes(item.fields['System.State']);
    const isBlocked = item.fields['System.State'] === 'Blocked';
    const isBug     = item.fields['System.WorkItemType'] === 'Bug';
    const pri       = item.fields['Microsoft.VSTS.Common.Priority'] ?? 9;
    if (!engMap[name]) engMap[name] = { active: 0, done: 0, bugs: 0, p1p2: 0, blocked: 0 };
    if (isDone)     engMap[name].done++;
    else {
      engMap[name].active++;
      if (isBlocked) engMap[name].blocked++;
    }
    if (isBug && !isDone)  engMap[name].bugs++;
    if (pri <= 2 && !isDone) engMap[name].p1p2++;
  }
  const prsByEng = {};
  for (const pr of d.prs) {
    const name = pr.createdBy?.displayName ?? 'Unknown';
    prsByEng[name] = (prsByEng[name] ?? 0) + 1;
  }
  const engineers = Object.entries(engMap)
    .sort((a, b) => b[1].active - a[1].active)
    .slice(0, 15);

  // Stale PRs
  const stalePRs = d.prs.filter(pr => Math.floor((Date.now() - new Date(pr.creationDate).getTime()) / 86400000) >= 5);

  // Statistical fallback when Ollama is unavailable
  const fallback = [
    `SPRINT PROGRESS — ${sprintPct}% of ${sprintTotal} sprint items done` + (d.sprint ? ` with ${spProg?.dLeft ?? '?'} days remaining in ${d.sprint.name}` : '') + '.',
    `QUALITY & TESTING — ${openBugs.length} open bugs (${critBugs.length} critical/high); bug density ${d.items.length ? Math.round((openBugs.length / d.items.length) * 100) : 0}% of active backlog.`,
    `ACTIVE WORK — ${d.items.length} open items globally; ${sprintActive} currently in progress within the sprint.`,
    stalePRs.length > 0
      ? `PULL REQUESTS — ${stalePRs.length} of ${d.prs.length} PRs stale (5+ days old) — assign reviewers today.`
      : `PULL REQUESTS — ${d.prs.length} active PRs, none stale.`,
    `NOTE — AI model (${MODEL}) unavailable. Run: ollama serve`,
  ].join('\n');

  const aiHtml = (ai || fallback)
    .split('\n')
    .map(l => esc(l).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'))
    .join('<br>\n');

  // ── CSS (light mode) ─────────────────────────────────────────────────────
  const CSS = `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f0f4f8;color:#1e293b;line-height:1.5}
    .w{max-width:700px;margin:0 auto;background:#f0f4f8}
    .hdr{background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 55%,#0369a1 100%);padding:26px 32px}
    .hdr-row{display:flex;align-items:center;gap:14px}
    .logo{width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0}
    .hdr-title{font-size:22px;font-weight:800;color:#fff;letter-spacing:-.4px}
    .hdr-sub{font-size:12px;color:#bfdbfe;margin-top:2px}
    .hdr-date{margin-top:12px;font-size:12px;color:#fff;background:rgba(255,255,255,.18);display:inline-block;padding:5px 14px;border-radius:100px;border:1px solid rgba(255,255,255,.28)}
    .body{background:#f0f4f8;padding:12px 0 24px}
    .sec{background:#fff;margin:10px 14px;border-radius:12px;padding:20px 22px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.05)}
    .sec-h{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#1d4ed8;margin-bottom:14px;display:flex;align-items:center;gap:8px}
    .sec-h::before{content:'';width:3px;height:14px;background:linear-gradient(to bottom,#1d4ed8,#0ea5e9);border-radius:2px;flex-shrink:0}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 10px;text-align:center}
    .kpi-n{font-size:26px;font-weight:900;line-height:1}
    .kpi-l{font-size:10px;color:#64748b;margin-top:5px;text-transform:uppercase;letter-spacing:.6px}
    .kpi-s{font-size:10px;color:#94a3b8;margin-top:2px}
    .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:11px 14px;margin-bottom:6px}
    .card:last-child{margin-bottom:0}
    .row{display:flex;gap:10px;align-items:flex-start}
    .rtitle{font-size:13px;color:#1e293b;flex:1;font-weight:500}
    .rmeta{font-size:11px;color:#64748b;margin-top:3px}
    .pb-bg{height:7px;background:#e2e8f0;border-radius:100px;overflow:hidden;margin-top:8px}
    .pb-f{height:100%;border-radius:100px}
    .pb-lbl{display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#64748b}
    .state-row{display:flex;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9;gap:10px}
    .state-row:last-child{border-bottom:none}
    .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
    .sn{font-size:13px;color:#334155;flex:1}
    .sc{font-size:13px;font-weight:700;color:#1e293b;width:32px;text-align:right}
    .sbar{width:90px;height:4px;background:#e2e8f0;border-radius:100px;overflow:hidden}
    .sbar-f{height:100%;border-radius:100px}
    .badge{font-size:10px;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:5px;flex-shrink:0;letter-spacing:.3px}
    .p1{background:#fee2e2;color:#b91c1c}
    .p2{background:#ffedd5;color:#c2410c}
    .p3{background:#fef9c3;color:#a16207}
    .p4{background:#f1f5f9;color:#64748b}
    .age-w{background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;flex-shrink:0;white-space:nowrap;border:1px solid #fbbf24}
    .age-ok{background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;flex-shrink:0;white-space:nowrap}
    .ai-box{background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:20px}
    .ai-lbl{font-size:10px;font-weight:800;color:#0369a1;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .ai-body{font-size:13.5px;line-height:1.8;color:#0f172a}
    .repo-tag{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;font-size:12px;color:#475569;display:inline-block;margin:3px}
    .ftr{padding:14px 22px;text-align:center;border-top:1px solid #e2e8f0;margin:0 14px 14px}
    .ftr p{font-size:11px;color:#94a3b8;margin:2px 0}
    .c-blue{color:#2563eb}.c-red{color:#dc2626}.c-amber{color:#d97706}.c-green{color:#16a34a}.c-slate{color:#475569}
    /* Sprint tile grid */
    .sp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
    .sp-tile{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px;text-align:center}
    .sp-tile-n{font-size:22px;font-weight:900;line-height:1}
    .sp-tile-l{font-size:9px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
    /* Eng / team tables */
    table.eng{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
    table.eng th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;padding:6px 8px;border-bottom:2px solid #e2e8f0;background:#f8fafc}
    table.eng td{padding:8px 8px;border-bottom:1px solid #f1f5f9;color:#1e293b;vertical-align:middle}
    table.eng tr:last-child td{border-bottom:none}
    .eng-name{font-weight:600;color:#1e293b;font-size:12.5px}
    .n{display:inline-block;min-width:24px;text-align:center;padding:2px 5px;border-radius:4px;font-weight:700;font-size:11px}
    .n-blue{background:#dbeafe;color:#1d4ed8}
    .n-green{background:#d1fae5;color:#065f46}
    .n-red{background:#fee2e2;color:#b91c1c}
    .n-amber{background:#fef3c7;color:#92400e}
    .n-gray{background:#f1f5f9;color:#64748b}
    .blocked-tag{font-size:10px;background:#fee2e2;color:#b91c1c;padding:1px 5px;border-radius:3px;font-weight:700;margin-left:4px}
  `;

  // ── Assemble ──────────────────────────────────────────────────────────────
  let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRM Morning Digest</title><style>${CSS}</style></head><body><div class="w">`;

  // Header
  html += `<div class="hdr"><div class="hdr-row"><div class="logo">📊</div><div><div class="hdr-title">PRM Morning Digest</div><div class="hdr-sub">Global HealthX &nbsp;·&nbsp; ${esc(d.project ?? PROJECT)} &nbsp;·&nbsp; Engineering Intelligence</div></div></div><div class="hdr-date">📅 ${esc(IST)}</div></div>`;

  html += `<div class="body">`;

  // ── Section 1: Sprint Intelligence ───────────────────────────────────────
  html += `<div class="sec"><div class="sec-h">Sprint Intelligence</div>`;
  if (d.sprint) {
    html += `<div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:3px">🏃 ${esc(d.sprint.name)}</div>`;
    html += `<div style="font-size:12px;color:#64748b;margin-bottom:10px">${fmt(d.sprint.attributes?.startDate)} → ${fmt(d.sprint.attributes?.finishDate)}`;
    if (spProg) html += ` &nbsp;·&nbsp; <strong style="color:#1d4ed8">${spProg.dLeft} day${spProg.dLeft !== 1 ? 's' : ''} remaining</strong>`;
    html += `</div>`;

    if (spProg) {
      const timeCol = spProg.pct >= 80 ? '#dc2626' : spProg.pct >= 50 ? '#d97706' : '#2563eb';
      html += `<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Time elapsed</div>`;
      html += `<div class="pb-bg"><div class="pb-f" style="width:${spProg.pct}%;background:${timeCol}"></div></div>`;
      html += `<div class="pb-lbl"><span>${spProg.pct}% elapsed</span><span>${100 - spProg.pct}% remaining</span></div>`;
    }

    if (sprintTotal > 0) {
      const compCol = sprintPct >= 70 ? '#16a34a' : sprintPct >= 40 ? '#d97706' : '#dc2626';
      html += `<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin:10px 0 3px">Sprint completion (${sprintDone} / ${sprintTotal} items)</div>`;
      html += `<div class="pb-bg"><div class="pb-f" style="width:${sprintPct}%;background:${compCol}"></div></div>`;
      html += `<div class="pb-lbl"><span>${sprintPct}% done</span><span>${sprintTotal - sprintDone} remaining</span></div>`;

      html += `<div class="sp-grid">`;
      html += `<div class="sp-tile"><div class="sp-tile-n c-green">${sprintDone}</div><div class="sp-tile-l">Done</div></div>`;
      html += `<div class="sp-tile"><div class="sp-tile-n c-blue">${sprintActive}</div><div class="sp-tile-l">In Progress</div></div>`;
      html += `<div class="sp-tile"><div class="sp-tile-n c-slate">${sprintNew}</div><div class="sp-tile-l">Not Started</div></div>`;
      html += `<div class="sp-tile"><div class="sp-tile-n c-red">${sprintBlocked}</div><div class="sp-tile-l">Blocked</div></div>`;
      html += `</div>`;
    }

    // Sprint workload per person
    if (sprintPeople.length > 0) {
      html += `<div style="margin-top:18px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:8px">Sprint workload per person</div>`;
      html += `<table class="eng"><thead><tr><th>Engineer</th><th style="text-align:center">Done</th><th style="text-align:center">Active</th><th style="text-align:center">Not Started</th><th style="text-align:center">Blocked</th></tr></thead><tbody>`;
      for (const [name, s] of sprintPeople) {
        const total   = s.done + s.active + s.notStarted + s.blocked;
        const donePct = total ? Math.round((s.done / total) * 100) : 0;
        html += `<tr>`;
        html += `<td><div class="eng-name">${esc(name)}</div><div style="font-size:10px;color:#94a3b8">${total} items · ${donePct}% done</div></td>`;
        html += `<td style="text-align:center"><span class="n n-green">${s.done}</span></td>`;
        html += `<td style="text-align:center"><span class="n n-blue">${s.active}</span></td>`;
        html += `<td style="text-align:center"><span class="n n-gray">${s.notStarted}</span></td>`;
        html += `<td style="text-align:center">${s.blocked > 0 ? `<span class="n n-red">${s.blocked}</span>` : `<span style="color:#cbd5e1">—</span>`}</td>`;
        html += `</tr>`;
      }
      html += `</tbody></table>`;
    }
  } else {
    html += `<p style="color:#64748b;font-size:13px">No active sprint found — check Azure DevOps team settings.</p>`;
  }
  html += `</div>`;

  // ── Section 2: KPI Tiles ──────────────────────────────────────────────────
  html += `<div class="sec"><div class="sec-h">Project At-a-Glance</div><div class="kpi-grid">`;
  html += `<div class="kpi"><div class="kpi-n c-blue">${d.items.length}</div><div class="kpi-l">Work Items</div><div class="kpi-s">open / active</div></div>`;
  html += `<div class="kpi"><div class="kpi-n c-red">${openBugs.length}</div><div class="kpi-l">Open Bugs</div><div class="kpi-s">${critBugs.length} critical/high</div></div>`;
  html += `<div class="kpi"><div class="kpi-n c-amber">${d.prs.length}</div><div class="kpi-l">Active PRs</div><div class="kpi-s">${stalePRs.length} stale</div></div>`;
  html += `<div class="kpi"><div class="kpi-n c-green">${d.repos.length}</div><div class="kpi-l">Repos</div><div class="kpi-s">${d.teams.length} team${d.teams.length !== 1 ? 's' : ''}</div></div>`;
  html += `</div></div>`;

  // ── Section 3: Team & Engineer Summary ───────────────────────────────────
  if (engineers.length > 0) {
    html += `<div class="sec"><div class="sec-h">Team & Engineer Summary</div>`;
    html += `<table class="eng"><thead><tr>`;
    html += `<th>Engineer</th>`;
    html += `<th style="text-align:center">Active Items</th>`;
    html += `<th style="text-align:center">Done (Sprint)</th>`;
    html += `<th style="text-align:center">Open Bugs</th>`;
    html += `<th style="text-align:center">P1 / P2</th>`;
    html += `<th style="text-align:center">Open PRs</th>`;
    html += `</tr></thead><tbody>`;
    for (const [name, s] of engineers) {
      const prs = prsByEng[name] ?? 0;
      html += `<tr>`;
      html += `<td><span class="eng-name">${esc(name)}</span>${s.blocked > 0 ? `<span class="blocked-tag">⚠ BLOCKED</span>` : ''}</td>`;
      html += `<td style="text-align:center"><span class="n ${s.active > 5 ? 'n-amber' : 'n-blue'}">${s.active}</span></td>`;
      html += `<td style="text-align:center"><span class="n n-green">${s.done}</span></td>`;
      html += `<td style="text-align:center">${s.bugs > 0 ? `<span class="n n-red">${s.bugs}</span>` : `<span style="color:#cbd5e1">—</span>`}</td>`;
      html += `<td style="text-align:center">${s.p1p2 > 0 ? `<span class="n n-amber">${s.p1p2}</span>` : `<span style="color:#cbd5e1">—</span>`}</td>`;
      html += `<td style="text-align:center">${prs > 0 ? `<span class="n n-blue">${prs}</span>` : `<span style="color:#cbd5e1">—</span>`}</td>`;
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
  }

  // ── Section 4: Work Item States ───────────────────────────────────────────
  if (stateEntries.length) {
    html += `<div class="sec"><div class="sec-h">Work Item States · Global Backlog</div>`;
    stateEntries.forEach(([state, count]) => {
      const col = STATE_COLOR[state] ?? '#6366f1';
      const pct = Math.round((count / maxState) * 100);
      html += `<div class="state-row"><div class="dot" style="background:${col}"></div><div class="sn">${esc(state)}</div><div class="sbar"><div class="sbar-f" style="width:${pct}%;background:${col}"></div></div><div class="sc">${count}</div></div>`;
    });
    html += `</div>`;
  }

  // ── Section 5: Open Bugs ──────────────────────────────────────────────────
  if (openBugs.length) {
    const sortedBugs = [...openBugs].sort((a, b) => (a.fields['Microsoft.VSTS.Common.Priority'] ?? 9) - (b.fields['Microsoft.VSTS.Common.Priority'] ?? 9));
    html += `<div class="sec"><div class="sec-h">Open Bugs (${openBugs.length})</div>`;
    sortedBugs.slice(0, 10).forEach(bug => {
      const pri = bug.fields['Microsoft.VSTS.Common.Priority'] ?? 4;
      const cls = pri <= 1 ? 'p1' : pri === 2 ? 'p2' : pri === 3 ? 'p3' : 'p4';
      const who = bug.fields['System.AssignedTo']?.displayName ?? '⚠ Unassigned';
      const age = daysOld(bug.fields['System.CreatedDate']);
      html += `<div class="card row"><span class="badge ${cls}">P${pri}</span><div style="flex:1"><div class="rtitle">${esc(bug.fields['System.Title'])}</div><div class="rmeta">${esc(bug.fields['System.State'])} &nbsp;·&nbsp; ${esc(who)} &nbsp;·&nbsp; ${age}d old</div></div></div>`;
    });
    if (openBugs.length > 10) html += `<p style="font-size:11px;color:#94a3b8;text-align:center;padding-top:8px">+ ${openBugs.length - 10} more open bugs in ADO</p>`;
    html += `</div>`;
  }

  // ── Section 6: Active PRs ─────────────────────────────────────────────────
  if (d.prs.length) {
    const sortedPRs = [...d.prs].sort((a, b) => new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime());
    html += `<div class="sec"><div class="sec-h">Active Pull Requests (${d.prs.length})</div>`;
    sortedPRs.slice(0, 8).forEach(pr => {
      const age = daysOld(pr.creationDate);
      const cls = age >= 5 ? 'age-w' : 'age-ok';
      const creator   = pr.createdBy?.displayName ?? 'Unknown';
      const reviewers = (pr.reviewers ?? []).map(r => r.displayName || r.uniqueName || '?').join(', ') || 'No reviewers';
      html += `<div class="card row"><span class="${cls}">${age}d</span><div style="flex:1"><div class="rtitle">${esc(pr.title)}</div><div class="rmeta">${esc(pr.repoName)} &nbsp;·&nbsp; by ${esc(creator)} &nbsp;·&nbsp; ${esc(reviewers)}</div></div></div>`;
    });
    if (d.prs.length > 8) html += `<p style="font-size:11px;color:#94a3b8;text-align:center;padding-top:8px">+ ${d.prs.length - 8} more active PRs</p>`;
    html += `</div>`;
  }

  // ── Section 7: AI Analysis ────────────────────────────────────────────────
  html += `<div class="sec"><div class="sec-h">AI Analysis &nbsp;·&nbsp; ${esc(MODEL)}</div><div class="ai-box"><div class="ai-lbl">✦ AI-Generated Morning Summary</div><div class="ai-body">${aiHtml}</div></div></div>`;

  // ── Section 8: Repositories ───────────────────────────────────────────────
  if (d.repos.length) {
    html += `<div class="sec"><div class="sec-h">Repositories (${d.repos.length})</div><div style="display:flex;flex-wrap:wrap;gap:4px">`;
    d.repos.forEach(r => { html += `<span class="repo-tag">📁 ${esc(r.name)}</span>`; });
    html += `</div></div>`;
  }

  // Footer
  html += `<div class="ftr"><p>PRM &nbsp;·&nbsp; Global HealthX Engineering Intelligence</p><p>Automated digest · 7:00 AM IST &nbsp;·&nbsp; ${esc(IST)}</p></div>`;

  html += `</div>`; // .body
  html += `</div></body></html>`;
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
  const ai = await getAI(data);

  console.log('\n🖊️   Building HTML email…');
  const html = buildHtml(data, ai);

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
