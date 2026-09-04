// Deterministic "structure of the data" diagrams, served from KAG without an LLM.
//
// WHY THIS EXISTS SEPARATELY FROM THE DRAWING PATH.
// DRAW_INTENT_RE (llmHandler) catches requests for PROCESS diagrams — an escalation
// flow, a customer journey. Those have no representation in KAG or BigQuery: there is no
// ESCALATES_TO edge anywhere, so the model has to invent the structure, and it needs real
// measured values baked into the node labels to be worth reading. That path keeps its
// BigQuery + LLM round-trip.
//
// A question about the SHAPE OF THE DATA is the opposite case. "what feeds into take
// rate" is not a question the model should answer from a 100-row sample — the answer is
// already a graph we built from the warehouse itself (Metric -MEASURED_BY-> Table
// -HAS_COLUMN-> Column, grouped by Domain). Asking an LLM to describe it introduces
// hallucination risk for a fact we hold exactly. So this path skips the model entirely
// and serializes the graph.
//
// COST, MEASURED, AND WHY THE CACHE IS NOT OPTIONAL.
// assembleGraph() reads INFORMATION_SCHEMA for every table in the catalog: timed at
// ~28s per call against the live warehouse, and it does NOT get cheaper on repeat. A
// 28-second "fast path" is not a fast path. The graph changes only when the warehouse
// schema changes, so it is cached process-wide and refreshed on a long TTL.

import { assembleGraph } from './kagBuilder';
import { graphToMermaid, MermaidGraphOptions } from './graphToMermaid';
import type { KagGraph, KagNode } from './types';

/** Long, because the input is warehouse SCHEMA — it changes on deploys, not on queries. */
const GRAPH_TTL_MS = 30 * 60 * 1000;

let cached: { graph: KagGraph; at: number } | null = null;
let inFlight: Promise<KagGraph> | null = null;

/**
 * The assembled graph, reused across requests.
 *
 * `inFlight` is shared deliberately: the first structure question after a restart pays
 * ~28s, and without it a second question arriving during that window would start a
 * SECOND full BigQuery scan rather than waiting for the one already running.
 *
 * `includeEntities: false` — the entity scan costs one query per STRING dimension column
 * and yields HAS_VALUE leaves (individual territory names), which are data values, not
 * structure. They would bury the schema they are hanging off.
 */
export async function getAssembledGraphCached(force = false): Promise<KagGraph> {
  if (!force && cached && Date.now() - cached.at < GRAPH_TTL_MS) return cached.graph;
  if (inFlight) return inFlight;

  inFlight = assembleGraph(false)
    .then((g) => {
      cached = { graph: g, at: Date.now() };
      return g as KagGraph;
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}

/** True once the cache is warm — lets callers report honestly instead of guessing. */
export function isGraphWarm(): boolean {
  return !!cached && Date.now() - cached.at < GRAPH_TTL_MS;
}

// ── Subject resolution ───────────────────────────────────────────────────────

/** Words that carry no subject and would otherwise match half the graph. */
const STOPWORDS = new Set([
  'show', 'me', 'the', 'a', 'an', 'of', 'for', 'in', 'on', 'to', 'into', 'is', 'are',
  'what', 'how', 'which', 'where', 'data', 'model', 'schema', 'graph', 'structure',
  'organized', 'organised', 'feeds', 'feed', 'built', 'come', 'comes', 'from', 'kag',
  'diagram', 'draw', 'map', 'and', 'my', 'our', 'this', 'that', 'it', 'all',
]);

/**
 * Find the node the question is ABOUT, so the diagram can be a neighbourhood rather than
 * the whole warehouse. "what feeds into take rate" -> Metric:take-rate-pct.
 *
 * Matches on label and aliases, longest label first so "take rate" beats "rate" and a
 * specific metric beats the domain that contains it. Returns undefined for a general
 * question ("show me the schema"), which correctly yields the whole-graph view.
 */
export function resolveStructureRoot(g: KagGraph, texts: string[]): string | undefined {
  const hay = texts.join(' ').toLowerCase();
  const meaningful = hay.split(/[^a-z0-9%]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (!meaningful.length) return undefined;

  const candidates: Array<{ id: string; len: number }> = [];
  for (const n of g.nodes) {
    // Domains are containers; rooting on one collapses the diagram to that subgraph and
    // hides the joins that make a lineage answer useful.
    if (n.type === 'Domain') continue;
    for (const name of [n.label, ...(n.aliases ?? [])]) {
      const norm = String(name).toLowerCase().trim();
      if (norm.length < 3) continue;
      // Require the phrase to appear AND to contribute a non-stopword the user typed,
      // so a table called "data" cannot match every question.
      if (hay.includes(norm) && meaningful.some((w) => norm.includes(w))) {
        candidates.push({ id: n.id, len: norm.length });
        break;
      }
    }
  }
  if (!candidates.length) return undefined;
  candidates.sort((a, b) => b.len - a.len);
  return candidates[0].id;
}

// Edge types that answer "what is this built FROM". Everything else is deliberately
// excluded, and the reason is not aesthetics — it is legibility and size.
//
// A 28-node neighbourhood of a real metric came back with 59 EDGES, because JOINS_ON
// (every table to every other) and SLICED_BY (132 dimension links) turn a lineage answer
// into a hairball. Mermaid's SVG scales with edge count, not node count, so it also blew
// past MAX_ARTIFACT_BYTES and the card refused with "rendered diagram exceeded size
// limit" — a working query, an unreadable answer, found only by rendering it.
//
// Lineage is the chain a value flows along: a Report is SOURCED_FROM a Table, a Metric is
// MEASURED_BY one, a Table HAS_COLUMN. How two tables happen to join is a different
// question, and one this diagram should not try to answer at the same time.
const LINEAGE_RELS = ['IN_DOMAIN', 'MEASURED_BY', 'HAS_COLUMN', 'SOURCED_FROM', 'REPORTS_ON', 'ALIAS_OF'] as const;

/** The overview drops HAS_COLUMN too — at model scale, columns are the hairball. */
const OVERVIEW_RELS = ['IN_DOMAIN', 'SOURCED_FROM', 'REPORTS_ON', 'MEASURED_BY'] as const;

/**
 * Sized from MEASURED rendered output, not from what "looks reasonable".
 *
 * The overview shipped at 40 and was REFUSED in the app with "rendered diagram exceeded
 * size limit" — 40 nodes / 68 edges rendered past MAX_ARTIFACT_BYTES (100KB), so the user
 * got the Mermaid SOURCE as a wall of text instead of a picture. Measured stripped-SVG
 * sizes for this graph: 14→18KB, 18→31KB, 22→47KB, 26→55KB, 30→62KB, 40→85KB.
 *
 * 85KB against a 100KB ceiling is not headroom, it is a coin flip — and those figures
 * were taken from a render that used foreignObject labels, which are SMALLER than the
 * <text>/<tspan> the shipping config emits. So the true 40-node size is above the
 * measurement that already sat at 85%. 22 leaves roughly half the budget spare, which
 * survives a warehouse that grows without anyone re-measuring.
 *
 * Metric nodes are dropped from the overview for the same reason: 28 of them attach to
 * the same handful of tables and add edges without adding shape. "What feeds X" is what
 * the rooted lineage view is for.
 */
const OVERVIEW_MAX_NODES = 22;

export interface StructureDiagram {
  content: string;
  title: string;
  caption: string;
  /** Node id the view is centred on, when the question named one. */
  rootId?: string;
}

/**
 * Serialize the structure answer. Pure over the graph, so it is testable against a
 * synthetic KagGraph with no BigQuery and no Neo4j — see scripts/test_structureDiagram.ts.
 */
export function buildStructureDiagram(g: KagGraph, texts: string[]): StructureDiagram {
  const rootId = resolveStructureRoot(g, texts);
  const opts: MermaidGraphOptions = rootId
    ? { rootId, relTypes: [...LINEAGE_RELS], maxNodes: 20 }
    : { nodeTypes: ['Domain', 'Report', 'Table'], relTypes: [...OVERVIEW_RELS], maxNodes: OVERVIEW_MAX_NODES };

  const content = graphToMermaid(g, opts);
  const label = rootId ? (g.nodes.find((n) => n.id === rootId)?.label ?? rootId) : undefined;

  return {
    content,
    title: label ? `Data lineage — ${label}` : 'Data model — domains, reports and tables',
    caption: label
      ? `How ${label} is built, read straight from the knowledge graph.`
      : 'Domains, the reports in them, and the tables behind those reports.',
    rootId,
  };
}

/** Convenience for callers that want the whole thing: cached graph + serialization. */
export async function structureDiagramFor(texts: string[]): Promise<StructureDiagram> {
  const g = await getAssembledGraphCached();
  return buildStructureDiagram(g, texts);
}

/** Node count, for status/telemetry lines that should not lie about what was drawn. */
export function summarize(g: KagGraph): { nodes: number; edges: number } {
  return { nodes: g.nodes.length, edges: g.edges.length };
}

export type { KagNode };
