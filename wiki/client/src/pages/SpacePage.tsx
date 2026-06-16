import { useEffect, useState } from 'react';
import { useNavigate, useParams, Outlet } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';
import { spacesApi } from '../api/spaces';
import { pagesApi } from '../api/pages';
import type { Space, PageTreeNode } from '../types';
import { PageTree } from '../components/pages/PageTree';
import { Skeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';

function updateNodeTitle(nodes: PageTreeNode[], pageId: string, title: string): PageTreeNode[] {
  return nodes.map((n) =>
    n.id === pageId
      ? { ...n, title }
      : { ...n, children: updateNodeTitle(n.children, pageId, title) }
  );
}

function removeNode(nodes: PageTreeNode[], pageId: string): PageTreeNode[] {
  return nodes
    .filter((n) => n.id !== pageId)
    .map((n) => ({ ...n, children: removeNode(n.children, pageId) }));
}

export function SpacePage() {
  const { spaceKey } = useParams<{ spaceKey: string }>();
  const navigate = useNavigate();
  const [space, setSpace] = useState<Space | null>(null);
  const [tree, setTree] = useState<PageTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spaceKey) return;
    Promise.all([spacesApi.getOne(spaceKey), pagesApi.getTree(spaceKey)])
      .then(([s, t]) => { setSpace(s); setTree(t); })
      .finally(() => setLoading(false));
  }, [spaceKey]);

  const createRootPage = async () => {
    if (!spaceKey) return;
    const page = await pagesApi.create(spaceKey, { title: 'Untitled' });
    navigate(`/spaces/${spaceKey}/${page.id}/edit`);
  };

  const handlePageDeleted = (pageId: string) => {
    setTree((prev) => removeNode(prev, pageId));
    // Navigate away if deleted page is currently open
    if (window.location.pathname.includes(`/${pageId}`)) {
      navigate(`/spaces/${spaceKey}`);
    }
  };

  const handlePageRenamed = (pageId: string, newTitle: string) => {
    setTree((prev) => updateNodeTitle(prev, pageId, newTitle));
  };

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-60 border-r border-surface-border p-3 space-y-1">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 rounded-lg" />)}
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-64 mb-4 rounded-lg" />
          <Skeleton className="h-4 w-full mb-2 rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
        </div>
      </div>
    );
  }

  if (!space) return <div className="p-8 text-slate-500">Space not found</div>;

  return (
    <div className="flex h-full">
      {/* Page tree panel */}
      <div className="w-60 border-r border-surface-border flex flex-col flex-shrink-0 overflow-hidden bg-surface-subtle">
        <div className="px-3 py-2.5 border-b border-surface-border flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg leading-none">{space.iconEmoji}</span>
            <span className="font-semibold text-sm text-slate-800 truncate">{space.name}</span>
          </div>
          <button
            onClick={createRootPage}
            className="p-1.5 rounded-lg hover:bg-surface-border text-slate-400 hover:text-slate-600 flex-shrink-0 transition-colors"
            title="New page"
          >
            <Plus size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {tree.length === 0 ? (
            <div className="py-10 text-center px-4">
              <p className="text-xs text-slate-400 mb-2">No pages yet</p>
              <button onClick={createRootPage} className="text-xs text-brand-600 font-medium hover:underline">
                Create first page
              </button>
            </div>
          ) : (
            <PageTree
              nodes={tree}
              spaceKey={spaceKey!}
              onPageCreated={(pageId) => navigate(`/spaces/${spaceKey}/${pageId}/edit`)}
              onPageDeleted={handlePageDeleted}
              onPageRenamed={handlePageRenamed}
            />
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto bg-white">
        <Outlet context={{ space, tree, setTree }} />
        {/* Default view when no page is selected */}
        {!window.location.pathname.includes('/spaces/' + spaceKey + '/') && (
          <div className="p-10 max-w-2xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center text-2xl border border-brand-100 shadow-sm">
                {space.iconEmoji}
              </div>
              <div>
                <h1 className="text-heading-lg">{space.name}</h1>
                {space.description && (
                  <p className="text-slate-500 text-sm mt-0.5">{space.description}</p>
                )}
              </div>
            </div>
            {tree.length === 0 && (
              <EmptyState
                icon={<FileText size={36} />}
                title="This space is empty"
                description="Create your first page to start documenting."
                action={{ label: 'Create first page', onClick: createRootPage }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
