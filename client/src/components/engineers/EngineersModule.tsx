import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import { LoadingCard, ErrorCard } from '../common/Spinner';
import { Modal } from '../common/Modal';
import { SortableTable } from '../common/SortableTable';
import type { EngineerActivity } from '../../types';
import { format, differenceInDays } from 'date-fns';

// ── helpers ──────────────────────────────────────────────────────────────────

function isWeekend(dateStr: string) {
  if (!dateStr) return false;
  const d = new Date(dateStr).getUTCDay(); // UTC day avoids timezone ambiguity with ADO timestamps
  return d === 0 || d === 6;
}

function filesOf(c: { changeCounts?: { Add?: number; Edit?: number; Delete?: number; add?: number; edit?: number; delete?: number } }) {
  // ADO returns both capitalised (Add/Edit/Delete) and lowercase variants depending on API version
  return (c.changeCounts?.Add ?? c.changeCounts?.add ?? 0)
       + (c.changeCounts?.Edit ?? c.changeCounts?.edit ?? 0)
       + (c.changeCounts?.Delete ?? c.changeCounts?.delete ?? 0);
}

function dayLabel(dateStr: string) {
  if (!dateStr) return '?';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(dateStr).getUTCDay()];
}

function enrichEngineer(e: EngineerActivity) {
  const wkCommits = e.commits.filter(c => isWeekend(c.author.date));
  const allFiles  = e.commits.reduce((s, c) => s + filesOf(c), 0);
  const wkFiles   = wkCommits.reduce((s, c) => s + filesOf(c), 0);
  const satCommits = wkCommits.filter(c => new Date(c.author.date).getDay() === 6).length;
  const sunCommits = wkCommits.filter(c => new Date(c.author.date).getDay() === 0).length;
  const wkDates   = [...new Set(wkCommits.map(c => format(new Date(c.author.date), 'MMM d, yyyy')))];
  const lastWkCommit = wkCommits.length
    ? wkCommits.reduce((a, b) => a.author.date > b.author.date ? a : b).author.date
    : null;
  return { ...e, wkCommits, allFiles, wkFiles, satCommits, sunCommits, wkDates, lastWkCommit };
}

type RichEngineer = ReturnType<typeof enrichEngineer>;

// ── main component ────────────────────────────────────────────────────────────

export function EngineersModule() {
  const { filters } = useFilterStore();
  const { data, loading, error } = useApi(
    () => api.getEngineerActivity({ fromDate: filters.fromDate, toDate: filters.toDate, project: filters.project }),
    [filters.fromDate, filters.toDate, filters.project]
  );

  const [selected, setSelected]     = useState<RichEngineer | null>(null);
  const [weekendOnly, setWeekendOnly] = useState(false);

  if (loading) return <LoadingCard label="Loading engineer activity…" />;
  if (error)   return <ErrorCard error={error} />;

  const engineers = (data ?? []).filter(e => e.commits.length > 0).map(enrichEngineer);
  const stale     = engineers.filter(e => !e.lastActivity || differenceInDays(new Date(), new Date(e.lastActivity)) >= 10);

  const weekendWarriors  = [...engineers].filter(e => e.wkCommits.length > 0).sort((a, b) => b.wkCommits.length - a.wkCommits.length);
  const totalWkCommits   = engineers.reduce((s, e) => s + e.wkCommits.length, 0);
  const totalWkFiles     = engineers.reduce((s, e) => s + e.wkFiles, 0);
  const totalSat         = engineers.reduce((s, e) => s + e.satCommits, 0);
  const totalSun         = engineers.reduce((s, e) => s + e.sunCommits, 0);

  const display = weekendOnly
    ? weekendWarriors
    : [...engineers].sort((a, b) => b.commits.length - a.commits.length);

  const barData = display.slice(0, 15).map(e => ({
    name:    e.displayName.split(' ')[0],
    Commits: weekendOnly ? e.wkCommits.length : e.commits.length,
    'Files Changed': weekendOnly ? e.wkFiles : e.allFiles,
    ...(weekendOnly ? {} : { Weekend: e.wkCommits.length }),
  }));

  const summaryTiles = weekendOnly
    ? [
        { label: 'Weekend Warriors',  value: weekendWarriors.length,                                   color: 'text-violet-500' },
        { label: 'Weekend Commits',   value: totalWkCommits,                                            color: 'text-blue-500'   },
        { label: 'Files Changed',     value: totalWkFiles,                                              color: 'text-emerald-500' },
        { label: 'Sat / Sun',         value: `${totalSat} / ${totalSun}`,                              color: 'text-orange-400' },
      ]
    : [
        { label: 'Total Engineers',   value: engineers.length                                                                     },
        { label: 'Total Commits',     value: engineers.reduce((s, e) => s + e.commits.length, 0)                                  },
        { label: 'PRs Opened',        value: engineers.reduce((s, e) => s + e.prsOpened.length, 0)                                },
        { label: 'Inactive (10d+)',   value: stale.length,  color: stale.length ? 'text-orange-400' : 'text-emerald-400'          },
      ];

  return (
    <div className="flex flex-col gap-6">

      {/* Weekend toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setWeekendOnly(v => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
            weekendOnly
              ? 'bg-violet-500/15 border-violet-500/50 text-violet-600 dark:text-violet-400'
              : 'bg-surface-elevated border-surface-border text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <span>🌙</span>
          <span>{weekendOnly ? 'Weekend Only — on' : 'Weekend Only'}</span>
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryTiles.map(s => (
          <div key={s.label} className="card">
            <span className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</span>
            <span className={`text-3xl font-bold ${s.color ?? 'text-gray-900 dark:text-white'}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Weekend Warriors spotlight (visible in all-data mode) */}
      {!weekendOnly && weekendWarriors.length > 0 && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-950/20 p-4">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">
              🌙 Weekend Warriors — {weekendWarriors.length} engineers committed on Sat / Sun
            </span>
            <span className="text-xs text-gray-500">
              {totalWkCommits} commits · {totalWkFiles} files changed · {totalSat} Sat / {totalSun} Sun
            </span>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            {weekendWarriors.map(e => (
              <button
                key={e.uniqueName}
                onClick={() => setSelected(e)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-surface-elevated border border-violet-200 dark:border-violet-900/50 hover:border-violet-400 transition-all"
              >
                <div className="w-7 h-7 rounded-full bg-violet-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {e.displayName[0]}
                </div>
                <div className="text-left min-w-0">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{e.displayName.split(' ')[0]}</div>
                  <div className="text-[10px] text-violet-500">{e.wkCommits.length} wk · {e.wkFiles} files</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bar chart */}
      {barData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-4">
            {weekendOnly ? 'Weekend Commits & Files Changed' : 'Top Contributors'}
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Bar dataKey="Commits" fill={weekendOnly ? '#8b5cf6' : '#3b82f6'} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Files Changed" fill="#10b981" radius={[4, 4, 0, 0]} />
              {!weekendOnly && <Bar dataKey="Weekend" fill="#8b5cf6" radius={[4, 4, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Engineer table */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-4">
          {weekendOnly
            ? `Weekend Warriors — ${display.length} engineer${display.length !== 1 ? 's' : ''}`
            : 'Engineer Activity'}
        </h3>
        <SortableTable
          data={display}
          rowKey={r => r.uniqueName}
          onRowClick={r => setSelected(r)}
          columns={weekendOnly ? [
            { key: 'name', header: 'Name',         sortable: true,  render: r => <span className="font-medium">{r.displayName}</span>,                                                                               sortValue: r => r.displayName },
            { key: 'wkc',  header: 'Wk Commits',   sortable: true,  render: r => <span className="font-bold text-violet-500">{r.wkCommits.length}</span>,                                                            sortValue: r => r.wkCommits.length },
            { key: 'wkf',  header: 'Files Changed', sortable: true, render: r => r.wkFiles,                                                                                                                           sortValue: r => r.wkFiles },
            { key: 'sat',  header: 'Sat',           sortable: true,  render: r => r.satCommits ? <span className="text-violet-500">{r.satCommits}</span> : <span className="text-gray-400">—</span>,                sortValue: r => r.satCommits },
            { key: 'sun',  header: 'Sun',           sortable: true,  render: r => r.sunCommits ? <span className="text-blue-400">{r.sunCommits}</span> : <span className="text-gray-400">—</span>,                  sortValue: r => r.sunCommits },
            { key: 'days', header: 'Days Worked',   sortable: false, render: r => <span className="text-xs text-gray-500">{r.wkDates.slice(0, 3).join(' · ')}{r.wkDates.length > 3 ? ` +${r.wkDates.length - 3}` : ''}</span> },
            { key: 'last', header: 'Last Weekend',  sortable: true,  render: r => r.lastWkCommit ? format(new Date(r.lastWkCommit), 'EEE MMM d') : '—',                                                              sortValue: r => r.lastWkCommit ?? '' },
          ] : [
            { key: 'name',    header: 'Name',         sortable: true,  render: r => <span className="font-medium">{r.displayName}</span>,                                                                             sortValue: r => r.displayName },
            { key: 'commits', header: 'Commits',       sortable: true,  render: r => r.commits.length,                                                                                                                sortValue: r => r.commits.length },
            { key: 'files',   header: 'Files Changed', sortable: true,  render: r => r.allFiles,                                                                                                                      sortValue: r => r.allFiles },
            { key: 'wk',      header: 'Weekend',       sortable: true,  render: r => r.wkCommits.length ? <span className="text-violet-500 font-semibold">{r.wkCommits.length}</span> : <span className="text-gray-400">0</span>, sortValue: r => r.wkCommits.length },
            { key: 'prs',     header: 'PRs',           sortable: true,  render: r => r.prsOpened.length,                                                                                                              sortValue: r => r.prsOpened.length },
            { key: 'reviews', header: 'Reviews',       sortable: true,  render: r => r.prsReviewed.length,                                                                                                            sortValue: r => r.prsReviewed.length },
            { key: 'done',    header: 'Items Done',    sortable: true,  render: r => r.completedItems.length,                                                                                                         sortValue: r => r.completedItems.length },
            { key: 'points',  header: 'Points',        sortable: true,  render: r => r.storyPointsCompleted,                                                                                                          sortValue: r => r.storyPointsCompleted },
            { key: 'stale',   header: 'Stale',         sortable: true,  render: r => r.staleItems.length ? <span className="text-orange-400">{r.staleItems.length}</span> : '0',                                     sortValue: r => r.staleItems.length },
            { key: 'last',    header: 'Last Active',   sortable: true,  render: r => r.lastActivity ? format(new Date(r.lastActivity), 'MMM d') : <span className="text-gray-500">—</span>,                          sortValue: r => r.lastActivity ?? '' },
          ]}
        />
      </div>

      {/* Engineer detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Activity: ${selected?.displayName ?? ''}`} width="max-w-4xl">
        {selected && <EngineerDetail engineer={selected} />}
      </Modal>
    </div>
  );
}

// ── engineer detail ───────────────────────────────────────────────────────────

function EngineerDetail({ engineer: e }: { engineer: RichEngineer }) {
  return (
    <div className="flex flex-col gap-6">

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Commits',        value: e.commits.length },
          { label: 'Files Changed',  value: e.allFiles },
          { label: 'PRs Opened',     value: e.prsOpened.length },
          { label: 'PRs Merged',     value: e.prsMerged.length },
          { label: 'Items Assigned', value: e.assignedItems.length },
          { label: 'Items Done',     value: e.completedItems.length },
          { label: 'Story Points',   value: e.storyPointsCompleted },
          { label: 'Weekend Commits', value: e.wkCommits.length, color: e.wkCommits.length ? 'text-violet-500' : undefined },
        ].map(s => (
          <div key={s.label} className="bg-surface-elevated rounded-lg p-3">
            <div className="text-xs text-gray-400">{s.label}</div>
            <div className={`text-2xl font-bold ${s.color ?? 'text-gray-900 dark:text-white'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Weekend activity */}
      {e.wkCommits.length > 0 && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-950/20 p-4">
          <h4 className="text-sm font-semibold text-violet-600 dark:text-violet-400 mb-3">
            🌙 Weekend Activity — {e.wkCommits.length} commits · {e.wkFiles} files changed
          </h4>
          <div className="flex gap-5 mb-3 text-xs flex-wrap">
            <span className="text-gray-500">Saturdays: <span className="font-bold text-gray-700 dark:text-gray-200">{e.satCommits}</span></span>
            <span className="text-gray-500">Sundays: <span className="font-bold text-gray-700 dark:text-gray-200">{e.sunCommits}</span></span>
            <span className="text-gray-500">Unique dates: <span className="font-bold text-gray-700 dark:text-gray-200">{e.wkDates.length}</span></span>
          </div>
          <ul className="space-y-1.5 max-h-52 overflow-y-auto">
            {e.wkCommits.map(c => (
              <li key={c.commitId} className="text-sm flex gap-2 items-center">
                <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  new Date(c.author.date).getDay() === 6
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                    : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                }`}>
                  {dayLabel(c.author.date)}
                </span>
                <span className="font-mono text-xs text-gray-500 flex-shrink-0">{c.commitId.slice(0, 7)}</span>
                <span className="truncate text-gray-700 dark:text-gray-200">{c.comment.split('\n')[0]}</span>
                <span className="ml-auto text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                  {format(new Date(c.author.date), 'MMM d, HH:mm')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stale items */}
      {e.staleItems.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-orange-400 mb-2">Stale Active Items</h4>
          <ul className="space-y-1">
            {e.staleItems.map(i => (
              <li key={i.id} className="text-sm text-gray-600 dark:text-gray-300 flex gap-2">
                <span className="font-mono text-brand-500">{i.id}</span>
                <span>{i.fields['System.Title']}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent commits */}
      {e.commits.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">Recent Commits</h4>
          <ul className="space-y-1 max-h-44 overflow-y-auto">
            {e.commits.slice(0, 25).map(c => (
              <li key={c.commitId} className="text-sm flex gap-2 items-center">
                <span className={`flex-shrink-0 text-[10px] font-bold ${isWeekend(c.author.date) ? 'text-violet-500' : 'text-gray-400'}`}>
                  {dayLabel(c.author.date)}
                </span>
                <span className="font-mono text-xs text-gray-500 flex-shrink-0">{c.commitId.slice(0, 7)}</span>
                <span className="truncate text-gray-600 dark:text-gray-300">{c.comment.split('\n')[0]}</span>
                <span className="text-gray-400 ml-auto text-xs whitespace-nowrap flex-shrink-0">{c.repoName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
