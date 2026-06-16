import { format } from 'date-fns';
import { useRelativeTime } from '../../hooks/useRelativeTime';
import { Tooltip } from './Tooltip';

interface RelativeTimeProps {
  date: string;
  className?: string;
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const relative = useRelativeTime(date);
  const absolute = format(new Date(date), 'MMM d, yyyy HH:mm');

  return (
    <Tooltip content={absolute}>
      <time dateTime={date} className={className}>
        {relative}
      </time>
    </Tooltip>
  );
}
