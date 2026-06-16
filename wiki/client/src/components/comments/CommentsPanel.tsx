import { useEffect, useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { commentsApi } from '../../api/comments';
import type { Comment } from '../../types';
import { CommentThread } from './CommentThread';
import { CommentInput } from './CommentInput';
import { Skeleton } from '../common/Skeleton';
import { EmptyState } from '../common/EmptyState';

interface CommentsPanelProps {
  pageId: string;
}

export function CommentsPanel({ pageId }: CommentsPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    commentsApi.getAll(pageId)
      .then(setComments)
      .finally(() => setLoading(false));
  }, [pageId]);

  const onComment = async (body: string) => {
    const c = await commentsApi.create(pageId, { body });
    setComments((prev) => [...prev, c]);
    setShowInput(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 flex items-center gap-2 text-sm">
          <MessageSquare size={14} />
          Comments {comments.length > 0 && `(${comments.length})`}
        </h3>
        <button
          onClick={() => setShowInput((v) => !v)}
          className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {showInput && (
        <CommentInput onSubmit={onComment} onCancel={() => setShowInput(false)} />
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : comments.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={28} />}
          title="No comments yet"
          description="Be the first to comment on this page."
        />
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => (
            <CommentThread
              key={c.id}
              comment={c}
              pageId={pageId}
              onUpdate={(updated) => setComments((prev) => prev.map((x) => x.id === updated.id ? updated : x))}
              onDelete={(id) => setComments((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
