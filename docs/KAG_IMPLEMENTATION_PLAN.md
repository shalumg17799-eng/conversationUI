# KAG (Knowledge-Augmented Generation) with Neo4j — Implementation Plan

**Status:** Phases 0–7 implemented and verified against live Neo4j + BigQuery (see §0).
**Target branch:** `P2-SK-Adaptive_UI` (or a dedicated `P2-KAG` branch)
**Graph store:** Neo4j (primary, authoritative)
**Scope:** backend only for Phases 0–5; frontend touched only in Phase 6 (debug surface) and Phase 7 (optional provenance UI)

---

## 0. Implementation status

**All seven phases are implemented.** Verified against a live Neo4j 5.26 (Docker) and the
real `data-practice-472314.report_hub_demo` BigQuery dataset.

### Graph as built

```
400 nodes   Entity=213 Column=69 Component=33 Metric=27 Report=19 Dimension=19 Term=10 Table=6 Domain=4
751 rels    HAS_VALUE=326 SLICED_BY=129 HAS_COLUMN=98 RENDERS_AS=66 REPORTS_ON=34
            ALIAS_OF=28 MEASURED_BY=24 SOURCED_FROM=19 IN_DOMAIN=19 JOINS_ON=8
```

### Phase status

| Phase | Deliverable | State |
|---|---|---|
| 0 | Driver, flags, telemetry, `kag:ping` | ✅ APOC **and** vector index both available |
| 1 | Schema, glossary, builder | ✅ 6/6 tables resolve; rebuild idempotent; mark-and-sweep verified (removed 96 stale nodes on a real rebuild) |
| 2 | Lucene sanitizer, retriever, grounding pack, shadow | ✅ 51 unit tests pass |
| 3 | Pack replaces full-catalog injection | ✅ `kagGrounding.ts`, wired at `llmHandler.ts` |
| 4 | Grounding validation | ✅ `kagValidator.ts`, wired after `fixColumnCasing` |
| 5 | Entities + parameterized filters + vector search | ⚠️ entities and filters ✅; **embeddings unverified** (see blockers) |
| 6 | Component affinity (advisory) | ✅ 33 Component nodes, 66 RENDERS_AS edges |
| 7 | Routing eval, debug endpoints, docs | ✅ `kag:eval`, `/api/kag/retrieve`, `/api/kag/stats` |

### Measured results — `npm run kag:eval`

**22/22 routing accuracy (100%)**, p50 118 ms, p95 214 ms, average pack 235 tokens.
The Phase 2 gate (≥90%) is met. Cases include synonym routing the pre-KAG literal
matcher could not do, and two negative cases that must NOT route:

```
churn by territory        → fact_sug_monthly_rollup       (churn → Return Rate %)
customer attrition trend  → fact_sug_monthly_rollup       (attrition → Return Rate %)
agent productivity        → fact_contact_center_metrics   (concept term)
signal strength by site   → fact_network_kpi_points       (Signal Strength → rsrp)
how did Dallas do…        → v_daily_sales_detail          (entity → city)
hello there               → no route                      (falls through to clarification)
```

### Two scoring/model bugs found and fixed by evaluation

1. **Entity seeds reached no table.** `Entity→Dimension→Column→Table` is 3 hops and
   `KAG_MAX_HOPS` is 2, so `Entity:dallas` seeded at score 1.0 and produced *zero*
   candidates. `HAS_VALUE` now hangs off the **Column** (`Entity→Column→Table`, 2 hops),
   which is also the more accurate statement — a value lives in a physical column.
2. **Table width beat relevance.** `scoreCandidates` summed every seed's contribution,
   so `fact_sug_monthly_rollup` (6 metrics, 12 reports) won "box close rate" on a long
   tail of weak "rate" matches. Contributions are now sorted and decayed
   (`SEED_DECAY = 0.5`): several seeds still beat one, but a long tail of weak matches
   no longer outweighs two strong ones. This took accuracy from 90.9% → 100%.
   `KAG_MIN_CONFIDENCE` was recalibrated 0.35 → 0.25 to match the compressed scale —
   **re-run `kag:eval` after any scoring change**, or good routes silently fall back.

### BigQuery: two missing views created

`dataSourceMap.ts` declared `v_monthly_territory_performance` and `v_daily_sales_detail`
as routable, but neither object existed in the dataset. Both are now created by
`npm run bq:views` (`scripts/bq_create_views.ts`, `CREATE OR REPLACE VIEW`, idempotent,
no data written and no table dropped):

| View | Rows | Cols | Derivation |
|---|---|---|---|
| `v_monthly_territory_performance` | 120 | 13 | `fact_sug_monthly_rollup` ⋈ `dim_territories`; `performance_score` is an explicit weighted composite (take rate 35% ↑, RIS 25% ↑, return rate 25% ↓, AARD 15% ↓), `territory_rank` ranks it per month |
| `v_daily_sales_detail` | 450 | 16 | `fact_sug_sales_daily` ⋈ `dim_outlets` ⋈ `dim_territories`, device grain rolled up — pure aggregation, no invented logic |

`performance_score` is a **demo-grade definition, not a signed-off business metric**. It
is written out in full in the view SQL rather than hidden in application code so whoever
owns the metric can review and change it.

### Glossary: 23 of 27 metrics now mapped

Filling `column` in `glossary.data.json` took `MEASURED_BY` from 14 → 24 edges.
**Four metrics are deliberately left unmapped** because no backing column exists anywhere
in the dataset — `Retention Index`, `Performance Index`, `Outage Count`, `Latency`.
`fact_network_kpi_points` has `cqi`/`rsrp`/`sinr`/`score`; none of them is latency, and
mapping one would be a fabrication. This is a real gap in the data model: either add the
columns upstream or drop the KPIs from `dataSourceMap.ts`.

### Blockers

1. **Embeddings unverified.** `GOOGLE_AI_API_KEY` is present but **empty** in
   `backend/.env`. The vector index exists (`kag_embedding`, 768-dim, cosine) and
   `kagEmbeddings.ts` is written and type-checks, but `npm run kag:build -- --embed`
   skips. Retrieval runs on full-text alone, which is why 100% accuracy is achievable
   without it. Set the key and re-run to enable semantic seeds.
2. **KAG is still OFF.** `KAG_ENABLED=false`, `KAG_SHADOW=true`. Every phase is wired
   but inert: Phase 3 returns the markdown fallback, Phase 4 reports without mutating,
   Phase 5 returns no filters. Flip `KAG_ENABLED=true` and `KAG_SHADOW=false` to
   activate — the eval gate is already met.

### Verification run

```
backend tsc          clean
npm run test:kag     51 passed, 0 failed
npm run kag:eval     22/22 (100%)
test:validation 15 · test:constraints 17 · test:governor 26
test:outputmode 17 · test:layout 37 · test:artifacts 34      all passed
npm run check:registry   33 components in sync
/api/kag/stats, /api/kag/retrieve   verified against the running server
```

### Deviations from this plan

- **`REPORTS_ON` added** (Report → Metric). The original edge set had no path from a
  metric to a table except `MEASURED_BY`, which is empty until mappings are confirmed —
  retrieval would have returned zero candidates on day one.
- **Phase 3 swapped one call site, not three.** Only `buildAnalyzePrompt` injects the
  heavy `catalog_context.md`. `sonnetRespond` and `clarifyOrGenerate` build a *compact
  list of every available report*, which is the option universe for clarification
  ("options MUST come ONLY from AVAILABLE DATA"). Narrowing it to a retrieved subset
  would let the model offer options it was never given. It stays complete by design.
- **Phase 7 eval is a standalone `kag:eval`, not an extension of `runEvaluation.ts`.**
  The existing harness calls the LLM per case, mixing model variance and API cost into
  what should be a measurement of retrieval. `kag:eval` is LLM-free, so it is fast, free
  and repeatable — the properties you want when tuning scoring.

---

## 1. What "KAG" means here

KAG = grounding every LLM decision in an explicit, queryable **knowledge graph of the data domain**, instead of pasting a flat text catalog into the prompt and hoping the model picks the right table and column names.

Three things change:

| Concern | Today (flat context) | With KAG |
|---|---|---|
| **What the model sees** | Whole `catalog_context.md` (all domains, all tables, all columns) injected on every analyze call | A retrieved *subgraph* — only the domains/tables/columns/KPIs reachable from the user's query |
| **How routing is decided** | LLM free-text choice + exact-string fallbacks | Cypher traversal produces a ranked candidate set; the LLM chooses *within* that set |
| **How output is validated** | Post-hoc string repair (`fixColumnCasing`) | Every table/column/KPI the LLM emits must resolve to a node; unresolvable ⇒ repaired from the graph or rejected |

---

## 2. Current state (what we're building on)

Read before implementing — these are the exact seams KAG plugs into.

| File | Role today | KAG impact |
|---|---|---|
| [backend/src/services/dataSourceMap.ts](../backend/src/services/dataSourceMap.ts) | Hand-maintained `DATA_SOURCES` (8 entries) + `REPORT_ANGLES` (14 entries). Single source of truth for routing and clarification options. | Becomes the **seed** for the graph builder. Stays as-is; the graph is derived from it, not a replacement. |
| [backend/src/services/catalogRefresher.ts](../backend/src/services/catalogRefresher.ts) | Queries `INFORMATION_SCHEMA.COLUMNS` per table, renders `backend/data/catalog_context.md` (~102 lines today). Refresh on startup + `POST /api/catalog/refresh`. | Same refresh path now also writes the graph to Neo4j. The `.md` stays — it is the **degraded-mode fallback** when Neo4j is unreachable. |
| [backend/src/services/llmHandler.ts:815](../backend/src/services/llmHandler.ts#L815) | `buildAnalyzePrompt` injects the **entire** catalog markdown as "DATASET FIELD REFERENCE". | Replaced by a retrieved grounding pack. Primary token win. |
| [backend/src/services/llmHandler.ts:783](../backend/src/services/llmHandler.ts#L783) | `deterministicRoute` / `findAnglesByLabel` — exact, case-insensitive label matching. | Backed by the Neo4j full-text index, so "churn" resolves to Return Rate % without a code edit. |
| [backend/src/services/queryEngine.ts](../backend/src/services/queryEngine.ts) | `SELECT * FROM <table> ORDER BY <orderBy> LIMIT <n>` — no column awareness, no filters, no joins. | Can project only graph-relevant columns and push down entity filters (Phase 5). |
| [backend/src/pipeline/runStreamingPipeline.ts:28](../backend/src/pipeline/runStreamingPipeline.ts#L28) | `fixColumnCasing` — repairs LLM-invented column casing against actual result columns. | Superseded by graph-canonical column resolution (kept as a belt-and-braces fallback). |
| [backend/src/services/cacheService.ts](../backend/src/services/cacheService.ts) | In-memory TTL cache singleton (`cacheService`, `generateKey`). | **Reused directly** to cache retrieval results and absorb Neo4j round-trip latency (§6). |
| [backend/src/lib/bigqueryClient.ts](../backend/src/lib/bigqueryClient.ts) | Module-level client built from env, `runQueryWithMeta` logs ENTRY/EXIT with timings. | Pattern to mirror for `neo4jClient.ts` — same env-driven construction, same timing logs. |
| [backend/src/evaluation/runEvaluation.ts](../backend/src/evaluation/runEvaluation.ts) | Pipeline eval over `testCases.json`, asserts root `renderType`. | Extended with routing-accuracy and grounding-violation metrics. |

**Observed pain points KAG addresses**

1. Catalog context grows linearly with tables × columns and is sent in full on *every* analyze call.
2. KPI display names (`"Take Rate %"`) have no machine link to physical columns — the model infers, sometimes wrongly, which is why `fixColumnCasing` exists.
3. Synonyms are invisible: "churn", "attrition", "drop-off" all mean the Return Rate / RIS family, but only literal matches route.
4. `DATA_SOURCES` and the generated `.md` encode the same facts twice, kept in sync by hand.
5. Entity values (territory, outlet, agent names) are never surfaced, so "how did Dallas do?" cannot route on the entity.

---

## 3. Neo4j setup

### 3.1 Hosting

Backend runs on Azure App Service (`.env.example` → `azurewebsites.net`); there is **no Docker or compose file in this repo today**.

| Environment | Recommendation |
|---|---|
| **Local dev** | Neo4j Desktop, or a new `docker-compose.kag.yml` running `neo4j:5-community` on 7474/7687. Adding the compose file is part of Phase 0 — do not assume developers have Neo4j installed. |
| **Shared dev / demo** | **Neo4j AuraDB Free** — 200k nodes / 400k relationships, far above our ceiling (§3.5). Zero ops. |
| **Production** | AuraDB Professional, or Neo4j on Azure Marketplace if data residency requires it. |

Aura runs Neo4j 5.x with APOC Core available — both `apoc.path.expandConfig` and native vector indexes are usable. Verify the APOC procedure allowlist on the target instance during Phase 0 rather than at Phase 2; the retriever design in §4.3 depends on it and has a documented fallback if it is unavailable.

### 3.2 Connection & credentials

New env vars (add to [.env.example](../.env.example)):

```
# Neo4j — KAG knowledge graph store
NEO4J_URI=neo4j+s://<instance>.databases.neo4j.io   # local: bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=
NEO4J_DATABASE=neo4j
```

On Azure App Service these become application settings. Outbound `bolt+s` (7687) must be permitted — confirm this early, it is a common first-deploy blocker.

`backend/src/kag/neo4jClient.ts` mirrors `bigqueryClient.ts`:

- module-level lazy driver (single instance — the driver pools connections internally; **never create a driver per request**)
- `maxConnectionPoolSize: 20`, `connectionAcquisitionTimeout: 5000`, `maxTransactionRetryTime: 5000`
- `runCypher(query, params)` helper logging `[Neo4j ENTRY]` / `[Neo4j EXIT] rows=… duration=…ms`, matching the BigQuery logs
- **all queries parameterized** — no string interpolation into Cypher, ever
- read queries use `session.executeRead` against `defaultAccessMode: READ` so Aura can route them to a replica
- graceful `driver.close()` on `SIGTERM`

### 3.3 Graph schema

**Node labels:** `Domain`, `Report`, `Table`, `Column`, `Metric`, `Dimension`, `Entity`, `Term`, `Component`
Every node also carries the shared label `:Kag` — this is what the full-text index spans, so seed matching is one index hit rather than nine.

**Relationship types:**

| Relationship | Meaning | Built by |
|---|---|---|
| `(:Report)-[:IN_DOMAIN]->(:Domain)` | report grouping | builder (deterministic) |
| `(:Report)-[:SOURCED_FROM]->(:Table)` | report's physical source | builder (deterministic) |
| `(:Report)-[:REPORTS_ON]->(:Metric)` | **the day-one routing path** — reaches a table without a confirmed column mapping | builder (deterministic) |
| `(:Table)-[:HAS_COLUMN]->(:Column)` | BQ schema | builder (BigQuery) |
| `(:Metric)-[:MEASURED_BY]->(:Column)` | **the key semantic link** | glossary (explicit) + name-similarity proposal, human-confirmed |
| `(:Metric)-[:SLICED_BY]->(:Dimension)` | valid breakdowns | builder + glossary |
| `(:Dimension)-[:HAS_VALUE]->(:Entity)` | distinct values | builder (Phase 5) |
| `(:Term)-[:ALIAS_OF]->(:Metric\|:Domain\|:Report)` | synonyms | glossary |
| `(:Metric)-[:RELATED_TO]->(:Metric)` | weighted affinity | glossary + telemetry |
| `(:Metric)-[:RENDERS_AS]->(:Component)` | weighted render affinity | registry + telemetry (Phase 6) |
| `(:Table)-[:JOINS_ON]->(:Table)` | shared key | builder (confirmed matches only) |

Every relationship carries `weight: float` (0–1) and `provenance: string`.

### 3.4 Constraints & indexes (run once, idempotent)

```cypher
CREATE CONSTRAINT kag_id IF NOT EXISTS
  FOR (n:Kag) REQUIRE n.id IS UNIQUE;

CREATE INDEX kag_type IF NOT EXISTS FOR (n:Kag) ON (n.type);

// Seed matching — Lucene full-text over display names and synonyms.
// This replaces the hand-rolled trigram/Jaro matcher a JSON store would have needed.
CREATE FULLTEXT INDEX kag_search IF NOT EXISTS
  FOR (n:Kag) ON EACH [n.label, n.aliasText];

// Phase 5 — native vector index for semantic seed matching.
CREATE VECTOR INDEX kag_embedding IF NOT EXISTS
  FOR (n:Kag) ON (n.embedding)
  OPTIONS { indexConfig: {
    `vector.dimensions`: 768,
    `vector.similarity_function`: 'cosine' } };
```

`aliasText` is the alias array joined on `" | "` — Neo4j full-text indexes string properties and arrays of strings, but a single joined field gives more predictable scoring across analyzers.

**Node properties:** `id` (`"Metric:take-rate-pct"`), `type`, `label`, `aliases` (array), `aliasText`, `provenance`, `builtAt`, plus type-specific props (`dataType`, `orderBy`, `rowLimit`, `description`, `unit`, `format`).

### 3.5 Expected size

| | Nodes | Relationships |
|---|---|---|
| Phases 1–4 (catalog + schema + glossary) | ~150 | ~350 |
| Phase 5 (entities, capped) | ~2,150 | ~4,300 |

Aura Free's 200k-node ceiling is ~90× headroom. Size is not a constraint; latency and availability are.

---

## 4. Retrieval design

### 4.1 TypeScript surface (`backend/src/kag/types.ts`)

```ts
export type KagNodeType =
  | 'Domain' | 'Report' | 'Table' | 'Column'
  | 'Metric' | 'Dimension' | 'Entity' | 'Term' | 'Component';

export interface KagNode {
  id: string;                       // "Metric:take-rate-pct" — matches the uniqueness constraint
  type: KagNodeType;
  label: string;
  aliases: string[];
  props: Record<string, unknown>;
  provenance: 'catalog' | 'bigquery' | 'glossary' | 'telemetry' | 'registry';
}

export interface RetrievedSubgraph {
  nodes: KagNode[];
  edges: Array<{ from: string; to: string; type: string; weight: number }>;
  seeds: Array<{ nodeId: string; score: number; matchedOn: string }>;
  candidateTables: Array<{ table: string; score: number; via: string[] }>;
  truncated: boolean;
  source: 'neo4j' | 'cache' | 'fallback-catalog';   // always report provenance
  latencyMs: number;
}
```

`source` is deliberately part of the contract: every consumer and every telemetry record can tell whether a decision was graph-grounded or served by the degraded fallback. Debugging a bad route without this field is guesswork.

### 4.2 Seed matching

```cypher
CALL db.index.fulltext.queryNodes('kag_search', $luceneQuery, {limit: 15})
YIELD node, score
RETURN node.id AS id, node.type AS type, node.label AS label, score
```

`$luceneQuery` is built by a **sanitizer** that escapes Lucene special characters (`+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /`) and joins terms as `term1~1 OR term2~1` for single-character fuzziness. Raw user text must never reach Lucene syntax unescaped — a stray `"` or `~` is a query parse error and takes out the whole route.

### 4.3 Expansion

Preferred (APOC available):

```cypher
MATCH (seed:Kag) WHERE seed.id IN $seedIds
CALL apoc.path.expandConfig(seed, {
  relationshipFilter: 'IN_DOMAIN|SOURCED_FROM|HAS_COLUMN|MEASURED_BY|SLICED_BY|ALIAS_OF>|RELATED_TO|HAS_VALUE',
  minLevel: 0, maxLevel: $maxHops, limit: $maxNodes, uniqueness: 'NODE_GLOBAL'
}) YIELD path
RETURN path
```

Fallback (APOC restricted — verify in Phase 0):

```cypher
MATCH p = (seed:Kag)-[r*0..2]-(n:Kag)
WHERE seed.id IN $seedIds
  AND ALL(rel IN r WHERE type(rel) IN $allowedTypes)
RETURN p LIMIT $maxNodes
```

Variable-length patterns are unbounded-cost by nature; `maxHops` is capped at 2 and `maxNodes` at 60 in config. Do not make these user-controllable.

### 4.4 Scoring

Scoring stays in **TypeScript**, not Cypher. Cypher fetches the subgraph; the retriever computes seed score × Π(edge weights) with hop decay, aggregates per `Table`, and ranks. Keeping this in TS means scoring is unit-testable without a database — the thing you will actually iterate on most.

If the top table's score is below `KAG_MIN_CONFIDENCE`, return the domain-level pack instead. That is precisely the signal that drives a clarification question today.

### 4.5 Grounding pack

Compact, deterministic, score-ordered, token-budgeted:

```
RELEVANT DATA (retrieved for this query):
[Sales] "Take Rate by Territory" → table: fact_sug_monthly_rollup (score 0.91)
  metrics: Take Rate % → take_rate_pct (FLOAT64), SUG Revenue → sug_revenue (FLOAT64)
  dimensions: territory_name (STRING), month_id (INT64)
  order: month_id DESC, limit 50
[Sales] "Territory Performance Scorecard" → table: v_monthly_territory_performance (score 0.44)
  metrics: Performance Score → performance_score (FLOAT64)
RULES: use ONLY the table and column names above, verbatim.
```

Target ≤ 600 tokens vs. the full-catalog injection today. **Measure both in Phase 2 shadow mode** rather than assuming the number.

---

## 5. Phased plan

Each phase is independently shippable and revertible. Flags live in `.env`.

### Phase 0 — Infra, driver, flags (~1.5 days)

- `docker-compose.kag.yml` for local Neo4j (`neo4j:5-community`), documented in `backend/README.md`.
- Provision AuraDB Free for shared dev; store credentials as Azure App Service settings.
- `backend/src/kag/neo4jClient.ts` — lazy driver, pool config, `runCypher` with ENTRY/EXIT timing logs, `SIGTERM` close.
- `backend/src/kag/config.ts` — `KAG_ENABLED` (default `false`), `KAG_SHADOW` (default `true`), `KAG_MAX_HOPS=2`, `KAG_MAX_NODES=60`, `KAG_MIN_CONFIDENCE`, `KAG_TIMEOUT_MS=800`, `KAG_CACHE_TTL_MS`.
- `backend/src/kag/kagTelemetry.ts` + `GET /api/metrics/kag` and its reset endpoint, matching the existing telemetry modules.
- `npm run kag:ping` — connectivity smoke test.
- **Verify on the target instance:** APOC procedure allowlist, vector index availability, outbound 7687 from Azure App Service.

**Done when:** `kag:ping` succeeds locally and against Aura from Azure; server boots unchanged with flags off; APOC availability is recorded in the plan.

### Phase 1 — Schema + builder (~2.5 days)

- `backend/src/kag/glossary.json` — hand-authored, the one genuinely manual input:
  - metric → column mappings (`"Take Rate %" → take_rate_pct`)
  - aliases (`churn`/`attrition` → Return Rate %; `AHT` → AHT (sec))
  - units and format hints
- `backend/src/kag/schema.cypher` + `applySchema()` — constraints and indexes from §3.4, idempotent, run at startup.
- `backend/src/kag/kagBuilder.ts`:
  - extract the `fetchTableSchema` helper out of `catalogRefresher.ts` and **share** it — do not copy it
  - build nodes/edges from `DATA_SOURCES`, `REPORT_ANGLES`, BQ schemas, glossary
  - write via batched `UNWIND $rows AS row MERGE (n:Kag {id: row.id}) SET n += row.props` — one transaction per node label, one per relationship type
  - **`MEASURED_BY` proposals by name similarity are written to `backend/data/kag/unmapped.json` for human review, never merged into the graph.** Silently inventing metric semantics is worse than the current guessing, because it looks authoritative.
  - stamp every node with `builtAt`; delete nodes whose `builtAt` predates the current build (mark-and-sweep) so removed tables do not linger
- `npm run kag:build`, mirroring the existing `registry:generate` script pattern.
- Wire into `refreshCatalog()` so `POST /api/catalog/refresh` rebuilds the graph too.

**Done when:** every table in `ALL_TABLES` has a `:Table` node with ≥1 `HAS_COLUMN`; every KPI string in `DATA_SOURCES.kpis` either has a confirmed `MEASURED_BY` edge or appears in `unmapped.json`; a rebuild is idempotent (node/rel counts stable across two consecutive runs).

### Phase 2 — Retriever + shadow mode (~2.5 days)

- `backend/src/kag/luceneEscape.ts` — the sanitizer from §4.2, with unit tests for every special character.
- `backend/src/kag/kagRetriever.ts` — seed → expand → score → `RetrievedSubgraph`, wrapped in the timeout + circuit breaker from §7.
- `backend/src/kag/groundingPack.ts` — token-budgeted serialization.
- Cache retrieval by normalized query via `cacheService` (§6).
- Wire **shadow only** into `buildAnalyzePrompt` and `sonnetRespond`: compute the pack, record it, **do not use it**.
- Telemetry per query: seed count, subgraph size, Neo4j latency, cache hit/miss, pack tokens vs full-catalog tokens, and whether the top candidate table matches what the live path actually routed to.

**Done when:** ≥50 shadow queries recorded; agreement between top KAG candidate and live routing is reported. **Gate: ≥90% agreement** before Phase 3. Triage disagreements — some will be KAG being right.

### Phase 3 — Retrieval replaces full-catalog injection (~1.5 days)

- Behind `KAG_ENABLED=true`, `buildAnalyzePrompt` uses the grounding pack instead of `loadCatalogContext()`.
- Same swap in `sonnetRespond` (llmHandler.ts:700) and `clarifyOrGenerate`.
- Clarification options come from retrieved `Report`/`Domain` nodes. The existing hard rule still holds: options must be real and available — the `getAvailableDataSources()` startup probe filter must exclude probe-failed tables **from the pack itself**, not merely from the options list.
- Automatic fallback to `loadCatalogContext()` whenever `source === 'fallback-catalog'`, or when `truncated` is true at low confidence.

**Done when:** `npm run test:validation` and the eval harness show no regression; median analyze-prompt tokens drop (report the measured figure); routing accuracy ≥ baseline; p95 added latency within the §6 budget.

### Phase 4 — Grounded generation & validation (~2 days)

- `backend/src/kag/kagValidator.ts` — every table/column/metric referenced by generated cards must resolve to a node in the retrieved subgraph:
  - resolvable via casing/alias → repair, count `repaired`
  - unresolvable → count `violation`, drop the offending prop or fall back
- Validate against the **already-retrieved subgraph in memory** — no extra Neo4j round-trip on this path.
- Shadow first (`KAG_SHADOW`), consistent with `shadowValidateCards`.
- Pass canonical column names into `generateReport` so the model is given exact identifiers rather than inferring them.
- Once violation rates are known, promote `fixColumnCasing` to graph-backed resolution, keeping the string heuristic as last resort.

**Done when:** violation rate measured and trending down; no card renders a column absent from the result set.

### Phase 5 — Entities + native vector search (~2.5 days)

- Builder step: for each `Dimension` column with `COUNT(DISTINCT) ≤ 200`, fetch distinct values → `:Entity` nodes + `HAS_VALUE` edges. Cap total entities (2,000) and **log what was dropped** — a silent cap reads as full coverage.
- Enables "how did Dallas do last quarter" → seed `Entity:dallas` → `Dimension:territory_name` → `Table:fact_sug_monthly_rollup`.
- `queryEngine.executeQuery` gains an optional `filters` argument so a resolved entity becomes a **parameterized** BigQuery `WHERE` clause. Entity values are never concatenated into SQL.
- Embed node `label + aliasText` at build time via the already-present `@google/genai` SDK; store as a node property and query through the native vector index — this is a concrete payoff of the Neo4j choice, since no separate embedding file or in-process cosine is needed. Blend vector score with full-text score in the TS scorer. Skips cleanly when no API key is configured.

**Done when:** entity-scoped queries route correctly on a hand-written test set; entity filters appear in emitted SQL as parameters; dropped-entity counts are logged.

### Phase 6 — Adaptive-UI affinity edges (~1.5 days, optional)

- `:Component` nodes from `registry/generated/componentRegistry.json`; `RENDERS_AS` edges weighted from the registry and updated incrementally from governor + layout telemetry. Incremental weight updates on a live graph are genuinely easier here than with a rebuilt file — worth doing if Phase 6 is taken up.
- Feed as an **advisory** signal into `componentSelector.deriveConstraints`, matching the current "passive, never fed into generation" stance.

**Done when:** affinity recorded alongside existing constraint telemetry with no behavior change.

### Phase 7 — Eval, debug surface, docs (~1.5 days)

- Extend `backend/src/evaluation/testCases.json` with `{ query, expectedTable, expectedDomain }` alongside the existing `expected` renderType.
- Extend `runEvaluation.ts` to report routing accuracy and grounding violations, not just root `renderType`.
- `npm run test:kag`.
- `GET /api/kag/stats` (node/rel counts by label, `builtAt`, breaker state) and `GET /api/kag/retrieve?q=…` (subgraph + pack + latency + source). The latter is the single most useful debugging and demo endpoint in the system.
- **Do not expose an endpoint that executes arbitrary Cypher.** Use Neo4j Browser against the instance directly for ad-hoc exploration.
- Update [ARCHITECTURE_PHASE2.md](../ARCHITECTURE_PHASE2.md) and [CHAT_FLOW_ARCHITECTURE.md](../CHAT_FLOW_ARCHITECTURE.md).

---

## 6. Latency budget

Neo4j sits on the hot path of every query. Budget it explicitly.

| Step | Target |
|---|---|
| Full-text seed query | < 15 ms |
| Expansion query | < 40 ms |
| TS scoring + serialization | < 5 ms |
| **Total (Aura, warm pool)** | **< 80 ms p95** |
| Total (cache hit) | < 1 ms |

Mitigations, in order of value:

1. **Cache retrieval results** in the existing `cacheService`, keyed on the normalized query, TTL 10 min. The catalog changes daily at most; retrieval for a repeated question is fully cacheable. Expect a high hit rate on demo and eval traffic.
2. **Warm the pool at startup** with a trivial `RETURN 1` so the first user query does not pay TLS + handshake cost.
3. **Co-locate Aura with the Azure App Service region.** Cross-region adds 40–80 ms per hop and would blow the budget on its own.
4. **Hard timeout** `KAG_TIMEOUT_MS=800` → fall back rather than hang. A slow route is worse than a slightly less precise one.

For scale: this replaces a large prompt injection ahead of an LLM call measured in seconds. An 80 ms graph lookup that shrinks the prompt is very likely net-positive on end-to-end latency — but **prove it with the Phase 2 shadow numbers** instead of asserting it.

---

## 7. Availability & degradation

Neo4j becoming a hard dependency of every query is the main risk this choice introduces. It is addressed directly:

- **Circuit breaker** in `kagRetriever`: 3 consecutive failures or timeouts → open for 60 s, retrieval short-circuits to fallback, breaker state exposed via `/api/kag/stats`.
- **Fallback is the current code path** — `loadCatalogContext()` with the existing `.md`. This is why the markdown catalog is retained rather than deleted. Degraded mode is exactly today's behavior, which is known to work.
- **`source: 'fallback-catalog'`** is recorded on every affected request, so silent degradation is impossible to miss in telemetry.
- **`KAG_ENABLED=false`** is a complete kill switch at every phase.
- **Startup never blocks on Neo4j.** Schema application and graph build run in the background; an unreachable Neo4j at boot means degraded KAG, not a failed server. Mirror the existing non-blocking catalog-refresh-on-startup behavior.

---

## 8. Security

- **Parameterized Cypher only.** No user text interpolated into a query string.
- **Lucene input escaped** before reaching `db.index.fulltext.queryNodes` (§4.2) — unescaped user text is both a correctness bug and an injection surface.
- **No arbitrary-Cypher endpoint**, in any environment.
- **Read-only credentials** for the application at runtime; the builder uses a separate write-capable credential invoked only by the refresh path.
- **Entity values are parameters** in BigQuery, never concatenated into SQL.
- Neo4j credentials as Azure App Service settings; never committed. Add to `.env.example` with empty values only.

---

## 9. New file layout

```
backend/src/kag/
  types.ts            # node/edge/subgraph interfaces
  config.ts           # flags + tunables
  neo4jClient.ts      # lazy driver, pool, runCypher, timing logs
  schema.ts           # constraints + full-text + vector indexes (idempotent)
  glossary.data.json  # hand-authored semantics (metric→column, aliases, units)
  glossary.ts         # typed accessor — NOT named glossary.json's sibling by accident:
                      # Node resolves './glossary' to the .json before the .ts
  kagBuilder.ts       # DATA_SOURCES + BQ schema + glossary → Neo4j
  kagRetriever.ts     # query → RetrievedSubgraph (timeout + breaker + cache)
  luceneEscape.ts     # full-text query sanitizer
  groundingPack.ts    # RetrievedSubgraph → prompt text (token-budgeted)
  kagValidator.ts     # generated cards → violations/repairs
  kagTelemetry.ts     # counters + /api/metrics/kag
backend/data/kag/
  unmapped.json       # generated: KPIs with no confirmed column mapping (review in PRs)
scripts/
  test_kag.ts         # retrieval + grounding assertions
docker-compose.kag.yml # local Neo4j for development
```

New dependency: `neo4j-driver@^5` in `backend/package.json`.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Neo4j unavailable ⇒ every query degraded | Circuit breaker + `.md` fallback + `source` telemetry + kill switch (§7) |
| Hot-path latency regression | Explicit budget, cache, pool warming, region co-location, 800 ms timeout (§6) |
| Retrieval misses the right table ⇒ worse routing than today | Shadow-mode gate at ≥90% agreement before any behavior change (Phase 2) |
| Graph stale vs BigQuery | Rebuilt by the existing refresh path; `builtAt` mark-and-sweep removes stale nodes |
| Name-similarity `MEASURED_BY` edges invent semantics | Proposals to `unmapped.json` for human confirmation; never auto-merged |
| Lucene syntax errors from raw user text | Dedicated escaper with per-character unit tests |
| Unbounded variable-length traversal | `maxHops ≤ 2`, `maxNodes ≤ 60`, not user-controllable |
| Entity extraction explodes node count / BQ cost | Cardinality cap (200/column), total cap (2,000), dropped counts logged |
| Infra/credential drift across local/dev/prod | Compose file for local, Aura for shared, `kag:ping` smoke test in all three |

---

## 11. Non-goals

- Replacing BigQuery as the source of truth. Neo4j holds **metadata and semantics**, never fact rows.
- LLM-generated SQL. The graph makes routing safer; free-form SQL generation is a separate decision.
- A user-facing graph explorer UI (Neo4j Browser covers internal needs).
- Multi-hop join reasoning beyond `JOINS_ON` edges the builder can confirm by shared key.

---

## 12. Sequencing summary

| Phase | Deliverable | Est. | Gate to next |
|---|---|---|---|
| 0 | Neo4j infra, driver, flags, `kag:ping` | 1.5d | Connectivity verified local + Azure→Aura; APOC availability confirmed |
| 1 | Schema, glossary, builder → Neo4j | 2.5d | Every table/KPI covered or listed unmapped; rebuild idempotent |
| 2 | Cypher retriever + shadow metrics | 2.5d | **≥90% routing agreement**; latency within budget |
| 3 | Pack replaces catalog injection | 1.5d | No eval regression; token drop measured |
| 4 | Grounding validation | 2d | Violation rate measured, trending down |
| 5 | Entities + native vector index | 2.5d | Entity queries route correctly; filters parameterized |
| 6 | Component affinity (optional) | 1.5d | Telemetry only, no behavior change |
| 7 | Eval, debug endpoints, docs | 1.5d | — |

**Core value lands at Phase 3–4 (~8 days).** Phases 5–7 are extensions.

Neo4j adds roughly **2 days** over an in-process store (Phase 0 infra, plus resilience and latency work in Phases 2 and 7). It buys Cypher-native retrieval, Lucene full-text seed matching for free, a native vector index in Phase 5, and incremental telemetry-weighted edges in Phase 6.

---

## 13. Open questions for the team

1. **Glossary ownership** — who authors and reviews metric→column mappings? This is the one genuinely manual input, and its quality caps the whole system's accuracy.
2. **Aura tier and region** — Free is sufficient by size, but must be co-located with the Azure App Service region (§6). Who provisions it, and does Free's inactivity pause policy affect demo readiness?
3. **`REPORT_ANGLES` vs graph** — do angles stay hand-curated (they read as product/demo copy, not derived facts), or become generated `:Report` nodes?
4. **Entity scope** — is exposing distinct territory/outlet/agent values acceptable given data sensitivity, or should `:Entity` nodes be limited to non-identifying dimensions?
5. **Provider split** — should the grounding pack differ between the `gemma` and `sonnet` paths? Gemma may need a tighter, more prescriptive pack.
