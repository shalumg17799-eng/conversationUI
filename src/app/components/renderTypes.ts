// Plain-TS (no JSX) list of every renderType the UITreeRenderer can render.
// Kept in its own module so the parity check + backend can import it without React.
// UITreeRenderer's COMPONENT_MAP is typed `Record<RenderType, ...>` — TS fails to
// compile if this list and the map ever drift.

export const RENDER_TYPES = [
  'KPI', 'KPICard', 'KPIGrid', 'StatDelta',
  'BarChart', 'LineChart', 'AreaChart', 'PieChart', 'RankedList',
  'ScatterPlot', 'FunnelChart', 'GaugeChart', 'ComparisonCard',
  'HeatMap', 'Sparkline', 'ComboChart', 'PivotTable',
  'TimelineCard', 'StepList', 'Callout', 'ProgressBar',
  'Table', 'GenerativeTable',
  'InsightCard', 'AlertBanner', 'SummaryText',
  'TwoColumn', 'Section', 'Report', 'ReportSkeleton', 'BigQueryDashboard',
  // Rich artifacts (Phase 2, Track D) — rendered via a sandboxed iframe, never
  // as raw injected markup. Kebab-case matches the registry entries in
  // backend/src/registry/componentRegistry.ts.
  // 'mermaid-artifact' carries Mermaid source rather than markup; it is compiled
  // to SVG client-side and then travels the identical sandbox path.
  'html-artifact', 'svg-artifact', 'mermaid-artifact',
] as const;

export type RenderType = typeof RENDER_TYPES[number];
