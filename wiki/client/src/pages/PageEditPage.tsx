import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Eye, Sparkles, Lock, Globe } from 'lucide-react';
import { pagesApi } from '../api/pages';
import type { Page } from '../types';
import { PageEditor } from '../components/editor/PageEditor';
import { Breadcrumb } from '../components/pages/Breadcrumb';
import { Skeleton } from '../components/common/Skeleton';
import { AIGenerateModal } from '../components/ai/AIGenerateModal';
import { AIAssistant } from '../components/ai/AIAssistant';
import { PageAccessModal } from '../components/pages/PageAccessModal';
import { Button } from '../components/common/Button';
import { cn } from '../utils/cn';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function PageEditPage() {
  const { spaceKey, pageId } = useParams<{ spaceKey: string; pageId: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState<Page | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [aiGenOpen, setAiGenOpen] = useState(false);
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pageId) return;
    pagesApi.getOne(pageId)
      .then((p) => { setPage(p); setTitle(p.title); setContent(p.content); })
      .finally(() => setLoading(false));
  }, [pageId]);

  const save = useCallback(async (t: string, c: string) => {
    if (!pageId) return;
    setSaveStatus('saving');
    try {
      await pagesApi.update(pageId, { title: t, content: c });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [pageId]);

  const debouncedSave = (t: string, c: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(t, c), 2500);
  };

  const onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    debouncedSave(e.target.value, content);
  };

  const onContentChange = (html: string) => {
    setContent(html);
    debouncedSave(title, html);
    const sel = window.getSelection()?.toString().trim() ?? '';
    setSelectedText(sel);
  };

  const publish = async () => {
    if (!pageId) return;
    await pagesApi.update(pageId, { status: 'published' });
    navigate(`/spaces/${spaceKey}/${pageId}`);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Skeleton className="h-4 w-48 mb-6" />
        <Skeleton className="h-12 w-96 mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!page) return <div className="p-8 text-slate-500">Page not found</div>;

  const isPrivate = page.isPrivate;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 gap-4">
        <Breadcrumb
          items={[
            { label: page.space?.name ?? spaceKey ?? '', href: `/spaces/${spaceKey}` },
            { label: title || 'Untitled' },
          ]}
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn(
            'text-xs',
            saveStatus === 'saving' ? 'text-slate-400' :
            saveStatus === 'saved' ? 'text-green-600' :
            saveStatus === 'error' ? 'text-red-500' : 'text-transparent'
          )}>
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && '✓ Saved'}
            {saveStatus === 'error' && 'Save failed'}
          </span>

          <button
            onClick={() => setAiGenOpen(true)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-purple-600 hover:bg-purple-50 text-sm transition-colors"
          >
            <Sparkles size={14} />Generate
          </button>

          {selectedText && (
            <AIAssistant
              selectedText={selectedText}
              onResult={(text) => { setContent(text); save(title, text); }}
            />
          )}

          {/* Access / visibility button */}
          <button
            onClick={() => setAccessModalOpen(true)}
            title={isPrivate ? 'Private page — click to manage access' : 'Public page — click to manage access'}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 rounded text-sm transition-colors',
              isPrivate
                ? 'text-amber-600 hover:bg-amber-50'
                : 'text-slate-500 hover:bg-surface-muted'
            )}
          >
            {isPrivate ? <Lock size={14} /> : <Globe size={14} />}
            {isPrivate ? 'Private' : 'Public'}
          </button>

          <button
            onClick={() => navigate(`/spaces/${spaceKey}/${pageId}`)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-slate-600 hover:bg-surface-muted text-sm transition-colors"
          >
            <Eye size={14} />Preview
          </button>

          <Button size="sm" onClick={publish}>
            <Check size={14} />Publish
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl cursor-pointer" title="Click to change emoji">
          {page.emoji}
        </span>
        <input
          value={title}
          onChange={onTitleChange}
          placeholder="Untitled"
          className="flex-1 text-3xl font-bold text-slate-900 border-none outline-none bg-transparent placeholder:text-slate-300"
        />
      </div>

      <PageEditor
        content={content}
        onChange={onContentChange}
        editable
      />

      <AIGenerateModal
        open={aiGenOpen}
        onClose={() => setAiGenOpen(false)}
        onGenerated={(html) => { setContent(html); save(title, html); }}
      />

      <PageAccessModal
        open={accessModalOpen}
        onClose={() => setAccessModalOpen(false)}
        page={page}
        onSaved={(updated) => setPage((p) => p ? { ...p, ...updated } : null)}
      />
    </div>
  );
}
