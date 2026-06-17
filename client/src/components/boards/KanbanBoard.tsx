import type { WorkItem } from '../../types';

const COLUMNS = [
  { id: 'todo',     label: 'To Do',       states: ['New', 'Reopened'],                           color: '#6366f1', bg: 'border-indigo-500/40' },
  { id: 'active',   label: 'In Progress', states: ['Active', 'In Progress', 'Committed'],         color: '#3b82f6', bg: 'border-blue-500/40'   },
  { id: 'testing',  label: 'Testing',     states: ['Ready for Testing', 'In Testing'],            color: '#8b5cf6', bg: 'border-violet-500/40'  },
  { id: 'resolved', label: 'Resolved',    states: ['Resolved', 'Verified', 'Completed'],          color: '#10b981', bg: 'border-emerald-500/40' },
  { id: 'closed',   label: 'Closed',      states: ['Closed', 'Done', 'Discarded', 'Cannot Reproduce'], color: '#6b7280', bg: 'border-gray-600/40'    },
];

const TYPE_ICONS: Record<string, string> = {
  'Bug': '🐛',
  'User Story': '📖',
  'Task': '✅',
  'Feature': '⭐',
  'Epic': '🚀',
};


interface Props {
  items: WorkItem[];
  onCardClick: (title: string, items: WorkItem[]) => void;
}

export function KanbanBoard({ items, onCardClick }: Props) {
  // Group items into columns
  const stateToCol: Record<string, string> = {};
  for (const col of COLUMNS) {
    for (const s of col.states) stateToCol[s] = col.id;
  }

  const grouped: Record<string, WorkItem[]> = {};
  for (const col of COLUMNS) grouped[col.id] = [];
  const overflow: WorkItem[] = [];

  for (const item of items) {
    const colId = stateToCol[item.fields['System.State']];
    if (colId) grouped[colId].push(item);
    else overflow.push(item);
  }

  // Sort each column: most recently updated first
  for (const col of COLUMNS) {
    grouped[col.id].sort((a, b) =>
      new Date(b.fields['System.ChangedDate']).getTime() - new Date(a.fields['System.ChangedDate']).getTime()
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
      {COLUMNS.map((col) => {
        const colItems = grouped[col.id];
        const wip = colItems.length;
        return (
          <div key={col.id} className={`flex-shrink-0 w-72 flex flex-col rounded-xl border bg-surface-elevated/40 ${col.bg}`}>
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
                <span className="text-sm font-semibold text-gray-200">{col.label}</span>
              </div>
              <span className="text-xs font-mono text-gray-500 bg-surface-card px-2 py-0.5 rounded-full">{wip}</span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-2 overflow-y-auto max-h-[600px]">
              {colItems.length === 0 && (
                <div className="text-xs text-gray-600 text-center py-8">Empty</div>
              )}
              {colItems.map((item) => (
                <KanbanCard key={item.id} item={item} onClick={() => onCardClick(item.fields['System.Title'], [item])} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Catch-all column for unmapped states */}
      {overflow.length > 0 && (
        <div className="flex-shrink-0 w-72 flex flex-col rounded-xl border bg-surface-elevated/40 border-gray-700/40">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-border">
            <span className="text-sm font-semibold text-gray-400">Other</span>
            <span className="text-xs font-mono text-gray-500 bg-surface-card px-2 py-0.5 rounded-full">{overflow.length}</span>
          </div>
          <div className="flex flex-col gap-2 p-2 overflow-y-auto max-h-[600px]">
            {overflow.map((item) => (
              <KanbanCard key={item.id} item={item} onClick={() => onCardClick(item.fields['System.Title'], [item])} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanCard({ item, onClick }: { item: WorkItem; onClick: () => void }) {
  const type = item.fields['System.WorkItemType'];
  const assignee = item.fields['System.AssignedTo'];
  const initials = assignee
    ? assignee.displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const daysSinceUpdate = Math.floor((Date.now() - new Date(item.fields['System.ChangedDate']).getTime()) / 86400000);
  const isStale = ['Active', 'In Progress', 'Committed'].includes(item.fields['System.State']) && daysSinceUpdate >= 3;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg bg-surface-card border border-surface-border hover:border-brand-600/50 hover:bg-surface-elevated transition-all p-2.5 group"
    >
      {/* Type + ID */}
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm flex-shrink-0">{TYPE_ICONS[type] ?? '📋'}</span>
          <span className="text-label font-mono text-gray-600">#{item.id}</span>
        </div>
        {isStale && <span title="Stale 3+ days" className="text-label text-yellow-500 flex-shrink-0">⚠</span>}
      </div>

      {/* Title */}
      <p className="text-xs text-gray-300 group-hover:text-white leading-snug line-clamp-2 mb-2">
        {item.fields['System.Title']}
      </p>

      {/* Footer: assignee + date */}
      <div className="flex items-center justify-between">
        {assignee ? (
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-brand-700 flex items-center justify-center text-label font-bold text-white flex-shrink-0">
              {initials}
            </span>
            <span className="text-label text-gray-500 truncate max-w-[100px]">
              {assignee.displayName.split(' ')[0]}
            </span>
          </div>
        ) : (
          <span className="text-label text-gray-600 italic">Unassigned</span>
        )}
        <span className="text-label text-gray-600">
          {daysSinceUpdate === 0 ? 'today' : `${daysSinceUpdate}d ago`}
        </span>
      </div>
    </button>
  );
}
