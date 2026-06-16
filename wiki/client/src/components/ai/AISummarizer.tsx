import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface AISummarizerProps {
  pageId: string;
  title: string;
  content: string;
}

export function AISummarizer({ title, content }: AISummarizerProps) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const getSummary = async () => {
    if (summary) { setExpanded((v) => !v); return; }
    setExpanded(true);
    setLoading(true);
    let result = '';
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/ai/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${JSON.parse(localStorage.getItem('wiki-auth') ?? '{}').accessToken ?? ''}`,
        },
        body: JSON.stringify({ title, content }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value).split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as { type: string; text?: string };
                if (data.type === 'delta' && data.text) {
                  result += data.text;
                  setSummary(result);
                }
              } catch { /* skip */ }
            }
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden mb-6">
      <button
        onClick={getSummary}
        className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-purple-700">
          <Sparkles size={14} />
          AI Summary
        </span>
        {expanded ? <ChevronUp size={14} className="text-purple-500" /> : <ChevronDown size={14} className="text-purple-500" />}
      </button>
      {expanded && (
        <div className="px-4 py-3 bg-white">
          {loading && !summary ? (
            <div className="text-sm text-gray-400 animate-pulse">Generating summary...</div>
          ) : (
            <p className="text-sm text-gray-700">{summary}</p>
          )}
        </div>
      )}
    </div>
  );
}
