import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, LayoutGrid } from 'lucide-react';
import { useUIStore } from '../../store/ui';
import { useAuth } from '../../hooks/useAuth';
import { spacesApi } from '../../api/spaces';
import type { Space } from '../../types';
import { Skeleton } from '../common/Skeleton';
import { CreateSpaceModal } from '../spaces/CreateSpaceModal';
import { cn } from '../../utils/cn';

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const { spaceKey } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    spacesApi.getAll()
      .then(setSpaces)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const onSpaceCreated = (space: Space) => {
    setSpaces((prev) => [space, ...prev]);
    navigate(`/spaces/${space.key}`);
  };

  return (
    <>
      <aside
        className={cn(
          'flex flex-col bg-sidebar-bg transition-all duration-200 h-full flex-shrink-0 scrollbar-dark',
          'border-r border-sidebar-border',
          sidebarCollapsed ? 'w-12' : 'w-52'
        )}
      >
        {/* Section header */}
        <div className={cn(
          'flex items-center px-2 py-3 border-b border-sidebar-border',
          sidebarCollapsed ? 'justify-center' : 'justify-between'
        )}>
          {!sidebarCollapsed && (
            <span className="text-label text-sidebar-muted px-2">Spaces</span>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-md text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-surface transition-all"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>

        {/* Home link */}
        <div className="px-1.5 pt-1.5">
          <Link
            to="/"
            className={cn(
              'flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-all',
              'text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-surface'
            )}
            title={sidebarCollapsed ? 'Home' : undefined}
          >
            <LayoutGrid size={14} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Home</span>}
          </Link>
        </div>

        {/* Spaces list */}
        <nav className="flex-1 overflow-y-auto py-1 px-1.5 scrollbar-dark space-y-0.5">
          {!sidebarCollapsed && spaces.length > 0 && (
            <p className="text-label text-sidebar-muted px-2 pt-2 pb-1">Your Spaces</p>
          )}
          {loading ? (
            <div className="space-y-1 px-1">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full bg-sidebar-surface" />
              ))}
            </div>
          ) : (
            spaces.map((space) => {
              const isActive = spaceKey === space.key;
              return (
                <Link
                  key={space.id}
                  to={`/spaces/${space.key}`}
                  className={cn(
                    'flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-all relative',
                    isActive
                      ? 'bg-sidebar-active text-white'
                      : 'text-sidebar-text hover:bg-sidebar-surface hover:text-white'
                  )}
                  title={sidebarCollapsed ? space.name : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-sidebar-accent rounded-r-full" />
                  )}
                  <span className="flex-shrink-0 text-base leading-none">{space.iconEmoji}</span>
                  {!sidebarCollapsed && (
                    <span className="truncate font-medium">{space.name}</span>
                  )}
                </Link>
              );
            })
          )}
        </nav>

        {/* New space */}
        <div className={cn('p-1.5 border-t border-sidebar-border', sidebarCollapsed && 'flex justify-center')}>
          <button
            onClick={() => setCreateOpen(true)}
            className={cn(
              'flex items-center gap-2.5 px-2 py-2 rounded-lg text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-surface text-sm transition-all',
              sidebarCollapsed ? 'w-8 h-8 justify-center' : 'w-full'
            )}
            title={sidebarCollapsed ? 'New space' : undefined}
          >
            <Plus size={14} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>New Space</span>}
          </button>
        </div>
      </aside>

      <CreateSpaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={onSpaceCreated}
      />
    </>
  );
}
