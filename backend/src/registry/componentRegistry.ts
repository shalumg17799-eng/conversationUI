// Single source of truth for every renderable component.
// Consumed (progressively) by: renderer parity check (Phase 1), validator (Phase 2+),
// constraint deriver (Phase 2+), and generated prompt menu (Phase 2+).
//
// Phase 1: this file only DEFINES the registry. Nothing enforces it at runtime yet.
// `family`, `tier`, `outputModes`, `dataNeeds`, and `shapeConstraints` are inert metadata.

export type ComponentFamily = 'metric' | 'chart' | 'table' | 'narrative' | 'layout';
export type ComponentTier = 'atomic' | 'molecular' | 'organism' | 'layout';
export type DataNeeds = 'none' | 'rows' | 'series';

// Enforced evolution of the existing `template` field. Tags only in Phase 1 (no enforcement).
export type OutputMode =
  | 'single_metric' | 'single_chart' | 'table'
  | 'narrative' | 'comparison_dashboard' | 'full_dashboard' | 'qa_answer';

// Single source of truth for enum membership (used by validators/resolvers in later phases).
export const OUTPUT_MODES: readonly OutputMode[] = [
  'single_metric', 'single_chart', 'table',
  'narrative', 'comparison_dashboard', 'full_dashboard', 'qa_answer',
] as const;

export interface ComponentSpec {
  type: string;                 // MUST match a key in the frontend COMPONENT_MAP
  tier: ComponentTier;
  family: ComponentFamily;
  requiredProps: string[];
  optionalProps: string[];
  dataNeeds: DataNeeds;         // drives hydrateTree in later phases
  shapeConstraints?: { requiresTimeSeries?: boolean; minRows?: number; maxColumns?: number };
  outputModes: OutputMode[];    // metadata only in Phase 1
  whenToUse: string;
  isLayoutWrapper?: boolean;    // true for containers whose children the governor evaluates transparently
  // propTypes?: Record<string, 'string'|'number'|'array'|'object'|'boolean'>; // Phase 2 (Ajv)
}

const ALL: OutputMode[] = ['single_chart', 'comparison_dashboard', 'full_dashboard'];

export const COMPONENT_REGISTRY: ComponentSpec[] = [
  // ── METRIC ────────────────────────────────────────────────────────────────
  { type: 'KPI',       tier: 'atomic', family: 'metric', requiredProps: ['title', 'value'], optionalProps: ['label','trend','delta','deltaLabel','explanation'], dataNeeds: 'none', outputModes: ['single_metric','single_chart','comparison_dashboard','full_dashboard','narrative'], whenToUse: 'Single headline metric.' },
  { type: 'KPICard',   tier: 'atomic', family: 'metric', requiredProps: ['title', 'value'], optionalProps: ['label','trend','delta','deltaLabel','explanation'], dataNeeds: 'none', outputModes: ['single_metric','single_chart','comparison_dashboard','full_dashboard','narrative'], whenToUse: 'Single headline metric.' },
  { type: 'KPIGrid',   tier: 'organism', family: 'metric', requiredProps: ['metrics'], optionalProps: ['columns','explanation'], dataNeeds: 'none', outputModes: ['comparison_dashboard','full_dashboard'], whenToUse: '2-6 metrics together.' },
  { type: 'StatDelta', tier: 'atomic', family: 'metric', requiredProps: ['title','current','previous'], optionalProps: ['currentLabel','previousLabel','trend','explanation'], dataNeeds: 'none', outputModes: ['single_metric','comparison_dashboard','full_dashboard'], whenToUse: 'Current vs previous value.' },
  { type: 'GaugeChart', tier: 'molecular', family: 'metric', requiredProps: ['title','value'], optionalProps: ['max','target','unit','explanation'], dataNeeds: 'none', outputModes: ['single_metric','comparison_dashboard','full_dashboard'], whenToUse: 'Attainment vs a target.' },
  { type: 'Sparkline', tier: 'atomic', family: 'metric', requiredProps: ['label','value','xKey','yKey'], optionalProps: ['trend','explanation'], dataNeeds: 'series', outputModes: ['comparison_dashboard','full_dashboard'], whenToUse: 'Inline KPI + trend line.' },
  { type: 'ProgressBar', tier: 'molecular', family: 'metric', requiredProps: ['items'], optionalProps: ['title','explanation'], dataNeeds: 'none', outputModes: ['comparison_dashboard','full_dashboard'], whenToUse: 'Progress toward targets.' },

  // ── CHART ─────────────────────────────────────────────────────────────────
  { type: 'BarChart',  tier: 'molecular', family: 'chart', requiredProps: ['xKey','yKey'], optionalProps: ['title','filterValues','color','explanation'], dataNeeds: 'rows', outputModes: ALL, whenToUse: 'Categorical comparison.' },
  { type: 'LineChart', tier: 'molecular', family: 'chart', requiredProps: ['xKey','yKey'], optionalProps: ['title','smooth','explanation'], dataNeeds: 'series', shapeConstraints: { requiresTimeSeries: true }, outputModes: ['single_chart','comparison_dashboard','full_dashboard'], whenToUse: 'Trend over time.' },
  { type: 'AreaChart', tier: 'molecular', family: 'chart', requiredProps: ['xKey','yKey'], optionalProps: ['title','explanation'], dataNeeds: 'series', shapeConstraints: { requiresTimeSeries: true }, outputModes: ['single_chart','comparison_dashboard','full_dashboard'], whenToUse: 'Trend over time, filled.' },
  { type: 'PieChart',  tier: 'molecular', family: 'chart', requiredProps: ['nameKey','valueKey'], optionalProps: ['title','explanation'], dataNeeds: 'rows', outputModes: ['single_chart','comparison_dashboard','full_dashboard'], whenToUse: 'Share of whole (<=6 slices).' },
  { type: 'RankedList', tier: 'molecular', family: 'chart', requiredProps: ['labelKey','valueKey'], optionalProps: ['title','limit','sort','explanation'], dataNeeds: 'rows', outputModes: ['comparison_dashboard','full_dashboard'], whenToUse: 'Top/bottom N ranking.' },
  { type: 'ScatterPlot', tier: 'organism', family: 'chart', requiredProps: ['xKey','yKey'], optionalProps: ['zKey','title','explanation'], dataNeeds: 'rows', outputModes: ['single_chart','comparison_dashboard','full_dashboard'], whenToUse: 'Correlation between two metrics.' },
  { type: 'FunnelChart', tier: 'organism', family: 'chart', requiredProps: ['nameKey','valueKey'], optionalProps: ['title','explanation'], dataNeeds: 'rows', outputModes: ['single_chart','comparison_dashboard','full_dashboard'], whenToUse: 'Conversion / drop-off.' },
  { type: 'HeatMap',   tier: 'organism', family: 'chart', requiredProps: ['xKey','yKey','valueKey'], optionalProps: ['title','explanation'], dataNeeds: 'rows', outputModes: ['comparison_dashboard','full_dashboard'], whenToUse: 'Time-of-day / day-of-week pattern.' },
  { type: 'ComboChart', tier: 'organism', family: 'chart', requiredProps: ['xKey','barKey','lineKey'], optionalProps: ['barLabel','lineLabel','title','explanation'], dataNeeds: 'rows', outputModes: ['comparison_dashboard','full_dashboard'], whenToUse: 'Dual-axis bar + line.' },
  { type: 'ComparisonCard', tier: 'molecular', family: 'chart', requiredProps: ['entities'], optionalProps: ['title','metric','explanation'], dataNeeds: 'none', outputModes: ['comparison_dashboard','full_dashboard'], whenToUse: '2-5 named entities head-to-head.' },

  // ── TABLE ─────────────────────────────────────────────────────────────────
  { type: 'Table',          tier: 'molecular', family: 'table', requiredProps: ['columns'], optionalProps: ['title','pageSize','explanation'], dataNeeds: 'rows', outputModes: ['table','comparison_dashboard','full_dashboard'], whenToUse: 'Exact tabular values.' },
  { type: 'GenerativeTable', tier: 'organism', family: 'table', requiredProps: ['columns'], optionalProps: ['title','pageSize','highlightKey','explanation'], dataNeeds: 'rows', outputModes: ['table','comparison_dashboard','full_dashboard'], whenToUse: 'Rich table with formatting.' },
  { type: 'PivotTable',     tier: 'organism', family: 'table', requiredProps: ['rowKey','colKey','valueKey'], optionalProps: ['title','explanation'], dataNeeds: 'rows', outputModes: ['comparison_dashboard','full_dashboard'], whenToUse: 'Cross-tab matrix.' },

  // ── NARRATIVE ─────────────────────────────────────────────────────────────
  { type: 'InsightCard', tier: 'molecular', family: 'narrative', requiredProps: ['title','body'], optionalProps: ['type','highlight'], dataNeeds: 'none', outputModes: ['narrative','comparison_dashboard','full_dashboard'], whenToUse: 'Key finding callout.' },
  { type: 'AlertBanner', tier: 'atomic', family: 'narrative', requiredProps: ['message'], optionalProps: ['type'], dataNeeds: 'none', outputModes: ['narrative','full_dashboard'], whenToUse: 'Status / warning banner.' },
  { type: 'SummaryText', tier: 'atomic', family: 'narrative', requiredProps: ['text'], optionalProps: [], dataNeeds: 'none', outputModes: ['narrative','full_dashboard'], whenToUse: 'Prose summary.' },
  { type: 'Callout',     tier: 'molecular', family: 'narrative', requiredProps: ['title'], optionalProps: ['body','metric','explanation'], dataNeeds: 'none', outputModes: ['narrative','comparison_dashboard','full_dashboard'], whenToUse: 'Highlighted key finding.' },
  { type: 'StepList',    tier: 'molecular', family: 'narrative', requiredProps: ['steps'], optionalProps: ['title','explanation'], dataNeeds: 'none', outputModes: ['narrative','full_dashboard'], whenToUse: 'Numbered actions / steps.' },
  { type: 'TimelineCard', tier: 'organism', family: 'narrative', requiredProps: ['events'], optionalProps: ['title','explanation'], dataNeeds: 'none', outputModes: ['narrative','full_dashboard'], whenToUse: 'Sequence of events.' },

  // ── LAYOUT / STRUCTURAL ───────────────────────────────────────────────────
  { type: 'TwoColumn', tier: 'layout', family: 'layout', requiredProps: [], optionalProps: ['children'], dataNeeds: 'none', outputModes: ['comparison_dashboard','full_dashboard'], whenToUse: 'Exactly 2 side-by-side cards.', isLayoutWrapper: true },
  { type: 'Section',   tier: 'layout', family: 'layout', requiredProps: [], optionalProps: ['title','description','children'], dataNeeds: 'none', outputModes: ['comparison_dashboard','full_dashboard'], whenToUse: 'Grouped sub-section.', isLayoutWrapper: true },
  { type: 'Report',    tier: 'layout', family: 'layout', requiredProps: ['title'], optionalProps: ['description','warnings','children'], dataNeeds: 'none', outputModes: ['full_dashboard'], whenToUse: 'Top-level report shell.' },
  { type: 'ReportSkeleton', tier: 'layout', family: 'layout', requiredProps: [], optionalProps: ['rows','showChart'], dataNeeds: 'none', outputModes: [], whenToUse: 'Loading placeholder (internal).' },
  { type: 'BigQueryDashboard', tier: 'organism', family: 'layout', requiredProps: [], optionalProps: ['datasetId','tableId','filters','title'], dataNeeds: 'none', outputModes: ['full_dashboard'], whenToUse: 'Live BigQuery dashboard view.' },

  // ── RICH ARTIFACTS (Phase 2, Track D) ─────────────────────────────────────
  // Ordinary registry members — selectable by componentSelector like any other
  // type, with no special-cased bypass. They carry family 'narrative' (not a new
  // family) deliberately: MODE_POLICY in componentSelector.ts keys allowedComponents
  // off a fixed ComponentFamily set, so a novel family would never be allowed by
  // any output mode and the types would be silently ungenerated.
  // Content is NEVER injected as raw markup — UITreeRenderer renders these inside a
  // sandboxed, isolated-origin iframe, and artifactSanitizer.ts allowlist-strips the
  // payload first. See scripts/test_artifacts.ts.
  { type: 'html-artifact', tier: 'organism', family: 'narrative', requiredProps: ['content'], optionalProps: ['title','variant','caption','explanation'], dataNeeds: 'none', outputModes: ['narrative','full_dashboard'], whenToUse: 'Self-contained rich HTML fragment (formatted prose, nested tables, structured layout) that no existing component expresses. Static markup only — never scripts or interactive widgets.' },
  { type: 'svg-artifact',  tier: 'organism', family: 'narrative', requiredProps: ['content'], optionalProps: ['title','variant','caption','explanation'], dataNeeds: 'none', outputModes: ['narrative','full_dashboard'], whenToUse: 'Bespoke vector diagram (flow, topology, annotated schematic) that the chart family cannot express. Prefer a real chart component whenever the data is tabular.' },
  // Third artifact type. `content` is Mermaid SOURCE, not markup — it is compiled
  // to SVG on the client and only that inert SVG enters the sandboxed iframe, so
  // the render path is unchanged. Source is checked by mermaidGuard.ts, which does
  // NOT strip: an unsupported diagram type or a click/init directive refuses the
  // whole payload and the card downgrades to plain text.
  { type: 'mermaid-artifact', tier: 'organism', family: 'narrative', requiredProps: ['content'], optionalProps: ['title','variant','caption','explanation'], dataNeeds: 'none', outputModes: ['narrative','full_dashboard'], whenToUse: 'Structural diagram from Mermaid source — flowchart, sequence, state, ER, or org/dependency graph. Prefer over svg-artifact whenever the diagram is a graph of nodes and edges rather than a bespoke annotated drawing.' },
];

export const REGISTRY_BY_TYPE: Record<string, ComponentSpec> =
  Object.fromEntries(COMPONENT_REGISTRY.map(c => [c.type, c]));

export const REGISTRY_TYPES: ReadonlySet<string> =
  new Set(COMPONENT_REGISTRY.map(c => c.type));

export function getSpec(type: string): ComponentSpec | undefined {
  return REGISTRY_BY_TYPE[type];
}
