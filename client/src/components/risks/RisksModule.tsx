import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle, RefreshCw, Plus, ChevronDown, ChevronRight,
  Edit2, Trash2, X, Bot, User, Shield, Flame, TrendingUp, CheckCircle,
  Save, Link2,
} from 'lucide-react';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import type { RegisteredRisk, RiskSeverity, RiskStatus, RiskCategory } from '../../types';
import { AiSummaryStrip } from '../common/AiSummaryStrip';

// ── Constants ────────────────────────────────────────────────────────────────

const SEV_ORDER: RiskSeverity[] = ['critical', 'high', 'medium', 'low'];

const SEV_STYLE: Record<RiskSeverity, { pill: string; dot: string; label: string }> = {
  critical: { pill: 'bg-red-100 text-red-700 border border-red-200',      dot: 'bg-red-500',    label: 'Critical' },
  high:     { pill: 'bg-orange-100 text-orange-700 border border-orange-200', dot: 'bg-orange-500', label: 'High'     },
  medium:   { pill: 'bg-yellow-100 text-yellow-700 border border-yellow-200', dot: 'bg-yellow-500', label: 'Medium'   },
  low:      { pill: 'bg-sky-100 text-sky-700 border border-sky-200',       dot: 'bg-sky-400',    label: 'Low'      },
};

const STATUS_FLOW: RiskStatus[] = ['open', 'mitigating', 'accepted', 'resolved'];

const STATUS_STYLE: Record<RiskStatus, { pill: string; icon: React.ReactNode; label: string }> = {
  open:       { pill: 'bg-red-50 text-red-600 border border-red-200',        icon: <Flame size={10} />,       label: 'Open'       },
  mitigating: { pill: 'bg-amber-50 text-amber-700 border border-amber-200',  icon: <TrendingUp size={10} />,  label: 'Mitigating' },
  accepted:   { pill: 'bg-slate-100 text-slate-600 border border-slate-200', icon: <Shield size={10} />,      label: 'Accepted'   },
  resolved:   { pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: <CheckCircle size={10} />, label: 'Resolved' },
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

// ── Risk Form (Add / Edit) ────────────────────────────────────────────────────

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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">{heading}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
        </div>

        {/* Body */}
        <form onSubmit={submit} className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{err}</div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Risk Title <span className="text-red-500">*</span></label>
            <input value={f.title} onChange={set('title')} placeholder="e.g. Key engineer leaving before release"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Description <span className="text-red-500">*</span></label>
            <textarea value={f.description} onChange={set('description')} rows={3}
              placeholder="What is the risk, what triggers it?"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 resize-none" />
          </div>

          {/* Severity + Category */}
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

          {/* Status (edit only) + Owner + Due Date */}
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

          {/* Impact */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Impact</label>
            <textarea value={f.impact} onChange={set('impact')} rows={2}
              placeholder="What happens if this risk occurs?"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 resize-none" />
          </div>

          {/* Mitigation */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Mitigation Plan</label>
            <textarea value={f.mitigation} onChange={set('mitigation')} rows={2}
              placeholder="What actions reduce or eliminate this risk?"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 resize-none" />
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
            Cancel
          </button>
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
                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-xs hover:bg-slate-50 ${st === risk.status ? 'font-semibold' : 'text-slate-600'}`}>
                {STATUS_STYLE[st].icon} {STATUS_STYLE[st].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Expanded Row Detail ───────────────────────────────────────────────────────

function ExpandedDetail({ risk }: { risk: RegisteredRisk }) {
  return (
    <tr className="bg-indigo-50/30 border-b border-slate-100">
      <td />
      <td colSpan={9} className="px-5 py-4">
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

export function RisksModule() {
  const { filters } = useFilterStore();
  const project = filters.project;

  const [risks, setRisks]         = useState<RegisteredRisk[]>([]);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [error, setError]         = useState('');
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [adding, setAdding]       = useState(false);
  const [editing, setEditing]     = useState<RegisteredRisk | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);

  // Filters
  const [sevFilter, setSevFilter]       = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [search, setSearch]             = useState('');

  const load = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const data = await api.getRiskRegister(project);
      setRisks(data);
      setError('');
    } catch (ex: any) {
      setError(ex.message);
    } finally {
      setLoading(false);
    }
  }, [project]);

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

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const SEV: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const ST:  Record<RiskStatus, number>   = { open: 0, mitigating: 1, accepted: 2, resolved: 3 };
    let r = [...risks];
    if (sevFilter !== 'all')    r = r.filter(x => x.severity === sevFilter);
    if (statusFilter !== 'all') r = r.filter(x => x.status === statusFilter);
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
  }, [risks, sevFilter, statusFilter, search]);

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

  async function handleAdd(f: FormFields) {
    await api.createRisk(project, f);
    await load();
    setAdding(false);
  }

  async function handleEdit(f: FormFields) {
    if (!editing) return;
    await api.updateRisk(project, editing.id, f);
    await load();
    setEditing(null);
  }

  async function handleStatusUpdate(id: string, status: RiskStatus) {
    await api.updateRisk(project, id, { status });
    setRisks(prev => prev.map(r => r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r));
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

  return (
    <div className="p-6 space-y-4">
      {/* AI Strip */}
      <AiSummaryStrip section="risks" />

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle size={20} className="text-orange-500" />
            Risk Register
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {risks.length} risks total · {counts.ai} AI-detected · {counts.manual} manual
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={sync} disabled={syncing}
            title="Scan ADO for new risks"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Scanning…' : 'Scan for AI Risks'}
          </button>

          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-colors">
            <Plus size={15} />
            Add Manual Risk
          </button>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Open',       val: counts.open,       color: 'border-l-red-500',     num: 'text-red-600',     bg: 'bg-red-50/50'     },
          { label: 'Mitigating', val: counts.mitigating, color: 'border-l-amber-500',   num: 'text-amber-700',   bg: 'bg-amber-50/50'   },
          { label: 'Accepted',   val: counts.accepted,   color: 'border-l-slate-400',   num: 'text-slate-600',   bg: 'bg-slate-50'      },
          { label: 'Resolved',   val: counts.resolved,   color: 'border-l-emerald-500', num: 'text-emerald-700', bg: 'bg-emerald-50/50' },
        ].map(s => (
          <button key={s.label}
            onClick={() => setStatusFilter(statusFilter === s.label.toLowerCase() ? 'all' : s.label.toLowerCase())}
            className={`${s.bg} border border-slate-200 border-l-4 ${s.color} rounded-xl px-4 py-3 text-left hover:brightness-95 transition-all ${statusFilter === s.label.toLowerCase() ? 'ring-2 ring-indigo-300' : ''}`}>
            <p className={`text-2xl font-bold ${s.num}`}>{s.val}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-xl px-4 py-3">
        {/* Status quick-filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 font-medium">Status:</span>
          {(['all', ...STATUS_FLOW] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 text-xs rounded-full capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
              {s === 'all' ? 'All' : STATUS_STYLE[s].label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-slate-200" />

        {/* Severity quick-filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 font-medium">Severity:</span>
          {(['all', ...SEV_ORDER] as const).map(s => (
            <button key={s} onClick={() => setSevFilter(s)}
              className={`px-2.5 py-1 text-xs rounded-full capitalize transition-colors ${
                sevFilter === s
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
              {s === 'all' ? 'All' : SEV_STYLE[s].label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, owner, ID…"
          className="ml-auto px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white text-slate-800 w-52" />
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
          <button onClick={load} className="ml-auto text-xs underline">Retry</button>
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
                  <th className="w-8 px-3 py-3" />
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
                    <td colSpan={10} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Shield size={36} className="opacity-25" />
                        <p className="font-medium text-slate-500">
                          {risks.length === 0 ? 'No risks in register yet' : 'No risks match the current filters'}
                        </p>
                        {risks.length === 0 && (
                          <div className="flex items-center gap-3 mt-1">
                            <button onClick={() => setAdding(true)}
                              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
                              <Plus size={13} /> Add Manual Risk
                            </button>
                            <span className="text-xs text-slate-400">or</span>
                            <button onClick={sync}
                              className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                              <RefreshCw size={13} /> Scan for AI Risks
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.map(risk => {
                  const isOverdue = risk.dueDate
                    && risk.status !== 'resolved' && risk.status !== 'accepted'
                    && new Date(risk.dueDate) < new Date();

                  return (
                    <>
                      <tr key={risk.id}
                        className={`border-b border-slate-100 hover:bg-slate-50/70 transition-colors ${expanded === risk.id ? 'bg-indigo-50/20' : ''}`}>
                        {/* Expand toggle */}
                        <td className="px-3 py-3">
                          <button onClick={() => setExpanded(e => e === risk.id ? null : risk.id)}
                            className="text-slate-300 hover:text-indigo-500 transition-colors">
                            {expanded === risk.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
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
                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 italic">Mitigation: {risk.mitigation}</p>
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

                        {/* Status (clickable pill) */}
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

                        {/* Source badge */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            risk.source === 'ai'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-emerald-100 text-emerald-700'}`}>
                            {risk.source === 'ai' ? <Bot size={10} /> : <User size={10} />}
                            {risk.source === 'ai' ? 'AI' : 'Manual'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => setEditing(risk)}
                              title="Edit"
                              className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                              <Edit2 size={13} />
                            </button>
                            {risk.source === 'manual' && (
                              <button onClick={() => setDeleting(risk.id)}
                                title="Delete"
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {expanded === risk.id && <ExpandedDetail key={`exp-${risk.id}`} risk={risk} />}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-400">
            <span>Showing {filtered.length} of {risks.length} risks</span>
            <span>{counts.critical} critical · {counts.high} high</span>
          </div>
        )}
      </div>

      {/* ── Add modal ── */}
      {adding && (
        <RiskFormModal
          heading="Add Manual Risk"
          onSave={handleAdd}
          onClose={() => setAdding(false)}
        />
      )}

      {/* ── Edit modal ── */}
      {editing && (
        <RiskFormModal
          heading={`Edit Risk — ${editing.displayId}`}
          initial={editInitial}
          isEdit
          onSave={handleEdit}
          onClose={() => setEditing(null)}
        />
      )}

      {/* ── Delete confirm ── */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-slate-800 mb-2">Delete this risk?</h3>
            <p className="text-sm text-slate-500 mb-5">
              This cannot be undone. To keep it for history, mark it as Resolved instead.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleting(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleting)}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
