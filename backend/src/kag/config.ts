// KAG configuration — all tunables in one place, all env-driven.
//
// Two independent flags, mirroring the existing Phase-3/4 telemetry pattern in this
// codebase ("passive, never blocks render"):
//   KAG_ENABLED — master switch. false ⇒ nothing in kag/ runs on the request path.
//   KAG_SHADOW  — when enabled, retrieval runs and is recorded but its result is
//                 NOT used to change any decision. Shadow must stay on until the
//                 Phase 2 agreement gate is met.

import dotenv from 'dotenv';

dotenv.config();

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

export const KAG_CONFIG = {
  // ── Master flags ──────────────────────────────────────────────────────────
  enabled: bool('KAG_ENABLED', false),
  shadow: bool('KAG_SHADOW', true),

  // ── Neo4j connection ──────────────────────────────────────────────────────
  uri: process.env.NEO4J_URI ?? '',
  user: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? '',
  database: process.env.NEO4J_DATABASE ?? 'neo4j',

  // ── Semantic (vector) seeds — OFF by default ──────────────────────────────
  // Measured, not assumed: switching this on took routing accuracy from 5/5 to 2/5 on
  // scripts/kag_verify.ts, and made "hello there" route to a table when refusing to
  // route is correct. Two causes, and a similarity floor fixes neither cleanly:
  //   • A vector index always returns nearest neighbours, however unrelated, so it
  //     manufactures seeds where full-text correctly found none.
  //   • Neo4j reports cosine as (1+cos)/2, so every score sits high and genuine
  //     matches (0.79–0.83) overlap the noise band — no threshold separates them.
  // RETESTED at full coverage (201/201 nodes embedded) — the "it was only half
  // embedded" hypothesis is refuted. Still worse, on both axes:
  //     vector OFF  25/25 (100%)  p50  85ms
  //     vector ON   20/25 ( 80%)  p50 665ms
  // "take rate by territory" and "customer attrition trend" stopped routing entirely,
  // and "hello there" routed to a table again. The latency alone disqualifies it for
  // the hot path: 665ms p50 against an 800ms timeout leaves no headroom.
  //
  // The node texts here are short labels ("Take Rate %", "AHT (sec)"), close to a worst
  // case for embedding similarity — full-text is simply the better tool for this
  // corpus. Do not re-enable without re-running kag:eval; the code is kept because it
  // would earn its place on longer, more descriptive node text.
  vectorSeeds: bool('KAG_VECTOR_SEEDS', false),

  // ── Routing enforcement ───────────────────────────────────────────────────
  // Without this the grounding pack only INFORMS the model: KAG can retrieve the right
  // table, put it first in the pack, and the LLM still routes elsewhere (observed:
  // top=fact_contact_center_metrics → BQ Query on fact_sug_monthly_rollup).
  // With it, a high-confidence retrieval overrides the model's table choice.
  //
  // Two separate bars, because the two situations are not equally reversible:
  //   enforceMinConfidence  — override the model on a FRESH query.
  //   switchMinConfidence   — pull an OPEN report onto a different table. Higher,
  //                           because yanking the table under a follow-up is jarring
  //                           and "compare to Q4" should stay where it is.
  enforceRouting: bool('KAG_ENFORCE_ROUTING', true),
  // Equal to minConfidence ON PURPOSE, and it was 0.40 until a demo query exposed why
  // that was wrong: "how did Dallas do on units sold" retrieved v_daily_sales_detail
  // at 0.29, which cleared minConfidence (0.25) so the pack DESCRIBED that table — but
  // sat under 0.40, so the model still queried fact_sug_monthly_rollup. The prompt and
  // the query disagreed, which is precisely the contradiction gap 1 exists to remove.
  // Correct routes span roughly 0.28–0.72 after the SEED_DECAY compression, so a 0.40
  // bar silently excluded about half of them.
  // The coherent rule: if retrieval is trusted enough to TELL the model which table to
  // use, it is trusted enough to route there. One threshold, not two.
  enforceMinConfidence: num('KAG_ENFORCE_MIN_CONFIDENCE', 0.25),
  // 0.55 was too strict in practice: "now show me agent handle time" on an open sales
  // report scored 0.4487 and stayed put, which is the exact case this bar exists to
  // allow. 0.42 still sits above the fresh-query bar (0.40), so switching an open report
  // remains harder than routing a new one, and vague follow-ups ("compare to Q4")
  // are unaffected - they produce no candidate at all, not a low-scoring one.
  switchMinConfidence: num('KAG_SWITCH_MIN_CONFIDENCE', 0.42),

  // ── Retrieval bounds (NOT user-controllable — these cap traversal cost) ───
  maxHops: num('KAG_MAX_HOPS', 2),
  // 60 truncated EVERY retrieval (7/7 observed live) — the budget was always binding,
  // so the subgraph was permanently clipped with nobody checking what fell off.
  // Swept 60/120/200/300 against kag:eval: accuracy stays 100% and the pack stays
  // 236 tokens at every setting, because groundingPack caps tables independently of
  // this. So raising it costs nothing in prompt size and only buys headroom.
  // 120 clears the truncation without paying 300's traversal cost on a bigger graph.
  maxNodes: num('KAG_MAX_NODES', 120),
  maxSeeds: num('KAG_MAX_SEEDS', 15),
  // Calibrated against scripts/kag_eval.ts: with per-seed diminishing returns in
  // scoreCandidates, correctly-routed queries land in 0.28–0.72 while queries that
  // SHOULD clarify ("hello there") produce no candidate at all and score 0. 0.25 sits
  // in that gap. Re-run `npm run kag:eval` after any scoring change — a threshold
  // tuned to the old scale silently sends good routes to the markdown fallback.
  minConfidence: num('KAG_MIN_CONFIDENCE', 0.25),

  // ── Resilience ────────────────────────────────────────────────────────────
  // A slow route is worse than a slightly less precise one — time out and fall back.
  timeoutMs: num('KAG_TIMEOUT_MS', 800),
  breakerThreshold: num('KAG_BREAKER_THRESHOLD', 3),
  breakerResetMs: num('KAG_BREAKER_RESET_MS', 60_000),

  // ── Caching ───────────────────────────────────────────────────────────────
  // The catalog changes daily at most, so retrieval for a repeated question is
  // fully cacheable. This is the main mitigation for Neo4j round-trip latency.
  cacheTtlMs: num('KAG_CACHE_TTL_MS', 10 * 60 * 1000),

  // ── Warehouse discovery ───────────────────────────────────────────────────
  // The graph used to mirror DATA_SOURCES — a hand-curated list of 7 tables — so 17 of
  // the 24 objects in report_hub_demo were invisible to it. That is why "break down by
  // platform" failed while device_group sat in three unexposed tables: the graph could
  // not even tell us the data existed. Curating the list is not a fix, because the
  // NEXT unexposed column fails the same way.
  //
  // With this on, every BigQuery object becomes a :Table node, but only those in
  // DATA_SOURCES are marked routable. Discovery and routability are separate concerns:
  // the graph knows the whole warehouse, while retrieval still only ever routes to a
  // table the query engine can actually serve.
  indexAllTables: bool('KAG_INDEX_ALL_TABLES', true),
  // Staging/duplicate objects. Excluded from discovery entirely — they duplicate their
  // parent table's columns and would double every column node for no benefit.
  tableExcludePattern: process.env.KAG_TABLE_EXCLUDE ?? '_temp$',

  // ── Builder bounds (Phase 5) ──────────────────────────────────────────────
  entityCardinalityCap: num('KAG_ENTITY_CARDINALITY_CAP', 200),
  entityTotalCap: num('KAG_ENTITY_TOTAL_CAP', 2000),
} as const;

/**
 * True when Neo4j credentials are present. Checked before any driver work so a
 * missing NEO4J_URI degrades to "KAG unavailable" rather than throwing at import.
 */
export function isKagConfigured(): boolean {
  return Boolean(KAG_CONFIG.uri && KAG_CONFIG.password);
}

/** True when KAG should do anything at all on the request path. */
export function isKagActive(): boolean {
  return KAG_CONFIG.enabled && isKagConfigured();
}
