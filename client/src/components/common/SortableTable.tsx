import { useState } from 'react';
import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

type Direction = 'asc' | 'desc';

export function SortableTable<T>({ columns, data, rowKey, onRowClick, emptyMessage = 'No data' }: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>('asc');

  function handleSort(col: Column<T>) {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setDirection('asc');
    }
  }

  const sorted = [...data].sort((a, b) => {
    if (!sortKey) return 0;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return 0;
    const va = col.sortValue(a);
    const vb = col.sortValue(b);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return direction === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border">
      <table className="w-full text-sm text-left">
        <thead className="bg-surface-elevated text-gray-500 dark:text-gray-400 uppercase text-xs tracking-wider">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col)}
                className={`px-4 py-3 ${col.sortable ? 'cursor-pointer select-none hover:text-gray-900 dark:hover:text-white' : ''}`}
              >
                {col.header}
                {col.sortable && sortKey === col.key && (
                  <span className="ml-1">{direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-10 text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={`border-t border-surface-border hover:bg-surface-elevated transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-gray-700 dark:text-gray-200">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
