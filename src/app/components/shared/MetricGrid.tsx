import React from 'react';
import { cn } from '../../../lib/utils';

export interface MetricGridProps {
  children: React.ReactNode;
  /** Columns at the largest breakpoint. Responsive steps are derived automatically. */
  columns?: 2 | 3 | 4;
  className?: string;
}

const colClass: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

/** Responsive grid wrapper for <StatCard> tiles (or any equal-width cards). */
export function MetricGrid({ children, columns = 4, className }: MetricGridProps) {
  return <div className={cn('grid gap-4', colClass[columns], className)}>{children}</div>;
}
