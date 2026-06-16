import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileText, Clock, Sparkles } from 'lucide-react';
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

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-full bg-surface-subtle">
      {/* Hero banner */}
      <div className="bg-gradient-to-r from-sidebar-bg via-[#1e1b4b] to-sidebar-bg px-8 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-brand-300 text-xs font-medium mb-2">
            <Sparkles size={12} />
            <span>Knowledge Base</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            {spaces.length > 0
              ? `You have ${spaces.length} space${spaces.length !== 1 ? 's' : ''} — keep building.`
              : "Your team's knowledge base is ready. Create your first space."}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 space-y-10">

        {/* Recently viewed */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-slate-400" />
            <h2 className="text-heading-sm">Recently viewed</h2>
          </div>

          {recentLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : recent.length === 0 ? (
            <div className="card px-6 py-8 text-center">
              <FileText size={28} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">Pages you visit will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recent.map((page) => (
                <Link
                  key={page.id}
                  to={`/spaces/${page.space?.key}/${page.id}`}
                  className="card-hover flex items-start gap-3 p-4 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center text-base flex-shrink-0 border border-brand-100">
                    {page.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-brand-600 transition-colors">
                      {page.title}
                    </p>
                    <p className="text-2xs text-slate-400 mt-0.5 font-medium">{page.space?.name}</p>
                    <p className="text-2xs text-slate-400 mt-0.5">
                      <RelativeTime date={page.viewedAt} />
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Spaces */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading-sm">Your spaces</h2>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-all"
            >
              <Plus size={13} />New space
            </button>
          </div>

          {spacesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
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
      </div>

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
