import React from 'react';
import { cn } from "../../../lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'brand' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

// Token-driven button. Colors come from theme.css design tokens, so a palette
// change there restyles every button app-wide. `brand` = terracotta CTA.
export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
    brand: "bg-brand text-brand-foreground hover:bg-brand-hover border-transparent",
    secondary: "bg-card text-foreground border-border hover:bg-accent",
    outline: "bg-transparent text-foreground border-border hover:bg-accent",
    ghost: "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground border-transparent",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-transparent",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-3 text-base gap-2",
    icon: "h-9 w-9",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-[8px] border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
