// Typed accessor for glossary.json — the hand-authored semantic layer.
// Kept separate from the builder so the retriever can use aliases without pulling
// in BigQuery.

// Named .data.json, not .json: Node resolves a bare './glossary' to glossary.json
// BEFORE glossary.ts, which silently yields the raw JSON instead of this module.
import glossaryJson from './glossary.data.json';

export interface GlossaryMetric {
  /** Physical BQ column. null until a human confirms it — see glossary.json _readme. */
  column: string | null;
  unit: string;
  kind: string;
  aliases: string[];
}

export interface GlossaryTerm {
  /** Metric labels this concept maps onto. Multi-target by design. */
  targets: string[];
  weight: number;
  note?: string;
}

export interface Glossary {
  version: number;
  domains: Record<string, { aliases: string[] }>;
  metrics: Record<string, GlossaryMetric>;
  terms: Record<string, GlossaryTerm>;
  dimensionHints: { namePatterns: string[]; dataTypes: string[] };
}

const raw = glossaryJson as unknown as Glossary & { _readme?: unknown };

export const GLOSSARY: Glossary = {
  version: raw.version,
  domains: raw.domains ?? {},
  metrics: raw.metrics ?? {},
  terms: raw.terms ?? {},
  dimensionHints: raw.dimensionHints ?? { namePatterns: [], dataTypes: [] },
};

/** Metrics with no confirmed column mapping — the review queue. */
export function unconfirmedMetrics(): string[] {
  return Object.entries(GLOSSARY.metrics)
    .filter(([, m]) => !m.column)
    .map(([label]) => label);
}

const dimensionPatterns = GLOSSARY.dimensionHints.namePatterns.map(p => new RegExp(p, 'i'));
const dimensionTypes = new Set(GLOSSARY.dimensionHints.dataTypes.map(t => t.toUpperCase()));

/**
 * Classify a physical column as a breakdown axis or a measure. Name patterns win
 * over data type: a FLOAT64 `territory_id` is still a dimension.
 */
export function isDimensionColumn(columnName: string, dataType: string): boolean {
  if (dimensionPatterns.some(re => re.test(columnName))) return true;
  return dimensionTypes.has(dataType.toUpperCase());
}
