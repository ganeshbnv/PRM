import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  sub?: string;
  color?: string;
  stripe?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, sub, color = 'text-white', stripe, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={`card flex flex-col gap-1 relative overflow-hidden ${onClick ? 'cursor-pointer hover:bg-surface-elevated transition-colors' : ''}`}
    >
      {stripe && <div className={`absolute top-0 left-0 right-0 h-[3px] ${stripe}`} />}
      <span className="text-xs text-gray-400 uppercase tracking-wider mt-1">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}
