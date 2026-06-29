import React from 'react';
import { cn } from '../../../lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Primary action(s) — usually a single <Button>. */
  action?: React.ReactNode;
  className?: string;
}

/** Centered empty / zero-data placeholder for lists, tables, and panels. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-12', className)}>
      {icon && (
        <div className="w-12 h-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center mb-4 [&_svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
