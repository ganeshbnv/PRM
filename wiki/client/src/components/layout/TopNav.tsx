import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Bell, ChevronDown, Settings, LogOut, Zap } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useUIStore } from '../../store/ui';
import { useKeyboard } from '../../hooks/useKeyboard';
import { Avatar } from '../common/Avatar';

export function TopNav() {
  const { user, logout } = useAuth();
  const { setSearchOpen, setNotificationPanelOpen } = useUIStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useKeyboard('k', () => setSearchOpen(true), { meta: true });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="h-13 bg-sidebar-bg border-b border-sidebar-border flex items-center px-4 gap-4 flex-shrink-0 z-20" style={{ height: '52px' }}>

      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-md">
          <Zap size={14} className="text-white fill-white" />
        </div>
        <span className="text-sidebar-text font-semibold text-sm tracking-tight">Wiki</span>
      </Link>

      {/* Search bar */}
      <button
        onClick={() => setSearchOpen(true)}
        className="flex-1 max-w-xs flex items-center gap-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 px-3 py-2 text-sidebar-muted text-sm transition-all"
        aria-label="Open search"
      >
        <Search size={13} className="flex-shrink-0" />
        <span className="flex-1 text-left text-sidebar-muted/70">Search pages…</span>
        <kbd className="text-2xs bg-white/10 text-sidebar-muted/60 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </button>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => setNotificationPanelOpen(true)}
          className="p-2 rounded-lg text-sidebar-muted hover:text-sidebar-text hover:bg-white/8 transition-all"
          aria-label="Notifications"
        >
          <Bell size={15} />
        </button>

        {user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-white/8 transition-all ml-1"
            >
              <Avatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
              <span className="text-sidebar-text text-sm font-medium hidden sm:block">{user.name.split(' ')[0]}</span>
              <ChevronDown size={11} className="text-sidebar-muted" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl bg-white shadow-float border border-surface-border py-1.5 z-50">
                <div className="px-3 py-2 border-b border-surface-border mb-1">
                  <p className="text-xs font-semibold text-slate-900 truncate">{user.name}</p>
                  <p className="text-2xs text-slate-500 truncate">{user.email}</p>
                </div>
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-surface-muted transition-colors"
                >
                  <Settings size={13} />
                  Settings
                </button>
                <hr className="my-1 border-surface-border" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
