import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  sub?: string;
  color?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, sub, color = 'text-white', onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={`card flex flex-col gap-1 ${onClick ? 'cursor-pointer hover:bg-surface-elevated transition-colors' : ''}`}
    >
      <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}
