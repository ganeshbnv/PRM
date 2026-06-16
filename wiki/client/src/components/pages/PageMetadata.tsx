import type { Page } from '../../types';
import { Avatar } from '../common/Avatar';
import { RelativeTime } from '../common/RelativeTime';
import { Clock, Eye } from 'lucide-react';

interface PageMetadataProps {
  page: Page;
}

export function PageMetadata({ page }: PageMetadataProps) {
  const wordCount = page.content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
      <span className="flex items-center gap-1.5">
        <Avatar name={page.creator.name} avatarUrl={page.creator.avatarUrl} size="sm" />
        <span className="text-gray-600">{page.creator.name}</span>
      </span>
      <span className="flex items-center gap-1">
        <Clock size={10} />
        <RelativeTime date={page.updatedAt} />
      </span>
      {page._count && (
        <span className="flex items-center gap-1">
          <Eye size={10} />
          {page._count.views} views
        </span>
      )}
      <span>{wordCount} words</span>
    </div>
  );
}
