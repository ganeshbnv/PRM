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
  bugs: 'Bug Analysis',
  engineers: 'Team Analysis',
  repos: 'Code Health',
  risks: 'Risk Analysis',
  wiki: 'Knowledge Base Analysis',
};

const SECTION_COLORS: Record<string, { accent: string; bg: string; border: string; badge: string }> = {
  bugs:      { accent: '#ef4444', bg: '#fef2f2', border: '#fecaca', badge: '#fee2e2' },
  engineers: { accent: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', badge: '#ede9fe' },
  repos:     { accent: '#0ea5e9', bg: '#f0f9ff', border: '#bae6fd', badge: '#e0f2fe' },
  risks:     { accent: '#f97316', bg: '#fff7ed', border: '#fed7aa', badge: '#ffedd5' },
  wiki:      { accent: '#10b981', bg: '#f0fdf4', border: '#bbf7d0', badge: '#dcfce7' },
};

function timeAgo(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime();
  if (ms < 60000)  return 'just now';
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  return `${Math.round(ms / 3600000)}h ago`;
}

export function AiSummaryStrip({ section }: Props) {
  const { filters } = useFilterStore();
  const [data, setData]         = useState<Analysis | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const colors = SECTION_COLORS[section] ?? SECTION_COLORS.bugs;
  const label  = SECTION_LABELS[section] ?? 'AI Analysis';

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

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-xl border mb-5 overflow-hidden" style={{ borderColor: colors.border, background: colors.bg }}>
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div className="w-5 h-5 rounded-md animate-pulse" style={{ background: colors.accent + '30' }} />
          <div className="h-3 w-24 rounded animate-pulse bg-gray-200" />
          <div className="ml-auto h-2 w-16 rounded animate-pulse bg-gray-200" />
        </div>
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-lg p-3 space-y-2 bg-white/60">
              <div className="h-2.5 w-20 rounded animate-pulse bg-gray-200" />
              <div className="h-2 w-full rounded animate-pulse bg-gray-200" />
              <div className="h-2 w-4/5 rounded animate-pulse bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-xl border mb-5 px-4 py-3 flex items-center gap-3"
        style={{ borderColor: '#fecaca', background: '#fef2f2' }}>
        <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#b91c1c' }}>AI analysis unavailable — {error}</span>
        <button onClick={() => load(true)} className="ml-auto text-xs underline" style={{ color: '#ef4444' }}>retry</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-xl border mb-5 overflow-hidden" style={{ borderColor: colors.border, background: colors.bg }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ borderBottom: expanded ? `1px solid ${colors.border}` : 'none' }}>
        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: colors.accent + '18', border: `1px solid ${colors.accent}30` }}>
          <Sparkles size={12} style={{ color: colors.accent }} />
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{label}</span>
        {data.fromCache && (
          <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 99, padding: '1px 8px', fontWeight: 500 }}>
            cached
          </span>
        )}
        <span style={{ fontSize: 10.5, color: '#94a3b8', marginLeft: 4 }}>
          Updated {timeAgo(data.generatedAt)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => load(true)}
            title="Refresh analysis"
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-black/5 transition-colors"
            style={{ color: '#94a3b8' }}
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-black/5 transition-colors"
            style={{ color: '#94a3b8' }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
          {/* Summary */}
          <div className="rounded-lg p-3.5 bg-white border" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-1.5 mb-2">
              <MessageSquare size={11} style={{ color: colors.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: colors.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Summary</span>
            </div>
            <p style={{ fontSize: 12.5, color: '#1e293b', lineHeight: 1.65 }}>
              {data.summary || 'No summary generated.'}
            </p>
          </div>

          {/* Key Findings */}
          <div className="rounded-lg p-3.5 bg-white border" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle size={11} style={{ color: colors.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: colors.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Key Findings</span>
            </div>
            {data.keyFindings.length > 0 ? (
              <ul className="space-y-1.5">
                {data.keyFindings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: colors.accent }} />
                    <span style={{ fontSize: 12, color: '#334155', lineHeight: 1.55 }}>{f}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 12, color: '#94a3b8' }}>No findings available.</p>
            )}
          </div>

          {/* Recommendations */}
          <div className="rounded-lg p-3.5 bg-white border" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb size={11} style={{ color: colors.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: colors.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Actions</span>
            </div>
            {data.recommendations.length > 0 ? (
              <ol className="space-y-1.5">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                      style={{ background: colors.badge, color: colors.accent, border: `1px solid ${colors.border}` }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 12, color: '#334155', lineHeight: 1.55 }}>{r}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: 12, color: '#94a3b8' }}>No recommendations available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
