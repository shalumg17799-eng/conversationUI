# Where data is pulled from GCP, and where it reaches the UI

Two diagrams of the same request. Every file path and line number below was read out of the
code. Only **two lines in the whole backend do I/O** — everything else is transformation.

| # | What | File | Line |
|---|---|---|---|
| 1 | Submits the query job to Google Cloud | `backend/src/lib/bigqueryClient.ts` | **42** |
| 2 | **Rows arrive from Google Cloud** | `backend/src/lib/bigqueryClient.ts` | **47** |
| 3 | **Bytes are written to the browser** | `backend/src/index.ts` | **176** |

Supporting lines: `index.ts:168` flushes the SSE headers and holds the socket open;
`runStreamingPipeline.ts:1010` attaches the rows to a card; `:1011` calls `send`, once per card.

---

## 1. Request trace — the order things happen

```mermaid
sequenceDiagram
    autonumber
    participant UI as Browser
    participant RT as index.ts
    participant PL as runStreamingPipeline.ts
    participant QE as queryEngine.ts
    participant BQ as bigqueryClient.ts
    participant GCP as Google Cloud BigQuery

    UI->>RT: POST /api/conversational/stream
    Note over RT: line 168 — headers flushed, socket stays open
    RT->>PL: runStreamingPipeline query, send
    PL->>QE: executeQuery table, filters
    QE->>BQ: runQueryWithMeta sql, params

    rect rgb(253, 243, 228)
        BQ->>GCP: line 42 createQueryJob — HTTPS POST
        GCP-->>BQ: job handle, no data yet
        BQ->>GCP: line 47 getQueryResults — HTTPS GET
        GCP-->>BQ: rows
        Note over BQ,GCP: THIS is the GCP pull. Line 47 is where data arrives.
    end

    BQ-->>QE: rows
    QE-->>PL: allRows
    Note over PL: line 1010 — hydrateTree attaches rows to each card

    rect rgb(230, 244, 243)
        loop once per card
            PL->>RT: send component, node
            RT->>UI: line 176 res.write — one SSE frame
        end
        Note over RT,UI: THIS is the UI write. Line 176 is the only line that emits bytes.
    end

    RT->>UI: send done
```

**Read it as:** the query goes down the participants left to right, crosses into Google Cloud in
the amber block, and comes back. Note that BigQuery takes **two HTTP round trips** — it is a
job-based API, so there is no single-call execute. The teal block loops: one `res.write` per
card, which is why the report appears to build itself on screen rather than arriving all at once.

---

## 2. Layer view — what sits inside the process, and what doesn't

```mermaid
flowchart TB
    UI["Browser — Conversational_new.tsx"]

    subgraph proc["Node.js process — backend/"]
        direction TB
        RT["index.ts — :161 route opens, :176 res.write"]
        PL["runStreamingPipeline.ts — :1010 hydrate, :1011 send"]
        QE["queryEngine.ts — :29 runQueryWithMeta"]
        BQ["bigqueryClient.ts — :42 createQueryJob, :47 getQueryResults"]
    end

    GCP[("Google Cloud — BigQuery Jobs API")]

    UI -->|"query"| RT
    RT -->|"query + send fn"| PL
    PL -->|"table + filters"| QE
    QE -->|"sql + params"| BQ
    BQ ==>|"1. HTTPS POST — line 42 submits the job"| GCP
    GCP ==>|"2. HTTPS GET — line 47 ROWS ARRIVE HERE"| BQ
    BQ -->|"rows"| QE
    QE -->|"allRows"| PL
    PL -->|"send component node, one per card"| RT
    RT ==>|"3. line 176 res.write — BYTES REACH THE UI"| UI

    classDef pull fill:#FDF3E4,stroke:#A96206,stroke-width:2px,color:#16202B
    classDef push fill:#E6F4F3,stroke:#0C6F6B,stroke-width:2px,color:#16202B
    classDef plain fill:#FFFFFF,stroke:#8A98A6,color:#16202B

    class BQ pull
    class GCP pull
    class RT push
    class PL plain
    class QE plain
    class UI plain

    linkStyle 4,5 stroke:#A96206,stroke-width:3px
    linkStyle 9 stroke:#0C6F6B,stroke-width:3px
```

**Read it as:** the dashed box is our own process. The two thick amber arrows are the only
traffic that leaves it for Google Cloud; the thick teal arrow is the only traffic that reaches
the browser. Everything drawn inside the box is a plain in-process function call.

---

## Why there is exactly one door to GCP

Grepped across the whole backend — these are complete counts, not samples.

| Searched for | Hits | Where |
|---|---|---|
| `new BigQuery(` | 2 | both inside `bigqueryClient.ts` (lines 14, 18) |
| `createQueryJob` / `getQueryResults` | 2 | both inside `bigqueryClient.ts` (lines 42, 47) |
| `runQueryWithMeta()` / `runQuery()` | 26 | `queryEngine`, `kagBuilder`, `catalogRefresher`, `llmHandler`, `bigqueryService`, `runStreamingPipeline` — **none touch the SDK directly** |

So a query timeout, a cost cap, a dry-run switch or a per-request audit log has exactly one place
to go: line 42. There is no second path to forget.

**Auth** is established once at module load (`bigqueryClient.ts:9-21`) — a service-account key
from `.env`, or `gcloud` Application Default Credentials as a fallback. The SDK signs a JWT,
exchanges it for an OAuth2 token, and attaches a bearer header to both HTTP calls. There is no
connection string and no pool: each query is an independent HTTPS request.

---

## Seeing it happen

Both edges log themselves. Run one query and watch the backend console:

```
[BigQuery ENTRY] project=data-practice-472314 dataset=report_hub_demo table=v_daily_sales_detail
[BigQuery EXIT]  table=v_daily_sales_detail rows=120 duration=340ms
```

In the browser: DevTools → Network → the `/api/conversational/stream` request → **EventStream**.
Every frame listed there was produced by line 176, one `res.write` at a time.

---

## One caveat worth knowing before touching this code

`bigqueryService.ts:109` exposes `runRawQuery(sql)`, which executes an arbitrary SQL string. It
still routes through line 42, so it inherits the auth and the logging — but it **bypasses
`buildQuerySQL`**, which means no parameter binding and no identifier allowlist. Safe only while
every caller passes a literal built in our own code. Worth an audit if anything user-derived ever
reaches it.

---

## Notes on these diagrams

Both blocks render natively in GitHub, GitLab, Notion, Confluence (Mermaid macro), VS Code's
Markdown preview, and <https://mermaid.live>. They were verified by rendering them with this
repo's pinned `mermaid@11.16.0` in headless Chromium under two configurations — stock defaults
and this app's `htmlLabels:false` config — and both pass `guardMermaid()`, so they can also be
displayed inside the app itself.

No `<br/>` is used anywhere on purpose: `mermaidGuard.ts` refuses any tag-open in diagram source,
so a multi-line label written that way renders on GitHub but is rejected by our own renderer.
