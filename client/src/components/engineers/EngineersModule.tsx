import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import { LoadingCard, ErrorCard } from '../common/Spinner';
import { Modal } from '../common/Modal';
import { SortableTable } from '../common/SortableTable';
import type { EngineerActivity } from '../../types';
import { format, differenceInDays } from 'date-fns';

export function EngineersModule() {
  const { filters } = useFilterStore();
  const { data, loading, error } = useApi(
    () => api.getEngineerActivity({ fromDate: filters.fromDate, toDate: filters.toDate, project: filters.project }),
    [filters.fromDate, filters.toDate, filters.project]
  );

  const [selected, setSelected] = useState<EngineerActivity | null>(null);

  if (loading) return <LoadingCard label="Loading engineer activity…" />;
  if (error) return <ErrorCard error={error} />;

  const engineers = data ?? [];
  const sorted = [...engineers].sort((a, b) => b.commits.length - a.commits.length);

  const barData = sorted.slice(0, 15).map((e) => ({
    name: e.displayName.split(' ')[0],
    Commits: e.commits.length,
    PRs: e.prsOpened.length,
    Points: e.storyPointsCompleted,
    Items: e.completedItems.length,
  }));

  // Stale engineers (no activity in 10+ days)
  const stale = engineers.filter(
    (e) => !e.lastActivity || differenceInDays(new Date(), new Date(e.lastActivity)) >= 10
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Engineers', value: engineers.length },
          { label: 'Total Commits', value: engineers.reduce((s, e) => s + e.commits.length, 0) },
          { label: 'PRs Opened', value: engineers.reduce((s, e) => s + e.prsOpened.length, 0) },
          { label: 'Inactive (10d+)', value: stale.length, color: stale.length ? 'text-orange-400' : 'text-emerald-400' },
        ].map((s) => (
          <div key={s.label} className="card">
            <span className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</span>
            <span className={`text-3xl font-bold ${s.color ?? 'text-white'}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Activity bar */}
      {barData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Top Contributors (Commits)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8 }} />
              <Bar dataKey="Commits" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Items" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Engineer table */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Engineer Activity Table</h3>
        <SortableTable
          data={sorted}
          rowKey={(r) => r.uniqueName}
          onRowClick={(r) => setSelected(r)}
          columns={[
            { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.displayName}</span>, sortValue: (r) => r.displayName },
            { key: 'commits', header: 'Commits', sortable: true, render: (r) => r.commits.length, sortValue: (r) => r.commits.length },
            { key: 'prs', header: 'PRs', sortable: true, render: (r) => r.prsOpened.length, sortValue: (r) => r.prsOpened.length },
            { key: 'reviews', header: 'Reviews', sortable: true, render: (r) => r.prsReviewed.length, sortValue: (r) => r.prsReviewed.length },
            { key: 'done', header: 'Items Done', sortable: true, render: (r) => r.completedItems.length, sortValue: (r) => r.completedItems.length },
            { key: 'points', header: 'Points', sortable: true, render: (r) => r.storyPointsCompleted, sortValue: (r) => r.storyPointsCompleted },
            { key: 'stale', header: 'Stale Items', sortable: true, render: (r) => r.staleItems.length ? <span className="text-orange-400">{r.staleItems.length}</span> : '0', sortValue: (r) => r.staleItems.length },
            { key: 'last', header: 'Last Active', sortable: true, render: (r) => r.lastActivity ? format(new Date(r.lastActivity), 'MMM d') : <span className="text-gray-500">—</span>, sortValue: (r) => r.lastActivity ?? '' },
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

function EngineerDetail({ engineer: e }: { engineer: EngineerActivity }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Commits', value: e.commits.length },
          { label: 'PRs Opened', value: e.prsOpened.length },
          { label: 'PRs Merged', value: e.prsMerged.length },
          { label: 'Items Assigned', value: e.assignedItems.length },
          { label: 'Items Done', value: e.completedItems.length },
          { label: 'Story Points', value: e.storyPointsCompleted },
        ].map((s) => (
          <div key={s.label} className="bg-surface-elevated rounded-lg p-3">
            <div className="text-xs text-gray-400">{s.label}</div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
          </div>
        ))}
      </div>

      {e.staleItems.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-orange-400 mb-2">Stale Active Items</h4>
          <ul className="space-y-1">
            {e.staleItems.map((i) => (
              <li key={i.id} className="text-sm text-gray-300 flex gap-2">
                <span className="font-mono text-brand-500">{i.id}</span>
                <span>{i.fields['System.Title']}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.commits.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Recent Commits</h4>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {e.commits.slice(0, 20).map((c) => (
              <li key={c.commitId} className="text-sm text-gray-300 flex gap-2">
                <span className="font-mono text-xs text-gray-500">{c.commitId.slice(0, 7)}</span>
                <span className="truncate">{c.comment.split('\n')[0]}</span>
                <span className="text-gray-500 ml-auto text-xs whitespace-nowrap">{c.repoName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
