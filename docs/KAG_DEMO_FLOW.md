# KAG demo — flow and run of show

How to demo the knowledge graph on the frontend and end to end.

Companion to [KAG_TEST_FLOW.md](KAG_TEST_FLOW.md) (URLs and test stages) and
[KAG_ARCHITECTURE.md](KAG_ARCHITECTURE.md) (how it is built). This one is the runbook:
what to open, what to type, what to point at, and what to say — in order.

Everything below was read from the source. Where the demo has a rough edge, it is named
rather than hidden.

---

## 1. What you are actually demoing

One sentence: **the graph decides which table answers the question, tells the model only
what that table needs, and corrects the model when it picks wrong.**

Three claims, each with its own visible proof. Do not demo more than these three.

| Claim | Proof line on screen | Where it comes from |
|---|---|---|
| It understands words that aren't in the schema | `Seeds : Metric:units-sold` for a query saying "churn" | full-text seeds over `Term`/`Metric` nodes |
| It cuts the prompt down to what matters | `Prompt : 298 tokens vs 1301 full catalog — saved 1003 (77%)` | `groundingPack` replacing the markdown catalog |
| It overrules the model when the model is wrong | `Routing : OVERRODE model — fact_sug_monthly_rollup → v_daily_sales_detail` | `resolveRoutingOverride`, `KAG_ENFORCE_ROUTING` |

The fourth thing worth showing is not a capability — it is **that killing the database
does not kill the app**. Save it for the end (Act 5).

---

## 2. End-to-end flow — what happens on one query

```
 BROWSER  http://localhost:5173/conversational
    │  user types "how did Dallas do on units sold"
    │  POST /api/conversational/stream          (SSE, Conversational_new.tsx:2637)
    ▼
 BACKEND  runStreamingPipeline           ← the ONLY path that emits kag_debug
    │
    ├─ runWithTrace()            binds a per-request KAG trace (AsyncLocalStorage)
    │
    ├─ analyzeQuery → LLM picks a table          ("fact_sug_monthly_rollup")
    │
    ├─ runShadow()               fire-and-forget; records what KAG WOULD choose
    │
    ├─ resolveRoutingOverride()  ── awaited ──▶  retrieve(query)
    │                                             ├─ cache? (10 min TTL)
    │                                             ├─ Neo4j full-text seeds → expand → score
    │                                             └─ 800ms budget, else fallback-catalog
    │        score 0.292 ≥ 0.25  →  OVERRIDE table to v_daily_sales_detail
    │
    ├─ resolveGroundingContext() ──▶ buildGroundingPack() → ~250 tokens of prompt text
    │        (replaces the ~1200-token markdown catalog dump)
    │
    ├─ resolveEntityFilters()    "Dallas" → city = @f0     (a BQ query PARAMETER)
    │
    ├─ executeQuery()  ──▶ BigQuery  ──▶ emits  bq_debug   (blue console group)
    │
    ├─ generateReport() ──▶ LLM  ← the slow step: 30–45s on Gemma
    │
    ├─ validateCardGrounding()   checks the model's column refs against the graph
    │
    ├─ logTraceBanner()          ┌─ KAG ─┐ box in the BACKEND console
    └─ send('kag_debug', …)      ──▶ purple [KAG] group in the BROWSER console
    │
    ▼
 BROWSER  cards paint; the [KAG] group is already sitting above them
```

**Two facts about this flow that change how you demo it:**

- `kag_debug`, the routing override, and the trace exist **only in
  `runStreamingPipeline`**. The non-streaming `POST /api/conversational` runs shadow,
  entity filters and validation but emits nothing and never overrides. The frontend
  always uses the streaming route, so this only matters if you demo with curl — use the
  `/stream` endpoint.
- The `kag_debug` event is deliberately sent **before** the components, so the
  explanation is on screen as the report paints rather than scrolling past after it.

---

## 3. Pre-demo setup

Do this **30 minutes before**, not 3. The graph build and the KAG warmup both take real
time, and a cold first query falls back to the catalog — which is the one thing you do
not want on screen in Act 1.

### 3.1 Flip the flags — the demo does not work on defaults

`backend/.env` ships with KAG **off**:

```
KAG_ENABLED=false
KAG_SHADOW=true
```

That is the correct production default and the wrong demo setting. Change to:

```
KAG_ENABLED=true
KAG_SHADOW=false
```

Then **restart the backend** — `config.ts` reads env once at import.

> **Gotcha worth knowing.** `npm run kag:verify` sets `KAG_ENABLED=true` on itself
> (`scripts/kag_verify.ts:15`) before importing config. A green verify therefore proves
> the *code path* is healthy, **not** that your `.env` is right. The only check that
> proves the running server is in demo mode is `/api/metrics/kag`.

### 3.2 Start order

```bash
docker compose -f docker-compose.kag.yml up -d      # Neo4j — start FIRST, it is slowest
cd backend && npx ts-node-dev --respawn src/index.ts
npm run dev                                          # repo root — Vite on 5173
```

Neo4j needs 20–30s to become healthy. The backend retries connectivity 6 times at 5s
intervals, so starting them together is fine — you just have to wait for the log line in
§3.3 before demoing.

### 3.3 Wait for these four backend log lines

```
[Startup] KAG: connected — Neo4j/5.x
[Startup] KAG: 4xx nodes, 7xx rels, built 2026-…
[Startup] KAG: retrieval path warm — NNNms       ← THE ONE THAT MATTERS
```

If you see `graph is EMPTY — building now`, it is self-healing; give it 40–60s. If you
see `Neo4j unreachable after 6 attempts`, Docker Desktop has probably stopped — it has
done so twice in testing.

**Do not demo before `retrieval path warm` appears.** Warmup exists precisely because
the first real query otherwise pays Lucene index load and blows the 800ms budget, and
your opening query would show `source: fallback-catalog`.

### 3.4 Preflight — four checks, two minutes

```bash
curl http://localhost:3001/api/metrics/kag
#   → "enabled": true, "shadowMode": false, "configured": true      ← MUST be this

curl http://localhost:3001/api/kag/stats
#   → totalNodes ~400, totalRels ~750, breaker.open: false, recent builtAt

npm run kag:eval        # 26 routing cases — expect 26/26
npm run kag:verify      # expect N/N checks passed
```

If `kag:eval` is below 26/26, stop and fix it. A missed route during a demo is
unrecoverable — you cannot debug scoring in front of an audience.

### 3.5 Browser setup

1. `http://localhost:5173/` → log in (`internal` / `internal123` from `.env`).
   The internal role maps to **Gemma**; client maps to Sonnet.
2. Go to `http://localhost:5173/conversational`.
3. Open DevTools → **Console**. Then:
   - Set log level to **Verbose/All** so `console.group` output is not filtered.
   - Turn **off** "Preserve log" if you want a clean slate per question — or leave it on
     if you want to compare two questions side by side. Pick one now, not live.
   - **Zoom the console to ~150%.** Everything you are pointing at is 10px monospace.
4. Dock DevTools to the **right**, not the bottom. The report and the `[KAG]` group need
   to be visible at the same time — that adjacency *is* the demo.

### 3.6 The cache decision — make it deliberately

Retrieval caches on the normalised query for **10 minutes**. So a query you rehearsed
five minutes ago comes back `source: cache` in ~1ms.

That cuts both ways:

- **Good:** it is fast and it proves the cache layer exists.
- **Bad:** `Retrieval : cache in 1ms` looks staged, and it hides the real 150–250ms
  Neo4j number that makes the latency claim credible.

Decide which you want. To force a live retrieval, restart the backend before the demo
(the cache is in-process) or rehearse with different phrasings than you present with.

---

## 4. The four surfaces, and how to arrange them

| # | Surface | What it shows | Screen position |
|---|---|---|---|
| 1 | **Browser console** — purple `[KAG]` group | The whole story per request | Right half, always visible |
| 2 | **Backend console** — `┌─ KAG ─┐` box | Same story, server side; plus `BQ Query — table:` | Second monitor or alt-tab |
| 3 | **`/api/kag/retrieve?q=…`** | Seeds, candidates, and the exact pack text | Browser tab, for the deep dive |
| 4 | **Neo4j Browser** `:7474` | The graph itself, visually | Browser tab, for the "why" |

**There is no in-app KAG panel today.** The `kag_debug` payload arrives at the client
and goes to `console.group` — nothing renders in the UI. If you need a demo that works
without DevTools open, see Appendix B.

---

## 5. Run of show

Roughly 12 minutes. Each act is one query. Do not add queries — the risk of a miss
climbs faster than the value of the extra point.

### Act 0 — set the frame (60s, no query)

Say what the problem is before showing the fix:

> "The model gets handed the entire data catalog as text on every question — about 1200
> tokens describing 20 tables — and then guesses which one to query. It guesses wrong on
> anything phrased in business language rather than schema language."

Then open `/api/kag/stats` and show the graph exists: ~400 nodes, ~750 relationships,
built today. One breath. Do not tour the node types.

### Act 1 — synonym routing (2 min)

**Query:** `churn by territory`

**Point at, in the console:**

```
Retrieval : neo4j in ~200ms — NN nodes
Seeds     : Term:churn (1)
Candidates: fact_sug_monthly_rollup @ 0.4x
```

**Say:** "The word *churn* does not exist anywhere in this warehouse. The column is
`return_rate_pct`. The graph knows `churn` is an alias of Return Rate, that Return Rate
is measured by that column, and that the column lives in that table. Three hops."

**Land it:** this is the class of question that used to fall back to `DATA_SOURCES[0]`
and answer with the wrong table's rows — confidently.

### Act 2 — the prompt shrinks (90s, same query still on screen)

**Point at:**

```
Prompt : 2xx tokens vs 1xxx full catalog — saved ~1000 (7x%)
Tables : fact_sug_monthly_rollup, …
```

**Say:** "Instead of pasting the whole catalog, the model gets a targeted description of
the three tables that could plausibly answer this — about 250 tokens. Same answer,
roughly a fifth of the grounding cost, on every single request."

If someone asks for the actual text, open surface 3 in a tab:
`http://localhost:3001/api/kag/retrieve?q=churn%20by%20territory` → the `pack.text`
field **is** the literal string the model receives. Showing that is more convincing than
any number.

### Act 3 — the override (3 min) — **the strongest moment**

**Query:** `how did Dallas do on units sold`

This one fires every stage at once:

```
▼ [KAG] Knowledge graph grounding
  Retrieval : neo4j in 203ms — 105 nodes
  Seeds     : Metric:units-sold (1)  Entity:dallas (0.356)
  Candidates: v_daily_sales_detail @ 0.292  |  fact_intraday_sales @ 0.245
  Prompt    : 298 tokens vs 1301 full catalog — saved 1003 (77%)
  Tables    : v_daily_sales_detail, fact_intraday_sales, v_monthly_territory_performance
  Routing   : OVERRODE model — fact_sug_monthly_rollup → v_daily_sales_detail @ 0.292
  Entities  : city IN [Dallas]
  Grounding : checked 4, repaired 0, violations 0
  KAG cost  : 203ms  (of 43620ms total request — the rest is the LLM)
```

**Point at two lines only.** Everything else is supporting cast.

1. **`Routing : OVERRODE`** — "The model chose the monthly rollup. The graph knew
   `Dallas` is a value in the `city` column of the daily sales view, and corrected it.
   Without this the query returns real, well-formatted, wrong-table numbers."
2. **`Entities : city IN [Dallas]`** — "That became a bound query parameter, `@f0`. Not
   string concatenation — the value never touches the SQL text."

**Confirm it server-side** by alt-tabbing to the backend console:

```
BQ Query — table: v_daily_sales_detail, filters: city=?
```

That line closes the loop: the graph's decision reached BigQuery.

> While the LLM runs (30–45s on Gemma) you have dead air. Fill it with the backend
> console: the `┌─ KAG ─┐` box appears immediately, seconds before the cards. Narrating
> the box while the report generates turns the worst part of the demo into a beat.

**Reading the `Routing :` line.** It has five possible verdicts, and they make very
different claims. Know which one you are pointing at before you narrate it:

| Verdict | Means | Did KAG have an opinion? |
|---|---|---|
| `OVERRODE model` | KAG moved the table | Yes — and it won |
| `agreed with model` | KAG's top candidate *was* the model's table | Yes |
| `deferred to model` | KAG preferred a **different** table but scored under the bar | Yes — it disagreed and stood down |
| `no opinion` | Retrieval produced no candidate (correct for vague queries) | No |
| `not consulted` | KAG disabled, shadowing, or retrieval degraded | No — claim nothing |

Only the first two are endorsements. `deferred` is a disagreement the confidence
threshold declined to act on, and `not consulted` means KAG never ran.

### Act 4 — it declines to guess (60s)

**Query:** `hello there`

```
Prompt : fell back to full catalog (no available candidate tables)
```

in amber.

**Say:** "This is correct behaviour, not a failure. A vague question has no route, so the
system does not invent one — it hands the model the whole catalog and lets the normal
clarification flow run. A retriever that always returns its nearest neighbour would
route this somewhere, and be wrong."

Showing a fallback on purpose is what makes the other three acts believable.

### Act 5 — kill the database (2 min) — optional, high impact

```bash
docker stop kag-neo4j
```

Ask any question. **It still answers.** Backend console:

```
[KAG] retrieval timed out after 800ms
[KAG] source=fallback-catalog
[KAG] grounding source=catalog-markdown reason="retrieval degraded"
```

**Say:** "KAG is a sidecar. Every layer degrades to exactly the behaviour that existed
before it. Three consecutive failures and a circuit breaker opens for 60 seconds so a
sick database is not hammered by every request — you can see that at `/api/kag/stats`."

```bash
docker start kag-neo4j        # recovers on its own; no restart needed
```

**Only do this act if you have ≥3 minutes left** and are willing to spend the next
question on the fallback path while the breaker's 60s window expires.

### Act 6 — the graph, if there is appetite (2 min)

Neo4j Browser → `http://localhost:7474` (`neo4j` / `localdevpassword`). Set node captions
to the `label` property once, before the demo.

```cypher
MATCH p = (t:Term {label:'churn'})-[:ALIAS_OF]->(m:Metric)
          <-[:REPORTS_ON]-(r:Report)-[:SOURCED_FROM]->(tab:Table)
RETURN p;
```

Eight nodes. It is the picture behind Act 1, and it is the only Cypher worth running
live. More in [KAG_CYPHER_QUERIES.md](KAG_CYPHER_QUERIES.md).

---

## 6. Backup queries

Have these ready but do not plan to use them all.

| Query | Demonstrates | Risk |
|---|---|---|
| `average handle time by agent` | alias `AHT` + override off the default table | low |
| `break down by platform` | `platform → device_group`, the gap that used to fail outright | low |
| `compare Dallas and Chicago` | multi-value filter → `city IN UNNEST(@f0)` | medium — depends on data |
| `signal strength by site` | `rsrp` — schema language nobody would type | low |
| `territory performance scorecard` | routes to a view, not a fact table | low |
| `now show me agent handle time` (as a follow-up) | table switch on an open report, `switchMinConfidence` 0.42 | medium — needs a report already open |

---

## 7. Contingencies

| Symptom | Cause | Fix, live |
|---|---|---|
| No `[KAG]` group at all | `KAG_ENABLED=false` or shadow on | `curl /api/metrics/kag`. Needs `enabled:true, shadowMode:false`. Requires a backend restart — do not attempt mid-demo. |
| `Retrieval : fallback-catalog` on the first query | Warmup not finished | Ask the same question again; it will hit Neo4j. Say "first request after a restart pays index warmup" — it is true. |
| `Retrieval : cache in 1ms` | You rehearsed this query <10 min ago | Rephrase slightly. Or own it: "that is the 10-minute retrieval cache." |
| `Routing : agreed with model` when you wanted OVERRODE | The model happened to pick the right table | Not a failure. Say "they agreed — the override only fires when they disagree." Move to a backup query. |
| `Routing : deferred to model` | KAG preferred a different table but scored under the bar | This is a *disagreement*, not agreement. Honest framing: "KAG wanted another table but wasn't confident enough to move, so it stood down." |
| `Routing : not consulted` | KAG is off or shadowing | You are not in demo mode — see §3.1. |
| Report takes 45s | Gemma. Normal. | Narrate the backend `┌─ KAG ─┐` box, which is already there. |
| Everything is 500ing | Docker Desktop stopped | Out of scope to fix live — pivot to Act 5 and demo the fallback deliberately. |
| Console output is filtered | DevTools log level | Set to Verbose/All. Check this in setup, not live. |

**Reset between runs:**

```bash
curl -X POST http://localhost:3001/api/metrics/kag/reset
```

Restart the backend if you want a cold retrieval cache too.

---

## 8. What not to claim

Three honesty guardrails. Each is built into the surfaces on purpose, so breaking them
contradicts your own screen.

**Do not read `requestMs` as KAG's cost.** The panel prints
`KAG cost : 203ms (of 43620ms total request — the rest is the LLM)` as two separate
numbers precisely so nobody says "KAG took 43 seconds". KAG's cost is 150–250ms, or ~1ms
cached.

**Do not claim it is on in production.** It ships `KAG_ENABLED=false`, `KAG_SHADOW=true`.
The honest framing: "it runs in shadow today, recording what it *would* have chosen. The
gate to turn it on is a 0.90 agreement rate, visible at `/api/metrics/kag`." That is a
stronger story than pretending otherwise — it says the team measures before it ships.

**Do not claim the model cannot go off-pack.** With `KAG_ENFORCE_ROUTING=true` (the
default) a high-confidence retrieval overrides the table choice, which closes the gap
described under "Known gap" in [KAG_TEST_FLOW.md](KAG_TEST_FLOW.md). But that is
enforcement on the **table**, not on every column the model writes. Column-level drift is
caught after the fact by `validateCardGrounding` — the `Grounding : checked 4, repaired 0`
line — not prevented.

---

## Appendix A — headless dry run

Run this the morning of the demo. It exercises the exact endpoint the UI uses and warms
the cache for the queries you are about to present.

```bash
for q in "churn by territory" \
         "how did Dallas do on units sold" \
         "average handle time by agent" \
         "hello there"; do
  echo "── $q"
  curl -sN -X POST http://localhost:3001/api/conversational/stream \
    -H 'Content-Type: application/json' \
    -d "{\"query\":\"$q\",\"skipClarification\":true,\"provider\":\"gemma\"}" \
    | grep -A1 'event: kag_debug'
done
```

Then read the aggregate:

```bash
curl http://localhost:3001/api/metrics/kag
```

Check `bySource.neo4j` is the bulk of retrievals and `bySource["fallback-catalog"]` is 0.
Anything in the fallback bucket means Neo4j was unreachable for those requests, and you
want to know that now rather than on stage.

Remember this warms the 10-minute cache — see §3.6 before deciding when to run it.

---

## Appendix B — if you need a demo without DevTools

Today the only frontend surface is the browser console. That is fine for an engineering
audience and wrong for anyone else: asking a stakeholder to read a console group is
asking them to take your word for it.

The gap is small. The `kag_debug` payload **already arrives at the client** fully formed
(`Conversational_new.tsx:2683`) — it is parsed and thrown at `console.log` instead of
into state. Making it visible is:

1. Store the payload instead of logging it — one `useState` next to the existing
   `patchMsg` handlers in the SSE reader.
2. Render a collapsible strip above the report cards with the same six lines the console
   group prints: retrieval, seeds, candidates, prompt saving, routing, entities.
3. Gate it on a query param or a Settings toggle (`?kag=1`), so it is a demo affordance
   rather than a permanent UI change.

No backend work is needed — the event, the numbers and the trace all exist. Scope it
before the demo, not during; and if it does not get built, run the console version rather
than a half-finished panel.

---

## Quick card — tape this to the monitor

```
Preflight   curl :3001/api/metrics/kag     → enabled:true, shadowMode:false
            curl :3001/api/kag/stats       → breaker.open:false, builtAt today
            backend log                    → "retrieval path warm"

Act 1  churn by territory              → Seeds: Term:churn        (synonym)
Act 2  (same)                          → Prompt: ~250 vs ~1200    (cost)
Act 3  how did Dallas do on units sold → Routing: OVERRODE        (the moment)
Act 4  hello there                     → fell back, in amber      (honesty)
Act 5  docker stop kag-neo4j           → still answers            (resilience)

Reset  curl -X POST :3001/api/metrics/kag/reset
```
