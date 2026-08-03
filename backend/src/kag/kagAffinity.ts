// Phase 6 — component affinity edges.
//
// Adds :Component nodes from the generated registry and RENDERS_AS edges carrying a
// weight, so the graph can answer "what usually renders this metric well?".
//
// ADVISORY ONLY. This matches the stance the rest of the pipeline already takes with
// derived constraints ("passive, never fed into generation" — runPipeline.ts). Nothing
// here changes what the LLM is asked for or what gets rendered; it is recorded
// alongside the existing constraint telemetry so the signal can be judged on real data
// before anyone wires it into a decision.
//
// The reason this phase is nicer on Neo4j than on a rebuilt file: weights are updated
// INCREMENTALLY from usage (bumpAffinity below) without rewriting the graph.

import { runCypher } from './neo4jClient';
import { isKagActive } from './config';
import registry from '../registry/generated/componentRegistry.json';
import { slugify, type KagNode, type KagEdge } from './types';

interface RegistryComponent {
  type: string;
  tier: string;
  family: string;
  dataNeeds: string;
  outputModes: string[];
  whenToUse: string;
}

/**
 * Seed affinities by metric KIND (from the glossary: ratio, measure, score, rank,
 * attribute) rather than by individual metric. Kind is the property that actually
 * predicts a good rendering, and it generalizes to metrics added later.
 */
const KIND_AFFINITY: Record<string, Array<{ component: string; weight: number }>> = {
  ratio:     [{ component: 'LineChart', weight: 0.8 }, { component: 'KPI', weight: 0.7 }, { component: 'BarChart', weight: 0.6 }],
  measure:   [{ component: 'BarChart', weight: 0.8 }, { component: 'LineChart', weight: 0.7 }, { component: 'KPI', weight: 0.6 }],
  score:     [{ component: 'KPI', weight: 0.8 }, { component: 'BarChart', weight: 0.7 }],
  rank:      [{ component: 'RankedList', weight: 0.9 }, { component: 'GenerativeTable', weight: 0.6 }],
  attribute: [{ component: 'GenerativeTable', weight: 0.7 }],
};

/** Component nodes + RENDERS_AS edges, assembled in memory (pure — testable). */
export function assembleAffinity(
  metrics: Array<{ id: string; kind: string }>,
): { nodes: KagNode[]; edges: KagEdge[] } {
  const components = (registry as { components: RegistryComponent[] }).components ?? [];
  const known = new Set(components.map(c => c.type));

  const nodes: KagNode[] = components.map(c => ({
    id: `Component:${slugify(c.type)}`,
    type: 'Component' as const,
    label: c.type,
    aliases: [],
    props: {
      tier: c.tier,
      family: c.family,
      dataNeeds: c.dataNeeds,
      outputModes: c.outputModes,
      whenToUse: c.whenToUse,
    },
    provenance: 'registry' as const,
  }));

  const edges: KagEdge[] = [];
  for (const m of metrics) {
    for (const a of KIND_AFFINITY[m.kind] ?? []) {
      // Never point at a component the registry does not define — a RENDERS_AS edge to
      // a non-existent renderer would be advice the pipeline cannot act on.
      if (!known.has(a.component)) continue;
      edges.push({
        from: m.id,
        to: `Component:${slugify(a.component)}`,
        type: 'RENDERS_AS',
        weight: a.weight,
        provenance: 'registry',
      });
    }
  }

  return { nodes, edges };
}

/**
 * Write Component nodes and RENDERS_AS edges into the graph.
 *
 * Provenance is 'registry' and 'telemetry', NEITHER of which is in the builder's
 * MANAGED_PROVENANCE list — so a catalog rebuild leaves learned weights intact. That
 * separation is the whole point of scoping mark-and-sweep by provenance.
 */
export async function buildAffinity(): Promise<{ components: number; edges: number }> {
  const metrics = await runCypher<{ id: string; kind: string }>(
    `MATCH (m:Metric) RETURN m.id AS id, coalesce(m.kind, 'unknown') AS kind`,
    {}, { timeoutMs: 30_000, quiet: true },
  );

  const { nodes, edges } = assembleAffinity(metrics);

  await runCypher(
    `UNWIND $rows AS row
     MERGE (n:Kag {id: row.id})
     SET n:Component, n += row.props, n.type = 'Component', n.label = row.label,
         n.aliases = [], n.aliasText = '', n.provenance = 'registry'`,
    {
      rows: nodes.map(n => ({
        id: n.id,
        label: n.label,
        props: {
          tier: n.props.tier, family: n.props.family, dataNeeds: n.props.dataNeeds,
          outputModes: n.props.outputModes, whenToUse: n.props.whenToUse,
        },
      })),
    },
    { access: 'write', timeoutMs: 60_000, quiet: true },
  );

  await runCypher(
    `UNWIND $rows AS row
     MATCH (a:Kag {id: row.from}) MATCH (b:Kag {id: row.to})
     MERGE (a)-[r:RENDERS_AS]->(b)
     ON CREATE SET r.weight = row.weight, r.provenance = 'registry', r.uses = 0`,
    { rows: edges },
    { access: 'write', timeoutMs: 60_000, quiet: true },
  );

  console.log(`[KAG Affinity] ${nodes.length} components, ${edges.length} RENDERS_AS edges`);
  return { components: nodes.length, edges: edges.length };
}

export interface AffinityHint {
  component: string;
  weight: number;
  viaMetric: string;
}

/**
 * What the graph would suggest rendering for a table's metrics. Read-only, advisory.
 * Returns [] when KAG is inactive — callers must treat it as a hint, never a rule.
 */
export async function affinityFor(table: string, limit = 5): Promise<AffinityHint[]> {
  if (!isKagActive() || !table) return [];
  try {
    const rows = await runCypher<{ component: string; weight: number; metric: string }>(
      `MATCH (t:Table {label: $table})-[:HAS_COLUMN]->(c:Column)<-[:MEASURED_BY]-(m:Metric)
             -[r:RENDERS_AS]->(comp:Component)
       RETURN comp.label AS component, r.weight AS weight, m.label AS metric
       // toInteger is required: the driver runs with disableLosslessIntegers, so a JS
       // number arrives as a float and LIMIT rejects '5.0' as not an integer.
       ORDER BY r.weight DESC LIMIT toInteger($limit)`,
      { table, limit },
      { quiet: true },
    );
    return rows.map(r => ({ component: r.component, weight: Number(r.weight), viaMetric: r.metric }));
  } catch (err) {
    console.warn('[KAG Affinity] lookup failed:', (err as Error).message?.slice(0, 120));
    return [];
  }
}

/**
 * Incremental learning: record that `component` was actually used for `table`.
 * Fire-and-forget; a failure here must never affect a render.
 */
export async function bumpAffinity(table: string, component: string): Promise<void> {
  if (!isKagActive() || !table || !component) return;
  try {
    await runCypher(
      `MATCH (t:Table {label: $table})-[:HAS_COLUMN]->(c:Column)<-[:MEASURED_BY]-(m:Metric)
       MATCH (comp:Component {label: $component})
       MERGE (m)-[r:RENDERS_AS]->(comp)
         ON CREATE SET r.weight = 0.5, r.provenance = 'telemetry', r.uses = 0
       SET r.uses = coalesce(r.uses, 0) + 1,
           // Bounded nudge: usage can raise a weight toward 0.95 but never past it, so
           // one popular component cannot crowd out every alternative.
           r.weight = CASE WHEN r.weight >= 0.95 THEN 0.95 ELSE r.weight + 0.01 END`,
      { table, component },
      { access: 'write', quiet: true },
    );
  } catch {
    /* advisory only — never surface */
  }
}
