import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, Cell,
} from 'recharts';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import { LoadingCard, ErrorCard } from '../common/Spinner';
import { Modal } from '../common/Modal';
import { SortableTable } from '../common/SortableTable';
import type { WorkItem, SprintStats } from '../../types';
import { format } from 'date-fns';
import { useState, useEffect } from 'react';
import { KanbanBoard } from './KanbanBoard';
import { AiInsights, SprintIntelligenceDashboard } from './AiInsights';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  total:      '#4c6ef5',
  new:        '#8b5cf6',
  inProgress: '#3b82f6',
  inReview:   '#f59e0b',
  resolved:   '#10b981',
  done:       '#14b8a6',
  bugs:       '#ef4444',
  healthy:    '#10b981',
  risk:       '#f59e0b',
  critical:   '#ef4444',
};

const STATE_COLORS: Record<string, string> = {
  New: '#8b5cf6', Reopened: '#a78bfa',
  Active: '#3b82f6', 'In Progress': '#60a5fa', Committed: '#818cf8',
  'Ready for Testing': '#f59e0b', 'In Testing': '#fbbf24', 'Under Review': '#f97316',
  Resolved: '#10b981', Verified: '#34d399', Completed: '#6ee7b7',
  Done: '#14b8a6', Closed: '#4b5563', Discarded: '#374151',
  'Cannot Reproduce': '#6b7280',
};

// Canonical ADO workflow order for tile display
const STATE_ORDER = [
  'New', 'Reopened', 'Active', 'In Progress', 'Committed',
  'Ready for Testing', 'In Testing', 'Under Review',
  'Resolved', 'Verified', 'Completed', 'Done', 'Closed',
  'Discarded', 'Cannot Reproduce',
];

const TILE_STATE_MAP: Record<string, string[]> = {
  new:        ['New', 'Reopened'],
  inProgress: ['Active', 'In Progress', 'Committed'],
  inReview:   ['Ready for Testing', 'In Testing', 'Under Review', 'Review'],
  resolved:   ['Resolved', 'Verified'],
  done:       ['Done', 'Closed', 'Completed', 'Discarded', 'Cannot Reproduce'],
};


// ── Main Component ────────────────────────────────────────────────────────────

export function BoardsModule() {
  const { filters, setFilter } = useFilterStore();
  const [view, setView]             = useState<'dashboard' | 'board' | 'ai'>('dashboard');
  const [modalItems, setModalItems] = useState<WorkItem[] | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [activeTile, setActiveTile] = useState<string | null>(null);

  const { data: sprints, loading: ls, error: es } = useApi(
    () => api.getSprintStats(filters.project, filters.team),
    [filters.project, filters.team],
  );

  useEffect(() => {
    if (!sprints || filters.iterationPath) return;
    const cur = sprints.find(s => s.iteration.attributes.timeFrame === 'current');
    if (cur) setFilter('iterationPath', cur.iteration.path);
  }, [sprints]);

  const { data: items, loading: li, error: ei, refresh: ri } = useApi(
    () => api.getWorkItems({
      iterationPath: filters.iterationPath || undefined,
      assignedTo:    filters.assignedTo    || undefined,
      workItemType:  filters.workItemType   || undefined,
      project:       filters.project,
      team:          filters.team           || undefined,
    }),
    [filters.iterationPath, filters.assignedTo, filters.workItemType, filters.project, filters.team],
    { skip: !sprints },
  );

  if (li && !items) return <LoadingCard label="Loading sprint data…" />;
  if (ei) return <ErrorCard error={`Work items: ${ei}`} />;

  const all   = items ?? [];
  const total = all.length;

  // ── Tile groups (used by pipeline flow bar only) ───────────────────────────
  const tileGroups = {
    new:        all.filter(i => TILE_STATE_MAP.new.includes(i.fields['System.State'])),
    inProgress: all.filter(i => TILE_STATE_MAP.inProgress.includes(i.fields['System.State'])),
    inReview:   all.filter(i => TILE_STATE_MAP.inReview.includes(i.fields['System.State'])),
    resolved:   all.filter(i => TILE_STATE_MAP.resolved.includes(i.fields['System.State'])),
    done:       all.filter(i => TILE_STATE_MAP.done.includes(i.fields['System.State'])),
    bugs:       all.filter(i => i.fields['System.WorkItemType'] === 'Bug'),
  };

  // ── Dynamic per-state tile counts ──────────────────────────────────────────
  const allStateCounts: Record<string, number> = {};
  for (const i of all) {
    const s = i.fields['System.State'];
    allStateCounts[s] = (allStateCounts[s] ?? 0) + 1;
  }
  const uniqueStates = Object.keys(allStateCounts).sort((a, b) => {
    const ai = STATE_ORDER.indexOf(a), bi = STATE_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  // ── Analytics view (tile-filtered) ──────────────────────────────────────────
  const analyticsItems = activeTile === '__bugs__'
    ? all.filter(i => i.fields['System.WorkItemType'] === 'Bug')
    : activeTile && activeTile !== '__total__'
    ? all.filter(i => i.fields['System.State'] === activeTile)
    : all;
  const analyticsTotal  = analyticsItems.length;

  const stateCounts: Record<string, number> = {};
  for (const i of analyticsItems) { const s = i.fields['System.State']; stateCounts[s] = (stateCounts[s] ?? 0) + 1; }
  const stateData = Object.entries(stateCounts).sort(([, a], [, b]) => b - a);

  const typeCounts: Record<string, number> = {};
  for (const i of analyticsItems) { const t = i.fields['System.WorkItemType']; typeCounts[t] = (typeCounts[t] ?? 0) + 1; }
  const typeData = Object.entries(typeCounts).sort(([, a], [, b]) => b - a);

  const memberMap: Record<string, { displayName: string; total: number; active: number; resolved: number; items: WorkItem[] }> = {};
  for (const i of analyticsItems) {
    const a = i.fields['System.AssignedTo']; if (!a) continue;
    const key = a.uniqueName;
    if (!memberMap[key]) memberMap[key] = { displayName: a.displayName, total: 0, active: 0, resolved: 0, items: [] };
    memberMap[key].total++;
    memberMap[key].items.push(i);
    if (['Resolved', 'Closed', 'Done'].includes(i.fields['System.State'])) memberMap[key].resolved++;
    else if (['Active', 'In Progress', 'Committed'].includes(i.fields['System.State'])) memberMap[key].active++;
  }
  const memberLoad = Object.values(memberMap).sort((a, b) => b.total - a.total);
  const maxLoad    = memberLoad[0]?.total ?? 1;

  // ── Sprint context ───────────────────────────────────────────────────────────
  const orderedSprints = [
    ...(sprints ?? []).filter(s => s.iteration.attributes.timeFrame === 'past'),
    ...(sprints ?? []).filter(s => s.iteration.attributes.timeFrame === 'current'),
    ...(sprints ?? []).filter(s => s.iteration.attributes.timeFrame === 'future'),
  ];

  const currentIdx     = orderedSprints.findIndex(s => s.iteration.path === filters.iterationPath);
  const canPrev        = currentIdx > 0;
  const canNext        = currentIdx >= 0 && currentIdx < orderedSprints.length - 1;
  const selectedSprint = filters.iterationPath
    ? (sprints ?? []).find(s => s.iteration.path === filters.iterationPath)
    : (sprints ?? []).find(s => s.iteration.attributes.timeFrame === 'current');

  let timeElapsedPct = 0, completionPct = 0;
  let daysLeft: number | null = null;
  let sprintDateRange = '', sprintTf = '';

  if (selectedSprint) {
    const { startDate, finishDate, timeFrame } = selectedSprint.iteration.attributes;
    sprintTf = timeFrame ?? '';
    if (startDate && finishDate) {
      const startDay = new Date(startDate); startDay.setHours(0, 0, 0, 0);
      const endDay   = new Date(finishDate); endDay.setHours(0, 0, 0, 0);
      const today    = new Date(); today.setHours(0, 0, 0, 0);
      const total_d  = Math.round((endDay.getTime() - startDay.getTime()) / 86400000);
      const elapsed  = Math.min(Math.max(0, Math.round((today.getTime() - startDay.getTime()) / 86400000)), total_d);
      timeElapsedPct = Math.round((elapsed / total_d) * 100);
      daysLeft       = Math.max(0, Math.round((endDay.getTime() - today.getTime()) / 86400000));
      sprintDateRange = `${format(new Date(startDate), 'MMM d')} – ${format(new Date(finishDate), 'MMM d')}`;
    }
    completionPct = selectedSprint.total > 0
      ? Math.round((selectedSprint.completed / selectedSprint.total) * 100)
      : 0;
  }

  const iterData = (sprints ?? []).map((s: SprintStats) => ({
    name: s.iteration.name, path: s.iteration.path,
    Resolved: s.completed, 'In Progress': s.active, 'Not Started': s.notStarted,
    tf: s.iteration.attributes.timeFrame,
  }));

  function openModal(title: string, its: WorkItem[]) { setModalTitle(title); setModalItems(its); }

  // ── Tile defs: Total + one per ADO state + Bugs ──────────────────────────────
  type TileDef = { key: string; label: string; count: number; color: string; items: WorkItem[] };
  const tiles: TileDef[] = [
    { key: '__total__', label: 'Total', count: total, color: C.total, items: all },
    ...uniqueStates.map(state => ({
      key:   state,
      label: state === 'Active' ? 'In Progress' : state,
      count: allStateCounts[state],
      color: STATE_COLORS[state] ?? '#6b7280',
      items: all.filter(i => i.fields['System.State'] === state),
    })),
    ...(tileGroups.bugs.length > 0
      ? [{ key: '__bugs__', label: 'Bugs', count: tileGroups.bugs.length, color: C.bugs, items: tileGroups.bugs }]
      : []),
  ];

  const activeTileData = activeTile ? tiles.find(t => t.key === activeTile) : null;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">

      {/* ── Sprint Command Bar ──────────────────────────────────────────────── */}
      <div className="bg-module-gradient rounded-2xl border border-surface-border overflow-hidden">

        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
          {/* Prev / Next sprint */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => canPrev && setFilter('iterationPath', orderedSprints[currentIdx - 1].iteration.path)}
              disabled={!canPrev || ls}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg text-gray-600 hover:text-white hover:bg-surface-elevated transition-all disabled:opacity-20">‹</button>
            <button onClick={() => canNext && setFilter('iterationPath', orderedSprints[currentIdx + 1].iteration.path)}
              disabled={!canNext || ls}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg text-gray-600 hover:text-white hover:bg-surface-elevated transition-all disabled:opacity-20">›</button>
          </div>

          {/* Sprint identity */}
          <div className="flex-1 min-w-0">
            {ls ? (
              <div className="h-4 w-52 rounded-md bg-surface-elevated animate-pulse" />
            ) : selectedSprint ? (
              <>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-bold text-white leading-none truncate">{selectedSprint.iteration.name}</h2>
                  {sprintTf === 'current' && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-label font-bold px-2 py-0.5 rounded-full"
                      style={{ background: '#10b98118', color: '#10b981', border: '1px solid #10b98135' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE
                    </span>
                  )}
                  {sprintTf === 'future' && (
                    <span className="flex-shrink-0 text-label font-semibold px-2 py-0.5 rounded-full text-gray-500 border border-surface-border">UPCOMING</span>
                  )}
                  {es && <span className="text-label text-amber-500 flex-shrink-0">· sync error</span>}
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  {sprintDateRange}
                  {sprintTf === 'current' && daysLeft !== null && ` · ${daysLeft === 0 ? 'Last day' : `${daysLeft}d left`}`}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600">Select a sprint</p>
            )}
          </div>

          {/* Sprint picker */}
          <select value={filters.iterationPath}
            onChange={e => { setFilter('iterationPath', e.target.value); setActiveTile(null); }}
            className="text-xs text-gray-400 bg-surface-elevated border border-surface-border rounded-lg px-2.5 py-1.5 max-w-[180px] truncate flex-shrink-0">
            <option value="">All Sprints</option>
            {orderedSprints.map(s => (
              <option key={s.iteration.id} value={s.iteration.path}>{s.iteration.name}</option>
            ))}
          </select>

          <button onClick={ri} className="text-gray-600 hover:text-gray-300 text-sm transition-colors flex-shrink-0" title="Refresh">↺</button>

          {/* View switcher */}
          <div className="flex items-center gap-0.5 bg-surface rounded-xl p-1 flex-shrink-0">
            {([
              { key: 'dashboard', icon: '⊞', label: 'Dashboard' },
              { key: 'board',     icon: '⬜', label: 'Board' },
              { key: 'ai',        icon: '🤖', label: 'AI' },
            ] as const).map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: view === v.key ? C.total : 'transparent',
                  color:      view === v.key ? '#fff'  : '#6b7280',
                }}>
                <span>{v.icon}</span>
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dual progress bars */}
        {selectedSprint && (
          <div className="px-6 pb-5 grid grid-cols-2 gap-6 border-t border-surface-border pt-4">
            <div>
              <div className="flex justify-between gap-4 text-label mb-1.5">
                <span className="text-gray-600">Sprint time</span>
                <span className="text-gray-400 font-semibold">{timeElapsedPct}% elapsed{daysLeft !== null && ` · ${daysLeft}d left`}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${timeElapsedPct}%`, background: 'linear-gradient(90deg,#4c6ef5,#818cf8)' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between gap-4 text-label mb-1.5">
                <span className="text-gray-600">Completion</span>
                <span className="text-gray-400 font-semibold">{completionPct}% · {selectedSprint.completed}/{selectedSprint.total} items</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${completionPct}%`, background: 'linear-gradient(90deg,#10b981,#34d399)' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── KPI Tiles ───────────────────────────────────────────────────────── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${tiles.length}, 1fr)` }}>
        {tiles.map(tile => {
          const sel  = tile.key === '__total__' ? !activeTile : activeTile === tile.key;
          const pct  = tile.key !== '__total__' && total > 0 ? Math.round((tile.count / total) * 100) : null;
          return (
            <button key={tile.key}
              onClick={() => setActiveTile(tile.key === '__total__' ? null : (activeTile === tile.key ? null : tile.key))}
              className="relative rounded-xl overflow-hidden flex flex-col items-center justify-center py-4 px-2 gap-1 transition-all"
              style={{
                border:     `2px solid ${sel ? tile.color : 'var(--tile-border)'}`,
                background: sel ? `${tile.color}12` : 'var(--tile-bg)',
                boxShadow:  sel ? `0 0 16px ${tile.color}28, 0 2px 8px rgba(0,0,0,0.08)` : '0 1px 3px rgba(0,0,0,0.06)',
                transform:  sel ? 'translateY(-2px)' : undefined,
              }}>
              <div className="absolute top-0 left-0 right-0 h-[3px]"
                style={{ background: `linear-gradient(90deg,${tile.color},${tile.color}66)`, opacity: sel ? 1 : 0.25 }} />
              <span className="text-xs uppercase tracking-wide font-semibold mt-1.5"
                style={{ color: sel ? tile.color : '#64748b' }}>{tile.label}</span>
              <span className="text-2xl font-bold leading-none tabular-nums"
                style={{ color: sel ? tile.color : '#1e293b' }}>{tile.count}</span>
              {pct !== null && (
                <span className="text-xs font-medium" style={{ color: sel ? tile.color : '#94a3b8' }}>{pct}%</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Pipeline Flow Bar ───────────────────────────────────────────────── */}
      {total > 0 && (
        <PipelineFlowBar groups={tileGroups} total={total}
          onSegmentClick={(label, its) => openModal(label, its)} />
      )}

      {/* ── Board view ──────────────────────────────────────────────────────── */}
      {view === 'board' && (
        <KanbanBoard items={all}
          onCardClick={(title, its) => openModal(title, its)} />
      )}

      {/* ── AI full view ─────────────────────────────────────────────────────── */}
      {view === 'ai' && (
        <AiInsights project={filters.project} team={filters.team} iterationPath={filters.iterationPath} />
      )}

      {/* ── Dashboard view ───────────────────────────────────────────────────── */}
      {view === 'dashboard' && (
        <div className="flex flex-col gap-4">

          {/* Sprint Intelligence: always-visible, loads automatically */}
          <SprintIntelligenceDashboard
            project={filters.project}
            team={filters.team}
            iterationPath={filters.iterationPath}
          />

          {/* Filter indicator when a tile is active */}
          {activeTileData && activeTileData.key !== '__total__' && (
            <div className="flex items-center gap-2 text-xs px-4 py-2 rounded-xl border"
              style={{ borderColor: `${activeTileData.color}35`, background: `${activeTileData.color}0c` }}>
              <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ background: activeTileData.color }} />
              <span className="text-gray-500">Analytics scoped to</span>
              <span className="font-bold" style={{ color: activeTileData.color }}>{activeTileData.label}</span>
              <span className="text-gray-600">— {activeTileData.count} of {total} items</span>
              <button onClick={() => setActiveTile(null)} className="ml-auto text-gray-600 hover:text-white transition-colors">show all ×</button>
            </div>
          )}

          {/* ── 3-column main panel ──────────────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-4">

            {/* LEFT: State breakdown + Work types */}
            <div className="col-span-6 flex flex-col gap-4">
              <div className="rounded-xl border border-surface-border bg-surface-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <Tag>Where are items?</Tag>
                  <span className="text-label text-gray-600">click to drill in</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {stateData.map(([name, value]) => (
                    <DataBar key={name} label={name} value={value} max={analyticsTotal}
                      color={STATE_COLORS[name] ?? C.total}
                      onClick={() => openModal(name, analyticsItems.filter(i => i.fields['System.State'] === name))} />
                  ))}
                  {stateData.length === 0 && (
                    <p className="text-xs text-gray-600 py-4 text-center">No items in this view</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-surface-border bg-surface-card p-5">
                <Tag className="mb-4">Work type mix</Tag>
                <div className="flex flex-col gap-2.5">
                  {typeData.map(([name, value]) => (
                    <DataBar key={name} label={name} value={value} max={analyticsTotal}
                      color={C.total}
                      onClick={() => openModal(`${name}s`, analyticsItems.filter(i => i.fields['System.WorkItemType'] === name))} />
                  ))}
                </div>
              </div>
            </div>

            {/* MIDDLE: Team pulse */}
            <div className="col-span-6">
              <div className="rounded-xl border border-surface-border bg-surface-card p-5 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <Tag>Team pulse</Tag>
                  {memberLoad.length > 0 && (
                    <span className="text-label text-gray-600">{memberLoad.length} members · click for details</span>
                  )}
                </div>

                {memberLoad.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-2">
                    <span className="text-3xl opacity-40">👥</span>
                    <p className="text-xs">No assigned items in this view</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {memberLoad.slice(0, 8).map(m => {
                      const pct      = Math.round((m.total / maxLoad) * 100);
                      const initials = m.displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                      const isHeavy  = pct >= 90 && memberLoad.length > 1;
                      const resPct   = m.total > 0 ? (m.resolved / m.total) : 0;
                      const actPct   = m.total > 0 ? (m.active   / m.total) : 0;
                      return (
                        <button key={m.displayName} onClick={() => openModal(m.displayName, m.items)}
                          className="group flex items-center gap-3 w-full text-left rounded-lg hover:bg-surface-elevated px-2 py-2 -mx-2 transition-all">
                          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-label font-bold text-white"
                            style={{ background: isHeavy ? '#ef444422' : '#4c6ef518', border: `2px solid ${isHeavy ? '#ef4444' : '#4c6ef5'}` }}>
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors truncate">{m.displayName.split(' ')[0]}</span>
                              <span className="text-xs font-bold text-gray-700 ml-2 flex-shrink-0">{m.total}</span>
                            </div>
                            {/* Stacked bar: resolved=green, active=blue, rest=gray */}
                            <div className="h-1.5 rounded-full bg-surface overflow-hidden flex">
                              <div style={{ width: `${resPct * 100}%`, background: '#10b981' }} className="h-full transition-all" />
                              <div style={{ width: `${actPct * 100}%`, background: '#4c6ef5' }} className="h-full transition-all" />
                            </div>
                            <div className="flex justify-between gap-3 mt-1">
                              <span className="text-label text-gray-600 truncate">{m.active} in progress</span>
                              <span className="text-label text-emerald-600 flex-shrink-0">{m.resolved} done</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── Sprint history + Burndown ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            {iterData.length > 0 && (
              <div className="rounded-xl border border-surface-border bg-surface-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <Tag>Sprint history</Tag>
                  {filters.iterationPath && (
                    <button onClick={() => { setFilter('iterationPath', ''); setActiveTile(null); }}
                      className="text-label text-gray-600 hover:text-gray-300 transition-colors">clear ×</button>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={iterData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
                    onClick={e => {
                      if (e?.activePayload?.[0]) {
                        const r = e.activePayload[0].payload as { path: string };
                        setFilter('iterationPath', r.path === filters.iterationPath ? '' : r.path);
                        setActiveTile(null);
                      }
                    }}
                    style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, fontSize: 12, color: 'var(--tooltip-text)' }}
                      labelFormatter={label => {
                        const s = (sprints ?? []).find((sp: SprintStats) => sp.iteration.name === label);
                        return `${label}${s?.iteration.attributes.timeFrame === 'current' ? ' · Active' : ''}`;
                      }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Resolved" stackId="a" fill={C.resolved}>
                      {iterData.map(e => <Cell key={e.path} fill={C.resolved} opacity={filters.iterationPath && e.path !== filters.iterationPath ? 0.18 : 1} />)}
                    </Bar>
                    <Bar dataKey="In Progress" stackId="a" fill={C.total}>
                      {iterData.map(e => <Cell key={e.path} fill={C.total} opacity={filters.iterationPath && e.path !== filters.iterationPath ? 0.18 : 1} />)}
                    </Bar>
                    <Bar dataKey="Not Started" stackId="a" fill="var(--tile-border)" radius={[3, 3, 0, 0]}>
                      {iterData.map(e => <Cell key={e.path} fill="var(--tile-border)" opacity={filters.iterationPath && e.path !== filters.iterationPath ? 0.5 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {selectedSprint && <SprintBurndown sprint={selectedSprint} />}
          </div>
        </div>
      )}

      <Modal open={!!modalItems} onClose={() => setModalItems(null)} title={modalTitle} width="max-w-5xl">
        <WorkItemTable items={modalItems ?? []} />
      </Modal>
    </div>
  );
}

// ── Pipeline Flow Bar ─────────────────────────────────────────────────────────

function PipelineFlowBar({ groups, total, onSegmentClick }: {
  groups: { new: WorkItem[]; inProgress: WorkItem[]; inReview: WorkItem[]; resolved: WorkItem[]; done: WorkItem[] };
  total: number;
  onSegmentClick: (label: string, items: WorkItem[]) => void;
}) {
  const segments = [
    { label: 'New',         items: groups.new,        color: C.new },
    { label: 'In Progress', items: groups.inProgress,  color: C.inProgress },
    ...(groups.inReview.length > 0 ? [{ label: 'In Review', items: groups.inReview, color: C.inReview }] : []),
    { label: 'Resolved',   items: groups.resolved,    color: C.resolved },
    { label: 'Done',       items: groups.done,        color: C.done },
  ].filter(s => s.items.length > 0);

  if (segments.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="bg-stack-bar flex h-11 rounded-xl overflow-hidden border border-surface-border">
        {segments.map((seg, idx) => {
          const w = Math.max((seg.items.length / total) * 100, 5);
          return (
            <button key={seg.label}
              onClick={() => onSegmentClick(seg.label, seg.items)}
              className="flex items-center justify-center gap-1.5 overflow-hidden transition-all hover:brightness-125 group relative"
              style={{ width: `${w}%`, background: `${seg.color}18`, borderRight: idx < segments.length - 1 ? '1px solid var(--tile-border)' : undefined }}
              title={`${seg.label}: ${seg.items.length} items`}>
              <span className="text-sm font-black flex-shrink-0" style={{ color: seg.color }}>{seg.items.length}</span>
              {w >= 14 && (
                <span className="text-label font-semibold uppercase tracking-wide truncate hidden sm:block" style={{ color: `${seg.color}cc` }}>
                  {seg.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* Percentage labels */}
      <div className="flex">
        {segments.map(seg => {
          const w   = Math.max((seg.items.length / total) * 100, 5);
          const pct = Math.round((seg.items.length / total) * 100);
          return (
            <div key={seg.label} style={{ width: `${w}%` }} className="text-center">
              <span className="text-label text-gray-700">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-label font-bold uppercase tracking-widest text-gray-500 ${className ?? ''}`}>
      {children}
    </p>
  );
}


function DataBar({ label, value, max, color, onClick }: {
  label: string; value: number; max: number; color: string; onClick: () => void;
}) {
  const pct = max > 0 ? Math.max(Math.round((value / max) * 100), 2) : 2;
  return (
    <button onClick={onClick} className="group flex items-center gap-3 w-full text-left">
      <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors w-28 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 bg-surface rounded-full h-2">
        <div className="h-2 rounded-full transition-all group-hover:brightness-125" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-7 text-right flex-shrink-0">{value}</span>
    </button>
  );
}

// ── Sprint burndown ───────────────────────────────────────────────────────────

function SprintBurndown({ sprint }: { sprint: SprintStats }) {
  const pct         = sprint.total ? Math.round((sprint.completed / sprint.total) * 100) : 0;
  const { attributes } = sprint.iteration;
  const burnData: { day: string; Ideal: number; Actual: number }[] = [];
  const start = attributes.startDate  ? new Date(attributes.startDate)  : null;
  const end   = attributes.finishDate ? new Date(attributes.finishDate) : null;

  if (start && end) {
    const totalDays   = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    const elapsedDays = Math.min(Math.ceil((Date.now() - start.getTime()) / 86400000), totalDays);
    for (let d = 0; d <= totalDays; d++) {
      const day    = format(new Date(start.getTime() + d * 86400000), 'MMM d');
      const ideal  = Math.round(sprint.total - (sprint.total / totalDays) * d);
      const actual = d <= elapsedDays
        ? Math.round(sprint.total - (sprint.completed / Math.max(elapsedDays, 1)) * d)
        : undefined as unknown as number;
      burnData.push({ day, Ideal: ideal, Actual: actual });
    }
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <Tag>Burndown</Tag>
        <span className="text-2xl font-bold text-gray-900 tabular-nums">
          {pct}<span className="text-sm font-normal text-gray-500">%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface mb-3">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#4c6ef5,#818cf8)' }} />
      </div>
      <div className="flex gap-4 text-xs mb-4">
        <span className="text-gray-600">{sprint.total} total</span>
        <span style={{ color: C.resolved }}>{sprint.completed} done</span>
        <span style={{ color: C.total }}>{sprint.active} in progress</span>
        {attributes.startDate && (
          <span className="text-gray-700 ml-auto">
            {format(new Date(attributes.startDate), 'MMM d')}
            {attributes.finishDate && ` – ${format(new Date(attributes.finishDate), 'MMM d')}`}
          </span>
        )}
      </div>
      {burnData.length > 0 && (
        <ResponsiveContainer width="100%" height={165}>
          <LineChart data={burnData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, fontSize: 11, color: 'var(--tooltip-text)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Ideal" stroke="#94a3b8" strokeDasharray="4 3" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="Actual" stroke={C.total} strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Work item table ───────────────────────────────────────────────────────────

function WorkItemTable({ items }: { items: WorkItem[] }) {
  return (
    <SortableTable data={items} rowKey={r => r.id} emptyMessage="No items"
      columns={[
        { key: 'id',     header: 'ID',           sortable: true, render: r => <span className="font-mono text-brand-500">{r.id}</span>,                       sortValue: r => r.id },
        { key: 'title',  header: 'Title',         sortable: true, render: r => r.fields['System.Title'],                                                       sortValue: r => r.fields['System.Title'] },
        { key: 'type',   header: 'Type',          sortable: true, render: r => r.fields['System.WorkItemType'],                                                sortValue: r => r.fields['System.WorkItemType'] },
        { key: 'state',  header: 'State',         sortable: true, render: r => (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: STATE_COLORS[r.fields['System.State']] ?? '#6b7280' }} />
            {r.fields['System.State']}
          </span>
        ), sortValue: r => r.fields['System.State'] },
        { key: 'who',    header: 'Assignee',      sortable: true, render: r => r.fields['System.AssignedTo']?.displayName ?? '—',                             sortValue: r => r.fields['System.AssignedTo']?.displayName ?? '' },
        { key: 'sprint', header: 'Sprint',        sortable: true, render: r => r.fields['System.IterationPath']?.split('\\').pop() ?? '—',                    sortValue: r => r.fields['System.IterationPath'] ?? '' },
        { key: 'when',   header: 'Last Updated',  sortable: true, render: r => format(new Date(r.fields['System.ChangedDate']), 'MMM d, yyyy'),               sortValue: r => r.fields['System.ChangedDate'] },
      ]}
    />
  );
}
