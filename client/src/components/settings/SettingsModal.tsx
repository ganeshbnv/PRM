import { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, ShieldCheck, ShieldOff, Copy, Check, Settings, Users, User, Moon, Sun } from 'lucide-react';
import { api, type ManagedUser } from '../../api/client';
import type { AuthUser } from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';

interface Props {
  currentUser: AuthUser;
  onClose: () => void;
}

type Tab = 'profile' | 'users';

export function SettingsModal({ currentUser, onClose }: Props) {
  const isAdmin = currentUser.role === 'admin';
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-2xl mx-4 flex flex-col shadow-2xl"
        style={{ maxHeight: 'min(85vh, 700px)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings size={15} className="text-gray-500" />
            <span className="text-white font-semibold text-sm">Settings</span>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-colors">
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
        <div className="flex-1 overflow-y-auto p-6">
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
    <button onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
        active
          ? 'text-white border-brand-500 bg-brand-500/8'
          : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/4',
      )}>
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
      {/* Avatar + name */}
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

      {/* Fields */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name" value={user.name} />
        <Field label="Email" value={user.email} />
        <Field label="Role" value={user.role === 'admin' ? 'Super Admin' : 'Member'} />
        <Field label="Member since" value={format(new Date(user.createdAt), 'MMM d, yyyy')} />
      </div>

      <div className="rounded-xl p-4 bg-brand-500/6 border border-brand-500/20 text-sm text-gray-400 leading-relaxed">
        🔐 You are signed in as <span className="text-white font-medium">{user.email}</span>.
        {user.role === 'admin' && (
          <> You have <span className="text-brand-400 font-semibold">Super Admin</span> privileges — you can manage all users in this workspace.</>
        )}
      </div>

      <AppearanceSection />
    </div>
  );
}

// ── Appearance ────────────────────────────────────────────────────────────────

function AppearanceSection() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Appearance</span>
      <div className="grid grid-cols-2 gap-3">
        <ThemeCard
          id="dark"
          label="Dark"
          icon={Moon}
          active={theme === 'dark'}
          preview={<DarkPreview />}
          onClick={() => setTheme('dark')}
        />
        <ThemeCard
          id="light"
          label="Light"
          icon={Sun}
          active={theme === 'light'}
          preview={<LightPreview />}
          onClick={() => setTheme('light')}
        />
      </div>
    </div>
  );
}

function ThemeCard({ label, icon: Icon, active, preview, onClick }: {
  id: string; label: string; icon: React.ElementType;
  active: boolean; preview: React.ReactNode; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 p-3 rounded-xl border-2 transition-all text-left',
        active
          ? 'border-brand-500 bg-brand-500/8'
          : 'border-surface-border bg-surface-elevated hover:border-surface-raised',
      )}
    >
      <div className="w-full rounded-lg overflow-hidden ring-1 ring-white/10">{preview}</div>
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={active ? 'text-brand-400' : 'text-gray-500'} />
        <span className={cn('text-xs font-semibold', active ? 'text-brand-400' : 'text-gray-400')}>{label}</span>
        {active && <span className="ml-auto text-[9px] text-brand-500 font-bold">ACTIVE</span>}
      </div>
    </button>
  );
}

function DarkPreview() {
  return (
    <div className="w-full h-16 bg-[#0d0d10] p-2 flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <div className="w-8 h-full bg-[#111114] rounded" />
        <div className="flex-1 flex flex-col gap-1">
          <div className="h-2 bg-[#1a1a1f] rounded w-3/4" />
          <div className="h-1.5 bg-[#252530] rounded w-1/2" />
          <div className="h-1.5 bg-[#4c6ef5]/40 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

function LightPreview() {
  return (
    <div className="w-full h-16 bg-[#f3f4f6] p-2 flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <div className="w-8 h-full bg-white rounded shadow-sm" />
        <div className="flex-1 flex flex-col gap-1">
          <div className="h-2 bg-[#e5e7eb] rounded w-3/4" />
          <div className="h-1.5 bg-[#d1d5db] rounded w-1/2" />
          <div className="h-1.5 bg-[#4c6ef5]/60 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">{label}</span>
      <span className="text-sm text-gray-300 bg-white/4 rounded-lg px-3 py-2 border border-white/[0.06]">{value}</span>
    </div>
  );
}

// ── User Management tab ───────────────────────────────────────────────────────

function UserManagementTab({ currentUser }: { currentUser: AuthUser }) {
  const [users, setUsers]             = useState<ManagedUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [showInvite, setShowInvite]   = useState(false);
  const [confirmId, setConfirmId]     = useState<string | null>(null);
  const [busy, setBusy]               = useState<string | null>(null);  // tracks id of item being mutated

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

  if (loading) return (
    <div className="flex flex-col gap-3 animate-pulse">
      {[1,2,3].map(n => <div key={n} className="h-14 bg-white/4 rounded-xl" />)}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-semibold text-sm">Workspace members</p>
          <p className="text-gray-600 text-xs mt-0.5">{users.length} member{users.length !== 1 ? 's' : ''} · @globalhealthx.co only</p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setError(null); }}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors">
          <UserPlus size={13} />
          Invite user
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <InviteForm
          onInvited={(newUser) => { setUsers(prev => [...prev, newUser]); }}
          onClose={() => setShowInvite(false)}
        />
      )}

      {/* User list */}
      <div className="flex flex-col gap-2">
        {users.map(u => {
          const isSelf = u.id === currentUser.id;
          const isBeingDeleted = confirmId === u.id;
          const isBusy = busy === u.id;
          const initials = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

          return (
            <div key={u.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors',
                isBeingDeleted
                  ? 'border-red-500/30 bg-red-500/6'
                  : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]',
              )}>
              {/* Avatar */}
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0',
                u.role === 'admin' ? 'bg-gradient-to-br from-brand-500 to-violet-600' : 'bg-white/10',
              )}>
                {initials}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200 truncate">{u.name}</span>
                  {isSelf && <span className="text-[9px] text-gray-600 bg-white/6 px-1.5 py-0.5 rounded-full">you</span>}
                  <RoleBadge role={u.role} />
                </div>
                <p className="text-xs text-gray-600 truncate">{u.email}</p>
              </div>

              {/* Joined date */}
              <span className="text-[10px] text-gray-700 flex-shrink-0 hidden sm:block">
                {format(new Date(u.createdAt), 'MMM d, yyyy')}
              </span>

              {/* Actions */}
              {!isSelf && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!isBeingDeleted ? (
                    <>
                      {/* Toggle admin */}
                      <button
                        onClick={() => toggleRole(u)}
                        disabled={isBusy}
                        title={u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                        className={cn(
                          'w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40',
                          u.role === 'admin'
                            ? 'text-brand-400 hover:text-red-400 hover:bg-red-500/10'
                            : 'text-gray-600 hover:text-brand-400 hover:bg-brand-500/10',
                        )}>
                        {u.role === 'admin' ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setConfirmId(u.id)}
                        title="Delete user"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-red-400 mr-2">Remove {u.name.split(' ')[0]}?</span>
                      <button
                        onClick={() => deleteUser(u.id)}
                        disabled={isBusy}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40">
                        {isBusy ? '…' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-xs px-2.5 py-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/8 transition-colors ml-0.5">
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
              <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Full name</label>
              <input
                value={name} onChange={e => setName(e.target.value)} required
                placeholder="Jane Smith"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Email</label>
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
        /* Success — show credentials to copy */
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <Check size={14} />
            <span>Account created for <span className="font-semibold">{created.user.name}</span></span>
          </div>
          <p className="text-xs text-gray-500">Share these one-time credentials with the new member. They can log in immediately.</p>

          <div className="rounded-lg bg-black/30 border border-white/10 p-3 font-mono text-xs text-gray-300 flex flex-col gap-1">
            <span>Email:    <span className="text-white">{created.user.email}</span></span>
            <span>Password: <span className="text-white">{created.tempPassword}</span></span>
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
      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/30 uppercase tracking-wide">
        <ShieldCheck size={9} /> Super Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/6 text-gray-500 border border-white/8 uppercase tracking-wide">
      Member
    </span>
  );
}
