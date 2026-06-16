import { Link } from 'react-router-dom';
import { FileText, Users } from 'lucide-react';
import type { Space } from '../../types';

interface SpaceCardProps {
  space: Space;
}

export function SpaceCard({ space }: SpaceCardProps) {
  return (
    <Link
      to={`/spaces/${space.key}`}
      className="block rounded-xl border p-4 hover:border-brand-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{space.iconEmoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 group-hover:text-brand-600 truncate">{space.name}</h3>
          {space.description && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{space.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            {space._count && (
              <>
                <span className="flex items-center gap-1"><FileText size={10} />{space._count.pages} pages</span>
                <span className="flex items-center gap-1"><Users size={10} />{space._count.members} members</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
