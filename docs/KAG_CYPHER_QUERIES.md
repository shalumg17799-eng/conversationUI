# KAG — Cypher queries for understanding the graph

Paste into Neo4j Browser at http://localhost:7474 (`neo4j` / `localdevpassword`).
Every query below was run against the live graph; the sample output is real.

Graph as of the last `npm run kag:build`: **400 nodes, 751 relationships**.

> Read these in order. 1–3 explain what the graph *is*, 4–6 explain how a query
> *reaches a table*, 7–10 are the ones that find bugs.

---

## 1. Shape of the graph — start here

```cypher
MATCH (n:Kag) RETURN n.type AS type, count(*) AS nodes ORDER BY nodes DESC;
```

```cypher
MATCH (:Kag)-[r]->(:Kag)
RETURN type(r) AS rel, count(*) AS count, round(avg(r.weight),2) AS avgWeight
ORDER BY count DESC;
```

| rel | count | avgWeight | meaning |
|---|---|---|---|
| `HAS_VALUE` | 326 | 0.9 | Column → Entity (a distinct value that lives in it) |
| `SLICED_BY` | 129 | 0.8 | Metric → Dimension (valid breakdown axis) |
| `HAS_COLUMN` | 98 | 1.0 | Table → Column (physical schema) |
| `RENDERS_AS` | 66 | — | Metric → Component (advisory, Phase 6) |
| `REPORTS_ON` | 34 | 0.9 | Report → Metric |
| `ALIAS_OF` | 28 | ~0.8 | Term → Metric (synonyms) |
| `MEASURED_BY` | 24 | 1.0 | Metric → Column — **human-confirmed only** |
| `SOURCED_FROM` / `IN_DOMAIN` | 19 each | 1.0 | Report → Table / Domain |
| `JOINS_ON` | 8 | 0.6 | Table ↔ Table via a shared key |

Weight matters: traversal decays a seed's score by it, so a 1.0 structural edge
carries a seed further than a 0.6 inferred one.

---

## 2. What is actually grounded — the honesty check

`MEASURED_BY` is the only edge that maps a business metric to a physical column, and
it is written **only** from a human-confirmed glossary entry — never from a similarity
guess. Anything with `n = 0` is a metric the model can name but cannot resolve.

```cypher
MATCH (m:Metric)
OPTIONAL MATCH (m)-[:MEASURED_BY]->(c:Column)<-[:HAS_COLUMN]-(t:Table)
WITH m, collect(DISTINCT t.label + '.' + c.label) AS cols
RETURN m.label AS metric, m.kind AS kind, size(cols) AS mappings, cols
ORDER BY mappings ASC, metric;
```

```
Latency            measure  0  []      ← no backing column anywhere
Outage Count       measure  0  []
Performance Index  score    0  []
Retention Index    score    0  []
AARD %             ratio    1  [fact_sug_monthly_rollup.aard_pct]
AHT (sec)          measure  1  [fact_contact_center_metrics.inb_aht_sec]
```

**Those four zeros are a real data-model gap, not a missing config line.**
`fact_network_kpi_points` has `cqi`/`rsrp`/`sinr`/`score` — none is latency. Either add
the columns upstream or drop the KPIs from `backend/src/services/dataSourceMap.ts`.

---

## 3. Anatomy of one table

```cypher
MATCH (t:Table {label:'fact_sug_monthly_rollup'})
OPTIONAL MATCH (t)<-[:SOURCED_FROM]-(r:Report)
OPTIONAL MATCH (t)-[:HAS_COLUMN]->(c:Column)
OPTIONAL MATCH (m:Metric)-[:MEASURED_BY]->(c)
RETURN t.label AS table,
       count(DISTINCT r) AS reports,
       count(DISTINCT c) AS columns,
       collect(DISTINCT m.label) AS metrics;
```

```
fact_sug_monthly_rollup | reports 10 | columns 9 | metrics [Return Rate %, Take Rate %, …]
```

Ten reports on one table is exactly why scoring needed diminishing returns — see query 8.

---

## 4. How a synonym reaches a table — the core capability

This is the thing the pre-KAG code could not do. `findAnglesByLabel` in
`dataSourceMap.ts` only matched literal report labels, so "churn" routed nowhere.

```cypher
MATCH path = (start:Kag)-[:ALIAS_OF|REPORTS_ON|SOURCED_FROM*1..3]-(t:Table)
WHERE start.label = 'churn'
RETURN [n IN nodes(path) | n.type + ':' + n.label] AS hops;
```

```
Term:churn → Metric:Return Rate %   → Report:Churn & Retention Metrics → Table:fact_sug_monthly_rollup
Term:churn → Metric:RIS %           → Report:Monthly Revenue & Take Rate → Table:fact_sug_monthly_rollup
Term:churn → Metric:Retention Index → Report:Churn & Retention Metrics → Table:fact_sug_monthly_rollup
```

Drop the `RETURN` and end with `RETURN path` to see it drawn in Browser.

Note `REPORTS_ON` is load-bearing here. Without it the only Metric→Table path is
`MEASURED_BY`, which is empty until someone confirms a column — retrieval would have
returned zero candidates on day one.

---

## 5. Entity seeding (Phase 5)

```cypher
MATCH (e:Entity)<-[:HAS_VALUE]-(c:Column)<-[:HAS_COLUMN]-(t:Table)
WHERE toLower(e.label) = 'dallas'
RETURN e.label AS entity, c.label AS column, t.label AS table;
```

```
Dallas | city | v_daily_sales_detail
```

**Two hops, and that is deliberate.** `HAS_VALUE` originally hung off the `Dimension`
concept, making it `Entity→Dimension→Column→Table` — 3 hops against a `KAG_MAX_HOPS`
of 2. `Entity:dallas` seeded at score 1.0 and reached *no table at all*. Moving the
edge to the Column fixed it and is the more accurate statement anyway.

Where the 213 entities came from:

```cypher
MATCH (c:Column)-[:HAS_VALUE]->(e:Entity)
RETURN c.table AS table, c.label AS column, count(e) AS values
ORDER BY values DESC;
```

```
fact_network_kpi_points      site_id         75
fact_contact_center_metrics  employee_name   30
fact_sug_monthly_rollup      territory_id    20
```

Temporal columns are excluded on purpose — dates are ranges, not names a user says out
loud, and 60 date literals would only produce false seed matches.

---

## 6. Reproduce what retrieval actually does

Retrieval is: full-text seed → expand ≤2 hops → score in TypeScript. Step one:

```cypher
CALL db.index.fulltext.queryNodes('kag_search', 'handle~1 OR time~1', {limit:5})
YIELD node, score
RETURN node.type AS type, node.label AS label, round(score,2) AS score;
```

```
Metric:Sales Time %                    3.74
Metric:AHT (sec)                       2.99
Report:Average Handle Time by Agent    2.95
```

The `~1` is fuzzy matching. Never hand-build this string from user input in code —
`backend/src/kag/luceneEscape.ts` exists because an unescaped `"` or `~` is both a
parse error that kills the route and an injection surface.

For the whole pipeline including scoring, use the HTTP endpoint instead — it shows
seeds, candidates and the exact pack the model would see:

```
GET http://localhost:3001/api/kag/retrieve?q=churn%20by%20territory
```

---

## 7. Find the gaps — orphan nodes

```cypher
MATCH (n:Kag) WHERE NOT (n)--() RETURN n.type AS type, n.label AS label;
```

Returns **25 Component nodes** (`KPICard`, `GaugeChart`, `PieChart`, `AreaChart`, …).

That is expected but worth knowing: Phase 6 seeds affinity from five metric *kinds*
(`ratio`, `measure`, `score`, `rank`, `attribute`) onto five components. The other 25
registry components have no affinity edge until `bumpAffinity()` learns one from real
usage. **An orphan `Metric`, `Table` or `Report` here would be a bug** — those should
never be isolated.

---

## 8. Why scoring needed diminishing returns

```cypher
MATCH (t:Table)<-[:SOURCED_FROM]-(r:Report)-[:REPORTS_ON]->(m:Metric)
RETURN t.label AS table, count(DISTINCT r) AS reports, count(DISTINCT m) AS metrics
ORDER BY reports DESC;
```

`fact_sug_monthly_rollup` has far more reports and metrics than any other table. The
original scorer summed every seed's contribution, so a query like "box close rate"
accumulated a long tail of weak `rate` matches there and beat the correct two-seed
match on `fact_contact_center_metrics`.

Contributions are now sorted and decayed (`SEED_DECAY = 0.5` in `kagRetriever.ts`).
Accuracy went 90.9% → 100%. Re-run `npm run kag:eval` after **any** scoring change —
`KAG_MIN_CONFIDENCE` is calibrated to the score scale, and a stale threshold silently
sends good routes to the markdown fallback.

---

## 9. Component affinity (advisory only)

```cypher
MATCH (m:Metric)-[r:RENDERS_AS]->(comp:Component)
RETURN m.kind AS kind, comp.label AS component, round(avg(r.weight),2) AS weight, count(*) AS metrics
ORDER BY kind, weight DESC;
```

```
rank      RankedList       0.90   2
measure   BarChart         0.80   9
ratio     LineChart        0.80   7
attribute GenerativeTable  0.70   4
```

Nothing reads this to make a decision yet — it is logged next to what the LLM actually
chose, so the signal can be judged on real usage first.

---

## 10. Join paths between tables

```cypher
MATCH (a:Table)-[:JOINS_ON]->(b:Table) RETURN a.label AS a, b.label AS b;
```

Use the directed `->` arrow. The builder writes each pair once, so an undirected
`-[:JOINS_ON]-` returns every edge twice and looks like duplicates.

Only shared **key-shaped** columns (`_id`, `_name`, `_key`, `_code`) of identical type
produce an edge — the builder will not invent a join.

---

## Whole-graph picture

```cypher
MATCH (n:Kag)-[r]->(m:Kag)
WHERE n.type <> 'Entity' AND m.type <> 'Entity'
RETURN n, r, m LIMIT 300;
```

Entities are excluded because 213 of them swamp the layout. Drop that filter and raise
the limit to see the entity clusters.

---

## Visualization — queries tuned for the Browser canvas

**The rule:** Browser only draws a graph when you return **graph objects** — a path
(`RETURN p`), or nodes and relationships (`RETURN n, r, m`). `RETURN n.label` returns
text and you get a table. Every query in this section returns `p`.

Node counts below are **measured**, not estimated. Use them to pick:

| Nodes | Reads as |
|---|---|
| ≤ 20 | one clear idea — best for explaining something |
| 20–60 | a readable structure |
| 60–150 | dense; useful for spotting clusters, not for reading labels |
| 150+ | a hairball — zoom and pan only |

### First: fix the captions

Our nodes carry a property literally named `label`, which is *not* what Browser shows
by default. Click a label chip (`Metric`, `Table`, …) in the legend under the result,
then pick **`label`** as the caption. Do this once per node type and every query
afterwards is readable. Colour and size are on the same panel.

---

### V1 · The backbone — start here (29 nodes, 38 rels)

Domains, reports and tables. No columns, no entities. This is the map of the catalog.

```cypher
MATCH p = (d:Domain)<-[:IN_DOMAIN]-(r:Report)-[:SOURCED_FROM]->(t:Table)
RETURN p;
```

### V2 · One domain (11 nodes, 14 rels)

The same thing scoped down — the clearest picture in the whole set.

```cypher
MATCH p = (d:Domain {label:'Sales'})<-[:IN_DOMAIN]-(r:Report)-[:SOURCED_FROM]->(t:Table)
RETURN p;
```

Swap in `Network`, `Contact Center` or `Customer Experience`.

### V3 · Why "churn" works (8 nodes, 13 rels) — **the one to show people**

The complete synonym→table path, small enough to read every node.

```cypher
MATCH p = (term:Term {label:'churn'})-[:ALIAS_OF]->(m:Metric)
          <-[:REPORTS_ON]-(r:Report)-[:SOURCED_FROM]->(t:Table)
RETURN p;
```

One `Term` fans out to three `Metric`s and converges on one `Table`. That convergence
is the reason "churn by territory" routes at all.

### V4 · The whole semantic layer (41 nodes, 57 rels)

Every concept term, not just churn.

```cypher
MATCH p = (term:Term)-[:ALIAS_OF]->(m:Metric)
          <-[:REPORTS_ON]-(r:Report)-[:SOURCED_FROM]->(t:Table)
RETURN p;
```

### V5 · Anatomy of one table (17 nodes, 16 rels)

Physical columns plus the metrics confirmed against them.

```cypher
MATCH (t:Table {label:'fact_sug_monthly_rollup'})-[hc:HAS_COLUMN]->(c:Column)
OPTIONAL MATCH (m:Metric)-[mb:MEASURED_BY]->(c)
RETURN t, hc, c, mb, m;
```

Columns hanging off the table with **no** metric attached are ungrounded — the model
can use them, but nothing maps a business name to them.

### V6 · Everything that is actually grounded (52 nodes, 47 rels)

Only `MEASURED_BY` paths — the human-confirmed spine of the graph.

```cypher
MATCH p = (m:Metric)-[:MEASURED_BY]->(c:Column)<-[:HAS_COLUMN]-(t:Table)
RETURN p;
```

The four unmapped metrics (`Latency`, `Outage Count`, `Retention Index`,
`Performance Index`) are **absent from this picture entirely** — that is the data-model
gap from query 2, seen visually.

### V7 · An entity cluster (7 nodes, 6 rels)

```cypher
MATCH p = (t:Table)-[:HAS_COLUMN]->(c:Column {label:'city'})-[:HAS_VALUE]->(e:Entity)
RETURN p;
```

The two hops that make `Entity:Dallas` reachable. Try `territory_id` (20 values) or
`employee_name` (30) for bigger clusters; `site_id` has 75 and gets busy.

### V8 · Component affinity (32 nodes, 66 rels)

```cypher
MATCH p = (m:Metric)-[:RENDERS_AS]->(comp:Component) RETURN p;
```

Dense but interesting — you can see the five seeded metric kinds converging on a small
set of components, and the 25 registry components sitting unconnected.

### V9 · Neighbourhood of one table (93 nodes, 103 rels)

Everything within 2 hops. Dense, but this is the actual traversal budget the retriever
works with — useful for understanding why a query does or doesn't reach a table.

```cypher
MATCH p = (t:Table {label:'fact_contact_center_metrics'})-[*1..2]-(n:Kag)
WHERE NOT n:Entity
RETURN p;
```

### V10 · The structural graph (154 nodes, 359 rels)

Everything except entities and components. This is the graph the retriever reasons over.

```cypher
MATCH p = (a:Kag)-[]->(b:Kag)
WHERE NOT a:Entity AND NOT b:Entity AND NOT a:Component AND NOT b:Component
RETURN p;
```

Expect a hairball with a visible hub — that hub is `fact_sug_monthly_rollup` carrying
10 reports, which is exactly the structure that forced `SEED_DECAY` into the scorer.

### V11 · The whole thing (372 nodes, 751 rels) — for the screenshot only

```cypher
MATCH p = (a:Kag)-[]->(b:Kag) RETURN p LIMIT 400;
```

Unreadable as a diagram; fine as a "look at the size of it" visual. Note Browser caps
the canvas at 300 nodes by default — raise it in **Browser Settings → Initial Node
Display**, or keep the `LIMIT` and accept a partial view.

---

### If a query returns a table instead of a graph

- You returned scalars. `RETURN p` or `RETURN n, r, m`, never `RETURN n.label`.
- Aggregations (`count`, `collect`) always produce a table — that is what the analysis
  queries in sections 1–10 above are for.
- Browser's **Graph / Table / Text** toggle sits on the left edge of the result pane;
  if the Graph tab is greyed out, the result genuinely contains no graph objects.

---

## Cheat sheet

| Node | What it is |
|---|---|
| `Domain` | Sales, Network, Contact Center, Customer Experience |
| `Report` | A named report or report angle |
| `Table` | A real BigQuery table or view (only if its schema resolved) |
| `Column` | A physical column; `role` is `measure` or `dimension` |
| `Metric` | A business KPI — `kind` is ratio/measure/score/rank/attribute |
| `Dimension` | A breakdown axis, shared across tables by column name |
| `Entity` | A distinct value (`Dallas`, `EMP-007`) |
| `Term` | A multi-target concept (`churn` → 3 metrics) |
| `Component` | A renderer from the component registry |

Every node also carries `:Kag`, which is what the full-text index spans — that is why
seed matching is one index hit rather than nine.

**Provenance decides what survives a rebuild.** `catalog`, `bigquery` and `glossary`
are builder-owned and swept on every build; `registry` and `telemetry` are not, so
learned affinity weights persist:

```cypher
MATCH (n:Kag) RETURN n.provenance AS provenance, count(*) AS nodes ORDER BY nodes DESC;
```
