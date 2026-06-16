import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, children, width = 'max-w-3xl' }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className={`relative bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full ${width} max-h-[85vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5 text-gray-400 hover:text-white">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>
  );
}
