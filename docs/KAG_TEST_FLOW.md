# KAG — URLs and test flow

All URLs verified live. Backend on 3001, Vite on 5173, Neo4j on 7474/7687.

---

## 1. URLs

### Services

| What | URL | Notes |
|---|---|---|
| **Frontend (Vite)** | http://localhost:5173/ | `npm run dev` from repo root |
| **Backend (Express)** | http://localhost:3001/ | `cd backend && npx ts-node-dev --respawn src/index.ts` |
| **Neo4j Browser** | http://localhost:7474/ | login `neo4j` / `localdevpassword` |
| Neo4j Bolt | `bolt://localhost:7687` | driver only, not a browser URL |

### Frontend pages

| Page | URL |
|---|---|
| **Conversational (the KAG path)** | http://localhost:5173/conversational |
| Dashboard | http://localhost:5173/dashboard |
| Reports | http://localhost:5173/reports |
| Datasets | http://localhost:5173/datasets |
| Enterprise BI | http://localhost:5173/enterprise-bi |
| Report Flow | http://localhost:5173/report-flow |
| Governance | http://localhost:5173/governance |
| Migration | http://localhost:5173/migration |
| Advanced | http://localhost:5173/advanced |
| Persona picker | http://localhost:5173/persona |
| Settings | http://localhost:5173/settings |

### KAG endpoints — paste straight into a browser

| Endpoint | URL |
|---|---|
| **Graph stats + breaker state** | http://localhost:3001/api/kag/stats |
| **Inspect retrieval for a query** | http://localhost:3001/api/kag/retrieve?q=churn%20by%20territory |
| **KAG telemetry** | http://localhost:3001/api/metrics/kag |
| Reset KAG telemetry | `POST` http://localhost:3001/api/metrics/kag/reset |

More retrieval probes:

```
http://localhost:3001/api/kag/retrieve?q=average%20handle%20time%20by%20agent
http://localhost:3001/api/kag/retrieve?q=how%20did%20Dallas%20do
http://localhost:3001/api/kag/retrieve?q=signal%20strength%20by%20site
http://localhost:3001/api/kag/retrieve?q=hello%20there
```

### Other telemetry (pre-existing)

```
http://localhost:3001/api/metrics/output-mode
http://localhost:3001/api/metrics/validation
http://localhost:3001/api/metrics/constraints
http://localhost:3001/api/metrics/governor
http://localhost:3001/api/metrics/layout
```

### Main pipeline endpoint

`POST http://localhost:3001/api/conversational/stream` — SSE. Body:

```json
{ "query": "churn by territory", "skipClarification": true, "provider": "gemma" }
```

`provider` is `gemma` or `sonnet`.

---

## 2. Before you start: KAG is OFF by default

```
GET http://localhost:3001/api/metrics/kag
→ { "enabled": false, "shadowMode": true, "configured": true }
```

That is the intended default. It means:

| Flag state | What happens |
|---|---|
| `enabled:false` | Phase 3 returns the markdown fallback; Phases 4–6 no-op. **The app behaves exactly as it did pre-KAG.** |
| `shadowMode:true` | Retrieval still runs and is recorded — but its answer is never used. |

So there are two distinct things to test: **observation** (Stage B) and **activation** (Stage C).

---

## Stage A — the graph itself (no app needed)

**A1.** Confirm the graph is loaded:
→ http://localhost:3001/api/kag/stats

Expect ~400 nodes / ~750 rels, `breaker.open: false`, and a recent `builtAt`.
If `totalNodes` is 0, run `npm run kag:build`.

**A2.** Confirm retrieval works and see inside it:
→ http://localhost:3001/api/kag/retrieve?q=churn%20by%20territory

Read these fields in order:
- `source` — must be `neo4j` (`fallback-catalog` means Neo4j is unreachable)
- `seeds` — should include `Term:churn`
- `candidateTables[0]` — should be `fact_sug_monthly_rollup`
- `pack.text` — **this is the exact text the LLM gets**
- `pack.tokens` — ~200, versus ~1176 for the full catalog it replaces

**A3.** Confirm it declines to guess:
→ http://localhost:3001/api/kag/retrieve?q=hello%20there

`candidateTables` must be empty. A vague query should fall through to clarification, not route.

**A4.** Regression suite:

```bash
npm run kag:eval      # 22 routing cases, expect 22/22
npm run test:kag      # 51 unit tests
```

---

## Stage B — observation mode (KAG off, shadow on) — **safe on a live app**

This is the mode the backend is in right now. Nothing KAG decides reaches the user;
you are measuring whether it *would* have been right.

**B1.** Reset the counters:

```bash
curl -X POST http://localhost:3001/api/metrics/kag/reset
```

**B2.** Use the app normally — http://localhost:5173/conversational — and ask 5–10
real questions. Or drive it headlessly:

```bash
for q in "churn by territory" "average handle time by agent" "take rate by territory" \
         "signal strength by site" "daily sales by outlet"; do
  curl -sN -X POST http://localhost:3001/api/conversational/stream \
    -H 'Content-Type: application/json' \
    -d "{\"query\":\"$q\",\"skipClarification\":true,\"provider\":\"gemma\"}" > /dev/null
done
```

**B3.** Read the verdict:
→ http://localhost:3001/api/metrics/kag

```jsonc
"shadow": { "comparisons": 5, "agreements": 4, "agreementRate": 0.8 },
"tokens": { "avgPackTokens": 263, "avgCatalogTokens": 1176, "avgSavedTokens": 913 },
"latency": { "p50Ms": 147, "p95Ms": 152 }
```

- `agreementRate` is **the gate**. ≥0.90 before enabling.
- `avgSavedTokens` is the economic argument, measured rather than claimed.
- `bySource.fallback-catalog > 0` means Neo4j was unreachable for some requests.

**B4.** Read the disagreements in the backend console — this is the interesting part:

```
[KAG SHADOW] DISAGREE kag=fact_contact_center_metrics live=fact_sug_monthly_rollup
             q="average handle time by agent"
```

**Triage each one; do not assume the live path is correct.** In this real example KAG
is right — AHT lives in the contact-centre table, and the live path fell back to
`DATA_SOURCES[0]`.

---

## Stage C — activation (KAG on)

Set in `backend/.env`, then restart the backend:

```
KAG_ENABLED=true
KAG_SHADOW=false
```

Confirm: http://localhost:3001/api/metrics/kag → `enabled:true, shadowMode:false`.

**C1. Phase 3 — the pack replaces the catalog dump.** Backend console should show:

```
[KAG] grounding source=kag-pack tokens=207 tables=[fact_contact_center_metrics,...]
```

`source=kag-pack` is the pass condition. `source=catalog-markdown` with a `reason=`
means it fell back — the reason string says why (`low confidence`, `retrieval degraded`,
`shadow mode`, `kag inactive`).

**C2. Phase 5 — entity filters.** Ask *"how did Dallas do"*. Expect:

```
[KAG] entity filters for v_daily_sales_detail: city="Dallas"
BQ Query — table: v_daily_sales_detail, filters: city=?
```

The value is a **query parameter** (`@f0`), never string-concatenated.

**C3. Phase 4 — grounding validation.** Only logs when something needed fixing:

```
[KAG Grounding] table=… checked=6 ok=5 repaired=1 violations=0 applied=true
   yKey:"Take Rate %"→take_rate_pct(metric-label)
```

`via=metric-label` is the repair `fixColumnCasing` structurally cannot do.

**C4. Phase 6 — affinity (advisory).** Logs suggestion vs actual choice:

```
[KAG Affinity] table=fact_sug_monthly_rollup suggested=[LineChart@0.81,BarChart@0.80]
               chosen=[KPIGrid,LineChart,Table]
```

Nothing acts on this yet, by design.

**C5. Resilience — the test worth running before you trust it.**

```bash
docker stop kag-neo4j
```

Now ask a question in the UI. It must still answer. Console should show:

```
[KAG] retrieval timed out after 800ms
[KAG] source=fallback-catalog
[KAG] grounding source=catalog-markdown reason="retrieval degraded"
```

After 3 consecutive failures the breaker opens (visible at `/api/kag/stats`) and
retrieval short-circuits for 60s instead of timing out every request.

```bash
docker start kag-neo4j     # recovers automatically
```

---

## Stage D — see it in the graph

Neo4j Browser → http://localhost:7474 (`neo4j` / `localdevpassword`).
Set node captions to the `label` property once (click a label chip in the legend).

```cypher
// Why "churn" routes — 8 nodes, the clearest picture
MATCH p = (t:Term {label:'churn'})-[:ALIAS_OF]->(m:Metric)
          <-[:REPORTS_ON]-(r:Report)-[:SOURCED_FROM]->(tab:Table)
RETURN p;
```

More in `docs/KAG_CYPHER_QUERIES.md` (11 visualization queries with measured sizes,
plus 10 analysis queries).

---

## Known gap to test around

**The pack informs the model; it does not constrain it.** In Stage C you may see KAG
retrieve the right table and the LLM still route elsewhere:

```
[KAG] source=neo4j top=fact_contact_center_metrics@0.46
[KAG] grounding source=kag-pack tables=[fact_contact_center_metrics,...]
BQ Query — table: fact_sug_monthly_rollup        ← LLM ignored the pack
```

Phase 3 changes what the model *sees*, not what it must *choose*. Closing this needs a
decision: use KAG's top candidate as the table directly when confidence clears the gate,
validate the LLM's choice against the pack and override, or strengthen prompt wording
only. Compare `[KAG] top=` against `BQ Query — table:` in the console to measure how
often it matters.

---

## Quick reference

```bash
npm run kag:ping          # connectivity + schema + graph size
npm run kag:build         # rebuild from BigQuery (add --embed for vectors)
npm run kag:build:dry     # assemble without writing to Neo4j
npm run kag:eval          # 22 routing cases
npm run test:kag          # 51 unit tests
npm run bq:views          # (re)create the two BigQuery views
npm run bq:views -- --check   # report view existence, change nothing
```

If Neo4j is unreachable, check Docker Desktop first — it has stopped twice in testing,
taking the container with it. `docker start kag-neo4j` once the daemon is back.

---

## Demo: showing KAG is working

Two surfaces, both live. Set `KAG_ENABLED=true` and `KAG_SHADOW=false` in `backend/.env`
first — with KAG off you will correctly see nothing.

### 1. Browser console (the one to project)

Open DevTools on http://localhost:5173/conversational and ask a question. A purple
`[KAG]` group appears next to the existing blue `[BigQuery]` group — they read as one
story: KAG picked the table, BigQuery served it.

Best demo query — **"how did Dallas do on units sold"** — because it fires every stage:

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

Every line is a distinct capability, and the two that land hardest are:

- **`Routing : OVERRODE`** — the model chose `fact_sug_monthly_rollup`; the graph knew
  `Dallas` is a `city` in `v_daily_sales_detail` and corrected it. Without KAG this
  query silently returns the wrong table's rows.
- **`Entities : city IN [Dallas]`** — becomes a parameterized `WHERE city = @f0`.
  Confirm in the backend log: `BQ Query — table: v_daily_sales_detail, filters: city=?`

### 2. Backend console banner

Same request, server side — a boxed block that stands out from the BigQuery chatter:

```
┌─ KAG ─────────────────────────────────────────────────
│ retrieved neo4j 203ms → v_daily_sales_detail@0.29
│ pack 298tok (saved 1003)
│ OVERRODE fact_sug_monthly_rollup → v_daily_sales_detail
│ filters city=Dallas
└───────────────────────────────────────────────────────
```

### Two honesty notes, deliberately built in

**KAG cost is reported separately from request time.** 203ms vs 43,620ms — the rest is
the LLM. A single "total" inside a KAG panel would read as "KAG took 43 seconds".

**Fallbacks are shown, not hidden.** Ask something vague ("hello there") and the panel
says `Prompt : fell back to full catalog (no available candidate tables)` in amber.
That is correct behaviour — a vague query must see the whole catalog — and a demo that
only ever shows the happy path teaches nobody how to read the system.

### Other queries worth having ready

| Query | What it demonstrates |
|---|---|
| `churn by territory` | synonym routing — `churn` is nowhere in the schema |
| `break down by platform` | `platform → device_group`, the gap that used to fail |
| `average handle time by agent` | alias `AHT`, and an override off the default table |
| `compare Dallas and Chicago` | multi-value filter → `city IN UNNEST(@f0)` |
| `hello there` | declines to route; falls back to the full catalog |

### If the panel does not appear

- `curl http://localhost:3001/api/metrics/kag` → `enabled` must be `true`, `shadowMode` `false`.
- `npm run kag:verify` → 34/34 means every KAG layer is healthy and the problem is elsewhere.
