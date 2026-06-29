import React from 'react';
import { cn } from "../../../lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function Card({ children, className, noPadding = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground rounded-[12px] border border-border shadow-sm overflow-hidden",
        className
      )}
      {...props}
    >
      <div className={cn(noPadding ? "" : "p-6")}>
        {children}
      </div>
    </div>
  );
}
