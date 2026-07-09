import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Lightbulb, MessageSquare } from 'lucide-react';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';

type Analysis = {
  section: string;
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  generatedAt: string;
  fromCache?: boolean;
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

function timeAgo(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime();
  if (ms < 60000)   return 'just now';
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  return `${Math.round(ms / 3600000)}h ago`;
}

// Watch html.dark class changes
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

  // Resolved colours that flip with dark mode
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

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-xl border mb-5 overflow-hidden" style={{ borderColor: outerBorder, background: outerBg }}>
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div className="w-5 h-5 rounded-md animate-pulse" style={{ background: colors.accent + '30' }} />
          <div className="h-3 w-24 rounded animate-pulse" style={{ background: isDark ? '#2a2c46' : '#e2e8f0' }} />
          <div className="ml-auto h-2 w-16 rounded animate-pulse" style={{ background: isDark ? '#2a2c46' : '#e2e8f0' }} />
        </div>
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-lg p-3 space-y-2" style={{ background: cardBg }}>
              <div className="h-2.5 w-20 rounded animate-pulse" style={{ background: isDark ? '#2a2c46' : '#e2e8f0' }} />
              <div className="h-2 w-full rounded animate-pulse"  style={{ background: isDark ? '#2a2c46' : '#e2e8f0' }} />
              <div className="h-2 w-4/5 rounded animate-pulse"  style={{ background: isDark ? '#2a2c46' : '#e2e8f0' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
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
      )}
    </div>
  );
}
