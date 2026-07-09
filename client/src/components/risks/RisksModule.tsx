import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AlertTriangle, RefreshCw, Plus, ChevronDown, ChevronRight,
  Edit2, Trash2, X, Bot, User, Shield, Flame, TrendingUp, CheckCircle,
  Save, Link2, RotateCcw, CheckSquare,
} from 'lucide-react';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import type { RegisteredRisk, RiskSeverity, RiskStatus, RiskCategory } from '../../types';
import { AiSummaryStrip } from '../common/AiSummaryStrip';

// ── Constants ─────────────────────────────────────────────────────────────────

const SEV_ORDER: RiskSeverity[] = ['critical', 'high', 'medium', 'low'];

const SEV_STYLE: Record<RiskSeverity, { pill: string; dot: string; label: string }> = {
  critical: { pill: 'bg-red-100 text-red-700 border border-red-200',          dot: 'bg-red-500',    label: 'Critical' },
  high:     { pill: 'bg-orange-100 text-orange-700 border border-orange-200',  dot: 'bg-orange-500', label: 'High'     },
  medium:   { pill: 'bg-yellow-100 text-yellow-700 border border-yellow-200',  dot: 'bg-yellow-500', label: 'Medium'   },
  low:      { pill: 'bg-sky-100 text-sky-700 border border-sky-200',           dot: 'bg-sky-400',    label: 'Low'      },
};

const STATUS_FLOW: RiskStatus[] = ['open', 'mitigating', 'accepted', 'resolved'];

const STATUS_STYLE: Record<RiskStatus, { pill: string; icon: React.ReactNode; label: string }> = {
  open:       { pill: 'bg-red-50 text-red-600 border border-red-200',              icon: <Flame size={10} />,        label: 'Open'       },
  mitigating: { pill: 'bg-amber-50 text-amber-700 border border-amber-200',        icon: <TrendingUp size={10} />,   label: 'Mitigating' },
  accepted:   { pill: 'bg-slate-100 text-slate-600 border border-slate-200',       icon: <Shield size={10} />,       label: 'Accepted'   },
  resolved:   { pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',  icon: <CheckCircle size={10} />,  label: 'Resolved'   },
};

const CATEGORIES: { value: RiskCategory; label: string }[] = [
  { value: 'technical',  label: 'Technical'    },
  { value: 'resource',   label: 'Resource'     },
  { value: 'schedule',   label: 'Schedule'     },
  { value: 'external',   label: 'External'     },
  { value: 'board',      label: 'Board'        },
  { value: 'bug',        label: 'Bug'          },
  { value: 'pr',         label: 'Pull Request' },
  { value: 'wiki',       label: 'Wiki'         },
  { value: 'engineer',   label: 'Engineer'     },
  { value: 'pipeline',   label: 'Pipeline'     },
  { value: 'manual',     label: 'Manual'       },
];

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label])) as Record<string, string>;

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Risk Form ─────────────────────────────────────────────────────────────────

interface FormFields {
  title: string; description: string;
  severity: RiskSeverity; category: RiskCategory;
  status: RiskStatus;
  owner: string; impact: string; mitigation: string; dueDate: string;
}

const EMPTY_FORM: FormFields = {
  title: '', description: '', severity: 'high', category: 'technical',
  status: 'open', owner: '', impact: '', mitigation: '', dueDate: '',
};

function RiskFormModal({ initial, heading, isEdit, onSave, onClose }: {
  initial?: FormFields;
  heading: string;
  isEdit?: boolean;
  onSave: (f: FormFields) => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState<FormFields>(initial ?? EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof FormFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF(prev => ({ ...prev, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim())       { setErr('Title is required.'); return; }
    if (!f.description.trim()) { setErr('Description is required.'); return; }
    setBusy(true); setErr('');
    try { await onSave(f); } catch (ex: any) { setErr(ex.message); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">{heading}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{err}</div>}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Risk Title <span className="text-red-500">*</span></label>
            <input value={f.title} onChange={set('title')} placeholder="e.g. Key engineer leaving before release"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Description <span className="text-red-500">*</span></label>
            <textarea value={f.description} onChange={set('description')} rows={3}
              placeholder="What is the risk, what triggers it?"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Severity</label>
              <select value={f.severity} onChange={set('severity')}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 bg-white outline-none focus:border-indigo-400">
                {SEV_ORDER.map(s => <option key={s} value={s}>{SEV_STYLE[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Category</label>
              <select value={f.category} onChange={set('category')}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 bg-white outline-none focus:border-indigo-400">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {isEdit && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Status</label>
                <select value={f.status} onChange={set('status')}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 bg-white outline-none focus:border-indigo-400">
                  {STATUS_FLOW.map(s => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
                </select>
              </div>
            )}
            <div className={isEdit ? '' : 'col-span-2'}>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Owner</label>
              <input value={f.owner} onChange={set('owner')} placeholder="Name or team"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Due Date</label>
              <input type="date" value={f.dueDate} onChange={set('dueDate')}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Impact</label>
            <textarea value={f.impact} onChange={set('impact')} rows={2}
              placeholder="What happens if this risk occurs?"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Mitigation Plan</label>
            <textarea value={f.mitigation} onChange={set('mitigation')} rows={2}
              placeholder="What actions reduce or eliminate this risk?"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 resize-none" />
          </div>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50">
            <Save size={13} /> {busy ? 'Saving…' : 'Save Risk'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status Dropdown ───────────────────────────────────────────────────────────

function StatusPill({ risk, onUpdate }: { risk: RegisteredRisk; onUpdate: (id: string, s: RiskStatus) => void }) {
  const [open, setOpen] = useState(false);
  const s = STATUS_STYLE[risk.status];
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-full text-xs font-medium cursor-pointer select-none ${s.pill}`}>
        {s.icon} {s.label} <ChevronDown size={9} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden w-36">
            {STATUS_FLOW.map(st => (
              <button key={st} onClick={() => { onUpdate(risk.id, st); setOpen(false); }}
                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-xs hover:bg-slate-50 ${st === risk.status ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                {STATUS_STYLE[st].icon} {STATUS_STYLE[st].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Expanded Detail ───────────────────────────────────────────────────────────

function ExpandedDetail({ risk, colSpan }: { risk: RegisteredRisk; colSpan: number }) {
  return (
    <tr className="bg-indigo-50/30 border-b border-slate-100">
      <td colSpan={colSpan} className="px-5 py-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Description</p>
            <p className="text-slate-700 leading-relaxed">{risk.description}</p>
          </div>
          {(risk.impact || risk.mitigation) && (
            <div className="space-y-3">
              {risk.impact && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Impact</p>
                  <p className="text-slate-700">{risk.impact}</p>
                </div>
              )}
              {risk.mitigation && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Mitigation Plan</p>
                  <p className="text-slate-700">{risk.mitigation}</p>
                </div>
              )}
            </div>
          )}
        </div>
        {risk.artifactId && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-indigo-600">
            <Link2 size={11} /> Linked: {risk.artifactType} #{risk.artifactId}
          </div>
        )}
        <div className="mt-3 pt-2 border-t border-slate-200 flex items-center gap-5 text-[11px] text-slate-400">
          <span>Detected: {fmtDate(risk.detectedAt)}</span>
          <span>Updated: {fmtDate(risk.updatedAt)}</span>
          {risk.createdBy && <span>By: {risk.createdBy}</span>}
        </div>
      </td>
    </tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type SourceFilter = 'all' | 'ai' | 'manual';

export function RisksModule() {
  const { filters } = useFilterStore();
  const project = filters.project;

  const [risks, setRisks]       = useState<RegisteredRisk[]>([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [bgSyncing, setBgSyncing] = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding]     = useState(false);
  const [editing, setEditing]   = useState<RegisteredRisk | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filters — default: manual source, all statuses
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('manual');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sevFilter, setSevFilter]       = useState<string>('all');
  const [search, setSearch]             = useState('');

  // Load stored register (fast, no ADO call)
  const load = useCallback(async (quiet = false) => {
    if (!project) return;
    if (!quiet) setLoading(true);
    try {
      const data = await api.getRiskRegister(project);
      setRisks(data);
      setError('');
    } catch (ex: any) {
      if (!quiet) setError(ex.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [project]);

  // Background AI sync — fires silently after initial load
  const bgSyncRef = useRef(false);
  const bgSync = useCallback(async () => {
    if (!project || bgSyncRef.current) return;
    bgSyncRef.current = true;
    setBgSyncing(true);
    try {
      const data = await api.syncRisks(project);
      setRisks(data);
    } catch {
      // silent — background failure doesn't show an error
    } finally {
      setBgSyncing(false);
    }
  }, [project]);

  // Explicit re-scan button
  const sync = useCallback(async () => {
    if (!project) return;
    setSyncing(true);
    try {
      const data = await api.syncRisks(project);
      setRisks(data);
      setError('');
    } catch (ex: any) {
      setError('AI scan failed: ' + ex.message);
    } finally {
      setSyncing(false);
    }
  }, [project]);

  useEffect(() => {
    bgSyncRef.current = false;
    load().then(() => bgSync());
  }, [load, bgSync]);

  // Clear selection when filter changes
  useEffect(() => { setSelected(new Set()); }, [sourceFilter, statusFilter, sevFilter, search]);

  const filtered = useMemo(() => {
    const SEV: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const ST:  Record<RiskStatus,   number> = { open: 0, mitigating: 1, accepted: 2, resolved: 3 };
    let r = [...risks];
    if (sourceFilter !== 'all') r = r.filter(x => x.source === sourceFilter);
    if (statusFilter !== 'all') r = r.filter(x => x.status === statusFilter);
    if (sevFilter !== 'all')    r = r.filter(x => x.severity === sevFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x =>
        x.title.toLowerCase().includes(q) ||
        x.description.toLowerCase().includes(q) ||
        (x.owner ?? '').toLowerCase().includes(q) ||
        x.displayId.toLowerCase().includes(q)
      );
    }
    return r.sort((a, b) => ST[a.status] - ST[b.status] || SEV[a.severity] - SEV[b.severity]);
  }, [risks, sourceFilter, statusFilter, sevFilter, search]);

  const counts = useMemo(() => ({
    open:       risks.filter(r => r.status === 'open').length,
    mitigating: risks.filter(r => r.status === 'mitigating').length,
    accepted:   risks.filter(r => r.status === 'accepted').length,
    resolved:   risks.filter(r => r.status === 'resolved').length,
    critical:   risks.filter(r => r.severity === 'critical').length,
    high:       risks.filter(r => r.severity === 'high').length,
    ai:         risks.filter(r => r.source === 'ai').length,
    manual:     risks.filter(r => r.source === 'manual').length,
  }), [risks]);

  // Selection helpers
  const allFilteredIds   = filtered.map(r => r.id);
  const allSelected      = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id));
  const someSelected     = allFilteredIds.some(id => selected.has(id));
  const selectedInView   = filtered.filter(r => selected.has(r.id));
  const canBulkResolve   = selectedInView.some(r => r.status !== 'resolved');
  const canBulkReopen    = selectedInView.some(r => r.status === 'resolved' || r.status === 'accepted');

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allFilteredIds));
    }
  }

  // Bulk status update
  const [bulkBusy, setBulkBusy] = useState(false);
  async function bulkUpdateStatus(status: RiskStatus) {
    const ids = [...selected];
    setBulkBusy(true);
    try {
      await Promise.all(ids.map(id => api.updateRisk(project, id, { status })));
      const now = new Date().toISOString();
      setRisks(prev => prev.map(r => ids.includes(r.id) ? { ...r, status, updatedAt: now } : r));
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  // Single status update (from pill dropdown)
  async function handleStatusUpdate(id: string, status: RiskStatus) {
    await api.updateRisk(project, id, { status });
    setRisks(prev => prev.map(r => r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r));
  }

  async function handleAdd(f: FormFields) {
    await api.createRisk(project, f);
    await load(true);
    setAdding(false);
  }

  async function handleEdit(f: FormFields) {
    if (!editing) return;
    await api.updateRisk(project, editing.id, f);
    await load(true);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    await api.deleteRisk(project, id);
    setRisks(prev => prev.filter(r => r.id !== id));
    setDeleting(null);
  }

  const editInitial: FormFields | undefined = editing ? {
    title: editing.title, description: editing.description,
    severity: editing.severity, category: editing.category as RiskCategory,
    status: editing.status, owner: editing.owner ?? '',
    impact: editing.impact ?? '', mitigation: editing.mitigation ?? '',
    dueDate: editing.dueDate ?? '',
  } : undefined;

  const COL_SPAN = 11; // checkbox + expand + id + risk + sev + cat + status + owner + due + source + actions

  return (
    <div className="p-6 space-y-4">
      <AiSummaryStrip section="risks" />

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle size={20} className="text-orange-500" />
            Risk Register
            {bgSyncing && (
              <span className="flex items-center gap-1 text-xs font-normal text-slate-400 ml-1">
                <RefreshCw size={11} className="animate-spin" /> syncing AI…
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {risks.length} total · {counts.ai} AI-detected · {counts.manual} manual
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={sync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Scanning…' : 'Scan for AI Risks'}
          </button>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors">
            <Plus size={15} /> Add Manual Risk
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-4 gap-3">
        {([
          ['open',       counts.open,       'border-l-red-500',     'text-red-600',     'bg-red-50/50'    ],
          ['mitigating', counts.mitigating, 'border-l-amber-500',   'text-amber-700',   'bg-amber-50/50'  ],
          ['accepted',   counts.accepted,   'border-l-slate-400',   'text-slate-600',   'bg-slate-50'     ],
          ['resolved',   counts.resolved,   'border-l-emerald-500', 'text-emerald-700', 'bg-emerald-50/50'],
        ] as const).map(([key, val, border, num, bg]) => (
          <button key={key}
            onClick={() => setStatusFilter(p => p === key ? 'all' : key)}
            className={`${bg} border border-slate-200 border-l-4 ${border} rounded-xl px-4 py-3 text-left hover:brightness-95 transition-all ${statusFilter === key ? 'ring-2 ring-indigo-300' : ''}`}>
            <p className={`text-2xl font-bold ${num}`}>{val}</p>
            <p className="text-xs text-slate-500 mt-0.5 capitalize">{key}</p>
          </button>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2.5">
        {/* Row 1: Source + Status */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Source filter — prominent */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            {([['all', 'All Risks'], ['manual', 'Manual'], ['ai', 'AI Detected']] as [SourceFilter, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setSourceFilter(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  sourceFilter === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {v === 'manual' ? <User size={11} /> : v === 'ai' ? <Bot size={11} /> : null}
                {label}
                <span className={`text-[10px] font-bold px-1 rounded-full ${sourceFilter === v ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
                  {v === 'all' ? risks.length : v === 'manual' ? counts.manual : counts.ai}
                </span>
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-slate-200" />

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Status:</span>
            {(['all', ...STATUS_FLOW] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs rounded-full capitalize transition-colors ${
                  statusFilter === s ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
                {s === 'all' ? 'All' : STATUS_STYLE[s].label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-slate-200" />

          {/* Severity filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Severity:</span>
            {(['all', ...SEV_ORDER] as const).map(s => (
              <button key={s} onClick={() => setSevFilter(s)}
                className={`px-2.5 py-1 text-xs rounded-full capitalize transition-colors ${
                  sevFilter === s ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
                {s === 'all' ? 'All' : SEV_STYLE[s].label}
              </button>
            ))}
          </div>

          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search title, owner, ID…"
            className="ml-auto px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white text-slate-800 w-52" />
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
          <button onClick={() => load()} className="ml-auto text-xs underline">Retry</button>
        </div>
      )}

      {/* ── Bulk Action Bar ── */}
      {someSelected && (
        <div className="sticky top-4 z-30 bg-indigo-700 text-white rounded-xl px-5 py-3 flex items-center gap-4 shadow-lg">
          <CheckSquare size={16} className="shrink-0" />
          <span className="text-sm font-semibold">{selectedInView.length} risk{selectedInView.length > 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-2 ml-2">
            {canBulkResolve && (
              <button onClick={() => bulkUpdateStatus('resolved')} disabled={bulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 rounded-lg disabled:opacity-50 transition-colors">
                <CheckCircle size={13} /> Resolve Selected
              </button>
            )}
            {canBulkReopen && (
              <button onClick={() => bulkUpdateStatus('open')} disabled={bulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg disabled:opacity-50 transition-colors">
                <RotateCcw size={13} /> Reopen Selected
              </button>
            )}
            <button onClick={() => bulkUpdateStatus('mitigating')} disabled={bulkBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg disabled:opacity-50 transition-colors">
              <TrendingUp size={13} /> Mark Mitigating
            </button>
          </div>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {/* Select all */}
                  <th className="w-10 px-3 py-3">
                    {filtered.length > 0 && (
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer accent-indigo-600" />
                    )}
                  </th>
                  <th className="w-8 px-1 py-3" />
                  <th className="px-3 py-3 text-left whitespace-nowrap">ID</th>
                  <th className="px-3 py-3 text-left">Risk</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Severity</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Category</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Status</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Owner</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Due Date</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Source</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={COL_SPAN} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Shield size={36} className="opacity-25" />
                        <p className="font-medium text-slate-500">
                          {risks.length === 0
                            ? 'No risks in register yet'
                            : sourceFilter === 'manual'
                              ? 'No manual risks — add one below'
                              : 'No risks match the current filters'}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <button onClick={() => setAdding(true)}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
                            <Plus size={13} /> Add Manual Risk
                          </button>
                          {risks.length === 0 && (
                            <>
                              <span className="text-xs text-slate-400">or</span>
                              <button onClick={sync}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                                <RefreshCw size={13} /> Scan for AI Risks
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}

                {filtered.map(risk => {
                  const isOverdue = !!(risk.dueDate
                    && risk.status !== 'resolved' && risk.status !== 'accepted'
                    && new Date(risk.dueDate) < new Date());
                  const isChecked  = selected.has(risk.id);
                  const isExpanded = expanded === risk.id;

                  return (
                    <>
                      <tr key={risk.id}
                        className={`border-b border-slate-100 transition-colors ${
                          isChecked   ? 'bg-indigo-50/40' :
                          isExpanded  ? 'bg-slate-50/80' :
                          'hover:bg-slate-50/60'}`}>

                        {/* Checkbox */}
                        <td className="px-3 py-3 w-10">
                          <input type="checkbox" checked={isChecked} onChange={() => toggleOne(risk.id)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer accent-indigo-600" />
                        </td>

                        {/* Expand */}
                        <td className="px-1 py-3 w-8">
                          <button onClick={() => setExpanded(e => e === risk.id ? null : risk.id)}
                            className="text-slate-300 hover:text-indigo-500 transition-colors">
                            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        </td>

                        {/* ID */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-mono text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {risk.displayId}
                          </span>
                        </td>

                        {/* Title */}
                        <td className="px-3 py-3 max-w-sm">
                          <p className="text-sm font-medium text-slate-800 line-clamp-1">{risk.title}</p>
                          {risk.mitigation && (
                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 italic">
                              Mitigation: {risk.mitigation}
                            </p>
                          )}
                        </td>

                        {/* Severity */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${SEV_STYLE[risk.severity].pill}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEV_STYLE[risk.severity].dot}`} />
                            {SEV_STYLE[risk.severity].label}
                          </span>
                        </td>

                        {/* Category */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs text-slate-500">{CAT_MAP[risk.category] ?? risk.category}</span>
                        </td>

                        {/* Status pill */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <StatusPill risk={risk} onUpdate={handleStatusUpdate} />
                        </td>

                        {/* Owner */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs text-slate-600">
                            {risk.owner || <span className="text-slate-300 italic">—</span>}
                          </span>
                        </td>

                        {/* Due Date */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                            {risk.dueDate ? (isOverdue ? '⚠ ' : '') + fmtDate(risk.dueDate) : '—'}
                          </span>
                        </td>

                        {/* Source */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            risk.source === 'ai' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {risk.source === 'ai' ? <Bot size={10} /> : <User size={10} />}
                            {risk.source === 'ai' ? 'AI' : 'Manual'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-0.5">
                            {/* Undo resolve — prominent on resolved rows */}
                            {risk.status === 'resolved' && (
                              <button onClick={() => handleStatusUpdate(risk.id, 'open')}
                                title="Reopen"
                                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg border border-slate-200 hover:border-amber-200 transition-colors mr-1">
                                <RotateCcw size={11} /> Reopen
                              </button>
                            )}
                            <button onClick={() => setEditing(risk)} title="Edit"
                              className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                              <Edit2 size={13} />
                            </button>
                            {risk.source === 'manual' && (
                              <button onClick={() => setDeleting(risk.id)} title="Delete"
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && <ExpandedDetail key={`exp-${risk.id}`} risk={risk} colSpan={COL_SPAN} />}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-400">
            <span>
              {someSelected
                ? `${selectedInView.length} of ${filtered.length} selected`
                : `${filtered.length} of ${risks.length} risks`}
            </span>
            <span>{counts.critical} critical · {counts.high} high</span>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {adding && (
        <RiskFormModal heading="Add Manual Risk" onSave={handleAdd} onClose={() => setAdding(false)} />
      )}

      {editing && (
        <RiskFormModal
          heading={`Edit — ${editing.displayId}`}
          initial={editInitial} isEdit
          onSave={handleEdit} onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-slate-800 mb-2">Delete this risk?</h3>
            <p className="text-sm text-slate-500 mb-5">
              Permanent. To keep it in the register, mark it as Resolved instead.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleting(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
              <button onClick={() => handleDelete(deleting)}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
