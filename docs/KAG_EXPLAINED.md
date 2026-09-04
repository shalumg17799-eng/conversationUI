# KAG, end to end — how it works and why

One document covering the whole thing: the problem, the graph, every step of a request,
the algorithms, how correctness is measured, and what is still not true.

Written in plain English. Where a number appears, it was measured on this repo against
the live `data-practice-472314.report_hub_demo` dataset — not estimated.

---

## 1. The problem, plainly

The app answers questions like *"churn by territory"* by picking a BigQuery table,
querying it, and asking an LLM to turn the rows into charts.

Picking the table is the hard part. Before KAG, the model was handed a text file — the
whole data catalog, every table and every column — and asked to choose. That has three
concrete failure modes, all of which were happening:

**It cannot handle words that aren't in the schema.** Nobody named a column `churn`.
The concept lives in `return_rate_pct`. A model reading a catalog of column names has no
way to make that leap reliably, and the old fallback (`findAnglesByLabel`) only matched
report titles literally — so "churn" matched nothing and the query fell back to
whichever table happened to be first in the list.

**The prompt grows with the warehouse.** The catalog dump is ~1,300 tokens today at 7
routable tables. At 70 tables it is 13,000 tokens on *every* question, most of it about
tables irrelevant to what was asked.

**Nothing checks the answer.** The model would write `yKey: "Take Rate %"` — the display
name — when the column is `take_rate_pct`. The chart renders empty. A helper called
`fixColumnCasing` existed to patch this, but it only fixes capitalisation; it cannot know
that a business name maps to a different string entirely.

**KAG's answer:** build a graph that knows what the words mean and what the columns
actually are, look up only what the question needs, and check the model's output against
it afterwards.

---

## 2. The 60-second version

```
"how did Dallas do on units sold"
        │
        ▼
 ① SEED     full-text search the graph → Metric:units-sold, Entity:dallas
        ▼
 ② EXPAND   walk ≤2 hops from those seeds → 105 related nodes
        ▼
 ③ SCORE    which TABLE do those nodes point at? → v_daily_sales_detail (0.29)
        ▼
 ④ PACK     write ~300 tokens describing just that table (vs 1,301 for the catalog)
        ▼
 ⑤ ROUTE    model said fact_sug_monthly_rollup → overridden to v_daily_sales_detail
        ▼
 ⑥ FILTER   "Dallas" is a known city value → WHERE city = @f0
        ▼
 ⑦ QUERY    BigQuery runs it
        ▼
 ⑧ VERIFY   every column the model names must exist; repair or flag
```

Steps ①–③ take **~40–200 ms**. The LLM call that follows takes seconds.

---

## 3. The graph

### 3.1 What's in it right now

Live totals from `GET /api/kag/stats`:

```
579 nodes    Entity 240 · Column 172 · Dimension 51 · Component 33
             Metric 28 · Report 21 · Table 20 · Term 10 · Domain 4

1035 edges   HAS_VALUE 363 · HAS_COLUMN 259 · SLICED_BY 132 · RENDERS_AS 111
             JOINS_ON 37 · REPORTS_ON 36 · ALIAS_OF 28 · MEASURED_BY 27
             SOURCED_FROM 21 · IN_DOMAIN 21
```

`kag:build` reports smaller numbers (546 nodes / 932 edges) and both are correct — the
build report counts only what the *builder assembled*, while `Component` nodes and
`RENDERS_AS` edges are written by the affinity step afterwards and carry a provenance
outside the builder's mark-and-sweep, so they survive rebuilds. If the two ever differ
by more than that gap, something is being swept that should not be.

### 3.2 Node types, in plain English

| Node | What it is | Example |
|---|---|---|
| **Domain** | A business area | `Sales`, `Network` |
| **Report** | Something a user can ask for | `Take Rate by Territory` |
| **Table** | A real BigQuery table or view | `fact_sug_monthly_rollup` |
| **Column** | A real physical column | `take_rate_pct` (FLOAT64) |
| **Metric** | A business KPI — what a human calls a number | `Take Rate %` |
| **Dimension** | A way to break a number down | `territory_name` |
| **Entity** | An actual value that exists in the data | `Dallas`, `EMP-007` |
| **Term** | A fuzzy concept covering several metrics | `churn`, `agent productivity` |
| **Component** | A renderer the UI can draw | `LineChart`, `RankedList` |

Every node also carries a shared `:Kag` label. That is not decoration — the full-text
index spans `:Kag`, so finding a seed is **one** index lookup instead of nine.

**Metric vs Column is the distinction that makes the whole thing work.** `Take Rate %`
is what people say; `take_rate_pct` is what BigQuery has. Keeping them as separate nodes
with an edge between them is what lets the system translate in both directions.

### 3.3 Edge types

| Edge | Reads as | Where it comes from |
|---|---|---|
| `Report -IN_DOMAIN-> Domain` | "this report belongs to Sales" | catalog, certain |
| `Report -SOURCED_FROM-> Table` | "this report is built on that table" | catalog, certain |
| `Report -REPORTS_ON-> Metric` | "this report shows Take Rate %" | catalog, certain |
| `Table -HAS_COLUMN-> Column` | "this table physically has that column" | BigQuery, certain |
| `Metric -MEASURED_BY-> Column` | **"Take Rate % IS take_rate_pct"** | glossary, human-confirmed |
| `Metric -SLICED_BY-> Dimension` | "you can break this metric down by that" | derived |
| `Column -HAS_VALUE-> Entity` | "'Dallas' is a value in the city column" | BigQuery `DISTINCT` |
| `Term -ALIAS_OF-> Metric` | "'churn' points at Return Rate %" | glossary |
| `Table -JOINS_ON-> Table` | "these two share a key" | inferred from matching key columns |
| `Metric -RENDERS_AS-> Component` | "ratios usually look good as a line chart" | registry + usage |

Every edge carries a `weight` (0–1). Traversal decays a score by that weight, so a
certain structural edge (1.0) carries a match further than an inferred one (0.6).

**`MEASURED_BY` is the important one.** It is the only edge that says a business name and
a physical column are the same thing, and it is written **only** from a human-confirmed
glossary entry — never from a similarity guess. 26 of 28 metrics are mapped. The other
two (`Outage Count`, `Latency`) have no column anywhere in the warehouse, so they stay
unmapped rather than being pointed at something that looks close.

### 3.4 Routable vs indexed — the safety boundary

The graph knows about **20 tables**, but only **7** can be queried.

- **Indexed** — the graph has the table and its columns. It knows it exists.
- **Routable** — the table has a `DATA_SOURCES` entry, so the query engine can serve it.

Why both: the graph used to mirror only the curated list of 7, which made 17 tables
*invisible*. That is why *"break down by platform"* failed while `device_group`
(Phone/Tablet/Wearable) sat in three unexposed tables — the system could not even tell
you the data existed.

Now the graph sees the whole warehouse, but `scoreCandidates` skips anything with
`routable: false`. So it can answer *"that exists in `dim_devices`, which isn't exposed"*
without ever routing a query at a table the engine would fail on.

The filtering happens **inside scoring**, not after it. If a non-routable table
out-ranked the real answer and were stripped later, the caller would get an empty
candidate list and fall back to the markdown catalog — silently losing a route that was
actually available.

---

## 4. How the graph gets built

`npm run kag:build` — about 40–60 seconds.

**Step 1 — discover.** Ask BigQuery `INFORMATION_SCHEMA.TABLES` for everything. Drop
anything matching `_temp$` (staging copies that would double every column node).

**Step 2 — fetch schemas.** For each object, read its real columns and types. This
happens *first*, because it decides which tables get a node at all. `DATA_SOURCES` claims
every entry is a real table — but that is an assertion, not a guarantee, and it was wrong
twice (two declared views did not exist). BigQuery is the authority.

**Step 3 — build nodes.** Domains, Reports (from both `DATA_SOURCES` and
`REPORT_ANGLES`), Tables, Columns. Each column is classified `measure` or `dimension` by
name pattern and type — a `FLOAT64 territory_id` is still a dimension, so name patterns
win over type.

**Step 4 — metrics and terms.** Every KPI named by a report becomes a Metric. Glossary
aliases attach to it. Concept terms like `churn` are folded into their target metrics'
alias lists **as well as** existing as `Term` nodes — because a 3-hop path
`Term → Metric → Report → Table` exceeds the 2-hop budget, but a direct alias hit on the
Metric does not.

**Step 5 — the semantic link.** For each metric with a confirmed glossary column, verify
that column actually exists in the table, then write `MEASURED_BY`. If the glossary is
wrong, it is logged and no edge is written. Metrics with no confirmed column produce a
**proposal** in `backend/data/kag/unmapped.json`, with name-similarity candidates and a
paste-ready JSON block — a human decision made mechanical, not automated away.

**Step 6 — entities.** For each STRING dimension on a *routable* table, `SELECT DISTINCT`
up to 200 values. Over the cap, skip the column entirely rather than store an arbitrary
prefix that would look like full coverage. Temporal columns (`date`, `month_name`) are
excluded — dates are ranges, not names people say, and 60 date literals would only
produce false matches.

**Step 7 — joins.** Two tables sharing a key-shaped column (`_id`, `_name`, `_key`,
`_code`) of identical type get a `JOINS_ON` edge. The builder will not invent a join.

**Step 8 — write and sweep.** Batched `UNWIND ... MERGE`. Every node is stamped with
`builtAt`; anything owned by the builder and *not* stamped by this run is deleted. That
is how a dropped table stops existing. Sweeping is scoped by provenance — `catalog`,
`bigquery` and `glossary` are builder-owned, while `registry` and `telemetry` are not, so
learned affinity weights survive a rebuild.

**Step 9 — affinity.** Component nodes and `RENDERS_AS` edges seeded from metric *kind*.

The build runs on startup (if the graph is empty), every 24 hours alongside the catalog
refresh, and on `POST /api/catalog/refresh`. It is single-flight — concurrent callers
share one rebuild — and it never throws: a failed rebuild leaves the previous graph
serving, because stale-but-coherent beats absent.

---

## 5. A request, end to end

Take **"how did Dallas do on units sold"**.

### ① Seed — find where in the graph to start

The query text is sanitised for Lucene (escaping `+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /`)
and thrown at the full-text index over `label` + `aliasText`:

```cypher
CALL db.index.fulltext.queryNodes('kag_search', $luceneQuery, {limit: 15})
```

Escaping is not optional. Raw user text containing a `"` or `~` is both a query parse
error that kills the route and an injection surface.

Result:
```
Metric:units-sold        1.000
Entity:dallas            0.356
Entity:dallas-northpark  0.271
```

Lucene scores are unbounded and corpus-relative, so they are normalised against the best
hit — otherwise no threshold downstream would mean anything stable.

### ② Expand — walk outward

From each seed, walk up to **2 hops** across allowed relationship types, capped at
**120 nodes**. Uses APOC `path.expandConfig` when available, plain variable-length Cypher
otherwise.

`JOINS_ON` is deliberately **not** walked. Testing showed including it dropped accuracy
22/22 → 21/22: a join edge means "these tables share a key", not "this table answers that
question", and following it leaks score into merely-adjacent tables.

### ③ Score — decide which table

Scoring runs in **TypeScript, not Cypher**, on purpose: it is the part that gets iterated
on most, and needing a running database to test a ranking tweak makes that slow.

For each seed, breadth-first from it, where each hop multiplies by the edge weight and a
`HOP_DECAY` of 0.6. Every Table node reached collects a contribution.

Then the part that took two attempts to get right:

```
score = Σ  contributionᵢ × 0.5ⁱ     (contributions sorted high → low)
```

**Why not a plain sum.** A plain sum rewards table *width*. `fact_sug_monthly_rollup`
carries 6 metrics and 10 reports, so a query like "box close rate" accumulated a long
tail of weak `rate` matches there and beat the correct two-seed match on the contact
centre table. Sorting and decaying each successive contribution keeps "several seeds beat
one" while stopping a long tail of weak matches outweighing a couple of strong ones. That
single change took accuracy from 90.9% to 100%.

Finally squashed to 0–1 by `score / (1 + score)` so thresholds have a stable scale.

```
v_daily_sales_detail  0.292
fact_intraday_sales   0.245
```

### ④ Pack — write what the model sees

The subgraph becomes compact text, capped at 5 tables / 600 tokens:

```
RELEVANT DATA (retrieved for this query):
[Sales] "Daily Sales Detail" → table: v_daily_sales_detail (score 0.29)
  metrics: Revenue → revenue (FLOAT64), Units Sold → units_sold (INT64)
  dimensions: city (STRING), outlet_name (STRING), territory_name (STRING)
  joinable with: fact_intraday_sales, fact_sug_monthly_rollup
  order: date DESC, outlet_name, limit 100
RULES: use ONLY the table and column names above, verbatim.
```

**298 tokens, against 1,301 for the full catalog — 77% less**, and every column name in
it is real.

Ordering is deterministic (everything sorted, deduped) for two reasons beyond neatness:
the pack is part of a cached prompt, and shadow-mode token comparisons are meaningless if
the same subgraph serialises differently across runs.

If the pack would be empty, or the top score is below **0.25**, the system falls back to
the full markdown catalog. That is correct, not a failure: a vague question should see
everything it might be about.

### ⑤ Route — act on it

The model reads the pack and picks a table. It picked `fact_sug_monthly_rollup` — wrong.

Because retrieval scored `v_daily_sales_detail` at 0.29, above the enforce bar of
**0.25**, KAG overrides it:

```
[KAG] ROUTING OVERRIDE: fact_sug_monthly_rollup → v_daily_sales_detail @ 0.29
```

**The bar is 0.25 on purpose, and it used to be 0.40.** At 0.40, this exact query
retrieved 0.29 — enough to clear `minConfidence` so the pack *described*
`v_daily_sales_detail`, but not enough to route there. The prompt said one table and the
query hit another, which is precisely the contradiction enforcement exists to remove.
The coherent rule: if retrieval is trusted enough to **tell** the model which table to
use, it is trusted enough to **route** there. One threshold, not two.

Follow-ups use a higher bar (**0.42**) because yanking the table out from under an open
report is more disruptive than routing a fresh question. So *"compare to Q4"* stays put
(it produces no candidate at all), while *"now show me agent handle time"* switches.

### ⑥ Filter — turn names into WHERE clauses

Entity labels for the chosen table are matched against the query with a word-boundary
check — so "Austin" does not match inside an unrelated word, and no Lucene escaping is
needed for short proper nouns.

```
city IN [Dallas]   →   WHERE `city` = @f0     params: { f0: "Dallas" }
```

Two values on the same column become `IN UNNEST(@f0)` — an OR, as one bound ARRAY
parameter. The earlier single-value model was actively wrong: "Dallas and Austin" ANDed
two equality predicates and matched nothing, so one was silently dropped.

Values are **always** query parameters. Column names cannot be parameterised in BigQuery,
so they are interpolated — behind a `^[A-Za-z_][A-Za-z0-9_]*$` allowlist that is the
guard making that safe.

### ⑦ Query

```
BQ Query — table: v_daily_sales_detail, filters: city=?
```

### ⑧ Verify — check the model's homework

Every column the generated cards reference (`xKey`, `yKey`, `labelKey`, `columns[]`, …)
must resolve to a real column of that table. Three outcomes:

- **exact match** → fine
- **resolvable** → repaired. Either casing (`MONTH_ID` → `month_id`) or, more usefully,
  a metric label (`"Take Rate %"` → `take_rate_pct`)
- **unresolvable** → counted as a violation

The metric-label repair is the one `fixColumnCasing` structurally cannot do — it works
off the result set and only fixes capitalisation. Both still run; they are complementary.

---

## 6. When things break

Neo4j sits on the path of every query, so degradation is designed rather than hoped for:

| Guard | Behaviour |
|---|---|
| **Cache** | Retrieval cached 10 min by normalised query. Repeats cost ~1 ms. |
| **Timeout** | 800 ms, then fall back. A slow route is worse than a slightly less precise one. |
| **Circuit breaker** | 3 consecutive failures → open 60 s. Stops piling onto a sick database. |
| **Fallback** | The pre-KAG markdown catalog. Degraded mode *is* the old behaviour, which is known to work. |
| **`source` field** | Every result says `neo4j` / `cache` / `fallback-catalog`, so silent degradation is impossible. |
| **Kill switch** | `KAG_ENABLED=false` restores the original path entirely. |

This was verified accidentally and for real: Docker Desktop died mid-session, and the
logs show `timed out after 800ms → source=fallback-catalog → grounding
source=catalog-markdown` — **and the app still answered.**

---

## 7. Every setting, and why it is what it is

| Setting | Default | Reasoning |
|---|---|---|
| `KAG_ENABLED` | `false` | Master switch. Off means byte-identical to pre-KAG. |
| `KAG_SHADOW` | `true` | Measure without acting. The gate before enabling. |
| `KAG_MAX_HOPS` | `2` | Enough for Metric→Report→Table and Entity→Column→Table. |
| `KAG_MAX_NODES` | `120` | Was 60, which truncated **every** retrieval. Swept 60/120/200/300: accuracy flat at 100%, pack size identical (the pack caps separately), so raising it costs nothing. |
| `KAG_MAX_SEEDS` | `15` | Full-text hits per query. |
| `KAG_MIN_CONFIDENCE` | `0.25` | Correct routes span 0.28–0.72; queries that *should* clarify score 0. 0.25 sits in the gap. |
| `KAG_ENFORCE_MIN_CONFIDENCE` | `0.25` | Equal to the above, deliberately — see §5⑤. |
| `KAG_SWITCH_MIN_CONFIDENCE` | `0.42` | Higher: switching an open report is more disruptive. |
| `KAG_ENFORCE_ROUTING` | `true` | Inert while `KAG_ENABLED=false`. |
| `KAG_VECTOR_SEEDS` | `false` | **Measured worse.** See §9. |
| `KAG_TIMEOUT_MS` | `800` | Fall back rather than hang. |
| `KAG_INDEX_ALL_TABLES` | `true` | Know the warehouse; route only to the exposed part. |
| `KAG_ENTITY_CARDINALITY_CAP` | `200` | Over this, skip the column rather than store a misleading prefix. |

Internal constants: `HOP_DECAY 0.6`, `SEED_DECAY 0.5`, pack caps 5 tables / 600 tokens.

**If you change scoring, re-run `npm run kag:eval`.** Thresholds are calibrated to the
score distribution; a stale threshold silently sends good routes to the fallback.

---

## 8. How correctness is measured

Three layers, each answering a different question.

### `npm run kag:eval` — is routing right?

25 cases, no LLM involved. Deliberately does **not** go through the pipeline: the
existing harness calls the model per case, which costs budget and mixes model variance
into a measurement of *retrieval*. This is fast, free and repeatable.

**Currently 25/25 (100%), p50 41 ms, avg pack 243 tokens.**

Cases cover direct metric language, synonyms the old matcher could not do (`churn`,
`attrition`, `AHT`), the device-group/platform route, entity seeding — and two negatives
that must **not** route. Refusing to guess is a pass, not a failure; it is what keeps
clarification working.

One case accepts *either* of two tables. "units sold per outlet" is genuinely served by
both `v_daily_sales_detail` and `fact_intraday_sales`. Insisting on one would encode a
preference as a correctness rule and invite tuning the scorer to satisfy the test.

### `npm run kag:verify` — is every layer healthy?

**34 checks, currently 34/34.** Groups L1–L8: Neo4j reachable, graph populated, graph
matches BigQuery, routing probes, pack replaces markdown, entity filters are
parameterised (asserts the value appears in `params` and **not** in the SQL string),
grounding repairs work, breaker closed.

Its most useful property: it tests KAG **without the LLM**. When the app says
*"I encountered an error generating the report"* and this says 34/34, the model is
failing, not KAG — a distinction that cost real debugging time before it existed.

### `npm run test:kag` — do the pure functions behave?

**51 unit tests.** Lucene escaping per special character, scoring on hand-built graphs,
pack determinism and token budget. No database needed.

### Shadow mode — would it have been right on real traffic?

With `KAG_SHADOW=true`, retrieval runs on every real request and is compared against
what the pipeline actually chose. `/api/metrics/kag` reports `agreementRate`.

Two hard-won lessons live here:

**It only counts fresh routing decisions.** Follow-ups are excluded. "Compare to Q4"
names no metric, so retrieval correctly finds nothing while the live path correctly
reuses the open table — scoring that as a disagreement measured the wrong population and
pinned the rate near zero.

**Read the disagreements; do not assume the live path is right.** The first real
disagreement was `kag=fact_contact_center_metrics live=fact_sug_monthly_rollup` for
"average handle time by agent" — and KAG was correct.

---

## 9. What is not true

**Semantic/vector search is off, because it measured worse.** All 201 nodes are embedded
and the index works — `"customers leaving us"` → `return_rate_pct` with zero shared
words. But switching it on:

```
vector OFF   25/25 (100%)   p50  85 ms
vector ON    20/25 ( 80%)   p50 665 ms
```

Two causes. A vector index **always** returns nearest neighbours however unrelated, so it
manufactures seeds where full-text correctly found none — `"hello there"` started
routing. And Neo4j reports cosine as `(1+cos)/2`, so every score sits high and genuine
matches (0.79–0.83) overlap the noise band; no threshold separates them. Node texts here
are short labels, close to a worst case for embeddings. The code is kept — it would earn
its place on longer descriptive text — but it stays off.

**Two metrics have no data.** `Outage Count` and `Latency` were removed from the catalog
rather than left advertised. `fact_network_kpi_points` has `cqi`/`rsrp`/`sinr`/`score`;
none is latency, and mapping one would be a fabrication.

**"churn" still routes to a proxy.** A real `churn_monthly` table exists — actual
`churn_rate`, `voluntary_churn_pct`, 24 months — and is **not exposed**. The graph found
it. But it has no territory dimension, so "churn by territory" genuinely still needs the
`return_rate_pct` proxy. Exposing it means two churn sources at different grains and a
glossary that disambiguates. Open decision.

**13 tables are indexed but unroutable.** Each build prints them with their available
breakdowns — `dim_outlets` (city/state/outlet_type), `dim_devices` (manufacturer). Each
is a "break down by X" waiting to fail until someone exposes it.

**The glossary is hand-written.** 28 metrics, 120 aliases, 10 concept terms. Its quality
caps everything. The builder proposes candidates but never auto-merges — a wrong
`MEASURED_BY` is worse than a missing one, because it looks authoritative.

**Scale is unproven.** Every number here comes from a 7-routable-table catalog and
single-digit query batches. `agreementRate: 1.0` is 4–6 comparisons, not a week of
traffic.

---

## 10. Where the code is

```
backend/src/kag/
  config.ts          149   every tunable, each with its measurement
  types.ts           154   node/edge model + the relationship whitelist
  neo4jClient.ts     132   pooled driver, parameterised Cypher, timing logs
  schema.ts          118   constraints, full-text index, vector index
  glossary.data.json       the hand-authored semantics
  glossary.ts         59   typed accessor + dimension classification
  kagBuilder.ts      718   BigQuery + glossary → graph
  kagRefresh.ts       76   single-flight rebuild, never throws
  kagRetriever.ts    436   seed → expand → score
  luceneEscape.ts     80   the escaper (correctness AND injection guard)
  groundingPack.ts   197   subgraph → prompt text (pure, no I/O)
  kagGrounding.ts    385   pack resolution, routing override, entity filters
  kagValidator.ts    191   checks the model's column references
  kagAffinity.ts     182   component suggestions (advisory)
  kagEmbeddings.ts   178   vector layer (off)
  kagShadow.ts        55   measure without acting
  kagTelemetry.ts    205   counters behind /api/metrics/kag
  kagTrace.ts        103   per-request demo trace (AsyncLocalStorage)
```

`AsyncLocalStorage` in `kagTrace.ts` is not incidental — a module-level variable would
interleave two concurrent users' traces and show the wrong numbers.

**Commands**

```bash
npm run kag:ping           # connectivity, schema, graph size
npm run kag:build          # rebuild from BigQuery  (--embed, --no-entities, --dry)
npm run kag:verify         # 34 health checks, no LLM needed
npm run kag:eval           # 25 routing cases
npm run test:kag           # 51 unit tests
npm run bq:views           # (re)create the two derived views
```

**Endpoints**

```
GET  /api/kag/stats                  graph contents + breaker state
GET  /api/kag/retrieve?q=...         full retrieval trace for one query
GET  /api/metrics/kag                telemetry incl. shadow agreement
POST /api/catalog/refresh            rebuilds catalog AND graph
```

There is deliberately **no** endpoint that runs arbitrary Cypher. Use Neo4j Browser at
http://localhost:7474.

---

## 11. What it is worth

**Measured:**
- Prompt field reference: **1,301 → ~250 tokens (~80% less)**, on every question
- Retrieval cost: **~40–200 ms**, against LLM calls measured in seconds
- Routing: **25/25** on the eval set, including synonyms the old code could not express
- Real corrections observed: `"average handle time by agent"` and
  `"how did Dallas do on units sold"` both routed to the wrong table without KAG

**Structural, and the stronger argument:**
- Prompt size stops growing with the warehouse — 7 tables or 70, the pack stays ~250 tokens
- Synonyms are data (`glossary.data.json`), not code
- Business names resolve to physical columns, closing a class of error casing repair cannot reach
- Building it surfaced three real data-model faults nobody knew about: two declared
  tables that did not exist, two KPIs with no column, and a churn table nobody exposed

**Honest cost:** Neo4j is now a dependency on the query path (mitigated, and the
mitigation is proven), the glossary needs a human owner, and the accuracy case rests on
25 curated cases rather than production traffic.
