import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

/** Pill search field with a leading icon and terracotta focus ring. */
export function SearchInput({ className, containerClassName, ...props }: SearchInputProps) {
  return (
    <div className={cn('relative', containerClassName)}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        className={cn(
          'w-full h-9 pl-10 pr-4 bg-input-background border border-input rounded-full text-sm text-foreground',
          'placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-ring/15 transition-all',
          className
        )}
        {...props}
      />
    </div>
  );
}
