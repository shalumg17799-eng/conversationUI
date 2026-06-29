// Shared, reusable application components — built on shadcn/ui primitives and
// driven entirely by the design tokens in src/styles/theme.css.
// Import from one place:  import { PageHeader, StatCard } from '@/app/components/shared';
export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

export { StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';

export { MetricGrid } from './MetricGrid';
export type { MetricGridProps } from './MetricGrid';

export { SectionCard } from './SectionCard';
export type { SectionCardProps } from './SectionCard';

export { SearchInput } from './SearchInput';
export type { SearchInputProps } from './SearchInput';

export { Toolbar } from './Toolbar';
export type { ToolbarProps } from './Toolbar';

export { FilterBar } from './FilterBar';
export type { FilterBarProps, FilterTab } from './FilterBar';

export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps, StatusTone } from './StatusBadge';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { DataTable } from './DataTable';
export type { DataTableProps, Column } from './DataTable';
