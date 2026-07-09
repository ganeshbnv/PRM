import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, Lightbulb, MessageSquare, TrendingUp,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';

interface ChartPoint { name: string; value: number; color?: string; }

type Analysis = {
  section: string;
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  generatedAt: string;
  fromCache?: boolean;
  metrics?: {
    distribution?: ChartPoint[];
    bars?: ChartPoint[];
    healthScore?: number;
    healthLabel?: string;
  };
};

interface Props {
  section: 'bugs' | 'engineers' | 'repos' | 'risks' | 'wiki';
}

const SECTION_LABELS: Record<string, string> = {
  bugs:      'Bug Analysis',
  engineers: 'Team Analysis',
  repos:     'Code Health',
  risks:     'Risk Analysis',
  wiki:      'Knowledge Base Analysis',
};

const SECTION_COLORS: Record<string, { accent: string; bg: string; bgDark: string; border: string; borderDark: string; badge: string }> = {
  bugs:      { accent: '#ef4444', bg: '#fef2f2', bgDark: 'rgba(239,68,68,0.08)',      border: '#fecaca', borderDark: 'rgba(239,68,68,0.25)',    badge: '#fee2e2' },
  engineers: { accent: '#8b5cf6', bg: '#f5f3ff', bgDark: 'rgba(139,92,246,0.08)',     border: '#ddd6fe', borderDark: 'rgba(139,92,246,0.25)',   badge: '#ede9fe' },
  repos:     { accent: '#0ea5e9', bg: '#f0f9ff', bgDark: 'rgba(14,165,233,0.08)',     border: '#bae6fd', borderDark: 'rgba(14,165,233,0.25)',   badge: '#e0f2fe' },
  risks:     { accent: '#f97316', bg: '#fff7ed', bgDark: 'rgba(249,115,22,0.08)',     border: '#fed7aa', borderDark: 'rgba(249,115,22,0.25)',   badge: '#ffedd5' },
  wiki:      { accent: '#10b981', bg: '#f0fdf4', bgDark: 'rgba(16,185,129,0.08)',     border: '#bbf7d0', borderDark: 'rgba(16,185,129,0.25)',   badge: '#dcfce7' },
};

const HEALTH_COLORS = {
  Healthy:  { bg: '#dcfce7', text: '#15803d', border: '#86efac', dot: '#22c55e', bgDark: 'rgba(34,197,94,0.12)',  textDark: '#4ade80',  borderDark: 'rgba(34,197,94,0.3)'  },
  Warning:  { bg: '#fef9c3', text: '#a16207', border: '#fde047', dot: '#eab308', bgDark: 'rgba(234,179,8,0.12)',  textDark: '#facc15',  borderDark: 'rgba(234,179,8,0.3)'  },
  Critical: { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', dot: '#ef4444', bgDark: 'rgba(239,68,68,0.12)', textDark: '#f87171',  borderDark: 'rgba(239,68,68,0.3)'  },
};

function timeAgo(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime();
  if (ms < 60000)   return 'just now';
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  return `${Math.round(ms / 3600000)}h ago`;
}

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function HealthScoreBadge({ score, label, isDark }: { score: number; label: string; isDark: boolean }) {
  const hc = HEALTH_COLORS[label as keyof typeof HEALTH_COLORS] ?? HEALTH_COLORS.Warning;
  const bg     = isDark ? hc.bgDark     : hc.bg;
  const text   = isDark ? hc.textDark   : hc.text;
  const border = isDark ? hc.borderDark : hc.border;

  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 6, padding: '12px 16px', borderRadius: 10, border: `1px solid ${border}`,
      background: bg, minWidth: 110,
    }}>
      <svg width={72} height={72} viewBox="0 0 72 72">
        <circle cx={36} cy={36} r={radius} fill="none" stroke={isDark ? 'rgba(255,255,255,0.07)' : '#e5e7eb'} strokeWidth={6} />
        <circle
          cx={36} cy={36} r={radius} fill="none"
          stroke={hc.dot} strokeWidth={6}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <text x={36} y={40} textAnchor="middle" fontSize={14} fontWeight={800} fill={text}>{score}</text>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: text, letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: 9.5, color: text, opacity: 0.7 }}>Health Score</div>
      </div>
    </div>
  );
}

function MiniDonut({ data, isDark }: { data: ChartPoint[]; isDark: boolean }) {
  if (!data.length) return null;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const RADIAN = Math.PI / 180;
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }: {
    cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; value: number;
  }) => {
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    const pct = Math.round((value / total) * 100);
    if (pct < 8) return null;
    return <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={9} fontWeight={700}>{pct}%</text>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: isDark ? '#6b7db3' : '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Distribution
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ResponsiveContainer width={96} height={96}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={26} outerRadius={44}
              dataKey="value" labelLine={false} label={renderCustomLabel}>
              {data.map((d, i) => <Cell key={i} fill={d.color ?? '#6366f1'} />)}
            </Pie>
            <Tooltip
              formatter={(val: number, name: string) => [`${val} (${Math.round(val/total*100)}%)`, name]}
              contentStyle={{
                background: isDark ? '#1e293b' : '#fff',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
                borderRadius: 8, fontSize: 11,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color ?? '#6366f1', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: isDark ? '#94a3b8' : '#475569', whiteSpace: 'nowrap' }}>
                {d.name} <strong style={{ color: isDark ? '#e2e8f0' : '#1e293b' }}>{d.value}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniBars({ data, isDark, accent }: { data: ChartPoint[]; isDark: boolean; accent: string }) {
  if (!data.length || data.every(d => d.value === 0)) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: isDark ? '#6b7db3' : '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Breakdown
      </span>
      <ResponsiveContainer width="100%" height={90}>
        <BarChart data={data} margin={{ top: 0, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: isDark ? '#64748b' : '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: isDark ? '#64748b' : '#94a3b8' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: isDark ? '#1e293b' : '#fff',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
              borderRadius: 8, fontSize: 11,
            }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color ?? accent} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AiSummaryStrip({ section }: Props) {
  const { filters } = useFilterStore();
  const isDark = useIsDark();
  const [data, setData]             = useState<Analysis | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [expanded, setExpanded]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const colors = SECTION_COLORS[section] ?? SECTION_COLORS.bugs;
  const label  = SECTION_LABELS[section] ?? 'AI Analysis';

  const outerBg     = isDark ? colors.bgDark    : colors.bg;
  const outerBorder = isDark ? colors.borderDark : colors.border;
  const cardBg      = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
  const cardBorder  = isDark ? colors.borderDark : colors.border;
  const titleColor  = isDark ? '#f0f4ff' : '#0f172a';
  const metaColor   = isDark ? '#6b7db3' : '#94a3b8';
  const bodyText    = isDark ? '#cbd5e1' : '#1e293b';
  const bulletText  = isDark ? '#94a3b8' : '#334155';

  const load = useCallback(async (bust = false) => {
    if (!filters.project) return;
    bust ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const result = await api.getAiAnalysis(section, filters.project);
      setData(result);
    } catch (err) {
      setError((err as Error).message ?? 'Analysis unavailable');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [section, filters.project]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border mb-4 px-4 py-2.5 flex items-center gap-3"
        style={{ borderColor: outerBorder, background: outerBg }}>
        <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 animate-pulse"
          style={{ background: colors.accent + '20' }}>
          <Sparkles size={11} style={{ color: colors.accent }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: titleColor }}>{label}</span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden mx-2"
          style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }}>
          <div className="h-full rounded-full animate-pulse"
            style={{ width: '55%', background: `linear-gradient(90deg, ${colors.accent}50, ${colors.accent}90)` }} />
        </div>
        <span style={{ fontSize: 11, color: metaColor }}>Analyzing…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border mb-5 px-4 py-3 flex items-center gap-3"
        style={{ borderColor: isDark ? 'rgba(239,68,68,0.3)' : '#fecaca', background: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2' }}>
        <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: isDark ? '#fca5a5' : '#b91c1c' }}>
          AI analysis unavailable — {error}
        </span>
        <button onClick={() => load(true)} className="ml-auto text-xs underline" style={{ color: '#ef4444' }}>retry</button>
      </div>
    );
  }

  if (!data) return null;

  const m = data.metrics;
  const hasCharts = m && ((m.distribution?.length ?? 0) > 0 || (m.bars?.length ?? 0) > 0 || m.healthScore !== undefined);

  return (
    <div className="rounded-xl border mb-5 overflow-hidden" style={{ borderColor: outerBorder, background: outerBg }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5"
        style={{ borderBottom: expanded ? `1px solid ${outerBorder}` : 'none' }}>
        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: colors.accent + '18', border: `1px solid ${colors.accent}30` }}>
          <Sparkles size={12} style={{ color: colors.accent }} />
        </div>

        <span style={{ fontSize: 12.5, fontWeight: 700, color: titleColor }}>{label}</span>

        {data.fromCache && (
          <span style={{ fontSize: 10, color: metaColor, background: isDark ? 'rgba(255,255,255,0.07)' : '#f1f5f9', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, borderRadius: 99, padding: '1px 8px', fontWeight: 500 }}>
            cached
          </span>
        )}

        {m?.healthScore !== undefined && (
          <span style={{
            fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '2px 8px',
            background: HEALTH_COLORS[m.healthLabel as keyof typeof HEALTH_COLORS]?.[isDark ? 'bgDark' : 'bg'] ?? '#e5e7eb',
            color: HEALTH_COLORS[m.healthLabel as keyof typeof HEALTH_COLORS]?.[isDark ? 'textDark' : 'text'] ?? '#64748b',
            border: `1px solid ${HEALTH_COLORS[m.healthLabel as keyof typeof HEALTH_COLORS]?.[isDark ? 'borderDark' : 'border'] ?? '#e2e8f0'}`,
          }}>
            {m.healthLabel} · {m.healthScore}/100
          </span>
        )}

        <span style={{ fontSize: 10.5, color: metaColor, marginLeft: 4 }}>
          Updated {timeAgo(data.generatedAt)}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => load(true)} title="Refresh analysis"
            className="w-6 h-6 rounded flex items-center justify-center transition-colors"
            style={{ color: metaColor }}
            onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setExpanded(v => !v)}
            className="w-6 h-6 rounded flex items-center justify-center transition-colors"
            style={{ color: metaColor }}
            onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <>
          {/* Text cards row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 pb-3">
            {/* Summary */}
            <div className="rounded-lg p-3.5 border" style={{ background: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-1.5 mb-2">
                <MessageSquare size={11} style={{ color: colors.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: colors.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Summary
                </span>
              </div>
              <p style={{ fontSize: 12.5, color: bodyText, lineHeight: 1.65 }}>
                {data.summary || 'No summary generated.'}
              </p>
            </div>

            {/* Key Findings */}
            <div className="rounded-lg p-3.5 border" style={{ background: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={11} style={{ color: colors.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: colors.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Key Findings
                </span>
              </div>
              {data.keyFindings.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.keyFindings.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: colors.accent }} />
                      <span style={{ fontSize: 12, color: bulletText, lineHeight: 1.55 }}>{f}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 12, color: metaColor }}>No findings available.</p>
              )}
            </div>

            {/* Recommendations */}
            <div className="rounded-lg p-3.5 border" style={{ background: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb size={11} style={{ color: colors.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: colors.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Actions
                </span>
              </div>
              {data.recommendations.length > 0 ? (
                <ol className="space-y-1.5">
                  {data.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                        style={{ background: isDark ? `${colors.accent}20` : colors.badge, color: colors.accent, border: `1px solid ${isDark ? colors.accent + '40' : cardBorder}` }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 12, color: bulletText, lineHeight: 1.55 }}>{r}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p style={{ fontSize: 12, color: metaColor }}>No recommendations available.</p>
              )}
            </div>
          </div>

          {/* Charts row */}
          {hasCharts && (
            <div style={{
              borderTop: `1px solid ${outerBorder}`,
              padding: '12px 16px 14px',
            }}>
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp size={11} style={{ color: colors.accent }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: colors.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Visual Breakdown
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {m?.healthScore !== undefined && (
                  <HealthScoreBadge score={m.healthScore} label={m.healthLabel ?? 'Warning'} isDark={isDark} />
                )}
                {m?.distribution && m.distribution.length > 0 && (
                  <div style={{ flex: '1 1 180px', minWidth: 180 }}>
                    <MiniDonut data={m.distribution} isDark={isDark} />
                  </div>
                )}
                {m?.bars && m.bars.length > 0 && (
                  <div style={{ flex: '2 1 260px', minWidth: 200 }}>
                    <MiniBars data={m.bars} isDark={isDark} accent={colors.accent} />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
