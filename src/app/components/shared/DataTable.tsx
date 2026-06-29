import React from 'react';
import { cn } from '../../../lib/utils';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  /** Header label. */
  header: React.ReactNode;
  /** Cell renderer, or a key to read from the row. */
  cell: keyof T | ((row: T, index: number) => React.ReactNode);
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  className?: string;
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/**
 * Generic, token-styled data table with typed column defs. Pass a renderer or a
 * row key per column. Supply `empty` for the zero-row state.
 */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty, className }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="No data" description="Nothing to show here yet." />}</>;
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col, i) => (
              <th
                key={i}
                className={cn(
                  'px-4 py-3 font-medium text-xs uppercase tracking-wide text-muted-foreground',
                  alignClass[col.align ?? 'left'],
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr
              key={rowKey(row, rIdx)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-border last:border-0 transition-colors',
                onRowClick && 'cursor-pointer hover:bg-accent'
              )}
            >
              {columns.map((col, cIdx) => {
                const content =
                  typeof col.cell === 'function' ? col.cell(row, rIdx) : (row[col.cell] as React.ReactNode);
                return (
                  <td
                    key={cIdx}
                    className={cn('px-4 py-3 text-foreground', alignClass[col.align ?? 'left'], col.className)}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
