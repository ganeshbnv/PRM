import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle, RefreshCw, Plus, ChevronDown, ChevronRight, Edit2, Trash2,
  X, Bot, User, Shield, Flame, TrendingUp, CheckCircle, Filter,
  LayoutList, Columns, BarChart2, Save, Link2, Calendar,
} from 'lucide-react';
import { api } from '../../api/client';
import { useFilterStore } from '../../store/filters';
import type { RegisteredRisk, RiskSeverity, RiskStatus, RiskCategory } from '../../types';
import { AiSummaryStrip } from '../common/AiSummaryStrip';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SEV_CFG: Record<RiskSeverity, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700 border-red-200',        dot: 'bg-red-500' },
  high:     { label: 'High',     color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  medium:   { label: 'Medium',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  low:      { label: 'Low',      color: 'bg-blue-100 text-blue-700 border-blue-200',      dot: 'bg-blue-400' },
};

const STATUS_CFG: Record<RiskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  open:       { label: 'Open',       color: 'bg-red-50 text-red-600 border-red-200',        icon: <Flame size={11} /> },
  mitigating: { label: 'Mitigating', color: 'bg-amber-50 text-amber-700 border-amber-200',  icon: <TrendingUp size={11} /> },
  accepted:   { label: 'Accepted',   color: 'bg-slate-100 text-slate-600 border-slate-200', icon: <Shield size={11} /> },
  resolved:   { label: 'Resolved',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle size={11} /> },
};

const CATEGORIES: RiskCategory[] = [
  'board','bug','pr','wiki','engineer','pipeline','technical','resource','schedule','external','manual',
];
const CAT_LABELS: Record<RiskCategory, string> = {
  board: 'Board', bug: 'Bug', pr: 'Pull Request', wiki: 'Wiki', engineer: 'Engineer',
  pipeline: 'Pipeline', technical: 'Technical', resource: 'Resource', schedule: 'Schedule',
  external: 'External', manual: 'Manual',
};

const STATUS_FLOW: RiskStatus[] = ['open', 'mitigating', 'accepted', 'resolved'];

// ── Risk Form ─────────────────────────────────────────────────────────────────

interface FormState {
  title: string; description: string; severity: RiskSeverity; category: RiskCategory;
  owner: string; impact: string; mitigation: string; dueDate: string; status: RiskStatus;
}
const BLANK_FORM: FormState = {
  title: '', description: '', severity: 'high', category: 'manual',
  owner: '', impact: '', mitigation: '', dueDate: '', status: 'open',
};

interface RiskFormProps {
  initial?: FormState;
  onSave: (data: FormState) => Promise<void>;
  onCancel: () => void;
  title: string;
  isEdit?: boolean;
}
function RiskForm({ initial, onSave, onCancel, title, isEdit }: RiskFormProps) {
  const [form, setForm] = useState<FormState>(initial ?? BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) { setErr('Title and description are required.'); return; }
    setSaving(true); setErr('');
    try { await onSave(form); } catch (ex: any) { setErr(ex.message); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{err}</div>}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Risk Title *</label>
            <input value={form.title} onChange={set('title')} placeholder="Concise risk statement"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
            <textarea value={form.description} onChange={set('description')} rows={3} placeholder="Describe the risk in detail"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Severity</label>
              <select value={form.severity} onChange={set('severity')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 bg-white">
                {(['critical','high','medium','low'] as RiskSeverity[]).map(s => (
                  <option key={s} value={s}>{SEV_CFG[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
              <select value={form.category} onChange={set('category')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 bg-white">
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
              </select>
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select value={form.status} onChange={set('status')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 bg-white">
                {STATUS_FLOW.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Owner</label>
              <input value={form.owner} onChange={set('owner')} placeholder="Assigned to"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
              <input type="date" value={form.dueDate} onChange={set('dueDate')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Impact</label>
            <textarea value={form.impact} onChange={set('impact')} rows={2}
              placeholder="What is the business/technical impact if this risk materialises?"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mitigation Plan</label>
            <textarea value={form.mitigation} onChange={set('mitigation')} rows={2}
              placeholder="What actions are being taken to mitigate this risk?"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
              <Save size={14} /> {saving ? 'Saving…' : 'Save Risk'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Status Chip ───────────────────────────────────────────────────────────────

function StatusChip({ risk, onUpdate }: { risk: RegisteredRisk; onUpdate: (id: string, s: RiskStatus) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CFG[risk.status];
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium cursor-pointer transition-all ${cfg.color}`}>
        {cfg.icon} {cfg.label} <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[140px]">
          {STATUS_FLOW.map(s => (
            <button key={s} onClick={() => { onUpdate(risk.id, s); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-slate-50 ${s === risk.status ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
              {STATUS_CFG[s].icon} {STATUS_CFG[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Register Table Row ─────────────────────────────────────────────────────────

function RiskRow({ risk, onEdit, onDelete, onStatusUpdate }: {
  risk: RegisteredRisk;
  onEdit: (r: RegisteredRisk) => void;
  onDelete: (id: string) => void;
  onStatusUpdate: (id: string, s: RiskStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEV_CFG[risk.severity];
  const isOverdue = risk.dueDate && risk.status !== 'resolved' && risk.status !== 'accepted'
    && new Date(risk.dueDate) < new Date();

  return (
    <>
      <tr className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${expanded ? 'bg-slate-50' : ''}`}>
        <td className="px-3 py-3 w-8">
          <button onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="px-2 py-3 whitespace-nowrap">
          <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{risk.displayId}</span>
        </td>
        <td className="px-3 py-3 max-w-xs">
          <div className="flex items-start gap-2">
            <span className={`inline-flex items-center gap-1 mt-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
              risk.source === 'ai' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {risk.source === 'ai' ? <Bot size={10} /> : <User size={10} />}
              {risk.source === 'ai' ? 'AI' : 'Manual'}
            </span>
            <span className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{risk.title}</span>
          </div>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium ${sev.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
            {sev.label}
          </span>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-xs text-slate-500">{CAT_LABELS[risk.category] ?? risk.category}</span>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <StatusChip risk={risk} onUpdate={onStatusUpdate} />
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-xs text-slate-600">{risk.owner || <span className="text-slate-400 italic">unassigned</span>}</span>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
            {risk.dueDate ? (isOverdue ? '⚠ ' : '') + fmtDate(risk.dueDate) : '—'}
          </span>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(risk)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <Edit2 size={13} />
            </button>
            {risk.source === 'manual' && (
              <button onClick={() => onDelete(risk.id)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={9} className="px-6 pb-4 pt-1">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="col-span-3">
                <p className="text-xs font-medium text-slate-500 mb-1">Description</p>
                <p className="text-slate-700">{risk.description}</p>
              </div>
              {risk.impact && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Impact</p>
                  <p className="text-slate-700">{risk.impact}</p>
                </div>
              )}
              {risk.mitigation && (
                <div className={risk.impact ? '' : 'col-span-2'}>
                  <p className="text-xs font-medium text-slate-500 mb-1">Mitigation Plan</p>
                  <p className="text-slate-700">{risk.mitigation}</p>
                </div>
              )}
              {risk.artifactId && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Linked Artifact</p>
                  <span className="flex items-center gap-1 text-indigo-600 text-xs">
                    <Link2 size={11} /> {risk.artifactType} #{risk.artifactId}
                  </span>
                </div>
              )}
              <div className="col-span-3 flex items-center gap-6 text-xs text-slate-400 pt-1 border-t border-slate-200">
                <span>Detected {timeAgo(risk.detectedAt)}</span>
                <span>Updated {timeAgo(risk.updatedAt)}</span>
                {risk.createdBy && <span>Created by {risk.createdBy}</span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Kanban View ───────────────────────────────────────────────────────────────

function KanbanView({ risks, onEdit }: {
  risks: RegisteredRisk[];
  onEdit: (r: RegisteredRisk) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {STATUS_FLOW.map(status => {
        const col = risks.filter(r => r.status === status);
        const cfg = STATUS_CFG[status];
        return (
          <div key={status} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
            <div className={`flex items-center justify-between px-3 py-2.5 border-b border-slate-200 ${cfg.color}`}>
              <div className="flex items-center gap-1.5 font-medium text-sm">
                {cfg.icon} {cfg.label}
              </div>
              <span className="text-xs font-bold bg-white bg-opacity-70 rounded-full px-2 py-0.5">{col.length}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[120px]">
              {col.map(r => {
                const sev = SEV_CFG[r.severity];
                const overdue = r.dueDate && r.status !== 'resolved' && r.status !== 'accepted' && new Date(r.dueDate) < new Date();
                return (
                  <div key={r.id} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => onEdit(r)}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${sev.color}`}>{sev.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        r.source === 'ai' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {r.source === 'ai' ? '✦ AI' : '✎ Manual'}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-800 line-clamp-2 mb-1.5">{r.title}</p>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{r.owner || 'Unassigned'}</span>
                      <span className="font-mono text-[10px]">{r.displayId}</span>
                    </div>
                    {overdue && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-red-600 font-medium">
                        <Calendar size={9} /> Overdue: {fmtDate(r.dueDate)}
                      </div>
                    )}
                  </div>
                );
              })}
              {col.length === 0 && (
                <div className="flex items-center justify-center h-20 text-xs text-slate-400 italic">No risks</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Charts View ───────────────────────────────────────────────────────────────

function ChartsView({ risks }: { risks: RegisteredRisk[] }) {
  const bySev = (['critical','high','medium','low'] as RiskSeverity[]).map(s => ({
    label: SEV_CFG[s].label, count: risks.filter(r => r.severity === s).length,
    color: s === 'critical' ? '#ef4444' : s === 'high' ? '#f97316' : s === 'medium' ? '#eab308' : '#60a5fa',
  }));
  const bySt = STATUS_FLOW.map(s => ({
    label: STATUS_CFG[s].label, count: risks.filter(r => r.status === s).length,
    color: s === 'open' ? '#ef4444' : s === 'mitigating' ? '#f59e0b' : s === 'accepted' ? '#94a3b8' : '#10b981',
  }));
  const byCat = [...new Set(risks.map(r => r.category))]
    .map(c => ({ label: CAT_LABELS[c] ?? c, count: risks.filter(r => r.category === c).length }))
    .sort((a, b) => b.count - a.count);

  const maxSev = Math.max(...bySev.map(b => b.count), 1);
  const maxSt  = Math.max(...bySt.map(b => b.count), 1);
  const maxCat = Math.max(...byCat.map(b => b.count), 1);

  return (
    <div className="grid grid-cols-3 gap-6">
      {[
        { title: 'By Severity', items: bySev, max: maxSev },
        { title: 'By Status',   items: bySt,  max: maxSt  },
        { title: 'By Category', items: byCat.map(b => ({ ...b, color: '#6366f1' })), max: maxCat },
      ].map(({ title, items, max }) => (
        <div key={title} className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">{title}</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {items.map((b: any) => (
              <div key={b.label}>
                <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                  <span>{b.label}</span><span className="font-semibold">{b.count}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(b.count / max) * 100}%`, background: b.color ?? '#6366f1' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type ViewMode = 'register' | 'kanban' | 'charts';

export function RisksModule() {
  const { filters } = useFilterStore();
  const project = filters.project;

  const [risks, setRisks] = useState<RegisteredRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const [view, setView] = useState<ViewMode>('register');
  const [showForm, setShowForm] = useState(false);
  const [editRisk, setEditRisk] = useState<RegisteredRisk | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [filterSev, setFilterSev] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterCat, setFilterCat] = useState('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'severity' | 'status' | 'dueDate' | 'updated'>('severity');

  const load = useCallback(async (withSync = false) => {
    if (!project) return;
    try {
      withSync ? setSyncing(true) : setLoading(true);
      const data = withSync ? await api.syncRisks(project) : await api.getRiskRegister(project);
      setRisks(data);
      setError('');
    } catch (ex: any) {
      setError(ex.message);
    } finally {
      setLoading(false); setSyncing(false);
    }
  }, [project]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const SEV_ORDER: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const STATUS_ORDER: Record<RiskStatus, number> = { open: 0, mitigating: 1, accepted: 2, resolved: 3 };
    let r = [...risks];
    if (filterSev !== 'all')    r = r.filter(x => x.severity === filterSev);
    if (filterStatus !== 'all') r = r.filter(x => x.status === filterStatus);
    if (filterSource !== 'all') r = r.filter(x => x.source === filterSource);
    if (filterCat !== 'all')    r = r.filter(x => x.category === filterCat);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x => x.title.toLowerCase().includes(q) || x.description.toLowerCase().includes(q) || (x.owner ?? '').toLowerCase().includes(q));
    }
    if (sortBy === 'severity') r.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    else if (sortBy === 'status') r.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    else if (sortBy === 'dueDate') r.sort((a, b) => (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1);
    else r.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return r;
  }, [risks, filterSev, filterStatus, filterSource, filterCat, search, sortBy]);

  const stats = useMemo(() => ({
    total:       risks.length,
    open:        risks.filter(r => r.status === 'open').length,
    critical:    risks.filter(r => r.severity === 'critical' || r.severity === 'high').length,
    mitigating:  risks.filter(r => r.status === 'mitigating').length,
    resolved:    risks.filter(r => r.status === 'resolved' || r.status === 'accepted').length,
    aiCount:     risks.filter(r => r.source === 'ai').length,
    manualCount: risks.filter(r => r.source === 'manual').length,
  }), [risks]);

  async function handleCreate(form: FormState) {
    await api.createRisk(project, form);
    await load();
    setShowForm(false);
  }

  async function handleEdit(form: FormState) {
    if (!editRisk) return;
    await api.updateRisk(project, editRisk.id, form);
    await load();
    setEditRisk(null);
  }

  async function handleStatusUpdate(id: string, status: RiskStatus) {
    await api.updateRisk(project, id, { status });
    setRisks(prev => prev.map(r => r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r));
  }

  async function handleDelete(id: string) {
    await api.deleteRisk(project, id);
    setRisks(prev => prev.filter(r => r.id !== id));
    setConfirmDelete(null);
  }

  const editForm: FormState | undefined = editRisk ? {
    title: editRisk.title, description: editRisk.description,
    severity: editRisk.severity, category: editRisk.category as RiskCategory,
    owner: editRisk.owner ?? '', impact: editRisk.impact ?? '',
    mitigation: editRisk.mitigation ?? '', dueDate: editRisk.dueDate ?? '',
    status: editRisk.status,
  } : undefined;

  const hasActiveFilters = filterSev !== 'all' || filterStatus !== 'all' || filterSource !== 'all' || filterCat !== 'all';

  return (
    <div className="p-6 space-y-5">
      {/* AI Strip */}
      <AiSummaryStrip section="risks" />

      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle size={20} className="text-orange-500" /> Risk Register
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {stats.aiCount} AI-detected · {stats.manualCount} manual · {stats.total} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load(true)} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Re-scan AI'}
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
              <Plus size={13} /> Add Risk
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total',         value: stats.total,      color: 'text-slate-700',   bg: 'bg-slate-50 border-slate-200' },
            { label: 'Open',          value: stats.open,       color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
            { label: 'Critical/High', value: stats.critical,   color: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200' },
            { label: 'Mitigating',    value: stats.mitigating, color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
            { label: 'Resolved',      value: stats.resolved,   color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* View toggle */}
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {([
            ['register', <LayoutList size={13} />, 'Register'],
            ['kanban',   <Columns    size={13} />, 'Kanban'],
            ['charts',   <BarChart2  size={13} />, 'Charts'],
          ] as [ViewMode, React.ReactNode, string][]).map(([v, icon, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {icon} {label}
            </button>
          ))}
        </div>

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search risks…"
          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 w-48 bg-white text-slate-800" />

        <button onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
            showFilters ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
          <Filter size={12} /> Filters
          {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
        </button>

        <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          Sort:
          {(['severity','status','dueDate','updated'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-2.5 py-1.5 rounded-lg capitalize border transition-colors ${
                sortBy === s ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
              {s === 'dueDate' ? 'Due Date' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
          {[
            { label: 'Severity', val: filterSev, set: setFilterSev,
              opts: [['all','All Severities'], ['critical','Critical'], ['high','High'], ['medium','Medium'], ['low','Low']] },
            { label: 'Status',   val: filterStatus, set: setFilterStatus,
              opts: [['all','All Statuses'], ...STATUS_FLOW.map(s => [s, STATUS_CFG[s].label])] },
            { label: 'Source',   val: filterSource, set: setFilterSource,
              opts: [['all','All Sources'], ['ai','AI-detected'], ['manual','Manual']] },
            { label: 'Category', val: filterCat, set: setFilterCat,
              opts: [['all','All Categories'], ...CATEGORIES.map(c => [c, CAT_LABELS[c]])] },
          ].map(({ label, val, set, opts }) => (
            <div key={label}>
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <select value={val} onChange={e => set(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 outline-none focus:border-indigo-400">
                {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
          <div className="flex items-end">
            <button onClick={() => { setFilterSev('all'); setFilterStatus('all'); setFilterSource('all'); setFilterCat('all'); setSearch(''); }}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50">
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Shield size={40} className="mb-3 opacity-30" />
          <p className="font-medium text-slate-600">No risks found</p>
          <p className="text-xs mt-1">
            {risks.length === 0 ? 'Click Re-scan AI to detect risks, or Add Risk to log one manually' : 'Try adjusting your filters'}
          </p>
        </div>
      ) : view === 'register' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="w-8 px-3 py-3" />
                  <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Risk</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Severity</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Owner</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <RiskRow key={r.id} risk={r} onEdit={setEditRisk} onDelete={setConfirmDelete} onStatusUpdate={handleStatusUpdate} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
            Showing {filtered.length} of {risks.length} risks
          </div>
        </div>
      ) : view === 'kanban' ? (
        <KanbanView risks={filtered} onEdit={setEditRisk} />
      ) : (
        <ChartsView risks={filtered} />
      )}

      {/* Add Modal */}
      {showForm && (
        <RiskForm title="Add Manual Risk" onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {/* Edit Modal */}
      {editRisk && (
        <RiskForm title={`Edit — ${editRisk.displayId}`} initial={editForm} isEdit onSave={handleEdit} onCancel={() => setEditRisk(null)} />
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-slate-800 mb-2">Delete this risk?</h3>
            <p className="text-sm text-slate-500 mb-5">This action cannot be undone. AI-detected risks can be marked as resolved instead.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
