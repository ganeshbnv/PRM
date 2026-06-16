import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Edit, MessageSquare, History, ChevronRight,
  ChevronDown, Download, FileText, ChevronsLeftRight,
} from 'lucide-react';
import { pagesApi } from '../api/pages';
import type { Page } from '../types';
import { PageEditor } from '../components/editor/PageEditor';
import { Breadcrumb } from '../components/pages/Breadcrumb';
import { PageMetadata } from '../components/pages/PageMetadata';
import { CommentsPanel } from '../components/comments/CommentsPanel';
import { VersionHistory } from '../components/pages/VersionHistory';
import { AISummarizer } from '../components/ai/AISummarizer';
import { Skeleton } from '../components/common/Skeleton';
import { cn } from '../utils/cn';

export function PageViewPage() {
  const { spaceKey, pageId } = useParams<{ spaceKey: string; pageId: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidePanel, setSidePanel] = useState<'comments' | 'history' | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pageId) return;
    setLoading(true);
    pagesApi.getOne(pageId)
      .then(setPage)
      .finally(() => setLoading(false));
  }, [pageId]);

  // Close export dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const exportAsPDF = () => {
    setShowExport(false);
    if (!page) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>${page.title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #111; }
        h1 { font-size: 2rem; margin-bottom: 0.5rem; }
        img { max-width: 100%; }
        @media print { body { padding: 0; } }
      </style>
    </head><body>
      <h1>${page.emoji} ${page.title}</h1>
      ${page.content}
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const exportAsWord = () => {
    setShowExport(false);
    if (!page) return;
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8">
        <style>body { font-family: Calibri, sans-serif; font-size: 11pt; }</style>
      </head><body>
        <h1>${page.emoji} ${page.title}</h1>
        ${page.content}
      </body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.title}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Skeleton className="h-4 w-48 mb-6" />
        <Skeleton className="h-10 w-96 mb-4" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-8" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!page) return <div className="p-8 text-slate-500">Page not found</div>;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className={cn('mx-auto px-6 py-8', expanded ? 'max-w-none' : 'max-w-4xl')}>

          {/* Top bar */}
          <div className="flex items-start justify-between mb-6 gap-4">
            <Breadcrumb
              items={[
                { label: page.space?.name ?? spaceKey ?? '', href: `/spaces/${spaceKey}` },
                { label: page.title },
              ]}
            />
            <div className="flex items-center gap-2 flex-shrink-0">

              {/* Export dropdown */}
              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setShowExport((v) => !v)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-slate-600 hover:bg-surface-muted text-sm transition-colors',
                    showExport && 'bg-surface-muted'
                  )}
                  title="Export"
                >
                  <Download size={14} />
                  Export
                  <ChevronDown size={12} className={cn('transition-transform', showExport && 'rotate-180')} />
                </button>
                {showExport && (
                  <div className="absolute right-0 top-full mt-1 w-36 bg-white border rounded-lg shadow-lg z-20 py-1">
                    <button
                      onClick={exportAsPDF}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-surface-subtle transition-colors"
                    >
                      <FileText size={13} />PDF
                    </button>
                    <button
                      onClick={exportAsWord}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-surface-subtle transition-colors"
                    >
                      <FileText size={13} />Word (.doc)
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => setSidePanel((v) => v === 'history' ? null : 'history')}
                className={cn('p-2 rounded-md text-slate-500 hover:bg-surface-muted transition-colors', sidePanel === 'history' && 'bg-surface-muted')}
                title="Version history"
              >
                <History size={16} />
              </button>
              <button
                onClick={() => setSidePanel((v) => v === 'comments' ? null : 'comments')}
                className={cn('p-2 rounded-md text-slate-500 hover:bg-surface-muted transition-colors relative', sidePanel === 'comments' && 'bg-surface-muted')}
                title="Comments"
              >
                <MessageSquare size={16} />
                {(page._count?.comments ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-brand-600 text-white text-[9px] rounded-full flex items-center justify-center">
                    {page._count?.comments}
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate(`/spaces/${spaceKey}/${pageId}/edit`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-md text-sm hover:bg-brand-700 transition-colors"
              >
                <Edit size={14} />Edit
              </button>
            </div>
          </div>

          {/* Title */}
          <div className="mb-4 flex items-center gap-3">
            <span className="text-4xl">{page.emoji}</span>
            <h1 className="text-heading-xl">{page.title}</h1>
          </div>

          <PageMetadata page={page} />

          {/* Expand/collapse button */}
          <div className="flex justify-center my-3">
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Collapse to reading width' : 'Expand to full width'}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-surface-border text-slate-400 hover:text-slate-600 hover:border-slate-300 hover:bg-surface-subtle transition-colors text-xs"
            >
              <ChevronsLeftRight size={14} />
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </div>

          <div className="mt-4">
            <AISummarizer pageId={page.id} title={page.title} content={page.content} />
            <PageEditor content={page.content} onChange={() => {}} editable={false} className="border-0 shadow-none" />
          </div>
        </div>
      </div>

      {/* Side panel */}
      {sidePanel && (
        <div className="w-80 border-l border-surface-border flex-shrink-0 overflow-y-auto p-4 bg-surface-subtle">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-heading-sm">
              {sidePanel === 'comments' ? 'Comments' : 'History'}
            </h3>
            <button onClick={() => setSidePanel(null)} className="p-1.5 rounded-lg hover:bg-surface-border text-slate-400 transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>
          {sidePanel === 'comments' && <CommentsPanel pageId={page.id} />}
          {sidePanel === 'history' && (
            <VersionHistory
              pageId={page.id}
              currentContent={page.content}
              onRestore={(content) => {
                setPage((p) => p ? { ...p, content } : null);
                setSidePanel(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
