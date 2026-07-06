import { ShapeSignature } from '../types';
import {
  OutputMode, ComponentFamily, ComponentSpec, COMPONENT_REGISTRY,
} from '../registry/componentRegistry';

// Phase 4: deterministic constraint derivation — ADVISORY ONLY.
// Turns (outputMode ⊕ ShapeSignature ⊕ registry) into allowed components + a budget.
// Nothing here enforces, rejects, or trims. Generation behavior is unchanged; the
// result is computed for telemetry and (in a later phase) for prompt-side guidance.

export type ShapeKind = 'single_value' | 'time_series' | 'categorical' | 'wide_table' | 'unknown';

export interface PrimaryRequirement {
  family: ComponentFamily | null; // required primary family; null = none
  min: number;                    // minimum count of that family
  max?: number;                   // optional cap (e.g. single_chart => exactly 1 chart)
}

export interface ConstraintSet {
  outputMode: OutputMode;
  shapeKind: ShapeKind;
  allowedComponents: string[];
  allowedFamilies: ComponentFamily[];
  maxCards: number;
  primaryRequirement: PrimaryRequirement;
}

// ── Budget definitions per output_mode ────────────────────────────────────────
interface ModePolicy { families: ComponentFamily[]; maxCards: number; primary: PrimaryRequirement; }

const MODE_POLICY: Record<OutputMode, ModePolicy> = {
  single_metric:        { families: ['metric'],                                   maxCards: 1, primary: { family: 'metric',    min: 1, max: 1 } },
  single_chart:         { families: ['chart', 'metric', 'narrative'],             maxCards: 3, primary: { family: 'chart',     min: 1, max: 1 } },
  table:                { families: ['table'],                                    maxCards: 1, primary: { family: 'table',     min: 1, max: 1 } },
  narrative:            { families: ['narrative', 'metric'],                      maxCards: 3, primary: { family: 'narrative', min: 1 } },
  comparison_dashboard: { families: ['metric', 'chart', 'table'],                maxCards: 5, primary: { family: 'chart',     min: 1 } },
  full_dashboard:       { families: ['metric', 'chart', 'table', 'narrative', 'layout'], maxCards: 5, primary: { family: null, min: 0 } },
  qa_answer:            { families: [],                                           maxCards: 0, primary: { family: null,       min: 0 } },
};

// ── Shape → appropriate chart types (comprehensive mapping rules) ─────────────
// Only CHART-family components are gated by shape here; other families are gated by
// their own registry shapeConstraints. 'unknown' is permissive (all charts allowed).
const SHAPE_CHART_RULES: Record<ShapeKind, string[]> = {
  single_value: [],                                        // one row → no chart, prefer a KPI
  time_series:  ['LineChart', 'AreaChart', 'ComboChart'],  // trends over time
  categorical:  ['BarChart', 'RankedList', 'PieChart', 'ComparisonCard', 'HeatMap', 'FunnelChart', 'ScatterPlot'],
  wide_table:   ['BarChart', 'RankedList'],                // many columns → prefer a table, limited charts
  unknown:      [],                                        // permissive: handled via allowAllCharts flag
};

const WIDE_TABLE_COLUMN_THRESHOLD = 6;

export function classifyShape(shape: ShapeSignature): ShapeKind {
  if (!shape || shape.rowCount <= 0) return 'unknown';
  if (shape.rowCount === 1) return 'single_value';
  if (shape.isTimeSeries) return 'time_series';
  if (shape.columnCount > WIDE_TABLE_COLUMN_THRESHOLD) return 'wide_table';
  if (shape.dimensionColumns.length >= 1 && shape.measureColumns.length >= 1) return 'categorical';
  return 'unknown';
}

function passesShapeConstraints(spec: ComponentSpec, shape: ShapeSignature): boolean {
  const c = spec.shapeConstraints;
  if (!c) return true;
  if (c.requiresTimeSeries && !shape.isTimeSeries) return false;
  if (c.minRows !== undefined && shape.rowCount < c.minRows) return false;
  if (c.maxColumns !== undefined && shape.columnCount > c.maxColumns) return false;
  return true;
}

/**
 * Derive the advisory constraint set for a request.
 * Deterministic and pure — safe to unit test. Never throws for a known OutputMode.
 */
export function deriveConstraints(
  outputMode: OutputMode,
  shape: ShapeSignature,
  registry: ComponentSpec[] = COMPONENT_REGISTRY,
): ConstraintSet {
  const policy = MODE_POLICY[outputMode] ?? MODE_POLICY.full_dashboard;
  const shapeKind = classifyShape(shape);
  const chartRule = SHAPE_CHART_RULES[shapeKind];
  const allowAllCharts = shapeKind === 'unknown';

  const allowedComponents = registry
    .filter(spec => spec.outputModes.includes(outputMode))   // mode allows it
    .filter(spec => policy.families.includes(spec.family))    // family within budget
    .filter(spec => passesShapeConstraints(spec, shape))      // hard shape constraints
    .filter(spec => spec.family !== 'chart' || allowAllCharts || chartRule.includes(spec.type)) // chart shape-fit
    .map(spec => spec.type);

  return {
    outputMode,
    shapeKind,
    allowedComponents,
    allowedFamilies: policy.families,
    maxCards: policy.maxCards,
    primaryRequirement: policy.primary,
  };
}
