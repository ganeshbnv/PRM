import { useEffect, useRef, useState } from 'react';
import { Tag, Plus, Check } from 'lucide-react';
import type { Label } from '../../types';
import { apiClient } from '../../api/client';

interface LabelPickerProps {
  spaceKey: string;
  selected: Label[];
  onAdd: (label: Label) => void;
  onRemove: (labelId: string) => void;
}

export function LabelPicker({ spaceKey, selected, onAdd, onRemove }: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.get<Label[]>(`/spaces/${spaceKey}/labels`).then((r) => setLabels(r.data)).catch(() => {});
  }, [spaceKey]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const createLabel = async () => {
    if (!newName.trim()) return;
    const { data } = await apiClient.post<Label>(`/spaces/${spaceKey}/labels`, { name: newName });
    setLabels((prev) => [...prev, data]);
    onAdd(data);
    setNewName('');
  };

  const isSelected = (id: string) => selected.some((l) => l.id === id);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <Tag size={12} />
        Labels
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border py-2 z-20">
          <ul className="max-h-48 overflow-y-auto">
            {labels.map((label) => (
              <li key={label.id}>
                <button
                  onClick={() => isSelected(label.id) ? onRemove(label.id) : onAdd(label)}
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                    {label.name}
                  </span>
                  {isSelected(label.id) && <Check size={12} className="text-brand-600" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t px-3 py-2 flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New label..."
              className="flex-1 text-xs border-none outline-none"
              onKeyDown={(e) => e.key === 'Enter' && createLabel()}
            />
            <button onClick={createLabel} className="text-brand-600"><Plus size={12} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
