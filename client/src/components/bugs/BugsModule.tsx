import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import { LoadingCard, ErrorCard } from '../common/Spinner';
import { StatCard } from '../common/StatCard';
import { Modal } from '../common/Modal';
import { SortableTable } from '../common/SortableTable';
import type { WorkItem } from '../../types';
import { differenceInDays } from 'date-fns';

const PRIORITY_COLORS: Record<number, string> = { 1: '#ef4444', 2: '#f97316', 3: '#eab308', 4: '#6b7280' };
const SEV_COLORS: Record<string, string> = { '1 - Critical': '#ef4444', '2 - High': '#f97316', '3 - Medium': '#eab308', '4 - Low': '#6b7280' };

export function BugsModule() {
  const { filters } = useFilterStore();

  // null = not yet initialized (will auto-select active sprint once sprints load)
  // ''   = user explicitly chose "All Sprints"
  // path = user chose a specific sprint
  const [sprintPath, setSprintPath] = useState<string | null>(null);

  const { data: sprints, loading: ls } = useApi(
    () => api.getSprintStats(filters.project, filters.team),
    [filters.project, filters.team],
  );

  useEffect(() => {
    if (!sprints || sprintPath !== null) return;
    const cur = sprints.find(s => s.iteration.attributes.timeFrame === 'current');
    setSprintPath(cur ? cur.iteration.path : '');
  }, [sprints]);

  const orderedSprints = [
    ...(sprints ?? []).filter(s => s.iteration.attributes.timeFrame === 'past'),
    ...(sprints ?? []).filter(s => s.iteration.attributes.timeFrame === 'current'),
    ...(sprints ?? []).filter(s => s.iteration.attributes.timeFrame === 'future'),
  ];
  const activePath = sprintPath ?? '';
  const currentIdx = orderedSprints.findIndex(s => s.iteration.path === activePath);
  const canPrev = currentIdx > 0;
  const canNext = currentIdx >= 0 && currentIdx < orderedSprints.length - 1;
  const selectedSprint = activePath
    ? (sprints ?? []).find(s => s.iteration.path === activePath)
    : undefined;
  const sprintTf = selectedSprint?.iteration.attributes.timeFrame ?? '';

  const { data: items, loading, error } = useApi(
    () => api.getWorkItems({
      workItemType:  'Bug',
      iterationPath: activePath || undefined,
      assignedTo:    filters.assignedTo || undefined,
      areaPath:      filters.areaPath   || undefined,
      project:       filters.project,
      // omit team when "All Sprints" so the backend skips area-path scoping,
      // allowing backlog bugs (no sprint assigned) to be included
      team:          activePath ? (filters.team || undefined) : undefined,
    }),
    [activePath, filters.assignedTo, filters.areaPath, filters.project, filters.team],
    { skip: !sprints },
  );

  const [modalBugs, setModalBugs] = useState<WorkItem[] | null>(null);
  const [modalTitle, setModalTitle] = useState('');

  if (loading && !items) return <LoadingCard label="Loading bugs…" />;
  if (error) return <ErrorCard error={error} />;

  const bugs = items ?? [];
  const open = bugs.filter((b) => !['Resolved', 'Closed', 'Done'].includes(b.fields['System.State']));
  const closed = bugs.filter((b) => ['Resolved', 'Closed', 'Done'].includes(b.fields['System.State']));
  const unassigned = open.filter((b) => !b.fields['System.AssignedTo']);
  const critHighOpen = open.filter((b) => (b.fields['Microsoft.VSTS.Common.Priority'] ?? 4) <= 2);

  // Priority distribution
  const priCounts: Record<string, number> = {};
  for (const b of open) {
    const p = `P${b.fields['Microsoft.VSTS.Common.Priority'] ?? '?'}`;
    priCounts[p] = (priCounts[p] ?? 0) + 1;
  }
  const priData = Object.entries(priCounts).map(([name, value]) => ({ name, value }));

  // Severity distribution
  const sevCounts: Record<string, number> = {};
  for (const b of open) {
    const s = b.fields['Microsoft.VSTS.Common.Severity'] ?? 'Unknown';
    sevCounts[s as string] = (sevCounts[s as string] ?? 0) + 1;
  }
  const sevData = Object.entries(sevCounts).map(([name, value]) => ({ name, value }));

  // Assignee bar
  const assigneeCounts: Record<string, number> = {};
  for (const b of open) {
    const a = b.fields['System.AssignedTo']?.displayName ?? 'Unassigned';
    assigneeCounts[a] = (assigneeCounts[a] ?? 0) + 1;
  }
  const assigneeData = Object.entries(assigneeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, Bugs: count }));

  // Aging buckets
  const agingBuckets = [
    { label: '0–7d', min: 0, max: 7 },
    { label: '8–14d', min: 8, max: 14 },
    { label: '15–30d', min: 15, max: 30 },
    { label: '31–60d', min: 31, max: 60 },
    { label: '60d+', min: 61, max: Infinity },
  ];
  const agingData = agingBuckets.map((b) => ({
    name: b.label,
    Bugs: open.filter((bug) => {
      const age = differenceInDays(new Date(), new Date(bug.fields['System.CreatedDate']));
      return age >= b.min && age <= b.max;
    }).length,
  }));

  function openModal(title: string, its: WorkItem[]) {
    setModalTitle(title);
    setModalBugs(its);
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Sprint picker ─────────────────────────────────────────────────────── */}
      <div className="bg-module-gradient rounded-2xl border border-surface-border overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4">

          {/* Prev / Next */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() => canPrev && setSprintPath(orderedSprints[currentIdx - 1].iteration.path)}
              disabled={!canPrev || ls}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg text-gray-600 hover:text-gray-900 dark:hover:text-white hover:bg-surface-elevated transition-all disabled:opacity-20">‹</button>
            <button
              onClick={() => canNext && setSprintPath(orderedSprints[currentIdx + 1].iteration.path)}
              disabled={!canNext || ls}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg text-gray-600 hover:text-gray-900 dark:hover:text-white hover:bg-surface-elevated transition-all disabled:opacity-20">›</button>
          </div>

          {/* Sprint name + badge */}
          <div className="flex-1 min-w-0">
            {ls ? (
              <div className="h-4 w-48 rounded-md bg-surface-elevated animate-pulse" />
            ) : selectedSprint ? (
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{selectedSprint.iteration.name}</span>
                {sprintTf === 'current' && (
                  <span className="flex-shrink-0 flex items-center gap-1 text-label font-bold px-2 py-0.5 rounded-full"
                    style={{ background: '#10b98118', color: '#10b981', border: '1px solid #10b98135' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE
                  </span>
                )}
                {sprintTf === 'future' && (
                  <span className="flex-shrink-0 text-label font-semibold px-2 py-0.5 rounded-full text-gray-500 border border-surface-border">UPCOMING</span>
                )}
              </div>
            ) : (
              <span className="text-sm font-bold text-gray-900 dark:text-white">All Sprints</span>
            )}
          </div>

          {/* Sprint dropdown */}
          <select
            value={activePath}
            onChange={e => setSprintPath(e.target.value)}
            className="text-xs text-gray-400 bg-surface-elevated border border-surface-border rounded-lg px-2.5 py-1.5 max-w-[200px] truncate flex-shrink-0">
            <option value="">All Sprints</option>
            {orderedSprints.map(s => (
              <option key={s.iteration.id} value={s.iteration.path}>{s.iteration.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Open Bugs"     value={open.length}       color="text-red-400"     stripe="bg-red-400"     onClick={() => openModal('Open Bugs', open)} />
        <StatCard label="Closed Bugs"   value={closed.length}     color="text-emerald-400" stripe="bg-emerald-400" onClick={() => openModal('Closed Bugs', closed)} />
        <StatCard label="Unassigned"    value={unassigned.length} color="text-orange-400"  stripe="bg-orange-400"  onClick={() => openModal('Unassigned Open Bugs', unassigned)} />
        <StatCard label="Crit/High Open" value={critHighOpen.length} color="text-red-400"  stripe="bg-red-400"     onClick={() => openModal('Critical & High Priority Bugs', critHighOpen)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Priority pie */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-red-400 inline-block flex-shrink-0" />Open Bugs by Priority</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={priData} dataKey="value" cx="50%" cy="50%" outerRadius={85}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                onClick={(e) => openModal(`Priority ${e.name}`, open.filter((b) => `P${b.fields['Microsoft.VSTS.Common.Priority'] ?? '?'}` === e.name))}
                style={{ cursor: 'pointer' }}
              >
                {priData.map((entry) => {
                  const num = parseInt(entry.name.replace('P', ''));
                  return <Cell key={entry.name} fill={PRIORITY_COLORS[num] ?? '#6b7280'} />;
                })}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, color: 'var(--tooltip-text)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Severity pie */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-red-400 inline-block flex-shrink-0" />Open Bugs by Severity</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={sevData} dataKey="value" cx="50%" cy="50%" outerRadius={85}
                label={({ name, percent }) => `${name.split(' - ')[0]} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                onClick={(e) => openModal(`Severity: ${e.name}`, open.filter((b) => (b.fields['Microsoft.VSTS.Common.Severity'] ?? 'Unknown') === e.name))}
                style={{ cursor: 'pointer' }}
              >
                {sevData.map((entry, i) => (
                  <Cell key={entry.name} fill={SEV_COLORS[entry.name] ?? `hsl(${i * 60}, 60%, 55%)`} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, color: 'var(--tooltip-text)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Assignee bar */}
      {assigneeData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-red-400 inline-block flex-shrink-0" />Open Bugs by Assignee (top 10)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={assigneeData} layout="vertical" margin={{ left: 70, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--tile-muted)', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--tile-muted)', fontSize: 11 }} width={100} />
              <Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, color: 'var(--tooltip-text)' }} />
              <Bar dataKey="Bugs" fill="#ef4444" radius={[0, 4, 4, 0]}
                onClick={(d) => openModal(`Bugs assigned to ${d.name}`, open.filter((b) => (b.fields['System.AssignedTo']?.displayName ?? 'Unassigned') === d.name))}
                style={{ cursor: 'pointer' }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Aging bar */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Bug Aging (Open Bugs)</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={agingData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="name" tick={{ fill: 'var(--tile-muted)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--tile-muted)', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8 }} />
            <Bar dataKey="Bugs" fill="#f97316" radius={[4, 4, 0, 0]}
              onClick={(d) => {
                const bucket = agingBuckets.find((b) => b.label === d.name)!;
                openModal(`Bugs aged ${d.name}`, open.filter((b) => {
                  const age = differenceInDays(new Date(), new Date(b.fields['System.CreatedDate']));
                  return age >= bucket.min && age <= bucket.max;
                }));
              }}
              style={{ cursor: 'pointer' }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Modal */}
      <Modal open={!!modalBugs} onClose={() => setModalBugs(null)} title={modalTitle} width="max-w-5xl">
        <BugTable bugs={modalBugs ?? []} />
      </Modal>
    </div>
  );
}

function adoWebUrl(item: WorkItem): string | undefined {
  return item.url?.replace('/_apis/wit/workitems/', '/_workitems/edit/');
}

function BugTable({ bugs }: { bugs: WorkItem[] }) {
  return (
    <SortableTable
      data={bugs}
      rowKey={(r) => r.id}
      emptyMessage="No bugs"
      onRowClick={(r) => {
        const url = adoWebUrl(r);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      }}
      columns={[
        {
          key: 'id', header: 'ID', sortable: true, sortValue: (r) => r.id,
          render: (r) => (
            <span className="font-mono text-blue-400 underline underline-offset-2 decoration-blue-400/40">
              #{r.id}
            </span>
          ),
        },
        {
          key: 'title', header: 'Title', sortable: true, sortValue: (r) => r.fields['System.Title'],
          render: (r) => (
            <span className="text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors">{r.fields['System.Title']}</span>
          ),
        },
        { key: 'state', header: 'State', sortable: true, render: (r) => r.fields['System.State'], sortValue: (r) => r.fields['System.State'] },
        {
          key: 'pri', header: 'Priority', sortable: true, sortValue: (r) => r.fields['Microsoft.VSTS.Common.Priority'] ?? 9,
          render: (r) => { const p = r.fields['Microsoft.VSTS.Common.Priority']; return p ? <span style={{ color: PRIORITY_COLORS[p] }}>P{p}</span> : '—'; },
        },
        {
          key: 'assignee', header: 'Assignee', sortable: true, sortValue: (r) => r.fields['System.AssignedTo']?.displayName ?? '',
          render: (r) => r.fields['System.AssignedTo']?.displayName ?? <span className="text-orange-400">Unassigned</span>,
        },
        {
          key: 'age', header: 'Age', sortable: true, sortValue: (r) => differenceInDays(new Date(), new Date(r.fields['System.CreatedDate'])),
          render: (r) => `${differenceInDays(new Date(), new Date(r.fields['System.CreatedDate']))}d`,
        },
        { key: 'area', header: 'Area', sortable: true, render: (r) => r.fields['System.AreaPath'], sortValue: (r) => r.fields['System.AreaPath'] },
      ]}
    />
  );
}
