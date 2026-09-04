// KAG retrieval: query text → RetrievedSubgraph (plan §4.2–§4.4, §6, §7).
//
// Shape of the pipeline:
//   1. seed    — one full-text index hit over :Kag (label + aliasText)
//   2. expand  — bounded traversal from the seeds (APOC if available, else Cypher)
//   3. score   — in TypeScript, NOT Cypher, so it is unit-testable without a database
//
// Scoring lives in TS on purpose: it is the part that gets iterated on most, and
// requiring a running Neo4j to test a ranking tweak would make that iteration slow.
//
// Every failure path returns a `fallback-catalog` subgraph rather than throwing. A
// retrieval failure must degrade to today's behavior, never break a user's query.

import { KAG_CONFIG } from './config';
import { runCypher, hasApocPathExpand } from './neo4jClient';
import { buildLuceneQuery } from './luceneEscape';
import { cacheService } from '../services/cacheService';
import { recordFailure, recordLowConfidence } from './kagTelemetry';
// Phase 5: semantic seeds. Returns [] when embeddings are unavailable.
import { vectorSeeds } from './kagEmbeddings';
import type {
  KagNode, KagEdge, KagSeed, KagCandidateTable, RetrievedSubgraph, KagRelType,
} from './types';

// Relationship types the traversal may cross. Deliberately excludes JOINS_ON: a join
// edge means "these tables share a key", not "this table answers that question", and
// following it lets a strong seed leak score into an unrelated table.
const TRAVERSAL_RELS: KagRelType[] = [
  'IN_DOMAIN', 'SOURCED_FROM', 'REPORTS_ON', 'HAS_COLUMN',
  'MEASURED_BY', 'SLICED_BY', 'ALIAS_OF', 'RELATED_TO', 'HAS_VALUE',
];
// Adding JOINS_ON here was tried and reverted: routing fell 22/22 → 21/22 and packs
// grew 236 → 268 tokens, exactly the score leak the comment above predicts. The pack
// still reports joinable tables — via a targeted lookup in kagGrounding, not traversal.
// Keep them separate: what the model is TOLD about need not be what scoring WALKS.

// ── Circuit breaker (plan §7) ────────────────────────────────────────────────
// N consecutive failures/timeouts open the breaker for a cool-off window, during
// which retrieval short-circuits to the fallback instead of piling onto a sick
// database. State is exposed through getBreakerState() for /api/kag/stats.

let consecutiveFailures = 0;
let breakerOpenedAt = 0;

function breakerIsOpen(): boolean {
  if (consecutiveFailures < KAG_CONFIG.breakerThreshold) return false;
  if (Date.now() - breakerOpenedAt >= KAG_CONFIG.breakerResetMs) {
    // Cool-off elapsed — half-open: let the next call through to probe recovery.
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

function noteFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures === KAG_CONFIG.breakerThreshold) {
    breakerOpenedAt = Date.now();
    console.warn(`[KAG] circuit breaker OPEN for ${KAG_CONFIG.breakerResetMs}ms`);
  }
}

function noteSuccess(): void {
  consecutiveFailures = 0;
}

export function getBreakerState(): { open: boolean; consecutiveFailures: number; openedAt: number | null } {
  return {
    open: breakerIsOpen(),
    consecutiveFailures,
    openedAt: breakerOpenedAt || null,
  };
}

/** Test seam — resets breaker state between unit tests. */
export function resetBreaker(): void {
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
}

// ── APOC availability, probed once ───────────────────────────────────────────

let apocAvailable: boolean | null = null;

async function apocIsAvailable(): Promise<boolean> {
  if (apocAvailable === null) {
    apocAvailable = await hasApocPathExpand().catch(() => false);
    console.log(`[KAG] APOC path expansion ${apocAvailable ? 'available' : 'NOT available — using Cypher fallback'}`);
  }
  return apocAvailable;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Cache key + agreement key. Collapses whitespace/case so "Show Revenue " ≡ "show revenue". */
export function normalizeQuery(q: string): string {
  return (q ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function emptySubgraph(source: RetrievedSubgraph['source'], latencyMs: number): RetrievedSubgraph {
  return { nodes: [], edges: [], seeds: [], candidateTables: [], truncated: false, source, latencyMs };
}

/** Reject a promise that outruns the budget, so a hung driver cannot hang a request. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Neo4j returns node props flat; rebuild the KagNode shape the rest of the code expects. */
function toKagNode(row: Record<string, any>): KagNode {
  const { id, type, label, aliasText, provenance, ...props } = row ?? {};
  return {
    id,
    type,
    label,
    aliases: typeof aliasText === 'string' && aliasText ? aliasText.split(' ').filter(Boolean) : [],
    props: props ?? {},
    provenance: provenance ?? 'catalog',
  };
}

// ── 1. Seeds ─────────────────────────────────────────────────────────────────

interface SeedRow { id: string; type: string; label: string; score: number }

async function findSeeds(luceneQuery: string): Promise<KagSeed[]> {
  const rows = await runCypher<SeedRow>(
    `CALL db.index.fulltext.queryNodes('kag_search', $luceneQuery, {limit: $limit})
     YIELD node, score
     RETURN node.id AS id, node.type AS type, node.label AS label, score`,
    { luceneQuery, limit: KAG_CONFIG.maxSeeds },
    { quiet: true },
  );

  if (rows.length === 0) return [];

  // Lucene scores are unbounded and corpus-relative — normalize to 0..1 against the
  // best hit so downstream weights and KAG_MIN_CONFIDENCE mean something stable.
  const top = Math.max(...rows.map(r => Number(r.score) || 0)) || 1;
  return rows.map(r => ({
    nodeId: r.id,
    score: (Number(r.score) || 0) / top,
    matchedOn: 'fulltext',
  }));
}

/**
 * Phase 5 — blend full-text and vector seeds.
 *
 * Full-text stays authoritative: it is exact, cheap and explainable. Vector hits are
 * folded in at a discount and only ever RAISE an individual node's score.
 *
 * That per-node monotonicity does NOT make the blend safe on its own, which cost a
 * regression to learn: a vector index ALWAYS returns its nearest neighbours, however
 * unrelated. Unfiltered, that
 *   • injects noise seeds that shift which table accumulates the most score, and
 *   • destroys the "no seeds ⇒ no route" property — "hello there" started routing to
 *     fact_network_kpi_points, when refusing to route is the correct behaviour.
 * Routing accuracy fell 5/5 → 2/5 the moment embeddings were switched on.
 *
 * VECTOR_MIN_SIMILARITY is therefore load-bearing, not a tuning knob. Genuine semantic
 * matches score well clear of it ("customers leaving us" → return_units at 0.79;
 * "how long calls take" → calls_handled at 0.83), while a greeting's nearest neighbour
 * does not clear it.
 */
const VECTOR_WEIGHT = 0.7;
const VECTOR_MIN_SIMILARITY = 0.75;

async function findSeedsBlended(luceneQuery: string, rawQuery: string): Promise<KagSeed[]> {
  // Off by default — see KAG_CONFIG.vectorSeeds for the measurements behind that.
  if (!KAG_CONFIG.vectorSeeds) return findSeeds(luceneQuery);

  const [lexical, semanticRaw] = await Promise.all([
    findSeeds(luceneQuery),
    vectorSeeds(rawQuery).catch(() => [] as Awaited<ReturnType<typeof vectorSeeds>>),
  ]);

  // Drop nearest-neighbour noise before it can influence anything (see above).
  const semantic = semanticRaw.filter(s => s.score >= VECTOR_MIN_SIMILARITY);
  if (semanticRaw.length && !semantic.length) {
    console.log(`[KAG] ${semanticRaw.length} vector hit(s) below ${VECTOR_MIN_SIMILARITY} — ignored ` +
      `(best ${Math.max(...semanticRaw.map(s => s.score)).toFixed(3)})`);
  }

  if (semantic.length === 0) return lexical;

  const byId = new Map<string, KagSeed>();
  for (const s of lexical) byId.set(s.nodeId, s);

  const topVec = Math.max(...semantic.map(s => s.score)) || 1;
  for (const v of semantic) {
    const scaled = (v.score / topVec) * VECTOR_WEIGHT;
    const existing = byId.get(v.id);
    if (!existing) {
      byId.set(v.id, { nodeId: v.id, score: scaled, matchedOn: 'vector' });
    } else if (scaled > existing.score) {
      byId.set(v.id, { ...existing, score: scaled, matchedOn: `${existing.matchedOn}+vector` });
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, KAG_CONFIG.maxSeeds);
}

// ── 2. Expansion ─────────────────────────────────────────────────────────────

interface ExpandRow { nodes: Record<string, any>[]; rels: Array<{ from: string; to: string; type: string; weight: number }> }

async function expand(seedIds: string[], timeoutMs?: number): Promise<{ nodes: KagNode[]; edges: KagEdge[]; truncated: boolean }> {
  const useApoc = await apocIsAvailable();

  // Both branches return the same shape. relationshipFilter has no direction markers
  // so traversal works either way along an edge — a Column must be reachable from the
  // Metric that measures it and vice versa.
  const cypher = useApoc
    ? `MATCH (seed:Kag) WHERE seed.id IN $seedIds
       CALL apoc.path.expandConfig(seed, {
         relationshipFilter: $relFilter,
         minLevel: 0, maxLevel: $maxHops, limit: $maxNodes, uniqueness: 'NODE_GLOBAL'
       }) YIELD path
       WITH collect(path) AS paths
       UNWIND paths AS p
       WITH collect(DISTINCT nodes(p)) AS nodeLists, collect(DISTINCT relationships(p)) AS relLists
       RETURN
         [n IN apoc.coll.toSet(apoc.coll.flatten(nodeLists)) | properties(n)] AS nodes,
         [r IN apoc.coll.toSet(apoc.coll.flatten(relLists)) |
            {from: startNode(r).id, to: endNode(r).id, type: type(r), weight: coalesce(r.weight, 0.5)}] AS rels`
    : `MATCH p = (seed:Kag)-[r*0..2]-(n:Kag)
       WHERE seed.id IN $seedIds AND ALL(rel IN r WHERE type(rel) IN $allowedTypes)
       WITH p LIMIT $maxNodes
       WITH collect(p) AS paths
       UNWIND paths AS path
       UNWIND nodes(path) AS node
       WITH collect(DISTINCT properties(node)) AS nodes, paths
       UNWIND paths AS path2
       UNWIND relationships(path2) AS rel
       RETURN nodes,
         collect(DISTINCT {from: startNode(rel).id, to: endNode(rel).id, type: type(rel), weight: coalesce(rel.weight, 0.5)}) AS rels`;

  const rows = await runCypher<ExpandRow>(
    cypher,
    {
      seedIds,
      relFilter: TRAVERSAL_RELS.join('|'),
      allowedTypes: TRAVERSAL_RELS,
      maxHops: KAG_CONFIG.maxHops,
      maxNodes: KAG_CONFIG.maxNodes,
    },
    // Warmup passes a generous budget; request path uses the 800ms default.
    { quiet: true, ...(timeoutMs ? { timeoutMs } : {}) },
  );

  const row = rows[0];
  if (!row) return { nodes: [], edges: [], truncated: false };

  const nodes = (row.nodes ?? []).map(toKagNode).filter(n => n.id);
  const edges: KagEdge[] = (row.rels ?? []).map(r => ({
    from: r.from,
    to: r.to,
    type: r.type as KagRelType,
    weight: Number(r.weight) || 0.5,
    provenance: 'catalog',
  }));

  return { nodes, edges, truncated: nodes.length >= KAG_CONFIG.maxNodes };
}

// ── 3. Scoring (pure — exported for unit tests, no database needed) ──────────

/**
 * Propagate seed score through the subgraph and aggregate onto Table nodes.
 *
 * seedScore × Π(edge weights) with per-hop decay. A table reachable from several
 * seeds accumulates, so "revenue by territory" (two seeds landing on the same table)
 * outranks a table matching only one — which is the behavior we actually want.
 */
export function scoreCandidates(
  nodes: KagNode[],
  edges: KagEdge[],
  seeds: KagSeed[],
  maxHops: number = KAG_CONFIG.maxHops,
): KagCandidateTable[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const adjacency = new Map<string, Array<{ to: string; weight: number }>>();
  for (const e of edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from)!.push({ to: e.to, weight: e.weight });
    adjacency.get(e.to)!.push({ to: e.from, weight: e.weight });
  }

  const HOP_DECAY = 0.6;
  /** Each additional seed reaching the same table counts for half the previous one. */
  const SEED_DECAY = 0.5;
  // table id → each seed's contribution, and the seeds that reached it (for `via`).
  // Contributions are kept SEPARATE rather than summed on the fly so diminishing
  // returns can be applied below — see SEED_DECAY.
  const tableScores = new Map<string, { contributions: number[]; via: Set<string> }>();

  for (const seed of seeds) {
    // BFS from this seed, keeping the best score seen per node.
    const best = new Map<string, number>([[seed.nodeId, seed.score]]);
    let frontier = [seed.nodeId];

    for (let hop = 0; hop < maxHops; hop++) {
      const next: string[] = [];
      for (const from of frontier) {
        const fromScore = best.get(from) ?? 0;
        for (const { to, weight } of adjacency.get(from) ?? []) {
          const propagated = fromScore * weight * HOP_DECAY;
          if (propagated <= (best.get(to) ?? 0)) continue;
          best.set(to, propagated);
          next.push(to);
        }
      }
      if (next.length === 0) break;
      frontier = next;
    }

    for (const [nodeId, score] of best) {
      const node = byId.get(nodeId);
      if (node?.type !== 'Table') continue;
      // Indexed-but-unexposed tables (routable === false) are in the graph so it knows
      // the warehouse, but they must never become a routing candidate — the query
      // engine has no DataSource for them and would fail. Filtering HERE rather than
      // downstream matters: if a non-routable table outranked the real answer and were
      // stripped later, the caller would see an empty candidate list and fall back to
      // the markdown catalog, silently losing a route that was actually available.
      if (node.props?.routable === false) continue;
      const entry = tableScores.get(nodeId) ?? { contributions: [], via: new Set<string>() };
      entry.contributions.push(score);
      entry.via.add(seed.nodeId);
      tableScores.set(nodeId, entry);
    }
  }

  return [...tableScores.entries()]
    .map(([nodeId, { contributions, via }]) => {
      // Diminishing returns instead of a plain sum. A plain sum rewards table WIDTH:
      // fact_sug_monthly_rollup carries six metrics and a dozen reports, so a query
      // like "box close rate" accumulated many weak "rate" matches there and beat the
      // strong, correct two-seed match on fact_contact_center_metrics.
      //
      // Sorting contributions and decaying each successive one keeps the original
      // intent — several seeds still beat one — while stopping a long tail of weak
      // matches from outweighing a small number of strong ones.
      const score = [...contributions]
        .sort((a, b) => b - a)
        .reduce((acc, c, i) => acc + c * Math.pow(SEED_DECAY, i), 0);

      return {
        table: (byId.get(nodeId)?.props?.table as string) ?? byId.get(nodeId)?.label ?? nodeId,
        // Squash to 0..1 — accumulation across seeds is unbounded, and the
        // KAG_MIN_CONFIDENCE gate needs a stable scale to compare against.
        score: Number((score / (1 + score)).toFixed(4)),
        via: [...via],
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Prime everything retrieve() touches on a cold process, with a generous budget.
 *
 * Warming the full-text index alone was NOT enough — measured, the first real query
 * still fell back at 813ms after a 439ms "warm". retrieve() also runs an APOC
 * capability probe (SHOW PROCEDURES, a metadata query) and the first expansion, and
 * both of those sit INSIDE the 800ms request budget on a cold process.
 *
 * So this warms the whole path: the APOC probe (whose result is then cached in
 * apocAvailable) and one real expansion. Idempotent; never throws.
 */
export async function warmRetrieval(): Promise<number> {
  const t0 = Date.now();
  try {
    await apocIsAvailable();                     // caches SHOW PROCEDURES
    const seeds = await findSeeds(buildLuceneQuery('revenue'));
    if (seeds.length) await expand(seeds.map(s => s.nodeId), 30_000);
  } catch {
    /* non-fatal — a cold first query is slower, not broken */
  }
  return Date.now() - t0;
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Retrieve a grounded subgraph for a query.
 *
 * NEVER throws and NEVER returns null: on any failure it returns a subgraph with
 * `source: 'fallback-catalog'` and no candidates, which every caller must read as
 * "use loadCatalogContext() instead".
 */
export async function retrieve(query: string): Promise<RetrievedSubgraph> {
  const t0 = Date.now();
  const normalized = normalizeQuery(query);

  if (!normalized) return emptySubgraph('fallback-catalog', 0);

  const cacheKey = { kag: 'retrieve', v: 1, q: normalized };
  const cached = cacheService.get<RetrievedSubgraph>(cacheKey);
  if (cached) return { ...cached, source: 'cache', latencyMs: Date.now() - t0 };

  if (breakerIsOpen()) {
    recordFailure('breaker-open', 'retrieval short-circuited');
    return emptySubgraph('fallback-catalog', Date.now() - t0);
  }

  const luceneQuery = buildLuceneQuery(normalized);
  if (!luceneQuery) {
    // Nothing but stopwords — a real "no seeds" result, not a failure. Do not count
    // it against the breaker.
    return emptySubgraph('fallback-catalog', Date.now() - t0);
  }

  try {
    const subgraph = await withTimeout(
      (async () => {
        const seeds = await findSeedsBlended(luceneQuery, query);
        if (seeds.length === 0) {
          return { nodes: [], edges: [], seeds: [], candidateTables: [], truncated: false };
        }
        const { nodes, edges, truncated } = await expand(seeds.map(s => s.nodeId));
        const candidateTables = scoreCandidates(nodes, edges, seeds);
        return { nodes, edges, seeds, candidateTables, truncated };
      })(),
      KAG_CONFIG.timeoutMs,
      '[KAG] retrieval',
    );

    noteSuccess();

    const result: RetrievedSubgraph = {
      ...subgraph,
      source: 'neo4j',
      latencyMs: Date.now() - t0,
    };

    // Below the confidence floor the top candidate is not trustworthy enough to
    // ground generation — that is precisely the signal that drives a clarification
    // question today. Flag it, but still return the subgraph so callers can decide.
    const top = result.candidateTables[0];
    if (!top || top.score < KAG_CONFIG.minConfidence) recordLowConfidence();

    cacheService.set(cacheKey, result, KAG_CONFIG.cacheTtlMs);
    return result;
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    noteFailure();
    recordFailure(message.includes('timed out') ? 'timeout' : 'error', message.slice(0, 200));
    return emptySubgraph('fallback-catalog', Date.now() - t0);
  }
}
