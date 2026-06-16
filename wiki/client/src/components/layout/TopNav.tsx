import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Bell, ChevronDown, Settings, LogOut } from 'lucide-react';
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
    <header className="h-12 bg-sidebar-bg border-b border-sidebar-active flex items-center px-4 gap-4 flex-shrink-0 z-20">
      <Link to="/" className="flex items-center gap-2 text-white font-semibold text-sm">
        <span className="text-lg">⚡</span>
        <span>Wiki</span>
      </Link>

      <button
        onClick={() => setSearchOpen(true)}
        className="flex-1 max-w-xs flex items-center gap-2 rounded-md bg-sidebar-active/60 hover:bg-sidebar-active px-3 py-1.5 text-sidebar-muted text-sm transition-colors"
        aria-label="Open search"
      >
        <Search size={14} />
        <span>Search...</span>
        <kbd className="ml-auto text-xs opacity-60">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => setNotificationPanelOpen(true)}
          className="p-2 rounded-md text-sidebar-muted hover:text-white hover:bg-sidebar-active transition-colors"
          aria-label="Notifications"
        >
          <Bell size={16} />
        </button>

        {user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-active transition-colors"
            >
              <Avatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
              <span className="text-sidebar-text text-sm">{user.name}</span>
              <ChevronDown size={12} className="text-sidebar-muted" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-lg bg-white shadow-lg border py-1 z-50">
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Settings size={14} />
                  Settings
                </button>
                <hr className="my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-gray-50"
                >
                  <LogOut size={14} />
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
