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

/**
 * Node-id slug. Lives here, not in kagBuilder, because kagAffinity needs it too and
 * importing it from the builder created a genuine kagBuilder <-> kagAffinity cycle.
 * It resolved at runtime only through module hoisting — a latent ordering hazard, and
 * the kind of thing that breaks when someone converts a module to ESM.
 * types.ts already owns the id contract (see KagNode.id), so the helper belongs here.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/%/g, 'pct')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

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

/**
 * The five distinct outcomes of a routing decision.
 *
 * Lives here, in L1, because both kagGrounding (which produces it) and kagTrace (which
 * carries it to the demo surface) need it and neither may import the other.
 *
 * It exists because `overridden: boolean` is not enough to describe what happened.
 * False covers "KAG looked and agreed", "KAG looked and disagreed but was under the
 * confidence bar", and "KAG never ran at all" — three claims of very different strength.
 * The console reported all of them as "agreed with model", which credits the graph with
 * a decision on every request where it was switched off.
 *
 *   overrode       KAG moved the table. The model's choice was discarded.
 *   agreed         KAG ran, and its top candidate WAS the model's table.
 *   deferred       KAG ran and preferred a DIFFERENT table, but scored under the bar.
 *                  A disagreement the threshold declined to act on — not an agreement.
 *   no-opinion     KAG ran and produced no candidate (correct for a vague query).
 *   not-consulted  KAG never compared: disabled, shadowing, enforcement off, retrieval
 *                  degraded, or it threw. No opinion was formed, so none may be claimed.
 */
export type RoutingVerdict =
  | 'overrode'
  | 'agreed'
  | 'deferred'
  | 'no-opinion'
  | 'not-consulted';

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
