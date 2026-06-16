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
        <div className="w-64 border-r p-4 space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8" />)}
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (!space) return <div className="p-8 text-gray-500">Space not found</div>;

  return (
    <div className="flex h-full">
      {/* Page tree panel */}
      <div className="w-60 border-r flex flex-col flex-shrink-0 overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">{space.iconEmoji}</span>
            <span className="font-medium text-sm text-gray-900 truncate">{space.name}</span>
          </div>
          <button
            onClick={createRootPage}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0"
            title="New page"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {tree.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-gray-400 mb-2">No pages yet</p>
              <button onClick={createRootPage} className="text-xs text-brand-600 hover:underline">
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
      <div className="flex-1 overflow-y-auto">
        <Outlet context={{ space, tree, setTree }} />
        {/* Default view when no page is selected */}
        {!window.location.pathname.includes('/spaces/' + spaceKey + '/') && (
          <div className="p-8">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{space.iconEmoji}</span>
                <h1 className="text-2xl font-bold text-gray-900">{space.name}</h1>
              </div>
              {space.description && <p className="text-gray-500">{space.description}</p>}
            </div>
            <EmptyState
              icon={<FileText size={40} />}
              title="This space is empty"
              description="Create your first page to get started documenting."
              action={{ label: 'Create first page', onClick: createRootPage }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
