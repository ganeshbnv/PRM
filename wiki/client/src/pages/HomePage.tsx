import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { spacesApi } from '../api/spaces';
import { pagesApi } from '../api/pages';
import type { Space, Page } from '../types';
import { SpaceCard } from '../components/spaces/SpaceCard';
import { Skeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { RelativeTime } from '../components/common/RelativeTime';
import { CreateSpaceModal } from '../components/spaces/CreateSpaceModal';

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [recent, setRecent] = useState<(Page & { viewedAt: string })[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    spacesApi.getAll().then(setSpaces).finally(() => setSpacesLoading(false));
    pagesApi.recent().then(setRecent).finally(() => setRecentLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name?.split(' ')[0]}</h1>
        <p className="text-gray-500 mt-1">Here's what's happening in your wiki</p>
      </div>

      {/* Recent pages */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Recently viewed</h2>
        {recentLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState icon={<FileText size={32} />} title="No recent pages" description="Pages you view will appear here." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recent.map((page) => (
              <Link
                key={page.id}
                to={`/spaces/${page.space?.key}/${page.id}`}
                className="block p-4 rounded-xl border hover:border-brand-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start gap-2">
                  <span className="text-xl">{page.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600">{page.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{page.space?.name}</p>
                    <p className="text-xs text-gray-400"><RelativeTime date={page.viewedAt} /></p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Spaces */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Your spaces</h2>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700"
          >
            <Plus size={14} />New space
          </button>
        </div>

        {spacesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : spaces.length === 0 ? (
          <EmptyState
            icon={<FileText size={32} />}
            title="No spaces yet"
            description="Create your first space to start documenting."
            action={{ label: 'Create space', onClick: () => setCreateOpen(true) }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {spaces.map((space) => <SpaceCard key={space.id} space={space} />)}
          </div>
        )}
      </section>

      <CreateSpaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(space) => {
          setSpaces((prev) => [space, ...prev]);
          navigate(`/spaces/${space.key}`);
        }}
      />
    </div>
  );
}
