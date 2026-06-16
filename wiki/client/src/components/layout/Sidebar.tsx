import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
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
          'flex flex-col bg-sidebar-bg transition-all duration-200 h-full border-r border-sidebar-active flex-shrink-0',
          sidebarCollapsed ? 'w-12' : 'w-56'
        )}
      >
        <div className="flex items-center justify-between px-2 py-3 border-b border-sidebar-active">
          {!sidebarCollapsed && (
            <span className="text-sidebar-muted text-xs font-semibold uppercase tracking-wider px-2">
              Spaces
            </span>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded text-sidebar-muted hover:text-white hover:bg-sidebar-active transition-colors ml-auto"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-1">
          {loading ? (
            <div className="space-y-1 px-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            spaces.map((space) => (
              <Link
                key={space.id}
                to={`/spaces/${space.key}`}
                className={cn(
                  'flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors',
                  spaceKey === space.key
                    ? 'bg-sidebar-active text-white'
                    : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
                )}
                title={sidebarCollapsed ? space.name : undefined}
              >
                <span className="flex-shrink-0">{space.iconEmoji}</span>
                {!sidebarCollapsed && (
                  <span className="truncate">{space.name}</span>
                )}
              </Link>
            ))
          )}
        </nav>

        {!sidebarCollapsed && (
          <div className="p-2 border-t border-sidebar-active">
            <button
              onClick={() => setCreateOpen(true)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sidebar-muted hover:text-white hover:bg-sidebar-hover text-sm transition-colors"
            >
              <Plus size={14} />
              <span>New Space</span>
            </button>
          </div>
        )}
      </aside>

      <CreateSpaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={onSpaceCreated}
      />
    </>
  );
}
