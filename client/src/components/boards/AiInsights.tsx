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

// ── Sprint Intelligence Dashboard (always-visible, no-click required) ──────────

export function SprintIntelligenceDashboard({ project, team, iterationPath }: Props) {
  const { data, loading, refresh } = useApi(
    () => api.getAiInsights(project, team, iterationPath || undefined),
    [project, team, iterationPath],
  );

  if (loading) return <IntelligenceSkeleton />;
  if (!data) return null;
  const d = data as AiInsight;
  const healthColor = HEALTH_COLOR[d.healthLabel];

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const totalItems    = Object.values(d.stateCounts).reduce((s, v) => s + v, 0);

  // Testing pipeline
  const readyForTest  = d.stateCounts['Ready for Testing'] ?? 0;
  const inTesting     = d.stateCounts['In Testing']        ?? 0;
  const underReview   = (d.stateCounts['Under Review'] ?? 0) + (d.stateCounts['Review'] ?? 0);
  const totalInPipe   = readyForTest + inTesting + underReview;
  const pipePct       = totalItems > 0 ? Math.round((totalInPipe / totalItems) * 100) : 0;
  const DONE_STATES   = ['Done', 'Closed', 'Resolved', 'Completed', 'Verified', 'Discarded'];
  const doneCount     = DONE_STATES.reduce((s, st) => s + (d.stateCounts[st] ?? 0), 0);
  const completionPct = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : d.completionRate;
  const qaBottleneck  = readyForTest >= 5 || (totalInPipe > 0 && totalInPipe / Math.max(totalItems, 1) > 0.3);

  // Bug density
  const bugDensityPct = totalItems > 0 ? +((d.bugCount / totalItems) * 100).toFixed(1) : 0;
  const storyCount    = Math.max(totalItems - d.bugCount, 1);
  const bugPerStory   = +(d.bugCount / storyCount).toFixed(2);
  const critAlerts    = d.alerts.filter(a => a.severity === 'critical');
  const warnAlerts    = d.alerts.filter(a => a.severity === 'warning');

  // Engineering rate — all current-sprint, consistent units
  const daysElapsed     = d.sprintDaysTotal !== null && d.sprintDaysLeft !== null
    ? Math.max(1, d.sprintDaysTotal - d.sprintDaysLeft) : null;
  const remainingItems  = totalItems - doneCount;
  const throughputPerDay = daysElapsed !== null && doneCount > 0
    ? +(doneCount / daysElapsed).toFixed(1) : 0;
  const neededPerDay    = d.sprintDaysLeft !== null && d.sprintDaysLeft > 0
    ? +(remainingItems / d.sprintDaysLeft).toFixed(1) : null;
  const onTrack         = neededPerDay !== null && throughputPerDay >= neededPerDay;
  const atRisk          = neededPerDay !== null && throughputPerDay > 0 && neededPerDay > throughputPerDay * 1.5;

  // Velocity chart (bottom section, historical context only)
  const velocityData  = [...d.velocityPoints].reverse().map((pts, i) => ({ sprint: `S-${i + 1}`, pts }));
  const velocityDelta = d.velocityPoints.length >= 2
    ? d.velocityPoints[d.velocityPoints.length - 1] - d.velocityPoints[d.velocityPoints.length - 2]
    : null;
  // Sort contributors by items resolved (most productive first)
  const topEngineers  = [...d.topAssignees].sort((a, b) => b.resolved - a.resolved || b.active - a.active).slice(0, 3);

  return (
    <div className="rounded-2xl border border-surface-border overflow-hidden"
      style={{ background: 'linear-gradient(160deg,#0a0c16 0%,#0d1020 60%,#0a0c16 100%)' }}>

      {/* ── Header: meta row + full AI analysis ─────────────────────────────── */}
      <div className="px-6 pt-5 pb-5 border-b border-surface-border flex flex-col gap-3">

        {/* Top bar: label · sprint name · status · timing · alerts · refresh */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm">🧠</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Sprint Intelligence</span>
          </div>

          {d.sprintName && (
            <>
              <span className="text-gray-700 flex-shrink-0">·</span>
              <span className="text-xs text-gray-500 flex-shrink-0">{d.sprintName}</span>
            </>
          )}

          {/* Health label — text badge only, no score */}
          <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${healthColor}18`, color: healthColor, border: `1px solid ${healthColor}35` }}>
            {d.healthLabel}
          </span>

          <div className="flex-1" />

          {/* Alert pills */}
          {critAlerts.length > 0 && (
            <span className="flex-shrink-0 text-[9px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
              🔴 {critAlerts.length} critical
            </span>
          )}
          {warnAlerts.length > 0 && (
            <span className="flex-shrink-0 text-[9px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">
              🟡 {warnAlerts.length} warnings
            </span>
          )}
          {critAlerts.length === 0 && warnAlerts.length === 0 && (
            <span className="flex-shrink-0 text-[9px] text-emerald-500 font-medium">✅ No alerts</span>
          )}

          {/* Sprint timing inline */}
          {d.sprintDaysLeft !== null && d.sprintDaysTotal !== null && (
            <div className="flex-shrink-0 flex items-center gap-2 pl-2 border-l border-surface-border">
              <span className="text-sm font-bold text-white">{d.sprintDaysLeft}d left</span>
              <div className="w-20 bg-surface rounded-full h-1.5">
                <div className="h-1.5 rounded-full"
                  style={{ width: `${d.sprintElapsedPct ?? 0}%`, background: 'linear-gradient(90deg,#4c6ef5,#818cf8)' }} />
              </div>
              <span className="text-[10px] text-gray-600">{d.sprintElapsedPct}%</span>
            </div>
          )}

          <button onClick={refresh}
            className="flex-shrink-0 text-gray-600 hover:text-gray-300 text-sm transition-colors ml-1">↺</button>
        </div>

        {/* AI Analysis — full width, multi-line */}
        <div className="surface-deep rounded-xl px-4 py-4 flex flex-col gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">AI Analysis</span>
          <AiAnalysisSections summary={d.summary} />
        </div>
      </div>

      {/* ── 3 perspectives ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-surface-border">

        {/* ① Engineering Rate */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚙️</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Engineering Rate</span>
          </div>

          {/* Hero: items done + throughput */}
          <div className="flex items-end gap-4">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white leading-none">{doneCount}</span>
                <span className="text-sm text-gray-600">/ {totalItems}</span>
              </div>
              <span className="text-[10px] text-gray-600 uppercase tracking-wide mt-1">items done</span>
            </div>
            {throughputPerDay > 0 && (
              <>
                <div className="w-px h-9 bg-surface-border flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xl font-black text-brand-400 leading-none">{throughputPerDay}</span>
                  <span className="text-[10px] text-gray-600 uppercase tracking-wide mt-1">items / day</span>
                </div>
              </>
            )}
          </div>

          {/* Pace bar: actual vs needed */}
          {neededPerDay !== null && d.sprintDaysLeft !== null && d.sprintDaysLeft > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Pace to finish</span>
                <span className={`text-[10px] font-bold ${onTrack ? 'text-emerald-400' : atRisk ? 'text-red-400' : 'text-yellow-400'}`}>
                  {onTrack ? '✅ On track' : atRisk ? '🔴 At risk' : '⚠️ Needs push'}
                </span>
              </div>
              <div className="relative h-2 bg-surface rounded-full overflow-hidden">
                <div className="h-2 rounded-full transition-all" style={{
                  width: `${Math.min(neededPerDay > 0 ? (throughputPerDay / neededPerDay) * 100 : 100, 100)}%`,
                  background: onTrack ? '#10b981' : atRisk ? '#ef4444' : '#f59e0b',
                }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-600">
                <span>Actual: <span className="text-gray-300 font-medium">{throughputPerDay}/day</span></span>
                <span>Need: <span className="text-gray-300 font-medium">{neededPerDay}/day</span> · {d.sprintDaysLeft}d left</span>
              </div>
            </div>
          )}

          {/* Predicted done + historical avg as footnote */}
          <div className="flex items-center gap-5">
            <PerspectiveStat label="Predicted done" value={`${d.predictedCompletion}%`} color="text-brand-400" />
            {d.avgVelocity !== null && (
              <PerspectiveStat label="Hist. avg velocity" value={`${d.avgVelocity} pts`} color="text-gray-600" />
            )}
          </div>

          {/* Contributors sorted by items resolved */}
          {topEngineers.length > 0 && (
            <div className="pt-3 border-t border-surface-border flex flex-col gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">Contributors this sprint</span>
              {topEngineers.map(eng => {
                const initials = eng.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                const donePct = eng.count > 0 ? Math.round((eng.resolved / eng.count) * 100) : 0;
                return (
                  <div key={eng.name} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-700/60 border border-brand-600/40 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                      {initials}
                    </div>
                    <span className="text-xs text-gray-400 truncate flex-1">{eng.name.split(' ')[0]}</span>
                    <div className="w-12 bg-surface rounded-full h-1 flex-shrink-0">
                      <div className="h-1 rounded-full bg-emerald-500 transition-all" style={{ width: `${donePct}%` }} />
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400 flex-shrink-0">{eng.resolved} ✓</span>
                    <span className="text-[11px] text-gray-600 flex-shrink-0">{eng.active} wip</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ② Testing Pipeline */}
        <div className="px-6 py-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔬</span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Testing Pipeline</span>
            </div>
            {qaBottleneck && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 flex-shrink-0">
                ⚠️ BOTTLENECK
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            {([
              { label: 'Ready for Test', count: readyForTest, color: '#f59e0b' },
              { label: 'In Testing',     count: inTesting,    color: '#10b981' },
              { label: 'Under Review',   count: underReview,  color: '#f97316' },
            ] as const).map(row => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: row.color }} />
                <span className="text-xs text-gray-400 flex-1">{row.label}</span>
                <div className="w-20 bg-surface rounded-full h-1.5 flex-shrink-0">
                  <div className="h-1.5 rounded-full transition-all" style={{
                    width: totalItems > 0 ? `${Math.max(Math.round((row.count / totalItems) * 100), row.count > 0 ? 3 : 0)}%` : '0%',
                    background: row.color,
                  }} />
                </div>
                <span className="text-sm font-bold text-gray-300 w-5 text-right flex-shrink-0">{row.count}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-surface-border">
            <PerspectiveStat label="Total in QA pipe" value={totalInPipe} color={totalInPipe > 0 ? 'text-yellow-400' : undefined} />
            <PerspectiveStat label="Pipeline %" value={`${pipePct}%`} color="text-gray-400" />
            <PerspectiveStat label="Items done" value={`${completionPct}%`} color="text-emerald-400" />
            <PerspectiveStat label="Stale items" value={d.staleCount} color={d.staleCount > 0 ? 'text-yellow-400' : undefined} />
          </div>
          {qaBottleneck && (
            <div className="rounded-lg px-3 py-2 bg-yellow-500/8 border border-yellow-500/20 text-[11px] text-yellow-400 leading-snug">
              ⚠️ QA pipeline congested — {readyForTest} items waiting, {inTesting} actively being tested.
            </div>
          )}
        </div>

        {/* ③ Bug Density */}
        <div className="px-6 py-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🐛</span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Bug Density</span>
            </div>
            {bugDensityPct > 20 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">HIGH</span>
            )}
            {bugDensityPct > 0 && bugDensityPct <= 10 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">HEALTHY</span>
            )}
          </div>
          {/* Big numbers */}
          <div className="flex items-end gap-4">
            <div className="flex flex-col">
              <span className="text-3xl font-black text-white leading-none">{d.bugCount}</span>
              <span className="text-[10px] text-gray-600 uppercase tracking-wide mt-1">total bugs</span>
            </div>
            <div className="flex flex-col mb-0.5">
              <span className={`text-xl font-black leading-none ${bugDensityPct > 20 ? 'text-red-400' : bugDensityPct > 10 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {bugDensityPct}%
              </span>
              <span className="text-[10px] text-gray-600 uppercase tracking-wide mt-1">density</span>
            </div>
          </div>
          {/* Density bar */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-600 mb-1.5">
              <span>Bug density rate</span>
              <span>{bugDensityPct}% of {totalItems} items</span>
            </div>
            <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
              <div className="h-2 rounded-full transition-all" style={{
                width: `${Math.min(bugDensityPct * 2.5, 100)}%`,
                background: bugDensityPct > 20 ? '#ef4444' : bugDensityPct > 10 ? '#f59e0b' : '#10b981',
              }} />
            </div>
            <div className="flex text-[9px] mt-1 gap-1 text-gray-700">
              <span>0%</span>
              <span className="flex-1 text-center text-emerald-800">healthy ≤10%</span>
              <span className="text-yellow-800">⚠️ 20%</span>
              <span className="text-red-800">🔴 40%</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-surface-border">
            <PerspectiveStat label="Bugs per story" value={bugPerStory} color={+bugPerStory > 0.3 ? 'text-red-400' : 'text-emerald-400'} />
            <PerspectiveStat label="Unassigned" value={d.unassignedCount} color={d.unassignedCount > 0 ? 'text-gray-400' : undefined} />
            <PerspectiveStat label="Critical alerts" value={critAlerts.length} color={critAlerts.length > 0 ? 'text-red-400' : undefined} />
            <PerspectiveStat label="Warnings" value={warnAlerts.length} color={warnAlerts.length > 0 ? 'text-yellow-400' : undefined} />
          </div>
        </div>
      </div>

      {/* ── Bottom: Alerts + Velocity ─────────────────────────────────────────── */}
      <div className="grid grid-cols-5 divide-x divide-surface-border border-t border-surface-border">

        {/* All alerts */}
        <div className="col-span-3 px-6 py-5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Active Alerts</span>
            <span className="text-[10px] text-gray-600">{d.alerts.length} total</span>
          </div>
          {d.alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400 py-3">
              <span>✅</span>
              <span className="text-xs">All clear — no active alerts for this sprint</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {d.alerts.map((alert, i) => {
                const s = SEVERITY_STYLE[alert.severity];
                return (
                  <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 border ${s.border}`}>
                    <span className="text-sm flex-shrink-0 mt-0.5">{s.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${s.text}`}>{alert.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{alert.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Velocity trend */}
        <div className="col-span-2 px-6 py-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Velocity Trend</span>
            {d.avgVelocity !== null && (
              <span className="text-[10px] text-brand-400 font-semibold">{d.avgVelocity} pts avg</span>
            )}
          </div>
          {velocityData.length > 1 ? (
            <>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={velocityData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" />
                  <XAxis dataKey="sprint" tick={{ fill: '#6b7280', fontSize: 9 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, fontSize: 11 }} />
                  <Line type="monotone" dataKey="pts" stroke="#4c6ef5" strokeWidth={2.5}
                    dot={{ fill: '#4c6ef5', r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-between text-[10px] text-gray-600">
                <span>Predicted: <span className="text-brand-400 font-semibold">{d.predictedCompletion}%</span></span>
                {velocityDelta !== null && (
                  <span className={velocityDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {velocityDelta >= 0 ? '↑' : '↓'} {Math.abs(velocityDelta)} pts vs prev sprint
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-gray-600 text-center">Not enough sprint history for trend</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PerspectiveStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-sm font-bold leading-none ${color ?? 'text-white'}`}>{value}</span>
      <span className="text-[10px] text-gray-600">{label}</span>
    </div>
  );
}

function IntelligenceSkeleton() {
  return (
    <div className="rounded-2xl border border-surface-border overflow-hidden animate-pulse"
      style={{ background: 'linear-gradient(160deg,#0a0c16 0%,#0d1020 60%,#0a0c16 100%)' }}>
      <div className="flex items-center gap-5 px-6 py-5 border-b border-surface-border">
        <div className="w-[68px] h-[68px] rounded-full bg-surface-elevated flex-shrink-0" />
        <div className="w-28 flex flex-col gap-2 flex-shrink-0">
          <div className="h-2 bg-surface-elevated rounded w-full" />
          <div className="h-3 bg-surface-elevated rounded w-3/4" />
          <div className="h-2 bg-surface-elevated rounded w-1/2" />
        </div>
        <div className="w-px h-12 bg-surface-border flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-2 bg-surface-elevated rounded w-full" />
          <div className="h-2 bg-surface-elevated rounded w-5/6" />
          <div className="h-2 bg-surface-elevated rounded w-3/4" />
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-surface-border">
        {[1, 2, 3].map(n => (
          <div key={n} className="px-6 py-5 space-y-3">
            <div className="h-2 bg-surface-elevated rounded w-1/3" />
            {[1, 2, 3, 4].map(i => <div key={i} className="h-3 bg-surface-elevated rounded" />)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 divide-x divide-surface-border border-t border-surface-border">
        <div className="col-span-3 px-6 py-5 space-y-2">
          {[1, 2, 3].map(n => <div key={n} className="h-10 bg-surface-elevated rounded-lg" />)}
        </div>
        <div className="col-span-2 px-6 py-5">
          <div className="h-28 bg-surface-elevated rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ── AI Analysis section parser ────────────────────────────────────────────────

const SECTION_COLORS: Record<string, { label: string; accent: string }> = {
  'SPRINT PROGRESS':    { label: 'Sprint Progress',    accent: '#60a5fa' },
  'VELOCITY & PACE':    { label: 'Velocity & Pace',    accent: '#a78bfa' },
  'QUALITY & TESTING':  { label: 'Quality & Testing',  accent: '#fb923c' },
  'TEAM WORKLOAD':      { label: 'Team Workload',       accent: '#34d399' },
  'RISKS & BLOCKERS':   { label: 'Risks & Blockers',   accent: '#f87171' },
  'RECOMMENDED ACTIONS':{ label: 'Recommended Actions',accent: '#fbbf24' },
};

function AiAnalysisSections({ summary }: { summary: string }) {
  const lines = summary.split('\n').map(l => l.trim()).filter(Boolean);

  const sections: { key: string; label: string; accent: string; body: string }[] = [];
  let currentKey = '';
  let currentBody: string[] = [];

  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Z &]+)\s*[—–-]\s*(.*)/);
    if (match) {
      if (currentKey) sections.push({ ...resolveSection(currentKey), body: currentBody.join(' ') });
      currentKey = match[1].trim();
      currentBody = match[2] ? [match[2]] : [];
    } else if (currentKey) {
      currentBody.push(line);
    } else {
      // No section parsed yet — treat as plain text
      sections.push({ key: 'plain', label: '', accent: '', body: line });
    }
  }
  if (currentKey) sections.push({ ...resolveSection(currentKey), body: currentBody.join(' ') });

  // Fall back to plain rendering if no sections were parsed
  if (sections.length === 0 || sections.every(s => s.key === 'plain')) {
    return <p className="text-sm text-gray-200 leading-[1.75] whitespace-pre-line">{summary}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((s, i) =>
        s.key === 'plain' ? (
          <p key={i} className="text-sm text-gray-300 leading-relaxed">{s.body}</p>
        ) : (
          <div key={i} className="flex gap-3">
            <div className="flex-shrink-0 w-1 rounded-full mt-0.5 self-stretch" style={{ background: s.accent, opacity: 0.7 }} />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: s.accent }}>{s.label}</span>
              <p className="text-sm text-gray-200 leading-[1.7]">{s.body}</p>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function resolveSection(key: string): { key: string; label: string; accent: string } {
  const found = SECTION_COLORS[key];
  return found ? { key, ...found } : { key, label: key.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), accent: '#94a3b8' };
}
