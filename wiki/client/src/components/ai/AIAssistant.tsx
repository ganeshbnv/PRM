import { useState } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

interface AIAssistantProps {
  selectedText: string;
  onResult: (text: string) => void;
}

type Action = 'improve' | 'summarize' | 'expand' | 'fix-grammar';

const ACTIONS: Array<{ key: Action; label: string }> = [
  { key: 'improve', label: 'Improve writing' },
  { key: 'summarize', label: 'Summarize' },
  { key: 'expand', label: 'Expand' },
  { key: 'fix-grammar', label: 'Fix grammar' },
];

export function AIAssistant({ selectedText, onResult }: AIAssistantProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = async (action: Action) => {
    setOpen(false);
    setLoading(true);
    let result = '';
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/ai/assist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${JSON.parse(localStorage.getItem('wiki-auth') ?? '{}').accessToken ?? ''}`,
        },
        body: JSON.stringify({ selectedText, action }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as { type: string; text?: string };
              if (data.type === 'delta' && data.text) result += data.text;
            } catch {
              // skip
            }
          }
        }
      }
      onResult(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!selectedText || loading}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          'bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-40 disabled:cursor-not-allowed'
        )}
      >
        <Sparkles size={14} />
        {loading ? 'Generating...' : 'AI'}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 bg-white rounded-lg shadow-lg border py-1 w-44 z-20">
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => run(a.key)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
