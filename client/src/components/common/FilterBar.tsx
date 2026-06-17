import { useEffect, useState } from 'react';
import { useFilterStore } from '../../store/filters';
import { api } from '../../api/client';

const selectCls =
  'bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 font-medium ' +
  'focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 transition-colors ' +
  'dark:bg-surface-elevated dark:border-surface-border dark:text-gray-200';

const inputCls =
  'bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 ' +
  'focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 transition-colors ' +
  'dark:bg-surface-elevated dark:border-surface-border dark:text-gray-200 dark:placeholder-gray-500';

const labelCls = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1';

export function FilterBar() {
  const { filters, setFilter, resetFilters } = useFilterStore();
  const [projects, setProjects] = useState<string[]>([]);
  const [teams, setTeams]       = useState<string[]>([]);

  useEffect(() => {
    api.getProjects()
      .then((list) => setProjects(list.map((p: { name: string }) => p.name).sort()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!filters.project) { setTeams([]); return; }
    api.getTeams(filters.project)
      .then((list: { name: string }[]) => {
        setTeams(list.map((t) => t.name).sort());
        setFilter('team', list[0]?.name ?? '');
        setFilter('iterationPath', '');
      })
      .catch(() => {});
  }, [filters.project]);

  return (
    <div className="flex flex-wrap items-end gap-4 px-5 py-3 bg-surface-card border-b border-surface-border">

      {/* Project */}
      <div>
        <label className={labelCls}>Project</label>
        <select
          value={filters.project}
          onChange={(e) => setFilter('project', e.target.value)}
          className={`${selectCls} min-w-[220px]`}
        >
          <option value="">— Select a project —</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="w-px h-9 bg-gray-200 self-end mb-0.5" />

      {/* Team */}
      {teams.length > 0 && (
        <div>
          <label className={labelCls}>Team</label>
          <select
            value={filters.team}
            onChange={(e) => {
              setFilter('team', e.target.value);
              setFilter('iterationPath', '');
            }}
            className={`${selectCls} min-w-[160px]`}
          >
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Type */}
      <div>
        <label className={labelCls}>Type</label>
        <select
          value={filters.workItemType}
          onChange={(e) => setFilter('workItemType', e.target.value)}
          className={`${selectCls} min-w-[130px]`}
        >
          <option value="">All Types</option>
          <option value="Bug">Bug</option>
          <option value="Task">Task</option>
          <option value="User Story">User Story</option>
          <option value="Feature">Feature</option>
          <option value="Epic">Epic</option>
        </select>
      </div>

      {/* Person */}
      <div>
        <label className={labelCls}>Person</label>
        <input
          type="text"
          placeholder="Filter by name…"
          value={filters.assignedTo}
          onChange={(e) => setFilter('assignedTo', e.target.value)}
          className={`${inputCls} w-44`}
        />
      </div>

      {/* Reset */}
      <button
        onClick={resetFilters}
        className="self-end mb-0.5 ml-auto px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
      >
        Reset filters
      </button>
    </div>
  );
}
