import React from 'react';
import { cn } from '../../../lib/utils';

export interface ToolbarProps {
  /** Left cluster — usually search + filters. */
  left?: React.ReactNode;
  /** Right cluster — usually view toggles + primary actions. */
  right?: React.ReactNode;
  className?: string;
}

/**
 * Horizontal action bar that sits above lists/tables. Stacks on small screens.
 * Pair with <SearchInput>, <FilterBar>, and <Button>.
 */
export function Toolbar({ left, right, className }: ToolbarProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4', className)}>
      <div className="flex items-center gap-2 flex-wrap">{left}</div>
      {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
    </div>
  );
}
