import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, UserPlus, Trash2, ShieldCheck, ShieldOff, Copy, Check,
  Settings, Users, User, Shield, RefreshCw, Search,
  ChevronLeft, ChevronRight, Download, AlertTriangle,
  LogIn, UserX, UserCog, Eye, Cpu, BarChart2,
} from 'lucide-react';
import { api, type ManagedUser, type AuditEntry, type AuditStats } from '../../api/client';
import type { AuthUser } from '../../store/auth';
import { cn } from '../../utils/cn';
import { format, formatDistanceToNow } from 'date-fns';

interface Props {
  currentUser: AuthUser;
  onClose: () => void;
}

type Tab = 'profile' | 'users';

export function SettingsModal({ currentUser, onClose }: Props) {
  const isAdmin = currentUser.role === 'admin';
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-2xl flex flex-col shadow-2xl w-full"
        style={{ maxWidth: 'min(95vw, 1440px)', height: '92vh' }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings size={15} className="text-gray-500" />
            <span className="text-white font-semibold text-sm">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 px-6 pt-3 pb-0 flex-shrink-0 border-b border-white/[0.06]">
          <TabBtn active={tab === 'profile'} icon={User} onClick={() => setTab('profile')}>Profile</TabBtn>
          {isAdmin && (
            <TabBtn active={tab === 'users'} icon={Users} onClick={() => setTab('users')}>User Management</TabBtn>
          )}
        </div>

        {/* Content */}
        <div className={cn('flex-1 min-h-0', tab === 'users' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto p-6')}>
          {tab === 'profile' && <ProfileTab user={currentUser} />}
          {tab === 'users' && isAdmin && <UserManagementTab currentUser={currentUser} />}
        </div>
      </div>
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({ active, icon: Icon, onClick, children }: {
  active: boolean; icon: React.ElementType; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
        active
          ? 'text-white border-brand-500 bg-brand-500/8'
          : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/4',
      )}
    >
      <Icon size={13} />
      {children}
    </button>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab({ user }: { user: AuthUser }) {
  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="text-white font-semibold text-base">{user.name}</p>
          <p className="text-gray-500 text-sm">{user.email}</p>
          <RoleBadge role={user.role} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name"    value={user.name} />
        <Field label="Email"        value={user.email} />
        <Field label="Role"         value={user.role === 'admin' ? 'Super Admin' : 'Member'} />
        <Field label="Member since" value={format(new Date(user.createdAt), 'MMM d, yyyy')} />
      </div>

      <div className="rounded-xl p-4 bg-brand-500/6 border border-brand-500/20 text-sm text-gray-400 leading-relaxed">
        You are signed in as <span className="text-white font-medium">{user.email}</span>.
        {user.role === 'admin' && (
          <> You have <span className="text-brand-400 font-semibold">Super Admin</span> privileges &mdash; you can manage all users in this workspace.</>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label font-semibold uppercase tracking-widest text-gray-600">{label}</span>
      <span className="text-sm text-gray-300 bg-white/4 rounded-lg px-3 py-2 border border-white/[0.06]">{value}</span>
    </div>
  );
}

// ── User Management tab (users list + inline audit log) ───────────────────────

function UserManagementTab({ currentUser }: { currentUser: AuthUser }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top: user list — fixed height, scrollable */}
      <div className="flex-shrink-0 border-b border-white/[0.06] overflow-y-auto" style={{ maxHeight: 290 }}>
        <div className="px-6 py-4">
          <UserListSection currentUser={currentUser} />
        </div>
      </div>

      {/* Bottom: full inline audit log — fills remaining space */}
      <div className="flex-1 min-h-0 flex flex-col">
        <InlineAuditLog />
      </div>
    </div>
  );
}

// ── User list section ─────────────────────────────────────────────────────────

function UserListSection({ currentUser }: { currentUser: AuthUser }) {
  const [users, setUsers]           = useState<ManagedUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmId, setConfirmId]   = useState<string | null>(null);
  const [busy, setBusy]             = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try { setUsers(await api.getUsers()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load users'); }
    finally { setLoading(false); }
  }

  async function toggleRole(u: ManagedUser) {
    setBusy(u.id);
    try {
      const updated = await api.updateUserRole(u.id, u.role === 'admin' ? 'user' : 'admin');
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to update role'); }
    finally { setBusy(null); }
  }

  async function deleteUser(id: string) {
    setBusy(id);
    try {
      await api.deleteUser(id);
      setUsers(prev => prev.filter(x => x.id !== id));
      setConfirmId(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to delete user'); }
    finally { setBusy(null); }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-semibold text-sm">Workspace members</p>
          <p className="text-gray-600 text-xs mt-0.5">
            {loading ? '…' : `${users.length} member${users.length !== 1 ? 's' : ''}`} · @globalhealthx.co only
          </p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setError(null); }}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors"
        >
          <UserPlus size={13} />
          Invite user
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
      )}

      {showInvite && (
        <InviteForm
          onInvited={(newUser) => setUsers(prev => [...prev, newUser])}
          onClose={() => setShowInvite(false)}
        />
      )}

      {loading ? (
        <div className="flex flex-col gap-2 animate-pulse">
          {[1, 2, 3].map(n => <div key={n} className="h-12 bg-white/4 rounded-xl" />)}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {users.map(u => {
            const isSelf        = u.id === currentUser.id;
            const isBeingDelete = confirmId === u.id;
            const isBusy        = busy === u.id;
            const initials      = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

            return (
              <div
                key={u.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-colors',
                  isBeingDelete
                    ? 'border-red-500/30 bg-red-500/6'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]',
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-label font-bold text-white flex-shrink-0',
                  u.role === 'admin' ? 'bg-gradient-to-br from-brand-500 to-violet-600' : 'bg-white/10',
                )}>
                  {initials}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200 truncate">{u.name}</span>
                    {isSelf && <span className="text-label text-gray-600 bg-white/6 px-1.5 py-0.5 rounded-full">you</span>}
                    <RoleBadge role={u.role} />
                  </div>
                  <p className="text-xs text-gray-600 truncate">{u.email}</p>
                </div>

                <span className="text-label text-gray-700 flex-shrink-0 hidden sm:block">
                  {format(new Date(u.createdAt), 'MMM d, yyyy')}
                </span>

                {!isSelf && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!isBeingDelete ? (
                      <>
                        <button
                          onClick={() => toggleRole(u)}
                          disabled={isBusy}
                          title={u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                          className={cn(
                            'w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40',
                            u.role === 'admin'
                              ? 'text-brand-400 hover:text-red-400 hover:bg-red-500/10'
                              : 'text-gray-600 hover:text-brand-400 hover:bg-brand-500/10',
                          )}
                        >
                          {u.role === 'admin' ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                        </button>
                        <button
                          onClick={() => setConfirmId(u.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-red-400 mr-2">Remove {u.name.split(' ')[0]}?</span>
                        <button
                          onClick={() => deleteUser(u.id)}
                          disabled={isBusy}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40"
                        >
                          {isBusy ? '…' : 'Delete'}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="text-xs px-2.5 py-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/8 transition-colors ml-0.5"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Invite form ───────────────────────────────────────────────────────────────

function InviteForm({ onInvited, onClose }: {
  onInvited: (u: ManagedUser) => void;
  onClose: () => void;
}) {
  const [email, setEmail]           = useState('');
  const [name, setName]             = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [created, setCreated]       = useState<{ user: ManagedUser; tempPassword: string } | null>(null);
  const [copied, setCopied]         = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSubmitting(true);
    try {
      const result = await api.inviteUser(email.trim(), name.trim());
      setCreated(result);
      onInvited(result.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setSubmitting(false);
    }
  }

  function copyCredentials() {
    if (!created) return;
    navigator.clipboard.writeText(`Email: ${created.user.email}\nPassword: ${created.tempPassword}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-brand-500/25 bg-brand-500/6 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Invite new member</span>
        <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors"><X size={13} /></button>
      </div>

      {!created ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-label font-semibold uppercase tracking-widest text-gray-600">Full name</label>
              <input
                value={name} onChange={e => setName(e.target.value)} required
                placeholder="Jane Smith"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label font-semibold uppercase tracking-widest text-gray-600">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="jane@globalhealthx.co"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/8 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors disabled:opacity-50">
              <UserPlus size={12} />
              {submitting ? 'Creating…' : 'Create & invite'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <Check size={14} />
            <span>Account created for <span className="font-semibold">{created.user.name}</span></span>
          </div>
          <p className="text-xs text-gray-500">Share these one-time credentials with the new member.</p>
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 font-mono text-xs text-gray-300 flex flex-col gap-1">
            <span>Email:    {created.user.email}</span>
            <span>Password: {created.tempPassword}</span>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={copyCredentials}
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
                copied ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/8 text-gray-300 hover:text-white',
              )}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy credentials'}
            </button>
            <button onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/8 transition-colors">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: 'user' | 'admin' }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 text-label font-bold px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/30 uppercase tracking-wide">
        <ShieldCheck size={9} /> Super Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-label font-bold px-1.5 py-0.5 rounded-full bg-white/6 text-gray-500 border border-white/8 uppercase tracking-wide">
      Member
    </span>
  );
}

// ── Inline audit log ──────────────────────────────────────────────────────────

const AUDIT_ACTION_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  LOGIN_SUCCESS:            { label: 'Signed in',           color: '#16a34a', Icon: LogIn },
  LOGIN_FAILED:             { label: 'Failed login',         color: '#dc2626', Icon: AlertTriangle },
  PASSWORD_RESET_REQUESTED: { label: 'Password reset req.',  color: '#2563eb', Icon: UserCog },
  PASSWORD_RESET_COMPLETED: { label: 'Password reset done',  color: '#2563eb', Icon: UserCog },
  USER_INVITED:             { label: 'User invited',         color: '#7c3aed', Icon: UserPlus },
  USER_ROLE_CHANGED:        { label: 'Role changed',         color: '#7c3aed', Icon: UserCog },
  USER_DELETED:             { label: 'User deleted',         color: '#dc2626', Icon: UserX },
  SECTION_VISITED:          { label: 'Viewed section',       color: '#475569', Icon: Eye },
  AI_QUERY:                 { label: 'AI query',             color: '#6d28d9', Icon: Cpu },
  AI_ANALYSIS:              { label: 'AI analysis',          color: '#6d28d9', Icon: BarChart2 },
};

const ALL_AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_META);
const PAGE_SIZE = 50;

function AuditActionBadge({ action }: { action: string }) {
  const meta = AUDIT_ACTION_META[action] ?? { label: action, color: '#475569', Icon: Eye };
  const { label, color, Icon } = meta;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: color + '18', color, border: `1px solid ${color}30` }}
    >
      <Icon size={9} />
      {label}
    </span>
  );
}

function auditAgo(ts: string) {
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); } catch { return ts; }
}

function auditFmtTs(ts: string) {
  try { return format(new Date(ts), 'MMM d, HH:mm:ss'); } catch { return ts; }
}

function InlineAuditLog() {
  // suppress unused-var lint for useRef (kept for future scroll-reset use)
  const _scrollRef = useRef<HTMLDivElement>(null);

  const [stats,         setStats]         = useState<AuditStats | null>(null);
  const [entries,       setEntries]       = useState<AuditEntry[]>([]);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(0);
  const [loading,       setLoading]       = useState(false);
  const [search,        setSearch]        = useState('');
  const [filterAction,  setFilterAction]  = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterFrom,    setFilterFrom]    = useState('');
  const [filterTo,      setFilterTo]      = useState('');
  const [expanded,      setExpanded]      = useState<string | null>(null);

  const loadStats = useCallback(() => {
    api.getAuditStats().then(setStats).catch(() => {});
  }, []);

  const loadEntries = useCallback(() => {
    setLoading(true);
    api.getAuditLog({
      limit:   PAGE_SIZE,
      offset:  page * PAGE_SIZE,
      search:  search        || undefined,
      action:  filterAction  || undefined,
      section: filterSection || undefined,
      fromTs:  filterFrom    || undefined,
      toTs:    filterTo      || undefined,
    }).then(r => {
      setEntries(r.entries);
      setTotal(r.total);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [page, search, filterAction, filterSection, filterFrom, filterTo]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadEntries(); }, [loadEntries]);
  useEffect(() => { setPage(0); }, [search, filterAction, filterSection, filterFrom, filterTo]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(search || filterAction || filterSection || filterFrom || filterTo);

  function downloadJSON() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  }

  const sections = stats
    ? Object.keys(stats.sectionCounts).sort((a, b) => stats.sectionCounts[b] - stats.sectionCounts[a])
    : [];

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Audit log sub-header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center flex-shrink-0">
          <Shield size={13} className="text-white" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Audit Log</p>
          <p className="text-gray-600 text-xs">
            {total.toLocaleString()} events
            {stats?.lastEntry && ` · Last: ${auditAgo(stats.lastEntry)}`}
          </p>
        </div>

        {/* Stat chips */}
        {stats && (
          <div className="flex items-center gap-2 ml-4 flex-wrap">
            <StatChip label="Today"        value={stats.todayCount} />
            <StatChip label="Active users" value={stats.activeUsers} />
            <StatChip label="Logins today" value={stats.loginsToday} color="#16a34a" />
            {stats.loginsFailed > 0 && (
              <StatChip label="Failed logins" value={stats.loginsFailed} color="#dc2626" />
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => { loadStats(); loadEntries(); }}
            title="Refresh"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/8 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={downloadJSON}
            title="Export as JSON"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/8 transition-colors"
          >
            <Download size={12} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-6 py-2.5 border-b border-white/[0.06]">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search email, action, section…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 placeholder-gray-700 focus:outline-none focus:border-brand-500/50 transition-colors"
          />
        </div>

        <select
          value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 focus:outline-none focus:border-brand-500/50"
        >
          <option value="">All actions</option>
          {ALL_AUDIT_ACTIONS.map(a => <option key={a} value={a}>{AUDIT_ACTION_META[a].label}</option>)}
        </select>

        {sections.length > 0 && (
          <select
            value={filterSection} onChange={e => setFilterSection(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 focus:outline-none focus:border-brand-500/50"
          >
            <option value="">All sections</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 focus:outline-none focus:border-brand-500/50" />
        <span className="text-gray-700 text-xs">to</span>
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 focus:outline-none focus:border-brand-500/50" />

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setFilterAction(''); setFilterSection(''); setFilterFrom(''); setFilterTo(''); }}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 bg-red-500/8 hover:bg-red-500/15 transition-colors"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-xs text-gray-600">{total.toLocaleString()} results</span>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto" ref={_scrollRef}>
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <RefreshCw size={18} className="animate-spin text-gray-700" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <Shield size={20} className="text-gray-700" />
            <p className="text-gray-600 text-xs">No audit events match your filters.</p>
          </div>
        ) : (
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{
                position: 'sticky', top: 0, zIndex: 1,
                background: '#0d0e1c',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                {['Time', 'User', 'Action', 'Section', 'IP', 'Status', ''].map(h => (
                  <th key={h} style={{
                    padding: '7px 12px', textAlign: 'left',
                    fontSize: 10, fontWeight: 700, color: '#4b5563',
                    letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => {
                const isOpen = expanded === e.id;
                const rowBg  = isOpen
                  ? 'rgba(255,255,255,0.04)'
                  : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';

                return (
                  <>
                    <tr
                      key={e.id}
                      onClick={() => setExpanded(isOpen ? null : e.id)}
                      style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                      className="hover:bg-white/[0.035] transition-colors"
                    >
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11.5 }}>{auditFmtTs(e.ts)}</div>
                        <div style={{ fontSize: 10, color: '#374151', marginTop: 1 }}>{auditAgo(e.ts)}</div>
                      </td>
                      <td style={{ padding: '8px 12px', minWidth: 160 }}>
                        <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 12 }}>{e.userName || '—'}</div>
                        <div style={{ fontSize: 10, color: '#4b5563', marginTop: 1 }}>{e.userEmail || 'unknown'}</div>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <AuditActionBadge action={e.action} />
                      </td>
                      <td style={{ padding: '8px 12px', color: '#6b7280', fontWeight: 500, fontSize: 11.5 }}>{e.section}</td>
                      <td style={{ padding: '8px 12px', color: '#374151', fontFamily: 'monospace', fontSize: 11 }}>{e.ip || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                          color: e.status >= 400 ? '#ef4444' : e.status >= 200 ? '#22c55e' : '#6b7280',
                        }}>
                          {e.status || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 8px', width: 24, color: '#374151', fontSize: 12 }}>
                        {(e.detail || e.userAgent) && (isOpen ? '▲' : '▼')}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${e.id}-x`} style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <td colSpan={7} style={{ padding: '8px 12px 12px 12px' }}>
                          <div className="flex flex-wrap gap-6">
                            {e.detail && (
                              <div>
                                <span style={{ fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '0.08em' }}>Detail</span>
                                <p style={{ marginTop: 3, color: '#cbd5e1', maxWidth: 600, fontSize: 11.5 }}>{e.detail}</p>
                              </div>
                            )}
                            <div>
                              <span style={{ fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '0.08em' }}>Browser</span>
                              <p style={{ marginTop: 3, color: '#94a3b8', fontSize: 11 }}>{e.userAgent?.slice(0, 60) || '—'}</p>
                            </div>
                            <div>
                              <span style={{ fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '0.08em' }}>Resource</span>
                              <p style={{ marginTop: 3, color: '#6b7280', fontFamily: 'monospace', fontSize: 10.5 }}>{e.resource}</p>
                            </div>
                            <div>
                              <span style={{ fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '0.08em' }}>Entry ID</span>
                              <p style={{ marginTop: 3, color: '#374151', fontFamily: 'monospace', fontSize: 10 }}>{e.id}</p>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-2.5 border-t border-white/[0.06] bg-white/[0.01]">
          <span className="text-xs text-gray-600">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/10 disabled:opacity-30 hover:bg-white/8 transition-colors text-gray-400"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="text-xs text-gray-500 min-w-[80px] text-center">Page {page + 1} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/10 disabled:opacity-30 hover:bg-white/8 transition-colors text-gray-400"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/[0.06]">
      <span className="text-[11px] font-bold" style={{ color: color ?? '#94a3b8' }}>{value.toLocaleString()}</span>
      <span className="text-[10px] text-gray-600">{label}</span>
    </div>
  );
}
