import { Link } from 'react-router-dom';
import { FileText, Users, Lock } from 'lucide-react';
import type { Space } from '../../types';

interface SpaceCardProps {
  space: Space;
}

export function SpaceCard({ space }: SpaceCardProps) {
  return (
    <Link
      to={`/spaces/${space.key}`}
      className="card-hover flex flex-col p-5 group h-full"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center text-xl shadow-sm border border-brand-100">
          {space.iconEmoji}
        </div>
        {space.isPrivate && (
          <span className="badge badge-amber">
            <Lock size={9} />Private
          </span>
        )}
      </div>

      <h3 className="text-heading-sm group-hover:text-brand-600 truncate transition-colors mb-1">
        {space.name}
      </h3>

      {space.description && (
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3">
          {space.description}
        </p>
      )}

      {space._count && (
        <div className="mt-auto pt-3 border-t border-surface-border flex items-center gap-3 text-2xs text-slate-400">
          <span className="flex items-center gap-1">
            <FileText size={10} />
            {space._count.pages} page{space._count.pages !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Users size={10} />
            {space._count.members} member{space._count.members !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </Link>
  );
}
