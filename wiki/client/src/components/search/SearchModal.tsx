import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { pagesApi } from '../../api/pages';
import type { SearchResult } from '../../types';
import { Skeleton } from '../common/Skeleton';
import { cn } from '../../utils/cn';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await pagesApi.search(query);
        setResults(r);
        setActiveIdx(0);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const goTo = useCallback((result: SearchResult) => {
    navigate(`/spaces/${result.space.key}/${result.id}`);
    onClose();
  }, [navigate, onClose]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIdx]) goTo(results[activeIdx]);
    else if (e.key === 'Escape') onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center px-4 py-3 border-b gap-3">
          <Search size={16} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search pages..."
            className="flex-1 text-sm outline-none text-gray-900 placeholder:text-gray-400"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
          <kbd className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : results.length === 0 && query ? (
            <div className="p-8 text-center text-sm text-gray-500">No results for "{query}"</div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <Search size={24} />
              <span>Type to search pages</span>
            </div>
          ) : (
            <ul>
              {results.map((result, i) => (
                <li key={result.id}>
                  <button
                    onClick={() => goTo(result)}
                    className={cn(
                      'w-full text-left flex items-start gap-3 px-4 py-3 transition-colors',
                      activeIdx === i ? 'bg-brand-50' : 'hover:bg-gray-50'
                    )}
                  >
                    <span className="text-lg flex-shrink-0 mt-0.5">{result.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{result.title}</div>
                      <div className="text-xs text-gray-500 truncate">{result.space.name}</div>
                      {result.snippet && (
                        <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{result.snippet}</div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
