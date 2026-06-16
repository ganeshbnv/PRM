import { useEffect, useState } from 'react';
import { pagesApi } from '../../api/pages';
import type { PageVersion } from '../../types';
import { Avatar } from '../common/Avatar';
import { RelativeTime } from '../common/RelativeTime';
import { Skeleton } from '../common/Skeleton';
import { History, RotateCcw } from 'lucide-react';
import { cn } from '../../utils/cn';

interface VersionHistoryProps {
  pageId: string;
  currentContent: string;
  onRestore?: (content: string) => void;
}

// ── Diff engine ──────────────────────────────────────────────────────────────

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

type RawToken = { text: string; status: 'added' | 'removed' | 'equal' };
type DiffToken =
  | { text: string; type: 'equal' | 'added' | 'removed' }
  | { oldText: string; newText: string; type: 'replaced' };

function lcsWordDiff(oldWords: string[], newWords: string[]): RawToken[] {
  const m = oldWords.length, n = newWords.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldWords[i - 1] === newWords[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const result: RawToken[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      result.unshift({ text: oldWords[i - 1], status: 'equal' });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ text: newWords[j - 1], status: 'added' });
      j--;
    } else {
      result.unshift({ text: oldWords[i - 1], status: 'removed' });
      i--;
    }
  }
  return result;
}

function computeDiff(oldHtml: string, newHtml: string): DiffToken[] {
  const oldWords = stripHtml(oldHtml).split(/\s+/).filter(Boolean).slice(0, 800);
  const newWords = stripHtml(newHtml).split(/\s+/).filter(Boolean).slice(0, 800);
  const raw = lcsWordDiff(oldWords, newWords);

  const result: DiffToken[] = [];
  let i = 0;
  while (i < raw.length) {
    // Adjacent removed+added → "replaced" (orange)
    if (raw[i].status === 'removed' && i + 1 < raw.length && raw[i + 1].status === 'added') {
      result.push({ type: 'replaced', oldText: raw[i].text, newText: raw[i + 1].text });
      i += 2;
    } else {
      result.push({ text: raw[i].text, type: raw[i].status });
      i++;
    }
  }
  return result;
}

// ── Component ────────────────────────────────────────────────────────────────

export function VersionHistory({ pageId, currentContent, onRestore }: VersionHistoryProps) {
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<PageVersion | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    pagesApi.getVersions(pageId)
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [pageId]);

  const handleViewVersion = async (v: PageVersion) => {
    if (selectedVersion?.id === v.id) {
      setSelectedVersion(null);
      return;
    }
    if (v.content) {
      setSelectedVersion(v);
      return;
    }
    setDiffLoading(true);
    try {
      const full = await pagesApi.getVersion(pageId, v.version);
      setSelectedVersion(full);
    } finally {
      setDiffLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-gray-900 flex items-center gap-2">
        <History size={14} />
        Version History
      </h3>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <ul className="space-y-1">
          {versions.map((v) => (
            <li key={v.id}>
              <button
                onClick={() => handleViewVersion(v)}
                className={cn(
                  'w-full text-left flex items-center gap-3 p-2 rounded-lg transition-colors',
                  selectedVersion?.id === v.id
                    ? 'bg-brand-50 ring-1 ring-brand-200'
                    : 'hover:bg-gray-50'
                )}
              >
                <Avatar name={v.author.name} avatarUrl={v.author.avatarUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">v{v.version} — {v.title}</div>
                  <div className="text-xs text-gray-500">
                    {v.author.name} · <RelativeTime date={v.createdAt} />
                  </div>
                </div>
              </button>

              {selectedVersion?.id === v.id && (
                <div className="ml-2 mt-1 rounded-lg border bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                    <span className="text-xs font-medium text-gray-600">
                      Changes since v{v.version}
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        added
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                        replaced
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                        deleted
                      </span>
                    </div>
                  </div>

                  {diffLoading ? (
                    <div className="p-3 space-y-1">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                  ) : selectedVersion.content ? (
                    <DiffView
                      oldContent={selectedVersion.content}
                      newContent={currentContent}
                    />
                  ) : null}

                  {onRestore && selectedVersion.content && (
                    <div className="px-3 py-2 bg-gray-50 border-t flex justify-end">
                      <button
                        onClick={() => { onRestore(selectedVersion.content!); setSelectedVersion(null); }}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors"
                      >
                        <RotateCcw size={11} />
                        Restore this version
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DiffView({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const tokens = computeDiff(oldContent, newContent);
  const hasChanges = tokens.some((t) => t.type !== 'equal');

  if (!hasChanges) {
    return (
      <p className="px-3 py-3 text-xs text-gray-400 italic">No text changes detected.</p>
    );
  }

  return (
    <p className="px-3 py-3 text-sm leading-relaxed text-gray-700 max-h-48 overflow-y-auto">
      {tokens.map((token, i) => {
        if (token.type === 'equal') {
          return <span key={i}>{token.text} </span>;
        }
        if (token.type === 'added') {
          return (
            <span key={i} className="bg-green-100 text-green-800 rounded px-0.5">
              {token.text}{' '}
            </span>
          );
        }
        if (token.type === 'removed') {
          return (
            <span key={i} className="bg-red-100 text-red-700 line-through rounded px-0.5">
              {token.text}{' '}
            </span>
          );
        }
        // replaced — show old (strikethrough orange) → new (orange)
        if (token.type === 'replaced') {
          return (
            <span key={i}>
              <span className="bg-orange-100 text-orange-700 line-through rounded px-0.5">
                {token.oldText}
              </span>
              {' '}
              <span className="bg-orange-100 text-orange-800 font-medium rounded px-0.5">
                {token.newText}
              </span>
              {' '}
            </span>
          );
        }
        return null;
      })}
    </p>
  );
}

