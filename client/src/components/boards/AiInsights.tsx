import { useApi } from '../../hooks/useApi';
import { api } from '../../api/client';
import { RadialBarChart, RadialBar, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface AiInsight {
  healthScore: number;
  healthLabel: 'On Track' | 'At Risk' | 'Critical';
  velocityPoints: number[];
  predictedCompletion: number;
  alerts: { severity: 'critical' | 'warning' | 'info'; title: string; detail: string }[];
  summary: string;
  generatedAt: string;
  // enriched
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

const SEVERITY_STYLE = {
  critical: { bar: 'bg-red-500',    border: 'border-red-500/30 bg-red-500/8',    icon: '🔴', text: 'text-red-400' },
  warning:  { bar: 'bg-yellow-500', border: 'border-yellow-500/30 bg-yellow-500/8', icon: '🟡', text: 'text-yellow-400' },
  info:     { bar: 'bg-blue-500',   border: 'border-blue-500/30 bg-blue-500/8',  icon: '🔵', text: 'text-blue-400' },
};

const HEALTH_COLOR: Record<string, string> = {
  'On Track': '#10b981',
  'At Risk':  '#f59e0b',
  'Critical': '#ef4444',
};

interface Props { project: string; team: string; iterationPath: string; }

// ── Compact always-visible strip ──────────────────────────────────────────────

export function AiInsightsStrip({ project, team, iterationPath, onExpand }: Props & { onExpand: () => void }) {
  const { data, loading } = useApi(
    () => api.getAiInsights(project, team, iterationPath || undefined),
    [project, team, iterationPath]
  );

  if (loading) {
    return (
      <div className="card py-3 px-4 flex items-center gap-3 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-surface-elevated flex-shrink-0" />
        <div className="h-3 bg-surface-elevated rounded w-2/3" />
      </div>
    );
  }

  if (!data) return null;
  const d = data as AiInsight;
  const color = HEALTH_COLOR[d.healthLabel];
  const criticals = d.alerts.filter((a) => a.severity === 'critical').length;
  const warnings  = d.alerts.filter((a) => a.severity === 'warning').length;

  return (
    <div className="card py-2.5 px-4 flex items-center gap-4 flex-wrap">
      {/* Health badge */}
      <div className="flex-shrink-0 flex flex-col items-center w-11">
        <span className="text-xl font-bold leading-none" style={{ color }}>{d.healthScore}</span>
        <span className="text-[9px] uppercase tracking-wider" style={{ color }}>{d.healthLabel}</span>
      </div>

      <div className="w-px h-7 bg-surface-border flex-shrink-0" />

      {/* Sprint timing */}
      {d.sprintDaysLeft !== null && (
        <>
          <div className="flex-shrink-0 flex flex-col items-center">
            <span className="text-sm font-bold text-white leading-none">{d.sprintDaysLeft}d</span>
            <span className="text-[9px] text-gray-600 uppercase tracking-wide">left</span>
          </div>
          <div className="w-16 h-1.5 bg-surface rounded-full flex-shrink-0 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${d.sprintElapsedPct ?? 0}%` }} />
          </div>
          <div className="w-px h-7 bg-surface-border flex-shrink-0" />
        </>
      )}

      {/* Quick stats */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <Stat label="Done" value={`${d.completionRate}%`} color="text-emerald-400" />
        {d.staleCount > 0    && <Stat label="Stale"      value={d.staleCount}      color="text-yellow-400" />}
        {d.bugCount > 0      && <Stat label="Bugs"       value={d.bugCount}        color="text-orange-400" />}
        {d.unassignedCount > 0 && <Stat label="Unassigned" value={d.unassignedCount} color="text-gray-400" />}
      </div>

      <div className="w-px h-7 bg-surface-border flex-shrink-0" />

      {/* AI summary */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-base">🤖</span>
      </div>
      <p className="text-xs text-gray-400 flex-1 line-clamp-1 leading-relaxed min-w-0">{d.summary}</p>

      {/* Alert badges */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {criticals > 0 && (
          <span className="flex items-center gap-1 text-xs bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
            🔴 {criticals}
          </span>
        )}
        {warnings > 0 && (
          <span className="flex items-center gap-1 text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">
            🟡 {warnings}
          </span>
        )}
        {criticals === 0 && warnings === 0 && (
          <span className="text-xs text-emerald-500">✅ Clear</span>
        )}
      </div>

      <button
        onClick={onExpand}
        className="flex-shrink-0 text-xs text-brand-400 hover:text-white border border-brand-600/40 hover:border-brand-500 px-3 py-1 rounded-lg transition-all"
      >
        Full Report →
      </button>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-sm font-bold leading-none ${color ?? 'text-white'}`}>{value}</span>
      <span className="text-[9px] text-gray-600 uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ── Full AI Insights panel ────────────────────────────────────────────────────

export function AiInsights({ project, team, iterationPath }: Props) {
  const { data, loading, error, refresh } = useApi(
    () => api.getAiInsights(project, team, iterationPath || undefined),
    [project, team, iterationPath]
  );

  if (loading) return (
    <div className="flex flex-col gap-4">
      {[1,2,3].map((n) => <div key={n} className="card h-28 animate-pulse bg-surface-elevated" />)}
    </div>
  );

  if (error) return (
    <div className="card text-yellow-400 text-sm py-3 px-4 border-yellow-700/50 bg-yellow-900/10">
      AI insights unavailable: {error}
    </div>
  );

  if (!data) return null;
  const d = data as AiInsight;
  const healthColor = HEALTH_COLOR[d.healthLabel];

  const velocityData = d.velocityPoints.map((pts, i) => ({ sprint: `S-${d.velocityPoints.length - i}`, Points: pts })).reverse();

  // Team workload sorted by most active
  const teamLoad = [...d.topAssignees].sort((a, b) => b.count - a.count);
  const maxLoad  = teamLoad[0]?.count ?? 1;

  // State bar data (open states only for clarity)
  const stateEntries = Object.entries(d.stateCounts).sort(([, a], [, b]) => b - a);
  const totalItems   = Object.values(d.stateCounts).reduce((s, v) => s + v, 0);

  const STATE_COLOR: Record<string, string> = {
    New: '#4c6ef5', Active: '#4c6ef5', 'In Progress': '#4c6ef5', Committed: '#4c6ef5',
    Resolved: '#10b981', Done: '#10b981', Verified: '#10b981', Completed: '#10b981',
    Closed: '#4b5563',
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Row 1: Health + Sprint progress + AI summary */}
      <div className="grid grid-cols-12 gap-4">

        {/* Health score */}
        <div className="col-span-2 card flex flex-col items-center justify-center py-5 gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Health</span>
          <div className="relative w-28 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="90%"
                startAngle={90} endAngle={-270}
                data={[{ value: d.healthScore, fill: healthColor }]}>
                <RadialBar dataKey="value" cornerRadius={6} background={{ fill: '#1e2130' }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold" style={{ color: healthColor }}>{d.healthScore}</span>
              <span className="text-[10px] text-gray-500">/ 100</span>
            </div>
          </div>
          <span className="text-sm font-semibold" style={{ color: healthColor }}>{d.healthLabel}</span>
        </div>

        {/* Sprint progress + quick stats */}
        <div className="col-span-3 card flex flex-col gap-4 justify-center">
          {d.sprintName && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Sprint</p>
              <p className="text-sm font-semibold text-white leading-tight">{d.sprintName}</p>
            </div>
          )}
          {d.sprintDaysLeft !== null && d.sprintDaysTotal !== null && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{d.sprintElapsedPct}% elapsed</span>
                <span className="font-semibold text-white">{d.sprintDaysLeft}d left</span>
              </div>
              <div className="w-full bg-surface rounded-full h-2">
                <div className="h-2 rounded-full bg-brand-500" style={{ width: `${d.sprintElapsedPct ?? 0}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>Day 1</span><span>Day {d.sprintDaysTotal}</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1 border-t border-surface-border">
            <QuickStat label="Completion" value={`${d.completionRate}%`} color="text-emerald-400" />
            <QuickStat label="Bugs" value={d.bugCount} color={d.bugCount > 0 ? 'text-orange-400' : undefined} />
            <QuickStat label="Stale items" value={d.staleCount} color={d.staleCount > 0 ? 'text-yellow-400' : undefined} />
            <QuickStat label="Unassigned" value={d.unassignedCount} color={d.unassignedCount > 0 ? 'text-gray-400' : undefined} />
            {d.avgVelocity !== null && <QuickStat label="Avg velocity" value={`${d.avgVelocity} pts`} />}
            <QuickStat label="Predicted done" value={`${d.predictedCompletion}%`} color="text-brand-400" />
          </div>
        </div>

        {/* AI summary */}
        <div className="col-span-7 card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <span className="text-sm font-semibold text-gray-300">AI Sprint Analysis</span>
              {d.sprintName && <span className="text-xs text-gray-600">· {d.sprintName}</span>}
            </div>
            <button onClick={refresh} className="btn-ghost text-xs">↺ Refresh</button>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed flex-1">{d.summary}</p>

          {/* Key numbers inline */}
          <div className="flex items-center gap-4 pt-3 border-t border-surface-border">
            <InlineStat label="Items" value={totalItems} />
            <InlineStat label="Done" value={`${d.completionRate}%`} color="text-emerald-400" />
            {d.staleCount > 0    && <InlineStat label="Stale"       value={d.staleCount}        color="text-yellow-400" />}
            {d.bugCount > 0      && <InlineStat label="Bugs"         value={d.bugCount}          color="text-orange-400" />}
            {d.unassignedCount > 0 && <InlineStat label="Unassigned" value={d.unassignedCount}   color="text-gray-400" />}
            <span className="ml-auto text-[10px] text-gray-600">
              Generated {new Date(d.generatedAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: State breakdown + Team workload */}
      <div className="grid grid-cols-2 gap-4">

        {/* State distribution */}
        <div className="card flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Item State Breakdown</h3>
          <div className="flex flex-col gap-2.5">
            {stateEntries.map(([state, count]) => {
              const pct = totalItems > 0 ? Math.max(Math.round((count / totalItems) * 100), 2) : 2;
              return (
                <div key={state} className="flex items-center gap-3">
                  <span className="text-sm text-gray-400 w-28 truncate flex-shrink-0">{state}</span>
                  <div className="flex-1 bg-surface rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: STATE_COLOR[state] ?? '#6b7280' }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-300 w-7 text-right flex-shrink-0">{count}</span>
                  <span className="text-[11px] text-gray-600 w-8 text-right flex-shrink-0">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Team workload */}
        <div className="card flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Team Workload</h3>
          {teamLoad.length === 0
            ? <p className="text-sm text-gray-600">No assigned items.</p>
            : (
              <div className="flex flex-col gap-3">
                {teamLoad.map((m) => {
                  const pct = Math.round((m.count / maxLoad) * 100);
                  const initials = m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                  const isHeavy = m.count === maxLoad && teamLoad.length > 1;
                  return (
                    <div key={m.name} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${isHeavy ? 'bg-red-600' : 'bg-brand-700'}`}>
                        {initials}
                      </div>
                      <span className="text-sm text-gray-400 w-20 truncate flex-shrink-0">
                        {m.name.split(' ')[0]}
                      </span>
                      <div className="flex-1 bg-surface rounded-full h-2">
                        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: isHeavy ? '#ef4444' : '#4c6ef5' }} />
                      </div>
                      <span className="text-[11px] text-gray-500 w-24 text-right flex-shrink-0 whitespace-nowrap">
                        {m.active} active · {m.resolved} done
                      </span>
                      <span className="text-sm font-bold text-gray-300 w-5 text-right flex-shrink-0">{m.count}</span>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>
      </div>

      {/* Row 3: Alerts + Velocity */}
      <div className="grid grid-cols-2 gap-4">

        {/* Smart Alerts */}
        <div className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Smart Alerts</h3>
            <span className="text-xs text-gray-500">{d.alerts.length} active</span>
          </div>
          {d.alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm py-4">
              <span>✅</span> No active alerts — sprint looks healthy
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {d.alerts.map((alert, i) => {
                const s = SEVERITY_STYLE[alert.severity];
                return (
                  <div key={i} className={`rounded-lg border px-3 py-2.5 ${s.border}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-sm flex-shrink-0 mt-0.5">{s.icon}</span>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold ${s.text}`}>{alert.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{alert.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Velocity trend */}
        <div className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Velocity Trend</h3>
            <span className="text-xs text-gray-500">
              Last {velocityData.length} sprints
              {d.avgVelocity !== null && <> · avg <span className="text-brand-400 font-semibold">{d.avgVelocity} pts</span></>}
            </span>
          </div>
          {velocityData.length === 0 ? (
            <p className="text-xs text-gray-500 py-4">Not enough sprint history for velocity trend.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={velocityData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
                  <XAxis dataKey="sprint" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="Points" stroke="#4c6ef5" strokeWidth={2.5}
                    dot={{ fill: '#4c6ef5', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Predicted completion: <span className="text-brand-400 font-medium">{d.predictedCompletion}%</span></span>
                {d.avgVelocity !== null && (
                  <span>Avg: <span className="text-gray-300 font-medium">{d.avgVelocity} pts/sprint</span></span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className={`text-sm font-bold leading-snug ${color ?? 'text-white'}`}>{value}</span>
      <span className="text-[10px] text-gray-600">{label}</span>
    </div>
  );
}

function InlineStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`text-xs font-semibold ${color ?? 'text-gray-300'}`}>{value}</span>
      <span className="text-[10px] text-gray-600">{label}</span>
    </span>
  );
}
