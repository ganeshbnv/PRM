import React, { useState } from 'react';
import { Button } from '../common/Button';

interface CommentInputProps {
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
}

export function CommentInput({ onSubmit, onCancel, placeholder = 'Write a comment...' }: CommentInputProps) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    try {
      await onSubmit(body.trim());
      setBody('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        )}
        <Button size="sm" type="submit" loading={loading} disabled={!body.trim()}>
          Comment
        </Button>
      </div>
    </form>
  );
}
