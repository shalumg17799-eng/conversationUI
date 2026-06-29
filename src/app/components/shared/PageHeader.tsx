import React from 'react';
import { cn } from '../../../lib/utils';

export interface PageHeaderProps {
  /** Optional small label above the title (e.g. section / breadcrumb tail). */
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, menus). */
  actions?: React.ReactNode;
  /** Optional leading icon block. */
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Standard page title block — title, optional eyebrow + description, right-aligned
 * actions. Use at the top of every page for a consistent header rhythm.
 */
export function PageHeader({ eyebrow, title, description, actions, icon, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-6', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="flex-shrink-0 w-10 h-10 rounded-[10px] bg-brand-subtle text-brand flex items-center justify-center [&_svg]:size-5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-xs font-medium uppercase tracking-wide text-brand mb-1">{eyebrow}</div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
