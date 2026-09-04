# KAG architecture

How the system is *built* — modules, boundaries, contracts, state, failure design.

Companion to [KAG_EXPLAINED.md](KAG_EXPLAINED.md), which covers *what it does and why*.
This one is for someone about to change the code.

Everything here was read from the source, not recalled. Where the structure has a
blemish, it is named.

---

## 1. The one-paragraph version

KAG is a **read-mostly sidecar**. A build process turns BigQuery's schema plus a
hand-written glossary into a Neo4j graph. At request time, a retriever turns the user's
question into a small subgraph, a serializer turns that into ~250 tokens of prompt text,
and three consumers act on it: the prompt builder, the router, and the query filter.
Nothing in it is on the critical path in the sense that failure breaks the app — every
layer degrades to the behaviour that existed before KAG.

---

## 2. Layers

Eight layers. Each depends only on the ones above it. This is the actual dependency
order, not an idealised one.

```
L0  config.ts            env → flags and tunables. Depends on nothing.
L1  types.ts             node/edge model, relationship whitelist, slugify.
L2  neo4jClient.ts       pooled driver, parameterised Cypher, timing logs.
    schema.ts            constraints, full-text index, vector index.
    glossary.ts          typed access to the hand-authored semantics.
L3  kagBuilder.ts        BigQuery + glossary → graph.        (BUILD TIME)
    kagAffinity.ts       registry → Component nodes.
    kagRefresh.ts        single-flight rebuild orchestration.
L4  luceneEscape.ts      query text → safe Lucene syntax.
    kagRetriever.ts      seed → expand → score.              (REQUEST TIME)
    kagEmbeddings.ts     optional vector seeds (off).
L5  groundingPack.ts     subgraph → prompt text.  PURE, no I/O.
L6  kagGrounding.ts      pack resolution, routing override, entity filters.
    kagValidator.ts      checks the model's column references.
L7  kagShadow.ts         measure without acting.
    kagTelemetry.ts      counters.
    kagTrace.ts          per-request trace (AsyncLocalStorage).
L8  (outside kag/)       llmHandler, runPipeline, runStreamingPipeline, index.ts
```

**Only five modules reach outside `kag/`, and only into four files:**

| Module | Imports | Why |
|---|---|---|
| `kagBuilder` | `dataSourceMap`, `catalogRefresher`, `bigqueryClient` | needs the catalog and the real schema |
| `kagGrounding` | `catalogRefresher` | the markdown fallback |
| `kagShadow` | `catalogRefresher` | token-comparison baseline |
| `kagRetriever` | `cacheService` | reuses the app's existing TTL cache |
| `kagAffinity` | `registry/generated/componentRegistry.json` | the component list |

That short list is the point. KAG can be removed by deleting one directory and four
import sites.

**Four modules import KAG** — `index.ts`, both pipelines, and `llmHandler`.

---

## 3. The two flows

### Build time — minutes, offline

```
BigQuery INFORMATION_SCHEMA ─┐
DATA_SOURCES / REPORT_ANGLES ─┼─▶ kagBuilder ──▶ Neo4j
glossary.data.json ───────────┘        │
componentRegistry.json ────────────────┴──▶ kagAffinity
```

Triggered by `npm run kag:build`, by startup when the graph is empty, by the 24-hour
scheduler, and by `POST /api/catalog/refresh`. `kagRefresh` wraps all four in a
**single-flight** guard — a rebuild takes ~40–60s and two overlapping rebuilds would
fight over the same `builtAt` stamp.

### Request time — milliseconds, online

```
query ─▶ luceneEscape ─▶ kagRetriever ─▶ groundingPack ─▶ kagGrounding ─┬─▶ prompt
                              │                                        ├─▶ table
                              └── cacheService (10 min)                └─▶ WHERE
                                                                            │
                                        generated cards ◀── LLM ◀───────────┘
                                              │
                                        kagValidator
```

---

## 4. Module contracts

The interfaces that matter, because breaking them breaks something non-obvious.

### `retrieve(query) → RetrievedSubgraph`

**Never throws. Never returns null.** On any failure it returns a subgraph with
`source: 'fallback-catalog'` and no candidates. Every caller must read that as "use the
markdown catalog instead".

`source` is `'neo4j' | 'cache' | 'fallback-catalog'` and is deliberately part of the
contract — without it, a decision made on the degraded fallback is indistinguishable
from a graph-grounded one, and silent degradation is the failure mode this system is
most exposed to.

### `buildGroundingPack(subgraph, opts) → GroundingPack`

**Pure.** No I/O, no database. Two consequences:

- It is unit-testable without Neo4j (11 of the 51 tests).
- Anything it needs that isn't in the subgraph must be passed in. `joinsByTable` is the
  example: `JOINS_ON` is deliberately not traversed, so the caller fetches join edges
  separately and hands them over.

Output ordering is deterministic — everything sorted and deduped. Not tidiness: the pack
is part of a cached prompt, and shadow-mode token comparisons are meaningless if the
same subgraph serialises differently between runs.

### `resolveGroundingContext(query, availableTables) → GroundingContext`

Returns fully-formed prompt text with its header, so the call site is one line. Always
returns *something* usable — pack, markdown, or empty — plus a `fallbackReason` when it
isn't the pack.

`availableTables` filters the **pack**, not just the options offered. Describing a table
the query engine would fail on is worse than omitting it.

### `checkCardGrounding(cards, schema, apply) → { report, cards }`

Pure core; `validateCardGrounding` is the async wrapper that fetches the schema. Same
split as the pack, for the same reason.

`apply: false` reports without mutating — that is the shadow path.

---

## 5. Where state lives

Five kinds, each with a different lifetime. Confusing them causes real bugs.

| State | Lives in | Lifetime | Notes |
|---|---|---|---|
| The graph | Neo4j | across restarts | authoritative |
| Physical schema | BigQuery | external | the graph mirrors it, never the reverse |
| Retrieval cache | `cacheService` | 10 min, in-process | keyed on normalised query |
| APOC availability | module-level in `kagRetriever` | process | probed once |
| Warm flag | module-level in `neo4jClient` | process | reset by `closeDriver()` |
| Circuit breaker | module-level in `kagRetriever` | process | counters + timestamp |
| Telemetry counters | module-level in `kagTelemetry` | process | reset via endpoint |
| **Per-request trace** | **`AsyncLocalStorage`** | **one request** | **see below** |

### Why the trace uses AsyncLocalStorage

Every other piece of state above is process-global, which is fine because it is either a
cache or a counter. The trace is not — it belongs to **one request**.

A module-level `lastTrace` variable would work perfectly in testing and interleave two
users' traces under any real concurrency, showing one user's seeds against another's
routing. `runWithTrace()` binds a store to the async context; `trace()` writes to
whichever request is currently executing. The context propagates through
`void runShadow(...)` because it is captured at call time.

---

## 6. Concurrency

**One driver, one pool, process-wide.** `getDriver()` is lazy and memoised. Never
construct a driver per request — the pool is the thing that makes latency acceptable.

- **Reads** use `session.executeRead` with `defaultAccessMode: READ`, so Aura can route
  them to a replica.
- **Writes** are builder-only.
- **Rebuilds** are single-flight (`kagRefresh.inFlight`).
- **Warmup** is idempotent via a module flag.
- **Shadow** is fire-and-forget so it overlaps the LLM call rather than preceding it.

The one deliberate race: shadow writes its trace asynchronously while `kag_debug` is
emitted later in the pipeline. Retrieval is ~200ms; the emit happens after the LLM call,
seconds later. A lost race costs a blank panel, never a wrong answer — and that is
written down at the call site rather than left to be rediscovered.

---

## 7. Failure architecture

The design principle: **KAG failing must produce the pre-KAG behaviour, never an error.**

```
retrieve()
  ├─ breaker open?        → fallback-catalog, no query attempted
  ├─ cache hit?           → return, ~1ms
  ├─ query Neo4j
  │    ├─ timeout 800ms   → noteFailure() → fallback-catalog
  │    └─ throws          → noteFailure() → fallback-catalog
  └─ success              → noteSuccess()
```

Five layers of degradation, in order:

1. **Cache** — repeats never touch the database
2. **Timeout** (800ms) — a slow route is worse than a slightly less precise one
3. **Circuit breaker** — 3 consecutive failures opens it for 60s, so a sick database is
   not hammered by every request
4. **Fallback** — the markdown catalog, i.e. exactly the pre-KAG behaviour
5. **Kill switch** — `KAG_ENABLED=false` removes KAG from the path entirely

Verified for real, not theoretically: Docker died mid-session and the logs show
`timed out after 800ms → source=fallback-catalog → grounding source=catalog-markdown`,
with the app still answering.

**Advisory paths swallow errors entirely** — `affinityFor`, `bumpAffinity`, `fetchJoins`
and the trace all `catch` and return empty. They are decoration; none should ever
surface.

---

## 8. Two safety boundaries

These are the places where a mistake would be genuinely dangerous, and what stops it.

### Injection

Three distinct surfaces, three distinct guards:

| Surface | Guard |
|---|---|
| Cypher values | always `$params`. No interpolation, anywhere. |
| Cypher **labels** and **relationship types** | cannot be parameterised. Validated against `KAG_REL_TYPES` / `/^[A-Za-z]+$/` before interpolation — the builder throws on anything else. |
| Lucene query text | `luceneEscape.ts` escapes every special character. Unescaped user text is both a parse error that kills the route *and* an injection surface. |
| BigQuery values | always named parameters (`@f0`). |
| BigQuery **column names** | cannot be parameterised. `^[A-Za-z_][A-Za-z0-9_]*$` allowlist. |

There is deliberately **no endpoint that runs arbitrary Cypher**, in any environment.

### Routable vs indexed

The graph knows 20 tables; only 7 can be queried. `scoreCandidates` skips
`routable: false`.

The filter is **inside scoring**, not after it — and that placement is load-bearing. If
a non-routable table out-ranked the real answer and were stripped downstream, the caller
would see an empty candidate list and fall back to markdown, silently losing a route
that was actually available.

---

## 9. Design decisions, and what they cost

Each of these was a real fork with a real trade.

**Scoring in TypeScript, not Cypher.** Scoring is the part iterated on most; requiring a
running database to test a ranking tweak makes that slow. Cost: one extra round-trip's
worth of data comes back to the app.

**Diminishing returns across seeds, not a sum.** A plain sum rewards table *width* — a
6-metric table won "box close rate" on a long tail of weak `rate` matches. Sorting and
decaying (`SEED_DECAY = 0.5`) took accuracy 90.9% → 100%. Cost: scores compress, so
every threshold had to be recalibrated.

**`JOINS_ON` fetched, not traversed.** Walking it leaked score into merely-adjacent
tables (measured 22/22 → 21/22). The pack still reports joinable tables via a targeted
lookup. What the model is *told* need not be what scoring *walks*.

**`MEASURED_BY` only from confirmed glossary entries.** Similarity proposals go to
`unmapped.json` for review and are never auto-merged. A wrong mapping is worse than a
missing one because it looks authoritative.

**Mark-and-sweep scoped by provenance.** `catalog`/`bigquery`/`glossary` are
builder-owned and swept each build; `registry`/`telemetry` are not, so learned affinity
weights survive a rebuild. This is the whole reason provenance exists as a field.

**Vector search present but off.** Measured worse at full coverage — 25/25 → 20/25, p50
85ms → 665ms. Kept because it would earn its place on longer node text; disabled because
on short labels it manufactures seeds where full-text correctly found none.

---

## 10. Extension points

**Add a synonym** → `glossary.data.json`, add to `aliases`. Rebuild. No code.

**Add a metric** → glossary entry with a confirmed `column`. Rebuild. If the column is
uncertain, leave it null and the builder proposes candidates in `unmapped.json`.

**Expose a table** → add to `DATA_SOURCES` in `dataSourceMap.ts`. It becomes routable on
the next rebuild. (It is already *indexed* — discovery picks up everything.)

**Add a node or edge type** → `types.ts` first. `KAG_REL_TYPES` is the whitelist the
builder validates against; adding an edge without registering it throws at build.

**Change traversal** → `TRAVERSAL_RELS` in `kagRetriever`. **Re-run `kag:eval`** — this
is exactly where the `JOINS_ON` regression came from.

**Change scoring** → `scoreCandidates`. Re-run `kag:eval` *and* re-check
`KAG_MIN_CONFIDENCE`: thresholds are calibrated to the score distribution, and a stale
threshold silently routes good queries to the fallback.

---

## 11. Honest notes on the structure

**Two blemishes were found while writing this doc and fixed:**

- `kagBuilder` and `kagAffinity` imported each other (`buildAffinity` ↔ `slugify`) — a
  genuine cycle that resolved only through module hoisting. `slugify` now lives in
  `types.ts`, which already owns the id contract it serves.
- `kagGrounding` used `await import('./neo4jClient')` in four places. There was no cycle
  to avoid — `neo4jClient` imports only `config` — so it was cost without benefit. Now
  one static import.

**Remaining rough edges, not fixed:**

- `kagBuilder` is 718 lines and does discovery, assembly, entity scanning, Neo4j writing
  and reporting. It splits cleanly along those seams if it grows further.
- `kagGrounding` holds four unrelated responsibilities — pack resolution, routing
  override, entity filters, warehouse lookup — bound only by "things the pipeline asks
  the graph". A `kagRouting.ts` split is the obvious next move.
- The retriever's module-level caches (APOC flag, breaker) make process-level test
  isolation dependent on `resetBreaker()` being called.

---

## 12. Map

```
backend/src/kag/
  config.ts          149   flags + tunables, each with its measurement
  types.ts           170   node/edge model, KAG_REL_TYPES whitelist, slugify
  neo4jClient.ts     170   driver, runCypher, warmUpIndexes
  schema.ts          118   constraints, full-text, vector index
  glossary.data.json       28 metrics, 120 aliases, 10 concept terms
  glossary.ts         59   typed accessor + dimension classification
  kagBuilder.ts      718   BigQuery + glossary → graph
  kagRefresh.ts       76   single-flight rebuild
  kagRetriever.ts    460   seed → expand → score, breaker, warmRetrieval
  luceneEscape.ts     80   the escaper
  groundingPack.ts   197   subgraph → prompt text (pure)
  kagGrounding.ts    385   pack, routing override, entity filters
  kagValidator.ts    191   column reference checking
  kagAffinity.ts     182   component suggestions (advisory)
  kagEmbeddings.ts   178   vector layer (off)
  kagShadow.ts        91   measure without acting
  kagTelemetry.ts    205   counters
  kagTrace.ts        110   per-request trace (AsyncLocalStorage)
```

**Verification of the architecture itself:**

```
npm run kag:verify   35 checks across all 8 layers, no LLM required
npm run kag:eval     25 routing cases, no LLM required
npm run test:kag     51 unit tests — pure functions only, no database
```

The first two need Neo4j. The third does not, by design: the pure core
(`luceneEscape`, `scoreCandidates`, `buildGroundingPack`, `checkCardGrounding`) is
testable without any infrastructure, and that is the property to preserve when changing
these modules.
