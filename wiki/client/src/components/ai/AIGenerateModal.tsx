import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { Sparkles } from 'lucide-react';

interface AIGenerateModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (html: string) => void;
}

export function AIGenerateModal({ open, onClose, onGenerated }: AIGenerateModalProps) {
  const [topic, setTopic] = useState('');
  const [outline, setOutline] = useState('');
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!topic) return;
    setLoading(true);
    let result = '';
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/ai/generate-page`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${JSON.parse(localStorage.getItem('wiki-auth') ?? '{}').accessToken ?? ''}`,
        },
        body: JSON.stringify({ topic, outline }),
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
                if (data.type === 'delta' && data.text) result += data.text;
              } catch { /* skip */ }
            }
          }
        }
      }
      onGenerated(result);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Generate with AI" size="md">
      <div className="space-y-4">
        <Input
          label="Topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g., API Authentication Best Practices"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Outline (optional)</label>
          <textarea
            value={outline}
            onChange={(e) => setOutline(e.target.value)}
            placeholder="Introduction\nSetup\nExamples\n..."
            rows={4}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={generate} loading={loading} disabled={!topic}>
            <Sparkles size={14} />Generate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
