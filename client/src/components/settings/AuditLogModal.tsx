import { useState, useEffect, useCallback } from 'react';
import { X, Shield, RefreshCw, Search, ChevronLeft, ChevronRight, Download, AlertTriangle, LogIn, UserPlus, UserX, UserCog, Eye, Cpu, BarChart2 } from 'lucide-react';
import { api, type AuditEntry, type AuditStats } from '../../api/client';
import { format, formatDistanceToNow } from 'date-fns';

interface Props { onClose: () => void }

const ACTION_META: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  LOGIN_SUCCESS:             { label: 'Signed in',          color: '#16a34a', bg: '#f0fdf4', Icon: LogIn },
  LOGIN_FAILED:              { label: 'Failed login',        color: '#dc2626', bg: '#fef2f2', Icon: AlertTriangle },
  PASSWORD_RESET_REQUESTED:  { label: 'Password reset req.', color: '#2563eb', bg: '#eff6ff', Icon: UserCog },
  PASSWORD_RESET_COMPLETED:  { label: 'Password reset done', color: '#2563eb', bg: '#eff6ff', Icon: UserCog },
  USER_INVITED:              { label: 'User invited',        color: '#7c3aed', bg: '#f5f3ff', Icon: UserPlus },
  USER_ROLE_CHANGED:         { label: 'Role changed',        color: '#7c3aed', bg: '#f5f3ff', Icon: UserCog },
  USER_DELETED:              { label: 'User deleted',        color: '#dc2626', bg: '#fef2f2', Icon: UserX },
  SECTION_VISITED:           { label: 'Viewed section',      color: '#475569', bg: '#f8fafc', Icon: Eye },
  AI_QUERY:                  { label: 'AI query',            color: '#6d28d9', bg: '#f5f3ff', Icon: Cpu },
  AI_ANALYSIS:               { label: 'AI analysis',         color: '#6d28d9', bg: '#f5f3ff', Icon: BarChart2 },
};

const ALL_ACTIONS = Object.keys(ACTION_META);
const PAGE_SIZE = 50;

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 800, color: color ?? '#0f172a', lineHeight: 1.1, marginTop: 4 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, color: '#475569', bg: '#f8fafc', Icon: Eye };
  const { label, color, bg, Icon } = meta;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: bg, color, border: `1px solid ${color}22` }}>
      <Icon size={10} />
      {label}
    </span>
  );
}

function ago(ts: string) {
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); } catch { return ts; }
}

function fmtTs(ts: string) {
  try { return format(new Date(ts), 'MMM d, HH:mm:ss'); } catch { return ts; }
}

function shortUA(ua: string): string {
  if (!ua) return '—';
  if (ua.includes('Chrome'))  return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('curl'))    return 'curl';
  return ua.slice(0, 20);
}

export function AuditLogModal({ onClose }: Props) {
  const [stats,    setStats]    = useState<AuditStats | null>(null);
  const [entries,  setEntries]  = useState<AuditEntry[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [filterAction,  setFilterAction]  = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate,   setFilterToDate]   = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadStats = useCallback(() => {
    api.getAuditStats().then(setStats).catch(() => {});
  }, []);

  const loadEntries = useCallback(() => {
    setLoading(true);
    api.getAuditLog({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      search:  search  || undefined,
      action:  filterAction  || undefined,
      section: filterSection || undefined,
      fromTs:  filterFromDate || undefined,
      toTs:    filterToDate   || undefined,
    }).then(r => {
      setEntries(r.entries);
      setTotal(r.total);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [page, search, filterAction, filterSection, filterFromDate, filterToDate]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, filterAction, filterSection, filterFromDate, filterToDate]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function downloadJSON() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.json`; a.click();
  }

  const sections = stats ? Object.keys(stats.sectionCounts).sort((a,b) => stats.sectionCounts[b] - stats.sectionCounts[a]) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-[98vw] h-[96vh] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-white">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center flex-shrink-0">
            <Shield size={16} style={{ color: '#fff' }} />
          </div>
          <div>
            <h2 style={{ color: '#0f172a', fontWeight: 800, fontSize: 15 }}>Audit Log</h2>
            <p style={{ color: '#64748b', fontSize: 11.5, marginTop: 1 }}>
              Full activity history · {total.toLocaleString()} events
              {stats?.lastEntry && ` · Last: ${ago(stats.lastEntry)}`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { loadStats(); loadEntries(); }}
              title="Refresh"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
              style={{ color: '#64748b' }}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={downloadJSON}
              title="Export current page as JSON"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
              style={{ color: '#64748b' }}>
              <Download size={13} />
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
              style={{ color: '#64748b' }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        {stats && (
          <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-5 gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
            <StatCard label="Total events"   value={stats.total.toLocaleString()} />
            <StatCard label="Today"          value={stats.todayCount} sub="events" />
            <StatCard label="Active users"   value={stats.activeUsers} sub="last 7 days" />
            <StatCard label="Logins today"   value={stats.loginsToday} color="#16a34a" />
            <StatCard label="Failed logins"  value={stats.loginsFailed} sub="last 7 days" color={stats.loginsFailed > 0 ? '#dc2626' : '#16a34a'} />
          </div>
        )}

        {/* ── Filter bar ── */}
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-6 py-3 border-b border-gray-100 bg-white">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search email, action, section…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-brand-400 focus:bg-white"
            />
          </div>

          {/* Action filter */}
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-brand-400 text-gray-600">
            <option value="">All actions</option>
            {ALL_ACTIONS.map(a => <option key={a} value={a}>{ACTION_META[a].label}</option>)}
          </select>

          {/* Section filter */}
          {sections.length > 0 && (
            <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-brand-400 text-gray-600">
              <option value="">All sections</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {/* Date range */}
          <input type="date" value={filterFromDate} onChange={e => setFilterFromDate(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-brand-400 text-gray-600" />
          <span style={{ color: '#94a3b8', fontSize: 11 }}>to</span>
          <input type="date" value={filterToDate} onChange={e => setFilterToDate(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-brand-400 text-gray-600" />

          {/* Clear */}
          {(search || filterAction || filterSection || filterFromDate || filterToDate) && (
            <button onClick={() => { setSearch(''); setFilterAction(''); setFilterSection(''); setFilterFromDate(''); setFilterToDate(''); }}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-colors">
              Clear filters
            </button>
          )}

          <span className="ml-auto text-xs text-gray-400">{total.toLocaleString()} results</span>
        </div>

        {/* ── Table ── */}
        <div className="flex-1 overflow-y-auto">
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw size={20} className="animate-spin text-gray-300" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <Shield size={24} className="text-gray-200" />
              <p style={{ color: '#94a3b8', fontSize: 13 }}>No audit events match your filters.</p>
            </div>
          ) : (
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0 }}>
                  {['Time', 'User', 'Action', 'Section', 'IP', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700,
                      color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, idx) => {
                  const isOpen = expanded === e.id;
                  const bg = isOpen ? '#f8fafc' : (idx % 2 === 0 ? '#ffffff' : '#fafafa');
                  return (
                    <>
                      <tr key={e.id}
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                        style={{ background: bg, borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                        className="hover:bg-blue-50 transition-colors">
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#475569' }}>
                          <div style={{ fontWeight: 500 }}>{fmtTs(e.ts)}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{ago(e.ts)}</div>
                        </td>
                        <td style={{ padding: '9px 12px', minWidth: 160 }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{e.userName || '—'}</div>
                          <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{e.userEmail || 'unknown'}</div>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <ActionBadge action={e.action} />
                        </td>
                        <td style={{ padding: '9px 12px', color: '#475569', fontWeight: 500 }}>{e.section}</td>
                        <td style={{ padding: '9px 12px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>
                          {e.ip || '—'}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                            color: e.status >= 400 ? '#dc2626' : e.status >= 200 ? '#16a34a' : '#64748b',
                          }}>
                            {e.status || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 8px', width: 24 }}>
                          {(e.detail || e.userAgent) && (
                            <span style={{ color: '#94a3b8', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${e.id}-detail`} style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <td colSpan={7} style={{ padding: '8px 12px 12px 12px' }}>
                            <div className="flex flex-wrap gap-4 text-xs">
                              {e.detail && (
                                <div>
                                  <span style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>Detail</span>
                                  <p style={{ marginTop: 3, color: '#1e293b', maxWidth: 600 }}>{e.detail}</p>
                                </div>
                              )}
                              <div>
                                <span style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>Browser</span>
                                <p style={{ marginTop: 3, color: '#475569' }}>{shortUA(e.userAgent)}</p>
                              </div>
                              <div>
                                <span style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>Resource</span>
                                <p style={{ marginTop: 3, color: '#475569', fontFamily: 'monospace', fontSize: 11 }}>{e.resource}</p>
                              </div>
                              <div>
                                <span style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>Entry ID</span>
                                <p style={{ marginTop: 3, color: '#94a3b8', fontFamily: 'monospace', fontSize: 10 }}>{e.id}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="w-7 h-7 rounded-lg flex items-center justify-center border border-gray-200 disabled:opacity-40 hover:bg-white transition-colors"
                style={{ color: '#475569' }}>
                <ChevronLeft size={13} />
              </button>
              <span style={{ fontSize: 12, color: '#475569', minWidth: 80, textAlign: 'center' }}>
                Page {page + 1} of {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="w-7 h-7 rounded-lg flex items-center justify-center border border-gray-200 disabled:opacity-40 hover:bg-white transition-colors"
                style={{ color: '#475569' }}>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
