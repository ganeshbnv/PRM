import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import { LoadingCard, ErrorCard } from '../common/Spinner';
import type { Risk, RiskSeverity } from '../../types';

const SEV_ORDER: RiskSeverity[] = ['critical', 'high', 'medium', 'low'];

const SEV_CLASS: Record<RiskSeverity, string> = {
  critical: 'badge-critical',
  high: 'badge-high',
  medium: 'badge-medium',
  low: 'badge-low',
};

const CATEGORY_ICONS: Record<string, string> = {
  board: '📋',
  bug: '🐛',
  pr: '🔀',
  wiki: '📄',
  engineer: '👤',
  pipeline: '⚙️',
};

export function RisksModule() {
  const { filters } = useFilterStore();
  const { data, loading, error, refresh } = useApi(() => {
    if (!filters.project) return Promise.resolve(null);
    return api.getRisks(filters.project);
  }, [filters.project]);
  const [filter, setFilter] = useState<RiskSeverity | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  if (loading) return <LoadingCard label="Scanning for risks…" />;
  if (error) return <ErrorCard error={error} />;

  const risks = data ?? [];
  const visible = risks.filter(
    (r) =>
      (filter === 'all' || r.severity === filter) &&
      (categoryFilter === 'all' || r.category === categoryFilter)
  );

  const bySev = SEV_ORDER.map((s) => ({
    name: s,
    count: risks.filter((r) => r.severity === s).length,
  }));

  const byCategory = Object.entries(
    risks.reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([name, count]) => ({ name, count }));

  const categories = Array.from(new Set(risks.map((r) => r.category)));

  return (
    <div className="flex flex-col gap-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {SEV_ORDER.map((s) => {
          const count = risks.filter((r) => r.severity === s).length;
          const colorMap: Record<RiskSeverity, string> = {
            critical: 'text-red-400',
            high: 'text-orange-400',
            medium: 'text-yellow-400',
            low: 'text-blue-400',
          };
          return (
            <div
              key={s}
              className="card cursor-pointer hover:bg-surface-elevated transition-colors"
              onClick={() => setFilter(filter === s ? 'all' : s)}
            >
              <span className="text-xs text-gray-400 uppercase">{s}</span>
              <span className={`text-3xl font-bold ${colorMap[s]}`}>{count}</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By severity bar */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Risks by Severity</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={bySev}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}
                fill="#ef4444"
                onClick={(d) => setFilter(d.name as RiskSeverity)}
                style={{ cursor: 'pointer' }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By category bar */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Risks by Category</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byCategory} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={60} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8 }} />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]}
                onClick={(d) => setCategoryFilter(categoryFilter === d.name ? 'all' : d.name)}
                style={{ cursor: 'pointer' }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400">Severity:</span>
        {(['all', ...SEV_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`btn text-xs ${filter === s ? 'bg-brand-600 text-white' : 'btn-ghost'}`}
          >
            {s}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-4">Category:</span>
        <button onClick={() => setCategoryFilter('all')} className={`btn text-xs ${categoryFilter === 'all' ? 'bg-brand-600 text-white' : 'btn-ghost'}`}>all</button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`btn text-xs ${categoryFilter === c ? 'bg-brand-600 text-white' : 'btn-ghost'}`}
          >
            {CATEGORY_ICONS[c]} {c}
          </button>
        ))}
        <button onClick={refresh} className="btn-ghost text-xs ml-auto">↺ Re-scan</button>
      </div>

      {/* Risk list */}
      <div className="flex flex-col gap-2">
        {visible.length === 0 && (
          <div className="card text-center text-gray-500 py-12">
            {risks.length === 0 ? '✅ No risks detected' : 'No risks match the current filter'}
          </div>
        )}
        {visible.map((risk) => (
          <RiskRow key={risk.id} risk={risk} />
        ))}
      </div>
    </div>
  );
}

function RiskRow({ risk }: { risk: Risk }) {
  return (
    <div className={`card flex gap-4 items-start ${risk.severity === 'critical' ? 'border-red-700/60 bg-red-900/10' : risk.severity === 'high' ? 'border-orange-700/50 bg-orange-900/10' : ''}`}>
      <span className="text-xl mt-0.5">{CATEGORY_ICONS[risk.category]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={SEV_CLASS[risk.severity]}>{risk.severity}</span>
          <span className="text-sm font-medium text-white">{risk.title}</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">{risk.description}</p>
      </div>
      {risk.artifactId && (
        <span className="font-mono text-xs text-brand-500 whitespace-nowrap">
          {risk.artifactType} #{risk.artifactId}
        </span>
      )}
    </div>
  );
}
