// Phase 3 — the grounding pack replaces the full-catalog injection.
//
// Scope note. The plan said "swap analyzeQuery / sonnetRespond / clarifyOrGenerate",
// but only ONE site injects the heavy artifact: buildAnalyzePrompt pastes the whole
// catalog_context.md. The other sites build a COMPACT list of every available
// domain/report — that list is the option universe for clarification ("options MUST
// come ONLY from AVAILABLE DATA"), so narrowing it to a retrieved subset would let
// the model offer options it was never given, or drop valid ones. It stays complete.
// Phase 3 therefore replaces the field reference, which is where the tokens are, and
// deliberately leaves the routing list alone.
//
// Every path returns a `source`, and the caller records it, so a decision made on the
// degraded fallback is never mistaken for a graph-grounded one.

import { KAG_CONFIG, isKagActive } from './config';
import { retrieve } from './kagRetriever';
import { runCypher } from './neo4jClient';
import { buildGroundingPack } from './groundingPack';
import { recordRetrieval, recordTokens, recordLowConfidence } from './kagTelemetry';
import { loadCatalogContext } from '../services/catalogRefresher';
import type { RetrievedSubgraph, RoutingVerdict } from './types';
import { trace } from './kagTrace';

/** table → tables sharing a confirmed key. Empty object on any failure. */
async function fetchJoins(tables: string[]): Promise<Record<string, string[]>> {
  if (tables.length === 0) return {};
  try {
    const rows = await runCypher<{ a: string; b: string }>(
      `MATCH (a:Table)-[:JOINS_ON]-(b:Table)
       WHERE a.label IN $tables
       RETURN a.label AS a, b.label AS b`,
      { tables },
      { quiet: true },
    );
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      const list = out[r.a] ?? [];
      if (!list.includes(r.b)) list.push(r.b);
      out[r.a] = list;
    }
    for (const k of Object.keys(out)) out[k].sort();
    return out;
  } catch {
    return {};   // advisory detail — never fail a pack over it
  }
}

export type GroundingSource =
  | 'kag-pack'          // retrieved subgraph — the Phase 3 goal
  | 'catalog-markdown'  // the pre-existing full-catalog injection
  | 'none';             // neither available; prompt goes out without a field reference

export interface GroundingContext {
  /** Fully-formed prompt section, header included. '' when source === 'none'. */
  text: string;
  source: GroundingSource;
  /** Tables described in the pack. Empty for the markdown fallback. */
  tables: string[];
  tokens: number;
  /** Why the pack was not used, when it was not. For telemetry and triage. */
  fallbackReason?: string;
}

const MD_HEADER = 'DATASET FIELD REFERENCE (pre-built from BigQuery — use for smarter clarification):';

async function markdownFallback(reason: string): Promise<GroundingContext> {
  const md = await loadCatalogContext().catch(() => null);
  if (!md) return { text: '', source: 'none', tables: [], tokens: 0, fallbackReason: `${reason}; catalog unavailable` };
  trace({ grounding: { source: 'catalog-markdown', packTokens: 0, catalogTokens: Math.ceil(md.length / 4), tables: [], fallbackReason: reason } });
  return {
    text: `${MD_HEADER}\n${md}`,
    source: 'catalog-markdown',
    tables: [],
    tokens: Math.ceil(md.length / 4),
    fallbackReason: reason,
  };
}

/**
 * Resolve the field-reference section for a prompt.
 *
 * `availableTables` is the caller's probe-filtered table list. Filtering happens on
 * the PACK, not merely on the options the model is offered — plan §Phase 3 is explicit
 * that a table which failed the startup probe must not appear in the grounding at all.
 * Describing a table the query engine would fail on is worse than omitting it.
 */
export async function resolveGroundingContext(
  query: string,
  availableTables: string[],
): Promise<GroundingContext> {
  if (!isKagActive()) return markdownFallback('kag inactive');

  // Shadow mode means "measure, do not use". Honouring it here is what makes
  // KAG_SHADOW a real gate rather than a label.
  if (KAG_CONFIG.shadow) return markdownFallback('shadow mode');

  let sub: RetrievedSubgraph;
  try {
    sub = await retrieve(query);
  } catch (err) {
    return markdownFallback(`retrieval threw: ${(err as Error).message?.slice(0, 80)}`);
  }

  recordRetrieval(sub, query);
  trace({
    retrieval: {
      source: sub.source,
      latencyMs: sub.latencyMs,
      seeds: sub.seeds.slice(0, 4).map(s2 => ({ id: s2.nodeId, score: +s2.score.toFixed(3) })),
      candidates: sub.candidateTables.slice(0, 4).map(c => ({ table: c.table, score: +c.score.toFixed(3) })),
      nodes: sub.nodes.length,
      truncated: sub.truncated,
    },
  });

  if (sub.source === 'fallback-catalog') return markdownFallback('retrieval degraded');

  // Drop candidates whose tables are not currently servable.
  const allowed = new Set(availableTables);
  const filtered: RetrievedSubgraph = {
    ...sub,
    candidateTables: sub.candidateTables.filter(c => allowed.has(c.table)),
  };

  if (filtered.candidateTables.length === 0) {
    recordLowConfidence();
    return markdownFallback('no available candidate tables');
  }

  const top = filtered.candidateTables[0];
  if (top.score < KAG_CONFIG.minConfidence) {
    // Low confidence is the signal that drives a clarification question. Widening to
    // the full catalog here is correct: the model should see everything it might ask about.
    recordLowConfidence();
    return markdownFallback(`low confidence (${top.score.toFixed(2)} < ${KAG_CONFIG.minConfidence})`);
  }

  // Gap 11 — join edges are fetched, not traversed. Walking JOINS_ON lets a strong
  // seed leak score into a merely-adjacent table (measured: 22/22 → 21/22), but the
  // model still benefits from knowing which tables share a key. One small indexed
  // lookup scoped to the tables already in the pack.
  const joinsByTable = await fetchJoins(filtered.candidateTables.map(c => c.table));

  const pack = buildGroundingPack(filtered, { joinsByTable });
  if (!pack.text) {
    return markdownFallback('empty pack');
  }

  // Measure the pack against what the live path would otherwise have injected —
  // the token saving is the economic argument and should be observed, not asserted.
  const md = await loadCatalogContext().catch(() => null);
  recordTokens(pack.text, md);
  trace({
    grounding: {
      source: 'kag-pack',
      packTokens: pack.tokens,
      catalogTokens: Math.ceil((md?.length ?? 0) / 4),
      tables: pack.tablesIncluded,
    },
  });

  return {
    text: pack.text,
    source: 'kag-pack',
    tables: pack.tablesIncluded,
    tokens: pack.tokens,
  };
}

/**
 * Where does a column-ish term live in the warehouse, and can we route to it?
 *
 * This is what discovery buys. Before, an unexposed column was indistinguishable from
 * a non-existent one, so the honest-but-wrong answer was "no platform column exists in
 * this dataset" while device_group sat in three tables. Now the difference is
 * answerable: "it exists in dim_devices / revenue_by_device_group, neither of which is
 * exposed as a report".
 */
export async function findColumnAcrossWarehouse(
  term: string,
): Promise<Array<{ table: string; column: string; dataType: string; routable: boolean }>> {
  if (!isKagActive() || !term.trim()) return [];
  try {
    const needle = term.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const rows = await runCypher<{ table: string; column: string; dataType: string; routable: boolean }>(
      `MATCH (t:Table)-[:HAS_COLUMN]->(c:Column)
       WHERE replace(replace(toLower(c.label), '_', ''), ' ', '') CONTAINS $needle
       RETURN t.label AS table, c.label AS column, c.dataType AS dataType,
              coalesce(t.routable, true) AS routable
       ORDER BY routable DESC, table, column`,
      { needle },
      { quiet: true },
    );
    return rows;
  } catch (err) {
    console.warn('[KAG] findColumnAcrossWarehouse failed:', (err as Error).message?.slice(0, 120));
    return [];
  }
}

export interface RoutingDecision {
  /** The table to actually query. Equals `currentTable` when KAG did not intervene. */
  table: string | null;
  overridden: boolean;
  /**
   * What actually happened, at more resolution than `overridden` can carry. Callers
   * that only route can keep reading `overridden`; anything that REPORTS the decision
   * must read this instead — see RoutingVerdict for why the boolean is not enough.
   */
  verdict: RoutingVerdict;
  /** Populated whenever KAG had an opinion, for logging and telemetry. */
  kagTable?: string | null;
  score?: number;
  reason: string;
}

/**
 * Gaps 1 and 9 — make retrieval authoritative, and give follow-ups a way out.
 *
 * Gap 1: the pack informs but does not constrain. A model that ignores it produces a
 * query against the wrong table while the grounding text describes the right one —
 * the worst of both, since the prompt now contradicts the data.
 *
 * Gap 9: on a follow-up the live path reuses the open table unconditionally. That is
 * right for "compare to Q4" and wrong for "now show me agent handle time", which names
 * a metric that lives somewhere else entirely. Retrieval can tell those apart; the
 * unconditional reuse could not.
 *
 * Conservative by construction: it only ever moves to a table retrieval scored above
 * the relevant bar, it never invents a table when retrieval is unsure, and returning
 * `currentTable` unchanged is the default outcome.
 */
export async function resolveRoutingOverride(
  query: string,
  currentTable: string | null,
  opts: { isFollowUp?: boolean; availableTables?: string[] } = {},
): Promise<RoutingDecision> {
  // `verdict` is the first argument, not an afterthought, because every early return
  // below has to answer it — and the ones that answer 'not-consulted' are exactly the
  // ones that used to be reported as agreement.
  const keep = (verdict: RoutingVerdict, reason: string,
                kagTable?: string | null, score?: number): RoutingDecision => {
    // Traced on every path, including the no-op ones. A demo that only logs overrides
    // makes KAG look silent when it is in fact deliberately declining to interfere.
    trace({ routing: { modelTable: currentTable, kagTable: kagTable ?? null, score, overridden: false, verdict, reason } });
    return { table: currentTable, overridden: false, verdict, kagTable, score, reason };
  };

  // Four ways to reach a decision without KAG ever forming an opinion. None of them is
  // agreement with the model — nothing was compared.
  if (!isKagActive() || KAG_CONFIG.shadow) {
    return keep('not-consulted', KAG_CONFIG.shadow ? 'shadow mode' : 'kag disabled');
  }
  if (!KAG_CONFIG.enforceRouting) return keep('not-consulted', 'enforcement disabled');

  try {
    const sub = await retrieve(query);
    if (sub.source === 'fallback-catalog') return keep('not-consulted', 'retrieval degraded');

    const allowed = opts.availableTables?.length ? new Set(opts.availableTables) : null;
    const candidates = allowed
      ? sub.candidateTables.filter(c => allowed.has(c.table))
      : sub.candidateTables;

    const top = candidates[0];
    if (!top) return keep('no-opinion', 'no candidate');
    if (top.table === currentTable) return keep('agreed', 'agrees', top.table, top.score);

    const bar = opts.isFollowUp ? KAG_CONFIG.switchMinConfidence : KAG_CONFIG.enforceMinConfidence;
    if (top.score < bar) {
      // A DISAGREEMENT the threshold declined to act on. Reporting this as agreement was
      // the worst case of the old wording: KAG named a different table and the panel
      // said the two concurred.
      return keep('deferred',
        `below ${opts.isFollowUp ? 'switch' : 'enforce'} bar (${top.score.toFixed(2)} < ${bar})`,
        top.table, top.score);
    }

    console.log(`[KAG] ROUTING OVERRIDE${opts.isFollowUp ? ' (follow-up table switch)' : ''}: ` +
      `${currentTable ?? 'none'} → ${top.table} @ ${top.score.toFixed(2)} for "${query.slice(0, 60)}"`);
    trace({ routing: { modelTable: currentTable, kagTable: top.table, score: +top.score.toFixed(3), overridden: true,
                       verdict: 'overrode', reason: opts.isFollowUp ? 'follow-up switched' : 'overrode model' } });
    return {
      table: top.table, overridden: true, verdict: 'overrode', kagTable: top.table, score: top.score,
      reason: opts.isFollowUp ? 'follow-up switched' : 'overrode model',
    };
  } catch (err) {
    return keep('not-consulted', `error: ${(err as Error).message?.slice(0, 60)}`);
  }
}

/**
 * Phase 5 — resolve named entities in the query to parameterized predicates.
 *
 * "how did Dallas do last quarter" → [{ column: 'territory_name', value: 'Dallas' }],
 * which executeQuery turns into `WHERE territory_name = @f0`. Before this, the query
 * ran unfiltered and the entity survived only as a hint in the prompt.
 *
 * Matching is done in TypeScript against the table's entity labels rather than by
 * throwing the query at the full-text index: entity labels are short proper nouns, and
 * a word-boundary check avoids "Austin" matching inside an unrelated word while
 * sidestepping Lucene escaping entirely.
 */
export async function resolveEntityFilters(
  query: string,
  table: string,
): Promise<Array<{ column: string; values: string[] }>> {
  if (!isKagActive() || KAG_CONFIG.shadow || !table) return [];

  try {
    const rows = await runCypher<{ label: string; column: string }>(
      `MATCH (e:Entity) WHERE e.table = $table
       RETURN e.label AS label, e.column AS column`,
      { table },
      { quiet: true },
    );
    if (rows.length === 0) return [];

    const hay = query.toLowerCase();
    const hits: Array<{ column: string; value: string }> = [];
    const seen = new Set<string>();

    for (const r of rows) {
      const label = String(r.label ?? '');
      if (label.length < 2) continue;              // single characters match everything
      const needle = label.toLowerCase();
      const idx = hay.indexOf(needle);
      if (idx === -1) continue;

      // Word-boundary check on both sides.
      const before = idx === 0 ? ' ' : hay[idx - 1];
      const after = idx + needle.length >= hay.length ? ' ' : hay[idx + needle.length];
      if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue;

      const key = `${r.column}=${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ column: r.column, value: label });
    }

    // Several entities on the SAME column are an OR, not an AND — "Dallas and Austin"
    // means both cities, and ANDing equality predicates matches nothing. They are
    // collected into one IN-list per column (buildQuerySQL emits IN UNNEST).
    // Different columns still AND, which is the correct reading of
    // "Dallas outlets handled by EMP-007".
    const byColumn = new Map<string, string[]>();
    for (const h of hits) {
      const existing = byColumn.get(h.column) ?? [];
      if (!existing.includes(h.value)) existing.push(h.value);
      byColumn.set(h.column, existing);
    }

    const filters = [...byColumn.entries()].map(([column, values]) => ({ column, values }));
    if (filters.length) trace({ entities: filters });
    if (filters.length) {
      console.log(`[KAG] entity filters for ${table}: ` +
        filters.map(f => `${f.column} IN [${f.values.join(', ')}]`).join(' AND '));
    }
    return filters;
  } catch (err) {
    console.warn('[KAG] resolveEntityFilters failed:', (err as Error).message?.slice(0, 120));
    return [];
  }
}

/**
 * Canonical column names for a table, straight from the graph. Phase 4 hands these to
 * the generator so it is TOLD the exact identifiers instead of inferring them — which
 * is what fixColumnCasing exists to clean up after.
 *
 * Returns null when KAG cannot answer, so callers keep their existing behaviour.
 */
export async function canonicalColumnsFor(table: string): Promise<
  { columns: Array<{ column: string; dataType: string; role: string }>; metrics: Array<{ label: string; column: string }> } | null
> {
  if (!isKagActive()) return null;
  try {
    const rows = await runCypher<{ column: string; dataType: string; role: string; metric: string | null }>(
      `MATCH (t:Table {label: $table})-[:HAS_COLUMN]->(c:Column)
       OPTIONAL MATCH (m:Metric)-[:MEASURED_BY]->(c)
       RETURN c.label AS column, c.dataType AS dataType, c.role AS role, m.label AS metric
       ORDER BY column`,
      { table },
      { quiet: true },
    );
    if (rows.length === 0) return null;

    const columns = [...new Map(rows.map(r => [r.column, {
      column: r.column, dataType: r.dataType ?? 'UNKNOWN', role: r.role ?? 'measure',
    }])).values()];
    const metrics = rows
      .filter(r => r.metric)
      .map(r => ({ label: r.metric as string, column: r.column }));

    return { columns, metrics };
  } catch (err) {
    console.warn('[KAG] canonicalColumnsFor failed:', (err as Error).message?.slice(0, 120));
    return null;
  }
}
