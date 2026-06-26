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

// ── ADO data fetcher ──────────────────────────────────────────────────────────

// Probe available projects and find the one(s) with the most work items
async function resolveProject() {
  // First try the configured project
  try {
    const teams = await adoList(`${BASE}/_apis/projects/${encodeURIComponent(PROJECT)}/teams`);
    if (teams.length) return PROJECT;
  } catch {}

  // Configured project doesn't exist — auto-detect
  console.log(`  ℹ Project "${PROJECT}" not found in ADO. Auto-detecting…`);
  const allProjects = await adoList(`${BASE}/_apis/projects`);
  let best = null, bestCount = 0;
  for (const proj of allProjects.slice(0, 10)) {
    try {
      const r = await adoPost(`${BASE}/${encodeURIComponent(proj.name)}/_apis/wit/wiql`, {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.Id] DESC`
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
  const d = { project: resolvedProject, teams: [], iterations: [], sprint: null, items: [], repos: [], prs: [], pipelines: [] };

  // Teams
  try {
    d.teams = await adoList(`${BASE}/_apis/projects/${encodeURIComponent(resolvedProject)}/teams`);
    console.log(`  ✓ teams: ${d.teams.length}`);
  } catch (e) { console.warn(`  ⚠ teams: ${e.message}`); }

  const team = d.teams.find(t =>
    t.name.toLowerCase().includes('main') ||
    t.name.toLowerCase() === resolvedProject.toLowerCase() ||
    t.name.toLowerCase().includes('default')
  )?.name ?? d.teams[0]?.name ?? resolvedProject;

  // Iterations / current sprint
  try {
    d.iterations = await adoList(`${BASE}/${encodeURIComponent(resolvedProject)}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations`);
    d.sprint = d.iterations.find(i => i.attributes?.timeFrame === 'current') ?? null;
    console.log(`  ✓ iterations: ${d.iterations.length}  sprint: ${d.sprint?.name ?? 'none'}`);
  } catch (e) { console.warn(`  ⚠ iterations: ${e.message}`); }

  // Work items (WIQL + batch)
  try {
    const wiql = await adoPost(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/wit/wiql`, {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${resolvedProject}' AND [System.State] NOT IN ('Closed','Resolved','Done','Removed') ORDER BY [System.ChangedDate] DESC`
    });
    const ids = (wiql.workItems ?? []).map(w => w.id).slice(0, 200);
    if (ids.length) {
      const batch = await adoPost(`${BASE}/_apis/wit/workitemsbatch`, {
        ids,
        fields: [
          'System.Id','System.Title','System.State','System.WorkItemType',
          'System.AssignedTo','System.CreatedDate','System.ChangedDate',
          'Microsoft.VSTS.Common.Priority','Microsoft.VSTS.Scheduling.StoryPoints',
          'System.IterationPath','System.BoardColumn'
        ]
      });
      d.items = batch.value ?? [];
    }
    console.log(`  ✓ work items: ${d.items.length}`);
  } catch (e) { console.warn(`  ⚠ work items: ${e.message}`); }

  // Repositories
  try {
    d.repos = await adoList(`${BASE}/${encodeURIComponent(resolvedProject)}/_apis/git/repositories`);
    console.log(`  ✓ repos: ${d.repos.length}`);
  } catch (e) { console.warn(`  ⚠ repos: ${e.message}`); }

  // Active PRs (one request per repo)
  await Promise.allSettled(d.repos.map(async repo => {
    try {
      const prs = await adoList(
        `${BASE}/${encodeURIComponent(resolvedProject)}/_apis/git/repositories/${repo.id}/pullrequests`,
        { 'searchCriteria.status': 'active' }
      );
      d.prs.push(...prs.map(pr => ({ ...pr, repoName: repo.name })));
    } catch { /* skip repo */ }
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
  const bugs   = d.items.filter(w => w.fields['System.WorkItemType'] === 'Bug');
  const active = d.items.filter(w => ['Active','In Progress','Committed'].includes(w.fields['System.State']));
  const openBugs = bugs.filter(b => !['Resolved','Closed','Done','Removed'].includes(b.fields['System.State']));
  const critBugs = openBugs.filter(b => (b.fields['Microsoft.VSTS.Common.Priority'] ?? 4) <= 2);
  const stalePRs = d.prs.filter(pr => Math.floor((Date.now() - new Date(pr.creationDate).getTime()) / 86400000) >= 5);

  const lines = [
    'You are a senior engineering manager at a healthcare tech company. Analyze this morning standup data for the PRM project.',
    '',
    `DATE: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    `SPRINT: ${d.sprint?.name ?? 'No active sprint'}`,
    `TEAMS: ${d.teams.map(t => t.name).join(', ') || 'Unknown'}`,
    '',
    'METRICS:',
    `- Active work items: ${active.length}`,
    `- Open bugs: ${openBugs.length} (${critBugs.length} critical/high priority)`,
    `- Stale PRs (>5 days): ${stalePRs.length} of ${d.prs.length} active PRs`,
    `- Repositories: ${d.repos.length}  Pipelines: ${d.pipelines.length}`,
    '',
    'TOP ACTIVE WORK ITEMS:',
    ...active.slice(0, 6).map(w => {
      const pri = w.fields['Microsoft.VSTS.Common.Priority'];
      const who = w.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
      return `  - [${w.fields['System.WorkItemType']}${pri ? ` P${pri}` : ''}] ${w.fields['System.Title']} (${w.fields['System.State']}) → ${who}`;
    }),
    '',
    'TOP OPEN BUGS:',
    ...openBugs.slice(0, 4).map(b => {
      const pri = b.fields['Microsoft.VSTS.Common.Priority'] ?? '?';
      const who = b.fields['System.AssignedTo']?.displayName ?? 'UNASSIGNED';
      const age = Math.floor((Date.now() - new Date(b.fields['System.CreatedDate']).getTime()) / 86400000);
      return `  - P${pri} (${age}d old) ${b.fields['System.Title']} → ${who}`;
    }),
    '',
    'Provide exactly 4 labeled sections:',
    '1. EXECUTIVE SUMMARY: 2-3 sentence overall project health',
    '2. KEY RISKS: top 3 risks in bullet points',
    '3. TODAY\'S PRIORITIES: top 3 recommended actions for today',
    '4. TEAM PULSE: one sentence on team momentum and morale',
    '',
    'Be specific, data-driven, concise. Under 380 words total.',
  ];

  try {
    const body = (model, prompt) => JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.7, num_predict: 350 },
    });

    const fullPrompt = lines.join('\n');

    // Try the configured model first (90s timeout); fall back to gemma if slow
    let resp;
    try {
      const r = await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body(MODEL, fullPrompt),
        signal: AbortSignal.timeout(90000),
      });
      resp = await r.json();
    } catch {
      console.warn(`  ⚠ ${MODEL} timed out (>90s) — falling back to gemma:latest`);
      const r2 = await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body('gemma:latest', fullPrompt),
        signal: AbortSignal.timeout(120000),
      });
      resp = await r2.json();
    }

    return (resp.response ?? '').trim();
  } catch (e) {
    console.warn(`  ⚠ Ollama: ${e.message}`);
    return 'AI analysis is temporarily unavailable. Check that Ollama is running (ollama serve).';
  }
}

// ── HTML email builder ────────────────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function daysOld(date) { return Math.floor((Date.now() - new Date(date).getTime()) / 86400000); }
function fmt(iso) { return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

const STATE_COLOR = {
  'Active':'#6366f1','In Progress':'#6366f1','Committed':'#6366f1',
  'New':'#64748b','Proposed':'#64748b','Ready':'#64748b','To Do':'#64748b',
  'Resolved':'#22c55e','Closed':'#22c55e','Done':'#22c55e',
  'Blocked':'#ef4444','On Hold':'#f97316',
};

function buildHtml(d, ai) {
  const now = new Date();
  const IST = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const bugs     = d.items.filter(w => w.fields['System.WorkItemType'] === 'Bug');
  const openBugs = bugs.filter(b => !['Resolved','Closed','Done','Removed'].includes(b.fields['System.State']));
  const critBugs = openBugs.filter(b => (b.fields['Microsoft.VSTS.Common.Priority'] ?? 4) <= 2);

  const stateCounts = {};
  d.items.forEach(w => { const s = w.fields['System.State']; stateCounts[s] = (stateCounts[s] ?? 0) + 1; });
  const stateEntries = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]);
  const maxState = Math.max(...stateEntries.map(e => e[1]), 1);

  const spProg = d.sprint?.attributes?.startDate && d.sprint?.attributes?.finishDate ? (() => {
    const s = new Date(d.sprint.attributes.startDate).getTime();
    const e = new Date(d.sprint.attributes.finishDate).getTime();
    const pct = Math.round(Math.min(100, Math.max(0, (now.getTime() - s) / (e - s) * 100)));
    const dLeft = Math.max(0, Math.ceil((e - now.getTime()) / 86400000));
    return { pct, dLeft };
  })() : null;

  const aiHtml = (ai || 'No analysis available.')
    .split('\n')
    .map(l => esc(l).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'))
    .join('<br>\n');

  const CSS = `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#0a0b14;color:#e2e8f0;line-height:1.5}
    .w{max-width:680px;margin:0 auto;background:#0a0b14}
    .hdr{background:linear-gradient(135deg,#1e1b4b 0%,#2d2a7a 50%,#1a3060 100%);padding:28px 30px;border-bottom:2px solid #4f46e5}
    .hdr-row{display:flex;align-items:center;gap:14px}
    .logo{width:46px;height:46px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;box-shadow:0 4px 14px rgba(99,102,241,.4)}
    .hdr-title{font-size:22px;font-weight:800;color:#fff;letter-spacing:-.5px}
    .hdr-sub{font-size:12px;color:#a5b4fc;margin-top:3px}
    .hdr-date{margin-top:14px;font-size:12px;color:#818cf8;background:rgba(99,102,241,.15);display:inline-block;padding:5px 14px;border-radius:100px;border:1px solid rgba(99,102,241,.3)}
    .sec{padding:20px 28px;border-bottom:1px solid #151826}
    .sec-h{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#6366f1;margin-bottom:14px;display:flex;align-items:center;gap:8px}
    .sec-h::before{content:'';width:3px;height:14px;background:linear-gradient(to bottom,#6366f1,#8b5cf6);border-radius:2px;flex-shrink:0}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .kpi{background:#10121e;border:1px solid #232540;border-radius:12px;padding:16px 10px;text-align:center}
    .kpi-n{font-size:28px;font-weight:900;line-height:1}
    .kpi-l{font-size:10px;color:#4b5563;margin-top:5px;text-transform:uppercase;letter-spacing:.6px}
    .kpi-s{font-size:10px;color:#2d3347;margin-top:2px}
    .card{background:#10121e;border:1px solid #232540;border-radius:10px;padding:13px 15px;margin-bottom:6px}
    .row{display:flex;gap:10px;align-items:flex-start}
    .rtitle{font-size:13px;color:#c0cce0;flex:1}
    .rmeta{font-size:11px;color:#374151;margin-top:3px}
    .pb-bg{height:6px;background:#1a1d2e;border-radius:100px;overflow:hidden;margin-top:10px}
    .pb-f{height:100%;background:linear-gradient(to right,#6366f1,#8b5cf6);border-radius:100px}
    .pb-lbl{display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#374151}
    .state-row{display:flex;align-items:center;padding:7px 0;border-bottom:1px solid #151826;gap:10px}
    .state-row:last-child{border-bottom:none}
    .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
    .sn{font-size:13px;color:#9aafc4;flex:1}
    .sc{font-size:13px;font-weight:700;color:#e2e8f0;width:32px;text-align:right}
    .sbar{width:90px;height:4px;background:#1a1d2e;border-radius:100px;overflow:hidden}
    .sbar-f{height:100%;border-radius:100px}
    .badge{font-size:10px;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:5px;flex-shrink:0;letter-spacing:.3px}
    .p1{background:#7f1d1d;color:#fca5a5}.p2{background:#7c2d12;color:#fdba74}.p3{background:#713f12;color:#fde68a}.p4{background:#1a1d2e;color:#4b5563}
    .age-w{background:#7c2d12;color:#fdba74;font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;flex-shrink:0;white-space:nowrap}
    .age-ok{background:#0c2438;color:#60a5fa;font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;flex-shrink:0;white-space:nowrap}
    .ai-box{background:linear-gradient(135deg,#0d1723,#0a1219);border:1px solid #1e3a5f;border-radius:12px;padding:22px}
    .ai-lbl{font-size:10px;font-weight:800;color:#38bdf8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;display:flex;align-items:center;gap:8px}
    .ai-body{font-size:13.5px;line-height:1.75;color:#9cb5cd}
    .repo-tag{background:#10121e;border:1px solid #232540;border-radius:6px;padding:4px 10px;font-size:12px;color:#4b5563;display:inline-block;margin:3px}
    .ftr{padding:18px 28px;text-align:center;border-top:1px solid #151826}
    .ftr p{font-size:11px;color:#1f2937;margin:2px 0}
    .c-v{color:#818cf8}.c-r{color:#f87171}.c-a{color:#fbbf24}.c-s{color:#38bdf8}.c-e{color:#34d399}
  `;

  let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRM Morning Digest</title><style>${CSS}</style></head><body><div class="w">`;

  // Header
  html += `<div class="hdr"><div class="hdr-row"><div class="logo">📊</div><div><div class="hdr-title">PRM Morning Digest</div><div class="hdr-sub">Global HealthX · ${esc(d.project ?? PROJECT)} · Engineering Intelligence</div></div></div><div class="hdr-date">📅 ${esc(IST)}</div></div>`;

  // Sprint card
  html += `<div class="sec"><div class="sec-h">Current Sprint</div>`;
  if (d.sprint) {
    html += `<div class="card"><div style="font-size:15px;font-weight:700;color:#e2e8f0">🏃 ${esc(d.sprint.name)}</div>`;
    html += `<div style="font-size:11px;color:#374151;margin-top:3px">${fmt(d.sprint.attributes?.startDate)} → ${fmt(d.sprint.attributes?.finishDate)}`;
    if (spProg) html += ` &nbsp;·&nbsp; <strong style="color:#a5b4fc">${spProg.dLeft} days remaining</strong>`;
    html += `</div>`;
    if (spProg) {
      html += `<div class="pb-bg"><div class="pb-f" style="width:${spProg.pct}%"></div></div>`;
      html += `<div class="pb-lbl"><span>Sprint progress</span><span>${spProg.pct}% elapsed</span></div>`;
    }
    html += `</div>`;
  } else {
    html += `<p style="color:#374151;font-size:13px;padding:8px 0">No active sprint found — check Azure DevOps team settings.</p>`;
  }
  html += `</div>`;

  // KPI tiles
  html += `<div class="sec"><div class="sec-h">Project At-a-Glance</div><div class="kpi-grid">`;
  html += `<div class="kpi"><div class="kpi-n c-v">${d.items.length}</div><div class="kpi-l">Work Items</div><div class="kpi-s">active</div></div>`;
  html += `<div class="kpi"><div class="kpi-n c-r">${openBugs.length}</div><div class="kpi-l">Open Bugs</div><div class="kpi-s">${critBugs.length} critical/high</div></div>`;
  html += `<div class="kpi"><div class="kpi-n c-a">${d.prs.length}</div><div class="kpi-l">Active PRs</div><div class="kpi-s">awaiting review</div></div>`;
  html += `<div class="kpi"><div class="kpi-n c-s">${d.repos.length}</div><div class="kpi-l">Repos</div><div class="kpi-s">${d.teams.length} teams</div></div>`;
  html += `</div></div>`;

  // Work item state breakdown
  if (stateEntries.length) {
    html += `<div class="sec"><div class="sec-h">Work Item States</div>`;
    stateEntries.forEach(([state, count]) => {
      const col = STATE_COLOR[state] ?? '#818cf8';
      const pct = Math.round((count / maxState) * 100);
      html += `<div class="state-row"><div class="dot" style="background:${col}"></div><div class="sn">${esc(state)}</div><div class="sbar"><div class="sbar-f" style="width:${pct}%;background:${col}"></div></div><div class="sc">${count}</div></div>`;
    });
    html += `</div>`;
  }

  // Open bugs
  if (openBugs.length) {
    const sorted = [...openBugs].sort((a, b) => (a.fields['Microsoft.VSTS.Common.Priority'] ?? 9) - (b.fields['Microsoft.VSTS.Common.Priority'] ?? 9));
    html += `<div class="sec"><div class="sec-h">Open Bugs (${openBugs.length})</div>`;
    sorted.slice(0, 8).forEach(bug => {
      const pri = bug.fields['Microsoft.VSTS.Common.Priority'] ?? 4;
      const cls = pri <= 1 ? 'p1' : pri === 2 ? 'p2' : pri === 3 ? 'p3' : 'p4';
      const who = bug.fields['System.AssignedTo']?.displayName ?? '⚠ Unassigned';
      const age = daysOld(bug.fields['System.CreatedDate']);
      html += `<div class="card row"><span class="badge ${cls}">P${pri}</span><div style="flex:1"><div class="rtitle">${esc(bug.fields['System.Title'])}</div><div class="rmeta">${esc(bug.fields['System.State'])} · ${esc(who)} · ${age}d old</div></div></div>`;
    });
    if (openBugs.length > 8) html += `<p style="font-size:11px;color:#374151;text-align:center;padding-top:8px">+ ${openBugs.length - 8} more open bugs in ADO</p>`;
    html += `</div>`;
  }

  // Active PRs
  if (d.prs.length) {
    const sortedPRs = [...d.prs].sort((a, b) => new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime());
    html += `<div class="sec"><div class="sec-h">Active Pull Requests (${d.prs.length})</div>`;
    sortedPRs.slice(0, 6).forEach(pr => {
      const age = daysOld(pr.creationDate);
      const cls = age >= 5 ? 'age-w' : 'age-ok';
      const creator = pr.createdBy?.displayName ?? 'Unknown';
      const reviewers = (pr.reviewers ?? []).map(r => r.displayName || r.uniqueName || '?').join(', ') || 'No reviewers assigned';
      html += `<div class="card row"><span class="${cls}">${age}d</span><div style="flex:1"><div class="rtitle">${esc(pr.title)}</div><div class="rmeta">${esc(pr.repoName)} · by ${esc(creator)} · ${esc(reviewers)}</div></div></div>`;
    });
    if (d.prs.length > 6) html += `<p style="font-size:11px;color:#374151;text-align:center;padding-top:8px">+ ${d.prs.length - 6} more active PRs</p>`;
    html += `</div>`;
  }

  // AI Analysis
  html += `<div class="sec"><div class="sec-h">AI Analysis · ${esc(MODEL)}</div><div class="ai-box"><div class="ai-lbl">✦ AI-Generated Morning Summary</div><div class="ai-body">${aiHtml}</div></div></div>`;

  // Repositories
  if (d.repos.length) {
    html += `<div class="sec"><div class="sec-h">Repositories (${d.repos.length})</div><div style="display:flex;flex-wrap:wrap;gap:2px">`;
    d.repos.forEach(r => { html += `<span class="repo-tag">📁 ${esc(r.name)}</span>`; });
    html += `</div></div>`;
  }

  // Footer
  html += `<div class="ftr"><p>PRM · Global HealthX Engineering Intelligence</p><p>Automated digest delivered at 7:00 AM IST · ${esc(IST)}</p></div>`;
  html += `</div></body></html>`;
  return html;
}

// ── Send via Microsoft Outlook (osascript) ────────────────────────────────────
function sendEmail(subject, htmlPath) {
  // Embed subject safely — escape any double-quotes
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
    timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
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
