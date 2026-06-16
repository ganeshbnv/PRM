import { useEffect } from 'react';

export function useKeyboard(
  key: string,
  handler: () => void,
  options: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {}
) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const metaMatch = options.meta ? e.metaKey || e.ctrlKey : true;
      const ctrlMatch = options.ctrl ? e.ctrlKey : true;
      const shiftMatch = options.shift ? e.shiftKey : true;
      if (e.key === key && metaMatch && ctrlMatch && shiftMatch) {
        e.preventDefault();
        handler();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [key, handler, options.meta, options.ctrl, options.shift]);
}
