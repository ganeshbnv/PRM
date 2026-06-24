import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, SlidersHorizontal, X } from 'lucide-react';
import { useFilterStore } from '../../store/filters';
import { api } from '../../api/client';
import { CheckDropdown } from '../common/CheckDropdown';
import type { CheckOption } from '../common/CheckDropdown';

const LABEL = 'block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5';

// ── Single-select dropdown (portal-based to escape overflow clipping) ─────────

interface DropdownOption { value: string; label: string; }
interface DropdownProps {
  label: string; value: string; options: DropdownOption[];
  onChange: (v: string) => void; placeholder?: string; minWidth?: string;
}

function Dropdown({ label, value, options, onChange, placeholder = 'Select…', minWidth = 'min-w-[160px]' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const selected = options.find(o => o.value === value);

  const openMenu = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 180) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 180) });
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [open]);

  return (
    <div className="flex-shrink-0">
      <p className={LABEL}>{label}</p>
      <button ref={btnRef} type="button" onClick={() => open ? setOpen(false) : openMenu()}
        className={`${minWidth} flex items-center justify-between gap-3 bg-white dark:bg-surface-elevated border rounded-lg px-3 py-2 text-sm font-medium transition-all
          ${open
            ? 'border-brand-500 ring-2 ring-brand-500/20 text-gray-900 dark:text-white'
            : 'border-gray-200 dark:border-surface-border text-gray-700 dark:text-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-surface-card'}`}
      >
        <span className="truncate">{selected?.label ?? <span className="text-gray-400 font-normal">{placeholder}</span>}</span>
        <ChevronDown size={14} className={`flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div ref={menuRef}
          style={{ position: 'fixed', left: pos.left, top: pos.top, minWidth: pos.width, zIndex: 9999 }}
          className="bg-white dark:bg-surface-elevated border border-gray-200 dark:border-surface-border rounded-xl shadow-lg dark:shadow-black/40 py-1">
          {options.map(opt => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors
                ${opt.value === value
                  ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 font-medium'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-card'}`}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={13} className="flex-shrink-0 text-brand-500" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── BoardsFilterBar ───────────────────────────────────────────────────────────

interface Props {
  sprintOptions: CheckOption[];
  sprintsLoading: boolean;
}

export function BoardsFilterBar({ sprintOptions, sprintsLoading }: Props) {
  const { filters, setFilter, resetFilters } = useFilterStore();
  const [projects, setProjects] = useState<string[]>([]);
  const [teams, setTeams]       = useState<string[]>([]);

  useEffect(() => {
    api.getProjects()
      .then(list => setProjects(list.map((p: { name: string }) => p.name).sort()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!filters.project) { setTeams([]); return; }
    api.getTeams(filters.project)
      .then((list: { name: string }[]) => {
        setTeams(list.map(t => t.name).sort());
        setFilter('selectedTeams', []);
        setFilter('team', '');
        setFilter('iterationPath', '');
        setFilter('selectedSprints', []);
      })
      .catch(() => {});
  }, [filters.project]);

  const projectOptions: DropdownOption[] = [
    { value: '', label: '— Select a project —' },
    ...projects.map(p => ({ value: p, label: p })),
  ];

  const teamOptions: CheckOption[] = teams.map(t => ({ value: t, label: t }));

  const typeOptions: DropdownOption[] = [
    { value: '', label: 'All Types' },
    { value: 'Bug',         label: 'Bug'        },
    { value: 'Task',        label: 'Task'       },
    { value: 'User Story',  label: 'User Story' },
    { value: 'Feature',     label: 'Feature'    },
    { value: 'Epic',        label: 'Epic'       },
  ];

  const activeFilterCount =
    filters.selectedTeams.length +
    filters.selectedSprints.length +
    (filters.workItemType ? 1 : 0) +
    (filters.assignedTo   ? 1 : 0);

  return (
    <div className="flex-shrink-0 bg-surface-card border-b border-surface-border">
      <div className="flex items-end gap-5 px-5 sm:px-6 py-4 overflow-x-auto scrollbar-none">

        {/* Icon */}
        <div className="flex-shrink-0 self-end mb-2.5 text-gray-400">
          <SlidersHorizontal size={15} />
        </div>

        {/* Project */}
        <Dropdown
          label="Project"
          value={filters.project}
          options={projectOptions}
          onChange={v => setFilter('project', v)}
          placeholder="Select project…"
          minWidth="min-w-[200px]"
        />

        <div className="w-px h-9 bg-gray-200 dark:bg-surface-border self-end mb-0.5 flex-shrink-0" />

        {/* Teams */}
        <CheckDropdown
          label="Teams"
          options={teamOptions}
          selected={filters.selectedTeams}
          onChange={v => {
            setFilter('selectedTeams', v);
            setFilter('team', v[0] ?? '');
            setFilter('iterationPath', '');
            setFilter('selectedSprints', []);
          }}
          allLabel="All Teams"
          minWidth="min-w-[140px]"
          disabled={teams.length === 0}
        />

        {/* Sprint */}
        <CheckDropdown
          label="Sprint"
          options={sprintOptions}
          selected={filters.selectedSprints}
          onChange={v => {
            setFilter('selectedSprints', v);
            setFilter('iterationPath', v[0] ?? '');
          }}
          allLabel="All Sprints"
          minWidth="min-w-[170px]"
          disabled={sprintsLoading || !filters.project}
        />

        <div className="w-px h-9 bg-gray-200 dark:bg-surface-border self-end mb-0.5 flex-shrink-0" />

        {/* Type */}
        <Dropdown
          label="Type"
          value={filters.workItemType}
          options={typeOptions}
          onChange={v => setFilter('workItemType', v)}
          minWidth="min-w-[120px]"
        />

        {/* Team Member */}
        <div className="flex-shrink-0">
          <p className={LABEL}>Team Member</p>
          <input
            type="text"
            placeholder="Search by name…"
            value={filters.assignedTo}
            onChange={e => setFilter('assignedTo', e.target.value)}
            className="w-56 bg-white dark:bg-surface-elevated border border-gray-200 dark:border-surface-border rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400
              focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all hover:border-gray-300 dark:hover:border-gray-500"
          />
        </div>

        {/* Reset — only visible when something is active */}
        {activeFilterCount > 0 && (
          <button
            onClick={resetFilters}
            className="self-end mb-0.5 ml-2 flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-500/20"
          >
            <X size={12} />
            <span>Reset</span>
            <span className="bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400 rounded-full px-1.5 py-px text-[10px] font-bold leading-none">{activeFilterCount}</span>
          </button>
        )}
      </div>
    </div>
  );
}
