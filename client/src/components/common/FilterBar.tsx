import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useFilterStore } from '../../store/filters';
import { api } from '../../api/client';

type Tab = 'boards' | 'bugs' | 'engineers' | 'repos' | 'wiki' | 'risks';
interface Props { activeTab: Tab; }

const SHOW: Record<Tab, { team: boolean; type: boolean; person: boolean }> = {
  boards:    { team: true,  type: true,  person: true  },
  bugs:      { team: true,  type: false, person: true  },
  engineers: { team: false, type: false, person: false },
  repos:     { team: false, type: false, person: false },
  risks:     { team: false, type: false, person: false },
  wiki:      { team: false, type: false, person: false },
};

const LABEL = 'block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

// ── Reusable custom dropdown ─────────────────────────────────────────────────

interface DropdownOption { value: string; label: string; }

interface DropdownProps {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  minWidth?: string;
}

function Dropdown({ label, value, options, onChange, placeholder = 'Select…', minWidth = 'min-w-[160px]' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <p className={LABEL}>{label}</p>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={`
          ${minWidth} flex items-center justify-between gap-3
          bg-white border rounded-lg px-3 py-2 text-sm font-medium transition-all
          ${open
            ? 'border-brand-500 ring-2 ring-brand-500/20 text-gray-900'
            : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'}
        `}
      >
        <span className="truncate">{selected?.label ?? <span className="text-gray-400 font-normal">{placeholder}</span>}</span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-full bg-white border border-gray-200 rounded-xl shadow-lg py-1 animate-pop-up">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`
                w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors
                ${opt.value === value
                  ? 'text-brand-600 bg-brand-50 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'}
              `}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={13} className="flex-shrink-0 text-brand-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filter bar ───────────────────────────────────────────────────────────────

export function FilterBar({ activeTab }: Props) {
  const { filters, setFilter, resetFilters } = useFilterStore();
  const [projects, setProjects] = useState<string[]>([]);
  const [teams, setTeams]       = useState<string[]>([]);

  const show = SHOW[activeTab];
  const hasExtras = show.team || show.type || show.person;

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

  const projectOptions: DropdownOption[] = [
    { value: '', label: '— Select a project —' },
    ...projects.map(p => ({ value: p, label: p })),
  ];

  const teamOptions: DropdownOption[] = teams.map(t => ({ value: t, label: t }));

  const typeOptions: DropdownOption[] = [
    { value: '',            label: 'All Types'   },
    { value: 'Bug',         label: 'Bug'         },
    { value: 'Task',        label: 'Task'        },
    { value: 'User Story',  label: 'User Story'  },
    { value: 'Feature',     label: 'Feature'     },
    { value: 'Epic',        label: 'Epic'        },
  ];

  return (
    <div className="flex flex-wrap items-end gap-4 px-5 py-3 bg-surface-card border-b border-surface-border">

      {/* Project */}
      <Dropdown
        label="Project"
        value={filters.project}
        options={projectOptions}
        onChange={(v) => setFilter('project', v)}
        placeholder="Select a project…"
        minWidth="min-w-[220px]"
      />

      {hasExtras && <div className="w-px h-9 bg-gray-100 self-end mb-0.5" />}

      {/* Team */}
      {show.team && teams.length > 0 && (
        <Dropdown
          label="Team"
          value={filters.team}
          options={teamOptions}
          onChange={(v) => { setFilter('team', v); setFilter('iterationPath', ''); }}
          minWidth="min-w-[160px]"
        />
      )}

      {/* Type */}
      {show.type && (
        <Dropdown
          label="Type"
          value={filters.workItemType}
          options={typeOptions}
          onChange={(v) => setFilter('workItemType', v)}
          minWidth="min-w-[130px]"
        />
      )}

      {/* Person */}
      {show.person && (
        <div>
          <p className={LABEL}>Person</p>
          <input
            type="text"
            placeholder="Filter by name…"
            value={filters.assignedTo}
            onChange={(e) => setFilter('assignedTo', e.target.value)}
            className="w-44 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400
              focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all hover:border-gray-300"
          />
        </div>
      )}

      {/* Reset */}
      <button
        onClick={resetFilters}
        className="self-end mb-0.5 ml-auto px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        Reset
      </button>
    </div>
  );
}
