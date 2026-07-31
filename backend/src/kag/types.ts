// KAG graph model — shared by the builder, the retriever and the validator.
//
// Node ids are stable and human-readable (`Metric:take-rate-pct`) because they are
// the uniqueness constraint in Neo4j AND the join key for mark-and-sweep rebuilds.
// Never generate them randomly.

export type KagNodeType =
  | 'Domain'
  | 'Report'
  | 'Table'
  | 'Column'
  | 'Metric'
  | 'Dimension'
  | 'Entity'
  | 'Term'
  | 'Component';

export type KagRelType =
  | 'IN_DOMAIN'
  | 'SOURCED_FROM'
  | 'REPORTS_ON'
  | 'HAS_COLUMN'
  | 'MEASURED_BY'
  | 'SLICED_BY'
  | 'HAS_VALUE'
  | 'ALIAS_OF'
  | 'RELATED_TO'
  | 'RENDERS_AS'
  | 'JOINS_ON';

/**
 * Whitelist of relationship types. Cypher cannot parameterize a relationship type,
 * so the builder interpolates it into the query string — it MUST be validated
 * against this list first. This is the injection guard for graph writes.
 */
export const KAG_REL_TYPES: readonly KagRelType[] = [
  'IN_DOMAIN',
  'SOURCED_FROM',
  // Report → Metric. Not in the original plan's edge list, but essential: it is the
  // only path from a metric seed to a table until glossary column mappings are
  // confirmed. Without it, retrieval returns zero candidate tables on day one.
  'REPORTS_ON',
  'HAS_COLUMN',
  'MEASURED_BY',
  'SLICED_BY',
  'HAS_VALUE',
  'ALIAS_OF',
  'RELATED_TO',
  'RENDERS_AS',
  'JOINS_ON',
];

export type KagProvenance =
  | 'catalog'    // DATA_SOURCES / REPORT_ANGLES — hand-maintained, authoritative
  | 'bigquery'   // INFORMATION_SCHEMA — physical truth
  | 'glossary'   // hand-authored semantics, human-reviewed
  | 'telemetry'  // learned from usage
  | 'registry';  // component registry

export interface KagNode {
  /** `${type}:${slug}` — unique, stable across rebuilds. */
  id: string;
  type: KagNodeType;
  /** Display name, verbatim from the source. Never normalized. */
  label: string;
  /** Lowercased synonyms, deduped. Feeds the full-text index via aliasText. */
  aliases: string[];
  /** Type-specific attributes: dataType, orderBy, rowLimit, description, unit... */
  props: Record<string, unknown>;
  provenance: KagProvenance;
}

export interface KagEdge {
  from: string;
  to: string;
  type: KagRelType;
  /** 0..1. Traversal decays score by this; 1.0 = a deterministic structural link. */
  weight: number;
  provenance: KagProvenance;
}

export interface KagGraph {
  nodes: KagNode[];
  edges: KagEdge[];
}

// ── Retrieval ────────────────────────────────────────────────────────────────

export interface KagSeed {
  nodeId: string;
  score: number;
  /** What produced the hit — 'fulltext', 'exact', 'vector'. Kept for triage. */
  matchedOn: string;
}

export interface KagCandidateTable {
  table: string;
  score: number;
  /** Node ids on the path that produced this candidate — explains the ranking. */
  via: string[];
}

/**
 * `source` is deliberately part of the contract: every consumer and every telemetry
 * record can tell whether a decision was graph-grounded or served by the degraded
 * fallback. Debugging a bad route without this field is guesswork.
 */
export type KagRetrievalSource = 'neo4j' | 'cache' | 'fallback-catalog';

export interface RetrievedSubgraph {
  nodes: KagNode[];
  edges: KagEdge[];
  seeds: KagSeed[];
  candidateTables: KagCandidateTable[];
  /** True when the node budget clipped the subgraph — a signal to widen or clarify. */
  truncated: boolean;
  source: KagRetrievalSource;
  latencyMs: number;
}

// ── Builder reporting ────────────────────────────────────────────────────────

/**
 * A metric with no confirmed column mapping. These are written to
 * backend/data/kag/unmapped.json for human review and are NEVER merged into the
 * graph as edges — silently inventing metric semantics is worse than the current
 * guessing, because it looks authoritative.
 */
export interface UnmappedMetric {
  metric: string;
  metricId: string;
  tables: string[];
  candidates: Array<{ table: string; column: string; dataType: string; similarity: number }>;
}

export interface BuildReport {
  builtAt: string;
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  tablesWithSchema: string[];
  tablesWithoutSchema: string[];
  unmapped: UnmappedMetric[];
  sweptNodes: number;
  durationMs: number;
  /** Phase 5 entity scan. Absent when the scan was skipped. */
  entityStats?: {
    columnsScanned: number;
    columnsSkipped: string[];
    entitiesAdded: number;
    capped: boolean;
  };
}
