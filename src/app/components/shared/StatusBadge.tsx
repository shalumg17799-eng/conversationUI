import React from 'react';
import { Badge } from '../ui/Badge';

export type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'destructive' | 'info';

const toneToVariant: Record<StatusTone, React.ComponentProps<typeof Badge>['variant']> = {
  neutral: 'default',
  brand: 'brand',
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
  info: 'secondary',
};

export interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: StatusTone;
  /** Show a small leading status dot. */
  dot?: boolean;
  className?: string;
}

const dotColor: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground',
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-foreground',
};

/** Semantic status pill built on <Badge>, with an optional status dot. */
export function StatusBadge({ children, tone = 'neutral', dot = false, className }: StatusBadgeProps) {
  return (
    <Badge variant={toneToVariant[tone]} className={className}>
      {dot && <span className={`size-1.5 rounded-full ${dotColor[tone]}`} />}
      {children}
    </Badge>
  );
}
