import { useState } from 'react';
import type { Comment } from '../../types';
import { Avatar } from '../common/Avatar';
import { RelativeTime } from '../common/RelativeTime';
import { commentsApi } from '../../api/comments';
import { CommentInput } from './CommentInput';
import { CheckCircle, Reply, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../utils/cn';

interface CommentThreadProps {
  comment: Comment;
  pageId: string;
  onUpdate: (comment: Comment) => void;
  onDelete: (id: string) => void;
}

export function CommentThread({ comment, pageId, onUpdate, onDelete }: CommentThreadProps) {
  const [showReply, setShowReply] = useState(false);
  const [replies, setReplies] = useState<Comment[]>(comment.replies ?? []);
  const { user } = useAuth();

  const handleResolve = async () => {
    const updated = await commentsApi.resolve(comment.id);
    onUpdate(updated as Comment);
  };

  const handleDelete = async () => {
    await commentsApi.delete(comment.id);
    onDelete(comment.id);
  };

  const handleReply = async (body: string) => {
    const reply = await commentsApi.create(pageId, { body, parentId: comment.id });
    setReplies((prev) => [...prev, reply]);
    setShowReply(false);
  };

  return (
    <li className={cn('space-y-2', comment.isResolved && 'opacity-60')}>
      <div className="flex items-start gap-2.5">
        <Avatar name={comment.author.name} avatarUrl={comment.author.avatarUrl} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900">{comment.author.name}</span>
            <RelativeTime date={comment.createdAt} className="text-xs text-gray-400" />
            {comment.isResolved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle size={10} /> Resolved
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</p>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => setShowReply((v) => !v)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <Reply size={10} />Reply
            </button>
            {!comment.isResolved && (
              <button onClick={handleResolve} className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600">
                <CheckCircle size={10} />Resolve
              </button>
            )}
            {user?.id === comment.author.id && (
              <button onClick={handleDelete} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500">
                <Trash2 size={10} />Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {replies.length > 0 && (
        <ul className="ml-8 space-y-3 pl-3 border-l border-gray-100">
          {replies.map((reply) => (
            <li key={reply.id} className="flex items-start gap-2">
              <Avatar name={reply.author.name} size="sm" />
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-900">{reply.author.name}</span>
                  <RelativeTime date={reply.createdAt} className="text-xs text-gray-400" />
                </div>
                <p className="text-sm text-gray-700">{reply.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showReply && (
        <div className="ml-8">
          <CommentInput onSubmit={handleReply} onCancel={() => setShowReply(false)} placeholder="Reply..." />
        </div>
      )}
    </li>
  );
}
