import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import { LoadingCard, ErrorCard } from '../common/Spinner';
import { Modal } from '../common/Modal';
import { SortableTable } from '../common/SortableTable';
import type { EngineerActivity, BranchSummary } from '../../types';
import { format, differenceInDays, subDays, addDays } from 'date-fns';
import { AiSummaryStrip } from '../common/AiSummaryStrip';

// ── helpers ──────────────────────────────────────────────────────────────────

function localDay(dateStr: string): number {
  if (!dateStr) return -1;
  try { return new Date(dateStr).getDay(); } catch { return -1; }
}

function isWeekend(dateStr: string) {
  const d = localDay(dateStr);
  return d === 0 || d === 6;
}

function commitLocalDate(dateStr: string): string {
  try { return format(new Date(dateStr), 'yyyy-MM-dd'); } catch { return ''; }
}

function isInPeriod(dateStr: string, satDate: string, sunDate: string) {
  const cd = commitLocalDate(dateStr);
  return cd === satDate || cd === sunDate;
}

function filesOf(c: { changeCounts?: { Add?: number; Edit?: number; Delete?: number; add?: number; edit?: number; delete?: number } }) {
  return (c.changeCounts?.Add ?? c.changeCounts?.add ?? 0)
       + (c.changeCounts?.Edit ?? c.changeCounts?.edit ?? 0)
       + (c.changeCounts?.Delete ?? c.changeCounts?.delete ?? 0);
}

function dayLabel(dateStr: string) {
  const d = localDay(dateStr);
  return d === -1 ? '?' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d];
}

function enrichEngineer(e: EngineerActivity) {
  const wkCommits  = e.commits.filter(c => isWeekend(c.author.date));
  const allFiles   = e.commits.reduce((s, c) => s + filesOf(c), 0);
  const wkFiles    = wkCommits.reduce((s, c) => s + filesOf(c), 0);
  const satCommits = wkCommits.filter(c => localDay(c.author.date) === 6).length;
  const sunCommits = wkCommits.filter(c => localDay(c.author.date) === 0).length;
  const wkDates    = [...new Set(wkCommits.map(c => commitLocalDate(c.author.date)))];
  const lastWkCommit = wkCommits.length
    ? wkCommits.reduce((a, b) => a.author.date > b.author.date ? a : b).author.date
    : null;
  return { ...e, wkCommits, allFiles, wkFiles, satCommits, sunCommits, wkDates, lastWkCommit };
}

type RichEngineer = ReturnType<typeof enrichEngineer>;

interface WeekendPeriod {
  satDate: string;
  sunDate: string;
  label: string;
  commitCount: number;
  engineerCount: number;
}

// ── Engineers always look back 90 days ───────────────────────────────────────

const ENG_FROM = format(subDays(new Date(), 90), 'yyyy-MM-dd');
const ENG_TO   = format(new Date(), 'yyyy-MM-dd');

// Names/email patterns to exclude from the Engineering module.
// Add lower-cased displayNames or email substrings here.
const EXCLUDED_NAMES = new Set([
  'tanveer kaur',
  'ganesh bandi',
  'meghana pasupuleti',
  'rohit sagar kata',
]);
const EXCLUDED_EMAIL_FRAGMENTS = ['noreply', 'service@', 'bot@', 'local@', 'saridsa'];

function isExcluded(e: EngineerActivity): boolean {
  const name  = e.displayName.toLowerCase();
  const email = e.uniqueName.toLowerCase();
  if (EXCLUDED_NAMES.has(name)) return true;
  if (name === 'local' || name === 'service') return true;
  if (EXCLUDED_EMAIL_FRAGMENTS.some(f => email.includes(f))) return true;
  return false;
}


type CoveragePanel = 'raw' | 'dedup' | 'contributors' | 'daterange' | 'branches';

// ── main component ────────────────────────────────────────────────────────────

export function EngineersModule() {
  const { filters } = useFilterStore();
  const { data, loading, error } = useApi(
    () => api.getEngineerActivity({ fromDate: ENG_FROM, toDate: ENG_TO, project: filters.project }),
    [filters.project]
  );
  const { data: branchSummaries, loading: branchLoading } = useApi(
    () => api.getBranchSummaries(filters.project),
    [filters.project]
  );

  const [selected,      setSelected]      = useState<RichEngineer | null>(null);
  const [weekendOnly,   setWeekendOnly]    = useState(false);
  const [selectedWkSat, setSelectedWkSat] = useState<string | null>(null);
  const [coveragePanel, setCoveragePanel] = useState<CoveragePanel | null>(null);

  // ── All derived state MUST be before any early return (Rules of Hooks) ───────

  const engineers = useMemo(
    () => (data ?? [])
      .filter(e => e.commits.length > 0)
      .filter(e => !isExcluded(e))
      .map(enrichEngineer),
    [data]
  );

  const allCommitsFlat = useMemo(
    () => engineers.flatMap(e => e.commits),
    [engineers]
  );

  const weekendPeriods = useMemo((): WeekendPeriod[] => {
    const periods: WeekendPeriod[] = [];
    const d = new Date(subDays(new Date(), 90));
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    const ceiling = new Date();
    while (d <= ceiling) {
      const satDate = format(d, 'yyyy-MM-dd');
      const sun     = addDays(d, 1);
      const sunDate = format(sun, 'yyyy-MM-dd');
      const wkC     = allCommitsFlat.filter(c => isInPeriod(c.author.date, satDate, sunDate));
      periods.push({
        satDate, sunDate,
        label: `${format(d, 'MMM d')}–${format(sun, 'd')}`,
        commitCount:   wkC.length,
        engineerCount: new Set(wkC.map(c => c.author.email)).size,
      });
      d.setDate(d.getDate() + 7);
    }
    return periods.reverse();
  }, [allCommitsFlat]);

  const mostRecentPeriod = useMemo(
    () => weekendPeriods.find(p => p.commitCount > 0) ?? null,
    [weekendPeriods]
  );

  const weekendDateSet = useMemo(() => {
    const s = new Set<string>();
    weekendPeriods.forEach(p => { s.add(p.satDate); s.add(p.sunDate); });
    return s;
  }, [weekendPeriods]);

  const mostRecentWarriors = useMemo(() => {
    if (!mostRecentPeriod) return [];
    return engineers
      .map(e => ({
        eng: e,
        commits: e.commits.filter(c => isInPeriod(c.author.date, mostRecentPeriod.satDate, mostRecentPeriod.sunDate)),
      }))
      .filter(x => x.commits.length > 0)
      .sort((a, b) => b.commits.length - a.commits.length);
  }, [engineers, mostRecentPeriod]);

  const activePeriod = useMemo(
    () => selectedWkSat ? weekendPeriods.find(p => p.satDate === selectedWkSat) ?? null : null,
    [selectedWkSat, weekendPeriods]
  );

  const weekendWarriors = useMemo(() => {
    const commitsForPeriod = (e: RichEngineer) =>
      activePeriod
        ? e.commits.filter(c => isInPeriod(c.author.date, activePeriod.satDate, activePeriod.sunDate))
        : e.commits.filter(c => weekendDateSet.has(commitLocalDate(c.author.date)));

    return engineers
      .map(e => {
        const periodCommits = commitsForPeriod(e);
        return {
          ...e,
          wkCommits:    periodCommits,
          wkFiles:      periodCommits.reduce((s, c) => s + filesOf(c), 0),
          satCommits:   periodCommits.filter(c => localDay(c.author.date) === 6).length,
          sunCommits:   periodCommits.filter(c => localDay(c.author.date) === 0).length,
          wkDates:      [...new Set(periodCommits.map(c => commitLocalDate(c.author.date)))],
          lastWkCommit: periodCommits.length
            ? periodCommits.reduce((a, b) => a.author.date > b.author.date ? a : b).author.date
            : null,
        };
      })
      .filter(e => e.wkCommits.length > 0)
      .sort((a, b) => b.wkCommits.length - a.wkCommits.length);
  }, [engineers, activePeriod, weekendDateSet]);

  // ── Early returns after all hooks ─────────────────────────────────────────────
  if (loading) return <LoadingCard label="Loading engineer activity…" />;
  if (error)   return <ErrorCard error={error} />;

  const engineerData  = (data ?? []).filter(e => !isExcluded(e) && e.commits.length > 0);
  const totalRaw      = engineerData.length;
  const totalCommitsRaw = engineerData.reduce((s, e) => s + e.commits.length, 0);

  const stale = engineers.filter(e => !e.lastActivity || differenceInDays(new Date(), new Date(e.lastActivity)) >= 10);

  const totalWkCommits = weekendWarriors.reduce((s, e) => s + e.wkCommits.length, 0);
  const totalWkFiles   = weekendWarriors.reduce((s, e) => s + e.wkFiles, 0);
  const totalSat       = weekendWarriors.reduce((s, e) => s + e.satCommits, 0);
  const totalSun       = weekendWarriors.reduce((s, e) => s + e.sunCommits, 0);

  const dowCounts = [0,1,2,3,4,5,6].map(d => ({
    day:    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d],
    Commits: allCommitsFlat.filter(c => localDay(c.author.date) === d).length,
    isWk:   d === 0 || d === 6,
  }));

  const display = weekendOnly
    ? weekendWarriors
    : [...engineers].sort((a, b) => b.commits.length - a.commits.length);

  const barData = display.slice(0, 15).map(e => ({
    name: e.displayName.split(' ')[0],
    __eng: e,
    Commits: weekendOnly ? e.wkCommits.length : e.commits.length,
    'Files Changed': weekendOnly ? e.wkFiles : e.allFiles,
    ...(weekendOnly ? {} : { Weekend: e.wkCommits.length }),
  }));

  const summaryTiles = weekendOnly
    ? [
        { label: activePeriod ? activePeriod.label : 'Weekend Warriors', value: weekendWarriors.length,  color: 'text-violet-500',  stripe: 'bg-violet-500'  },
        { label: 'Weekend Commits',  value: totalWkCommits,                                               color: 'text-blue-500',    stripe: 'bg-blue-500'    },
        { label: 'Files Changed',    value: totalWkFiles,                                                 color: 'text-emerald-500', stripe: 'bg-emerald-500' },
        { label: 'Sat / Sun',        value: `${totalSat} / ${totalSun}`,                                 color: 'text-orange-400',  stripe: 'bg-orange-400'  },
      ]
    : [
        { label: 'Total Engineers',  value: engineers.length,                                              color: 'text-sky-400',     stripe: 'bg-sky-400'     },
        { label: 'Total Commits',    value: allCommitsFlat.length,                                         color: 'text-violet-400',  stripe: 'bg-violet-400'  },
        { label: 'PRs Opened',       value: engineers.reduce((s, e) => s + e.prsOpened.length, 0),        color: 'text-emerald-400', stripe: 'bg-emerald-400' },
        { label: 'Inactive (10d+)',  value: stale.length, color: stale.length ? 'text-orange-400' : 'text-emerald-400', stripe: stale.length ? 'bg-orange-400' : 'bg-emerald-400' },
      ];

  return (
    <div className="flex flex-col gap-6">

      <AiSummaryStrip section="engineers" />

      {/* ── Data coverage strip ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-gray-500">
        <span className="font-semibold text-gray-700 dark:text-gray-300">Repo data</span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <button onClick={() => setCoveragePanel('raw')}
          className="font-medium hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2 transition-colors">
          <span className="font-bold text-gray-800 dark:text-white">{totalCommitsRaw.toLocaleString()}</span> raw commits
        </button>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <button onClick={() => setCoveragePanel('dedup')}
          className="font-medium hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2 transition-colors">
          <span className="font-bold text-gray-800 dark:text-white">{allCommitsFlat.length.toLocaleString()}</span> after dedup
        </button>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <button onClick={() => setCoveragePanel('contributors')}
          className="font-medium hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2 transition-colors">
          <span className="font-bold text-gray-800 dark:text-white">{totalRaw}</span> engineers
        </button>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <button onClick={() => setCoveragePanel('daterange')}
          className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2 transition-colors">
          last 90 days
        </button>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <button onClick={() => setCoveragePanel('branches')}
          className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2 transition-colors">
          all branches
        </button>
      </div>

      {/* ── Most Recent Weekend banner ────────────────────────────────────── */}
      <div className="rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-950/20 p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌙</span>
            <div>
              <span className="text-sm font-bold text-violet-700 dark:text-violet-300">
                Most Recent Weekend
              </span>
              {mostRecentPeriod
                ? <span className="ml-2 text-sm text-violet-500">{mostRecentPeriod.label}</span>
                : <span className="ml-2 text-xs text-gray-400">No weekend activity in 90 days</span>
              }
            </div>
          </div>
          {mostRecentPeriod && (
            <span className="text-xs text-gray-500">
              {mostRecentPeriod.commitCount} commits · {mostRecentPeriod.engineerCount} engineer{mostRecentPeriod.engineerCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {mostRecentWarriors.length > 0 ? (
          <div className="flex gap-2.5 flex-wrap">
            {mostRecentWarriors.map(({ eng: e, commits: wc }) => (
              <button
                key={e.uniqueName}
                onClick={() => setSelected(e)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-surface-elevated border border-violet-200 dark:border-violet-900/50 hover:border-violet-400 transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {e.displayName[0]}
                </div>
                <div className="text-left min-w-0">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">{e.displayName}</div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                    <span className="text-violet-500 font-semibold">{wc.length} commits</span>
                    {wc.filter(c => localDay(c.author.date) === 6).length > 0 &&
                      <span className="px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">Sat</span>}
                    {wc.filter(c => localDay(c.author.date) === 0).length > 0 &&
                      <span className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">Sun</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">No weekend commits detected in the last 90 days.</p>
        )}
      </div>

      {/* ── Weekend toggle ────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={() => { setWeekendOnly(v => !v); setSelectedWkSat(null); }}
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

      {/* ── Week filter chips (only in weekendOnly mode) ──────────────────── */}
      {weekendOnly && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold px-0.5">Filter by weekend</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            <button
              onClick={() => setSelectedWkSat(null)}
              className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                !selectedWkSat
                  ? 'bg-violet-500 border-violet-500 text-white'
                  : 'bg-surface-elevated border-surface-border text-gray-500 hover:border-violet-400 hover:text-violet-500'
              }`}
            >
              <span>All</span>
              <span className="text-[9px] font-normal mt-0.5 opacity-70">{weekendPeriods.reduce((s, p) => s + p.commitCount, 0)} commits</span>
            </button>

            {weekendPeriods.map(p => {
              const isSelected = selectedWkSat === p.satDate;
              const hasData    = p.commitCount > 0;
              return (
                <button
                  key={p.satDate}
                  onClick={() => setSelectedWkSat(isSelected ? null : p.satDate)}
                  disabled={!hasData}
                  className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-violet-500 border-violet-500 text-white'
                      : hasData
                        ? 'bg-surface-elevated border-surface-border text-gray-600 dark:text-gray-300 hover:border-violet-400 hover:text-violet-500'
                        : 'bg-surface-elevated border-surface-border text-gray-300 dark:text-gray-600 opacity-40 cursor-not-allowed'
                  }`}
                >
                  <span>{p.label}</span>
                  <span className={`text-[9px] font-normal mt-0.5 ${isSelected ? 'opacity-90' : 'opacity-60'}`}>
                    {hasData ? `${p.engineerCount} eng · ${p.commitCount} commits` : 'no activity'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Summary tiles ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryTiles.map(s => (
          <div key={s.label} className="card relative overflow-hidden">
            {s.stripe && <div className={`absolute top-0 left-0 right-0 h-[3px] ${s.stripe}`} />}
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1 block">{s.label}</span>
            <span className={`text-3xl font-bold ${s.color ?? 'text-gray-900 dark:text-white'}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* ── Commit activity by day of week ────────────────────────────────── */}
      {!weekendOnly && allCommitsFlat.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              Commit Activity by Day of Week
              <span className="ml-2 text-xs font-normal text-gray-400">{allCommitsFlat.length} commits · last 90 days</span>
            </h3>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-violet-500 inline-block" />Weekend</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />Weekday</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dowCounts} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: 'var(--tile-muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--tile-muted)', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, color: 'var(--tooltip-text)' }}
                formatter={(v: number, _n, p) => [`${v} commits`, p.payload.day]}
              />
              <Bar dataKey="Commits" radius={[4, 4, 0, 0]}>
                {dowCounts.map((d, i) => <Cell key={i} fill={d.isWk ? '#8b5cf6' : '#3b82f6'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Weekend Warriors panel (weekendOnly mode) ─────────────────────── */}
      {weekendOnly && weekendWarriors.length > 0 && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-950/20 p-4">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">
              {activePeriod ? `Weekend ${activePeriod.label}` : 'All Weekends'} — {weekendWarriors.length} engineer{weekendWarriors.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-gray-500">
              {totalWkCommits} commits · {totalWkFiles} files · {totalSat} Sat / {totalSun} Sun
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
                  <div className="text-[10px] text-violet-500">{e.wkCommits.length} commits · {e.wkFiles} files</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {weekendOnly && weekendWarriors.length === 0 && (
        <div className="card text-center py-10 text-gray-400">
          {activePeriod ? `No weekend commits for ${activePeriod.label}` : 'No weekend commits found in the last 90 days'}
        </div>
      )}

      {/* ── Bar chart ─────────────────────────────────────────────────────── */}
      {barData.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              {weekendOnly
                ? `Weekend Commits${activePeriod ? ` — ${activePeriod.label}` : ' (all weekends)'}`
                : 'Top Contributors'}
            </h3>
            <span className="text-xs text-gray-400">Click a bar or name to view details</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={barData}
              margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
              style={{ cursor: 'pointer' }}
              onClick={(chartData) => {
                const eng = (chartData?.activePayload?.[0]?.payload as any)?.__eng;
                if (eng) setSelected(eng);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="name"
                tick={(props: any) => {
                  const { x, y, payload, index } = props;
                  const eng = barData[index]?.__eng;
                  return (
                    <g
                      transform={`translate(${x},${y})`}
                      onClick={(e) => { e.stopPropagation(); if (eng) setSelected(eng); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <text
                        x={0} y={0} dy={14}
                        textAnchor="middle"
                        fill="#a78bfa"
                        fontSize={11}
                        fontWeight={600}
                        style={{ textDecoration: 'underline' }}
                      >
                        {payload.value}
                      </text>
                    </g>
                  );
                }}
              />
              <YAxis tick={{ fill: 'var(--tile-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, color: 'var(--tooltip-text)' }}
                cursor={{ fill: 'rgba(139,92,246,0.08)' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--tile-muted)' }} />
              <Bar dataKey="Commits" fill={weekendOnly ? '#8b5cf6' : '#3b82f6'} radius={[4, 4, 0, 0]} cursor="pointer" />
              <Bar dataKey="Files Changed" fill="#10b981" radius={[4, 4, 0, 0]} cursor="pointer" />
              {!weekendOnly && <Bar dataKey="Weekend" fill="#8b5cf6" radius={[4, 4, 0, 0]} cursor="pointer" />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Engineer table ────────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-4">
          {weekendOnly
            ? `Weekend Warriors${activePeriod ? ` — ${activePeriod.label}` : ''} (${display.length})`
            : `Engineers (${display.length})`}
        </h3>
        <SortableTable
          data={display}
          rowKey={r => r.uniqueName}
          onRowClick={r => setSelected(r)}
          columns={weekendOnly ? [
            { key: 'name', header: 'Name',          sortable: true,  render: r => <span className="font-medium">{r.displayName}</span>,                                                                                         sortValue: r => r.displayName },
            { key: 'wkc',  header: 'Wk Commits',    sortable: true,  render: r => <span className="font-bold text-violet-500">{r.wkCommits.length}</span>,                                                                      sortValue: r => r.wkCommits.length },
            { key: 'wkf',  header: 'Files Changed',  sortable: true,  render: r => r.wkFiles,                                                                                                                                   sortValue: r => r.wkFiles },
            { key: 'sat',  header: 'Sat',            sortable: true,  render: r => r.satCommits ? <span className="text-violet-500">{r.satCommits}</span> : <span className="text-gray-400">—</span>,                          sortValue: r => r.satCommits },
            { key: 'sun',  header: 'Sun',            sortable: true,  render: r => r.sunCommits ? <span className="text-blue-400">{r.sunCommits}</span>   : <span className="text-gray-400">—</span>,                          sortValue: r => r.sunCommits },
            { key: 'days', header: 'Days Worked',    sortable: false, render: r => <span className="text-xs text-gray-500">{r.wkDates.slice(0,3).join(' · ')}{r.wkDates.length > 3 ? ` +${r.wkDates.length-3}` : ''}</span>  },
            { key: 'last', header: 'Last Weekend',   sortable: true,  render: r => r.lastWkCommit ? <div><div>{format(new Date(r.lastWkCommit), 'EEE MMM d, yyyy')}</div><div className="text-[10px] font-mono text-gray-400">{format(new Date(r.lastWkCommit), 'HH:mm:ss')}</div></div> : '—', sortValue: r => r.lastWkCommit ?? '' },
          ] : [
            { key: 'name',    header: 'Name',         sortable: true,  render: r => <span className="font-medium">{r.displayName}</span>,                                                                                        sortValue: r => r.displayName },
            { key: 'commits', header: 'Commits',       sortable: true,  render: r => r.commits.length,                                                                                                                           sortValue: r => r.commits.length },
            { key: 'files',   header: 'Files Changed', sortable: true,  render: r => r.allFiles,                                                                                                                                 sortValue: r => r.allFiles },
            { key: 'wk',      header: 'Weekend',       sortable: true,  render: r => r.wkCommits.length ? <span className="text-violet-500 font-semibold">{r.wkCommits.length}</span> : <span className="text-gray-400">0</span>, sortValue: r => r.wkCommits.length },
            { key: 'prs',     header: 'PRs Opened',    sortable: true,  render: r => r.prsOpened.length,                                                                                                                         sortValue: r => r.prsOpened.length },
            { key: 'merged',  header: 'PRs Merged',    sortable: true,  render: r => r.prsMerged.length,                                                                                                                         sortValue: r => r.prsMerged.length },
            { key: 'reviews', header: 'Reviews',       sortable: true,  render: r => r.prsReviewed.length,                                                                                                                       sortValue: r => r.prsReviewed.length },
            { key: 'last',    header: 'Last Commit',   sortable: true,  render: r => r.lastActivity ? <div><div>{format(new Date(r.lastActivity), 'MMM d, yyyy')}</div><div className="text-[10px] font-mono text-gray-400">{format(new Date(r.lastActivity), 'HH:mm:ss')}</div></div> : <span className="text-gray-500">—</span>, sortValue: r => r.lastActivity ?? '' },
          ]}
        />
      </div>

      {/* ── Branch Coverage ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            Branch Coverage
            <span className="ml-2 text-xs font-normal text-gray-400">last commit per branch · engineers only</span>
          </h3>
          {branchLoading && <span className="text-xs text-gray-400 animate-pulse">Loading branches…</span>}
        </div>
        {!branchLoading && branchSummaries && (() => {
          // Group branches by repo
          const engEmails = new Set(engineers.map(e => e.uniqueName.toLowerCase()));
          const byRepo: Record<string, BranchSummary[]> = {};
          branchSummaries.forEach(b => {
            if (!byRepo[b.repoName]) byRepo[b.repoName] = [];
            byRepo[b.repoName].push(b);
          });
          return (
            <div className="flex flex-col gap-4">
              {Object.entries(byRepo).map(([repoName, branches]) => (
                <div key={repoName} className="rounded-lg border border-surface-border overflow-hidden">
                  <div className="px-4 py-2 bg-surface-elevated flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{repoName}</span>
                    <span className="text-xs text-gray-400">{branches.length} branches</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="border-b border-surface-border">
                      <tr className="text-xs uppercase text-gray-400 tracking-wider">
                        <th className="px-4 py-2 text-left">Branch</th>
                        <th className="px-4 py-2 text-left">Last Commit By</th>
                        <th className="px-4 py-2 text-left">Message</th>
                        <th className="px-4 py-2 text-right">Date</th>
                        <th className="px-4 py-2 text-right font-mono">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branches.map(b => {
                        const c = b.lastCommit;
                        const authorEmail = c?.author.email.toLowerCase() ?? '';
                        const isEngineer  = engEmails.has(authorEmail);
                        const eng = engineers.find(e => e.uniqueName.toLowerCase() === authorEmail);
                        return (
                          <tr key={b.branchName} className="border-t border-surface-border hover:bg-surface-elevated transition-colors">
                            <td className="px-4 py-2.5">
                              <span className="font-mono text-xs text-blue-500 dark:text-blue-400">{b.branchName}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              {c ? (
                                isEngineer
                                  ? <button className="flex items-center gap-1.5 hover:underline" onClick={() => eng && setSelected(eng)}>
                                      <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">{c.author.name[0]}</span>
                                      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{c.author.name}</span>
                                    </button>
                                  : <span className="text-xs text-gray-400 italic">{c.author.name}</span>
                              ) : <span className="text-xs text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 max-w-xs">
                              {c ? (
                                <span className="text-xs text-gray-600 dark:text-gray-300 truncate block">
                                  <span className="font-mono text-gray-400 mr-1.5">{c.commitId.slice(0, 7)}</span>
                                  {c.comment.split('\n')[0]}
                                </span>
                              ) : <span className="text-xs text-gray-300">no commits</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap">
                              {c ? format(new Date(c.author.date), 'MMM d, yyyy') : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400 whitespace-nowrap">
                              {c ? format(new Date(c.author.date), 'HH:mm:ss') : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          );
        })()}
        {!branchLoading && !branchSummaries && (
          <p className="text-xs text-gray-400 py-4 text-center">No branch data available.</p>
        )}
      </div>

      {/* ── Engineer detail modal ─────────────────────────────────────────── */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Activity: ${selected?.displayName ?? ''}`} width="max-w-4xl">
        {selected && <EngineerDetail engineer={selected} />}
      </Modal>

      {/* ── Coverage detail modals ────────────────────────────────────────── */}
      <Modal
        open={coveragePanel !== null}
        onClose={() => setCoveragePanel(null)}
        title={
          coveragePanel === 'raw'          ? `Raw Commits — engineers, all branches (${totalCommitsRaw.toLocaleString()} total)` :
          coveragePanel === 'dedup'        ? `Deduplicated Commits — ${allCommitsFlat.length.toLocaleString()} unique commits` :
          coveragePanel === 'contributors' ? `Engineers — ${totalRaw} active contributors` :
          coveragePanel === 'daterange'    ? `Date Range — last 90 days` :
          coveragePanel === 'branches'     ? `Branch Coverage — all repos queried` : ''
        }
        width="max-w-5xl"
      >
        {coveragePanel === 'raw' && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Raw counts include commits that appear in multiple branches (same commit reachable from feature + main = counted once per branch query). The "after dedup" number collapses these by <code className="bg-surface-elevated px-1 rounded">commitId</code>.
            </p>
            <div className="overflow-x-auto rounded-lg border border-surface-border">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface-elevated text-xs uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Engineer</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 text-right">Raw Commits</th>
                    <th className="px-4 py-3 text-right">Deduped</th>
                    <th className="px-4 py-3">Last Commit</th>
                  </tr>
                </thead>
                <tbody>
                  {engineerData.sort((a, b) => b.commits.length - a.commits.length).map(e => {
                    const deduped = engineers.find(eng => eng.uniqueName === e.uniqueName);
                    return (
                      <tr key={e.uniqueName} className="border-t border-surface-border hover:bg-surface-elevated transition-colors">
                        <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{e.displayName}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{e.uniqueName}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-white">{e.commits.length.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400">{deduped?.commits.length ?? '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">
                          {e.lastActivity
                            ? <><div>{format(new Date(e.lastActivity), 'MMM d, yyyy')}</div><div className="font-mono text-gray-400">{format(new Date(e.lastActivity), 'HH:mm:ss')}</div></>
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {coveragePanel === 'dedup' && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-elevated rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{allCommitsFlat.length.toLocaleString()}</div>
                <div className="text-xs text-gray-400 mt-1">Unique commits</div>
              </div>
              <div className="bg-surface-elevated rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{engineers.length}</div>
                <div className="text-xs text-gray-400 mt-1">Engineers</div>
              </div>
              <div className="bg-surface-elevated rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {new Set(allCommitsFlat.map(c => (c as any).repoName)).size}
                </div>
                <div className="text-xs text-gray-400 mt-1">Repos</div>
              </div>
            </div>
            {engineers.sort((a, b) => b.commits.length - a.commits.length).map(e => (
              <div key={e.uniqueName} className="rounded-lg border border-surface-border">
                <div className="flex items-center gap-3 px-4 py-3 bg-surface-elevated rounded-t-lg">
                  <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">{e.displayName[0]}</div>
                  <div>
                    <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">{e.displayName}</div>
                    <div className="text-xs text-gray-400">{e.uniqueName}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
                    <span><span className="font-bold text-gray-800 dark:text-white">{e.commits.length}</span> commits</span>
                    <span><span className="font-bold text-gray-800 dark:text-white">{e.allFiles}</span> files</span>
                    <span><span className="font-bold text-violet-500">{e.wkCommits.length}</span> weekend</span>
                  </div>
                </div>
                <ul className="divide-y divide-surface-border max-h-48 overflow-y-auto">
                  {[...e.commits].sort((a, b) => b.author.date.localeCompare(a.author.date)).slice(0, 20).map(c => (
                    <li key={c.commitId} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface-elevated transition-colors">
                      <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${isWeekend(c.author.date) ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                        {dayLabel(c.author.date)}
                      </span>
                      <span className="font-mono text-xs text-gray-400 flex-shrink-0">{c.commitId.slice(0, 7)}</span>
                      <span className="truncate text-gray-700 dark:text-gray-300">{c.comment.split('\n')[0]}</span>
                      <span className="ml-auto flex-shrink-0 text-right">
                        <div className="text-[10px] text-gray-500">{format(new Date(c.author.date), 'MMM d, yyyy')}</div>
                        <div className="text-[10px] font-mono text-gray-400">{format(new Date(c.author.date), 'HH:mm:ss')}</div>
                      </span>
                      <span className="flex-shrink-0 text-[10px] text-gray-400">{(c as any).repoName}</span>
                    </li>
                  ))}
                </ul>
                {e.commits.length > 20 && (
                  <div className="px-4 py-2 text-xs text-gray-400 border-t border-surface-border">
                    + {e.commits.length - 20} more commits not shown
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {coveragePanel === 'contributors' && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Active software engineers with commits in the last 90 days.
            </p>
            <div className="overflow-x-auto rounded-lg border border-surface-border">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface-elevated text-xs uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 text-right">Commits</th>
                    <th className="px-4 py-3 text-right">PRs Opened</th>
                    <th className="px-4 py-3 text-right">Weekend</th>
                    <th className="px-4 py-3">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {engineers.sort((a, b) => b.commits.length - a.commits.length).map(e => (
                    <tr key={e.uniqueName} className="border-t border-surface-border hover:bg-surface-elevated transition-colors cursor-pointer" onClick={() => { setCoveragePanel(null); setSelected(e); }}>
                      <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{e.displayName}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{e.uniqueName}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-white">{e.commits.length}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">{e.prsOpened.length}</td>
                      <td className="px-4 py-2.5 text-right text-violet-500">{e.wkCommits.length || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {e.lastActivity
                          ? <><div>{format(new Date(e.lastActivity), 'MMM d, yyyy')}</div><div className="font-mono text-gray-400">{format(new Date(e.lastActivity), 'HH:mm:ss')}</div></>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {coveragePanel === 'daterange' && (() => {
          const weeks: { label: string; count: number; engineers: Set<string> }[] = [];
          const from = new Date(ENG_FROM);
          const to   = new Date(ENG_TO);
          const cur  = new Date(from);
          while (cur <= to) {
            const wStart = new Date(cur);
            const wEnd   = new Date(cur); wEnd.setDate(wEnd.getDate() + 6);
            const label  = `${format(wStart, 'MMM d')} – ${format(wEnd > to ? to : wEnd, 'MMM d')}`;
            const wkC    = allCommitsFlat.filter(c => {
              const d = new Date(c.author.date);
              return d >= wStart && d <= wEnd;
            });
            weeks.push({ label, count: wkC.length, engineers: new Set(wkC.map(c => c.author.email)) });
            cur.setDate(cur.getDate() + 7);
          }
          const maxCount = Math.max(...weeks.map(w => w.count), 1);
          return (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-elevated rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{ENG_FROM}</div>
                  <div className="text-xs text-gray-400 mt-1">From date</div>
                </div>
                <div className="bg-surface-elevated rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{ENG_TO}</div>
                  <div className="text-xs text-gray-400 mt-1">To date</div>
                </div>
                <div className="bg-surface-elevated rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">90</div>
                  <div className="text-xs text-gray-400 mt-1">Days</div>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-surface-border">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-elevated text-xs uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Week</th>
                      <th className="px-4 py-3 text-right">Commits</th>
                      <th className="px-4 py-3 text-right">Active engineers</th>
                      <th className="px-4 py-3">Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map(w => (
                      <tr key={w.label} className="border-t border-surface-border hover:bg-surface-elevated transition-colors">
                        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{w.label}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-white">{w.count}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">{w.engineers.size}</td>
                        <td className="px-4 py-2.5">
                          <div className="h-2 rounded-full bg-surface-border overflow-hidden w-48">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${Math.round((w.count / maxCount) * 100)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {coveragePanel === 'branches' && (() => {
          const repoMap: Record<string, { commits: number; engineers: Set<string> }> = {};
          allCommitsFlat.forEach(c => {
            const r = (c as any).repoName as string;
            if (!repoMap[r]) repoMap[r] = { commits: 0, engineers: new Set() };
            repoMap[r].commits++;
            repoMap[r].engineers.add(c.author.email);
          });
          const rows = Object.entries(repoMap).sort((a, b) => b[1].commits - a[1].commits);
          return (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Every branch in every repo is queried via ADO <code className="bg-surface-elevated px-1 rounded">refs/heads/</code>. Commits are fetched per-branch with <code className="bg-surface-elevated px-1 rounded">$top=5000</code> + pagination, then deduplicated by <code className="bg-surface-elevated px-1 rounded">commitId</code> globally.
              </p>
              <div className="overflow-x-auto rounded-lg border border-surface-border">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-elevated text-xs uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Repository</th>
                      <th className="px-4 py-3 text-right">Commits</th>
                      <th className="px-4 py-3 text-right">Engineers</th>
                      <th className="px-4 py-3">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([repo, stats]) => (
                      <tr key={repo} className="border-t border-surface-border hover:bg-surface-elevated transition-colors">
                        <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{repo}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-white">{stats.commits}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">{stats.engineers.size}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 rounded-full bg-surface-border overflow-hidden w-32">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${Math.round((stats.commits / allCommitsFlat.length) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">{Math.round((stats.commits / allCommitsFlat.length) * 100)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">
                All branches within each repository are automatically discovered and queried. Branch counts not shown here (query the debug endpoint for full branch breakdown).
              </p>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// ── engineer detail popup ─────────────────────────────────────────────────────

function EngineerDetail({ engineer: e }: { engineer: RichEngineer }) {
  return (
    <div className="flex flex-col gap-6">

      {/* Repo stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Commits',   value: e.commits.length },
          { label: 'Files Changed',   value: e.allFiles },
          { label: 'PRs Opened',      value: e.prsOpened.length },
          { label: 'PRs Merged',      value: e.prsMerged.length },
          { label: 'PR Reviews',      value: e.prsReviewed.length },
          { label: 'Weekend Commits', value: e.wkCommits.length, color: e.wkCommits.length ? 'text-violet-500' : undefined },
          { label: 'Sat Commits',     value: e.satCommits, color: e.satCommits ? 'text-violet-400' : undefined },
          { label: 'Sun Commits',     value: e.sunCommits, color: e.sunCommits ? 'text-blue-400' : undefined },
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
                  localDay(c.author.date) === 6
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                    : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                }`}>{dayLabel(c.author.date)}</span>
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

      {/* PRs */}
      {e.prsOpened.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">Pull Requests</h4>
          <ul className="space-y-1 max-h-36 overflow-y-auto">
            {e.prsOpened.slice(0, 20).map(pr => (
              <li key={pr.pullRequestId} className="text-sm flex gap-2 items-center">
                <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  pr.status === 'completed'
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                    : pr.status === 'abandoned'
                      ? 'bg-gray-100 dark:bg-gray-900/40 text-gray-500'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                }`}>{pr.status}</span>
                <span className="truncate text-gray-700 dark:text-gray-200">{pr.title}</span>
                <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-mono text-gray-400 whitespace-nowrap">{format(new Date(pr.creationDate), 'MMM d, yyyy · HH:mm')}</span>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">{(pr as any).repoName}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* All commits */}
      {e.commits.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
            Recent Commits <span className="text-xs font-normal text-gray-400">({e.commits.length} total)</span>
          </h4>
          <ul className="space-y-1 max-h-44 overflow-y-auto">
            {e.commits.slice(0, 30).map(c => (
              <li key={c.commitId} className="text-sm flex gap-2 items-center">
                <span className={`flex-shrink-0 text-[10px] font-bold ${isWeekend(c.author.date) ? 'text-violet-500' : 'text-gray-400'}`}>
                  {dayLabel(c.author.date)}
                </span>
                <span className="font-mono text-xs text-gray-500 flex-shrink-0">{c.commitId.slice(0, 7)}</span>
                <span className="truncate text-gray-600 dark:text-gray-300">{c.comment.split('\n')[0]}</span>
                <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-mono text-gray-400 whitespace-nowrap">{format(new Date(c.author.date), 'MMM d, yyyy · HH:mm')}</span>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">{(c as any).repoName}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
