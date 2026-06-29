import React from 'react';
import { cn } from '../../../lib/utils';

export interface FilterTab {
  label: string;
  value: string;
  count?: number;
}

export interface FilterBarProps {
  tabs: FilterTab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Segmented pill filter (e.g. All / Active / Draft) with optional counts. */
export function FilterBar({ tabs, value, onChange, className }: FilterBarProps) {
  return (
    <div className={cn('inline-flex items-center gap-1 p-1 bg-muted rounded-full', className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('text-xs tabular-nums', active ? 'text-brand' : 'text-muted-foreground')}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
