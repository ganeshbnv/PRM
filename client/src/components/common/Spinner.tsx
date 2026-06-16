export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }[size];
  return (
    <div className={`animate-spin rounded-full border-2 border-surface-border border-t-brand-500 ${s}`} />
  );
}

export function LoadingCard({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="card flex items-center justify-center gap-3 py-12">
      <Spinner />
      <span className="text-sm text-gray-400">{label}</span>
    </div>
  );
}

export function ErrorCard({ error }: { error: string }) {
  return (
    <div className="card border-red-700/50 bg-red-900/20 text-red-300 text-sm py-8 flex items-center justify-center gap-2">
      <span>⚠</span>
      <span>{error}</span>
    </div>
  );
}
