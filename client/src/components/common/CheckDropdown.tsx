import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface CheckOption { value: string; label: string; group?: string; }

interface Props {
  label: string;
  options: CheckOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
  minWidth?: string;
  disabled?: boolean;
}

const LABEL = 'block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

export function CheckDropdown({
  label, options, selected, onChange,
  allLabel = 'All', minWidth = 'min-w-[160px]', disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);

  const openMenu = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 200) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 200) });
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [open]);

  const displayLabel =
    selected.length === 0 ? allLabel
    : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
    : `${selected.length} selected`;

  const isAll = selected.length === 0;

  // Build grouped sections
  const grouped: { group: string | null; items: CheckOption[] }[] = [];
  const ungrouped: CheckOption[] = [];
  const groupOrder: string[] = [];
  for (const opt of options) {
    if (opt.group) {
      if (!groupOrder.includes(opt.group)) groupOrder.push(opt.group);
    } else {
      ungrouped.push(opt);
    }
  }
  for (const g of groupOrder) {
    grouped.push({ group: g, items: options.filter(o => o.group === g) });
  }
  if (ungrouped.length > 0) grouped.push({ group: null, items: ungrouped });

  const hasGroups = groupOrder.length > 0;

  return (
    <div>
      <p className={LABEL}>{label}</p>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => open ? setOpen(false) : openMenu()}
        className={`
          ${minWidth} flex items-center justify-between gap-3
          bg-white dark:bg-surface-elevated border rounded-lg px-3 py-2 text-sm font-medium transition-all
          disabled:opacity-40 disabled:cursor-not-allowed
          ${open
            ? 'border-brand-500 ring-2 ring-brand-500/20 text-gray-900 dark:text-white'
            : 'border-gray-200 dark:border-surface-border text-gray-700 dark:text-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-surface-card'
          }
        `}
      >
        <span className={`truncate ${isAll ? 'text-gray-400 font-normal' : ''}`}>{displayLabel}</span>
        <ChevronDown size={14} className={`flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', left: pos.left, top: pos.top, minWidth: pos.width, zIndex: 9999 }}
          className="bg-white dark:bg-surface-elevated border border-gray-200 dark:border-surface-border rounded-xl shadow-lg dark:shadow-black/40 py-1"
        >
          {/* All / clear */}
          <button
            type="button"
            onClick={() => { onChange([]); setOpen(false); }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors
              ${isAll
                ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 font-medium'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-card'}`}
          >
            <span>{allLabel}</span>
            {isAll && <Check size={13} className="flex-shrink-0 text-brand-500" />}
          </button>

          <div className="h-px bg-gray-100 dark:bg-white/5 mx-2 my-1" />

          <div className="max-h-72 overflow-y-auto">
            {hasGroups ? grouped.map(({ group, items }, gi) => (
              <div key={group ?? '__ungrouped__'}>
                {gi > 0 && <div className="h-px bg-gray-100 dark:bg-white/5 mx-2 my-1" />}
                {group && (
                  <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {group}
                  </p>
                )}
                {items.map(opt => {
                  const checked = selected.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggle(opt.value)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors
                        ${checked
                          ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-card'}`}
                    >
                      <span className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors
                        ${checked ? 'bg-brand-500 border-brand-500' : 'border-gray-300 dark:border-gray-600'}`}>
                        {checked && <Check size={9} className="text-white" strokeWidth={3} />}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )) : options.map(opt => {
              const checked = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors
                    ${checked
                      ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-card'}`}
                >
                  <span className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors
                    ${checked ? 'bg-brand-500 border-brand-500' : 'border-gray-300 dark:border-gray-600'}`}>
                    {checked && <Check size={9} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
