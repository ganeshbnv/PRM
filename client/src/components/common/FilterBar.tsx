import { useEffect, useState } from 'react';
import { useFilterStore } from '../../store/filters';
import { api } from '../../api/client';

export function FilterBar() {
  const { filters, setFilter, resetFilters } = useFilterStore();
  const [projects, setProjects] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);

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
        setFilter('iterationPath', ''); // reset sprint when project changes
      })
      .catch(() => {});
  }, [filters.project]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-surface-card border-b border-surface-border text-sm">
      {/* Project selector */}
      <select
        value={filters.project}
        onChange={(e) => setFilter('project', e.target.value)}
        className="bg-surface-elevated border border-brand-600 rounded-lg px-3 py-1.5 text-gray-200 font-medium min-w-[200px]"
      >
        <option value="">— Select a project —</option>
        {projects.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <span className="text-surface-border px-1">|</span>

      <input type="text" placeholder="Person…" value={filters.assignedTo}
        onChange={(e) => setFilter('assignedTo', e.target.value)}
        className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-1.5 text-gray-200 w-32" />

      <select value={filters.workItemType} onChange={(e) => setFilter('workItemType', e.target.value)}
        className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-1.5 text-gray-200">
        <option value="">All Types</option>
        <option value="Bug">Bug</option>
        <option value="Task">Task</option>
        <option value="User Story">User Story</option>
        <option value="Feature">Feature</option>
        <option value="Epic">Epic</option>
      </select>

      {teams.length > 0 && (
        <select
          value={filters.team}
          onChange={(e) => {
            setFilter('team', e.target.value);
            setFilter('iterationPath', ''); // reset sprint when team changes
          }}
          className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-1.5 text-gray-200 text-sm"
        >
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}

      <button onClick={resetFilters} className="btn-ghost text-xs ml-auto">Reset</button>
    </div>
  );
}
