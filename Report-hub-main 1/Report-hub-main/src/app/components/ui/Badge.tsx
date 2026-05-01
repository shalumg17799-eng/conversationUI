import React from 'react';
import { cn } from "../../../lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'secondary' | 'accent';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: "bg-gray-100 text-gray-800",
    outline: "border border-gray-200 text-gray-600",
    secondary: "bg-blue-50 text-blue-700",
    accent: "bg-rose-50 text-rose-700",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
