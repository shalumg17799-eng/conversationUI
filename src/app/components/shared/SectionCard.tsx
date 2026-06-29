import React from 'react';
import { cn } from '../../../lib/utils';

export interface SectionCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned header actions (filters, view toggles, links). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Remove inner body padding (e.g. when wrapping a full-bleed table). */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
}

/**
 * A titled content panel — the workhorse container for page sections. Header is
 * optional; pass `flush` when the body is a table or chart that owns its padding.
 */
export function SectionCard({
  title, description, actions, children, flush = false, className, bodyClassName,
}: SectionCardProps) {
  const hasHeader = title || description || actions;
  return (
    <section className={cn('bg-card border border-border rounded-[12px] shadow-sm overflow-hidden', className)}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn(flush ? '' : 'p-5', bodyClassName)}>{children}</div>
    </section>
  );
}
