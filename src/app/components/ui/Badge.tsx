import React from 'react';
import { cn } from "../../../lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'secondary' | 'accent' | 'brand' | 'success' | 'warning' | 'destructive';
}

// Token-driven badge / status pill. `brand`/`accent` = terracotta tint.
export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: "bg-muted text-foreground",
    outline: "border border-border text-muted-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    accent: "bg-brand-subtle text-brand",
    brand: "bg-brand-subtle text-brand",
    success: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success",
    warning: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning",
    destructive: "bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] text-destructive",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
