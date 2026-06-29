import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Optional delta, e.g. "+12.4%". Direction drives the up/down icon + color. */
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
  /** Whether an up trend is good (green) or bad (red). Default: up = good. */
  invertTrendColor?: boolean;
  icon?: React.ReactNode;
  hint?: string;
  className?: string;
}

/**
 * A single KPI tile — label, big value, optional trend delta. Compose many via
 * <MetricGrid>. Trend color: up=success / down=destructive (flip with invertTrendColor).
 */
export function StatCard({
  label, value, delta, trend = 'flat', invertTrendColor = false, icon, hint, className,
}: StatCardProps) {
  const good = invertTrendColor ? trend === 'down' : trend === 'up';
  const trendColor = trend === 'flat' ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive';
  const TrendIcon = trend === 'down' ? TrendingDown : TrendingUp;

  return (
    <div className={cn('bg-card border border-border rounded-[12px] p-5 shadow-sm', className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</span>
        {delta && trend !== 'flat' && (
          <span className={cn('flex items-center gap-0.5 text-xs font-medium mb-1', trendColor)}>
            <TrendIcon className="size-3.5" />
            {delta}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}
