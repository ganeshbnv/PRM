import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

export function useRelativeTime(dateStr: string) {
  const [relative, setRelative] = useState(() =>
    formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  );

  useEffect(() => {
    const update = () =>
      setRelative(formatDistanceToNow(new Date(dateStr), { addSuffix: true }));
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [dateStr]);

  return relative;
}
