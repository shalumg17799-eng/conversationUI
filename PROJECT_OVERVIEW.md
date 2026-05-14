# PROJECT_OVERVIEW.md — conversationUI (BI Fabric Static Demo)

> Single source of truth for understanding this codebase. Use this file for all context.

---

## What This Project Is

A **Generative BI chat application** that lets users ask natural-language questions about business data and receive dynamically generated reports — charts, tables, KPI cards — rendered in real time via a streaming pipeline.

The UI is a static demo derived from a Figma design (`BI Fabric Static Demo`). The backend is a live Express + BigQuery + Gemma LLM pipeline.

**Original Figma:** https://www.figma.com/design/wU1riaCz175xRMD1BmRosj/BI-Fabric-Static-Demo

---

## Architecture Overview

```
Browser (React + Vite)
  └── Conversational_new.tsx  →  UITreeRenderer  →  Charts / Tables / KPIs
          │
          │  POST /api/conversational/stream  (SSE)
          ▼
Backend (Express :3001, TypeScript)
  └── runStreamingPipeline.ts
          ├── intentClassifier   →  query intent + clarification
          ├── queryEngine        →  BigQuery SQL builder + executor
          ├── dataShapeAnalyzer  →  column types, cardinality
          ├── llmHandler         →  Gemma-4-31b-it (Google GenAI)
          └── cacheService       →  5-min TTL in-memory cache
```

---

## How to Run

```bash
# Frontend
npm i
npm run dev          # Vite dev server

# Backend
cd backend
npm i
npm run dev          # ts-node-dev on :3001
```

---

## Repository Structure

```
conversationUI/
├── src/                          # Frontend (React + TypeScript)
│   ├── app/
│   │   ├── pages/
│   │   │   ├── Conversational_new.tsx   # Primary chat UI (~2700 lines)
│   │   │   ├── ReportFlow_new.tsx       # Guided 5-step report creation
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Reports.tsx
│   │   │   ├── Datasets.tsx
│   │   │   ├── Migration.tsx            # Dataset migration assistant
│   │   │   └── ...
│   │   ├── components/
│   │   │   ├── UITreeRenderer.tsx       # Dispatches renderType → React component
│   │   │   ├── GenerativeTable.tsx      # Sortable/filterable data table
│   │   │   ├── InlineChart.tsx
│   │   │   ├── ReportVisualization.tsx
│   │   │   ├── SuggestedPrompts.tsx
│   │   │   └── ui/                      # shadcn/ui primitives (40+ components)
│   │   ├── context/
│   │   │   └── PersonaContext.tsx       # Role-based defaults (marketing_director / power_user)
│   │   └── App.tsx                      # BrowserRouter with 15+ routes
│   ├── lib/
│   │   ├── dataModel.ts
│   │   ├── generateReportPDF.ts
│   │   └── utils.ts
│   └── main.tsx
│
├── backend/                      # Backend (Express + TypeScript)
│   ├── src/
│   │   ├── index.ts                     # Express server, all route definitions
│   │   ├── pipeline/
│   │   │   ├── runStreamingPipeline.ts  # Master SSE orchestrator
│   │   │   └── runPipeline.ts           # Non-streaming fallback
│   │   ├── services/
│   │   │   ├── llmHandler.ts            # Gemma LLM calls (analyzeQuery, generateReport, classifyAndEditReport)
│   │   │   ├── intentClassifier.ts      # Query → intent type + clarification flag
│   │   │   ├── queryEngine.ts           # BigQuery SQL builder + executor
│   │   │   ├── dataShapeAnalyzer.ts     # Column type + cardinality analysis
│   │   │   ├── dataSourceMap.ts         # 8 BigQuery table definitions + keyword routing
│   │   │   ├── bigqueryService.ts       # Typed BQ query methods
│   │   │   ├── cacheService.ts          # TTL in-memory cache
│   │   │   ├── catalogRefresher.ts      # 24h BigQuery catalog refresh
│   │   │   ├── componentSelector.ts
│   │   │   ├── propMapper.ts
│   │   │   ├── reportComposer.ts
│   │   │   └── uiValidator.ts
│   │   ├── lib/
│   │   │   └── bigqueryClient.ts        # BQ connection
│   │   ├── types/
│   │   │   └── index.ts                 # Shared interfaces: IntentResult, ShapeSignature, UITypeTree
│   │   └── evaluation/
│   │       ├── runEvaluation.ts
│   │       └── testCases.json
│   └── data/
│       └── catalog_context.md           # Auto-generated BQ schema catalog (LLM system context)
│
├── MASTER.md                     # Design system: colors, typography, spacing, component rules
├── CHAT_FLOW_ARCHITECTURE.md     # Full end-to-end flow documentation
├── PROJECT_OVERVIEW.md           # ← this file
└── guidelines/Guidelines.md
```

---

## Key Concepts

### Streaming Pipeline (SSE)
User query → `POST /api/conversational/stream` → Express streams `text/event-stream` events back:

| Event | Payload |
|-------|---------|
| `meta` | `{ title, description }` |
| `component` | `{ renderType, props, data }` — one per chart/table card |
| `followUp` | `{ prompts[] }` — suggested next questions |
| `clarification` | `{ question, options[] }` — when query is ambiguous |
| `error` | `{ message }` |
| `done` | `{ success: true }` |

### UITypeTree
The LLM outputs a tree of UI nodes. Each node:
```ts
interface UITypeTree {
  renderType: string;   // "LineChart" | "BarChart" | "Table" | "KPICard" | ...
  props: Record<string, any>;
  children?: UITypeTree[];
}
```
`UITreeRenderer.tsx` dispatches each `renderType` to the correct Recharts or custom component.

### LLM Calls (Gemma-4-31b-it via Google GenAI)
| Function | Purpose |
|----------|---------|
| `analyzeQuery()` | Intent classification + clarification detection |
| `generateReport()` | Produces UITypeTree from data shape + 20 sample rows |
| `classifyAndEditReport()` | Edits existing report layout without re-querying BQ |

Retry: exponential backoff ×3 on 429/500.

### BigQuery Data Sources
| Table | Domain |
|-------|--------|
| `fact_sug_monthly_rollup` | Sales revenue, take rate, churn signals |
| `fact_network_kpi_points` | Network KPI time-series |
| `fact_dynamic_scores` | Employee/territory ranked scores |
| `fact_contact_center_metrics` | Agent performance (AHT, close rate) |
| `v_monthly_territory_performance` | Territory scorecard |
| `v_daily_sales_detail` | Day-level transactions |
| `v_churn_analysis` | Retention cohorts |
| `v_forecast_vs_actual` | Forecast accuracy |

### Caching
- Key: hash of `{ query, persona, conversationId }`
- TTL: 5 min (queries), 10 min (catalog), 24h refresh cycle

---

## Frontend Tech Stack

| Library | Version | Use |
|---------|---------|-----|
| React | 18.3.1 | UI framework |
| Vite | 6.3.5 | Build + dev server |
| TypeScript | — | Type safety |
| Tailwind CSS | 4.1.12 | Styling |
| Recharts | 2.15.2 | Charts (Line, Bar, Area, Pie) |
| shadcn/ui + Radix UI | — | UI primitives |
| Lucide React | 0.487.0 | Icons |
| React Router | 7.x | Routing |
| Motion | 12.x | Animations |

## Backend Tech Stack

| Library | Version | Use |
|---------|---------|-----|
| Express | 4.x | HTTP server |
| TypeScript | 5.x | Type safety |
| @google/genai | 1.x | Gemma LLM |
| @google-cloud/bigquery | 8.x | Data queries |
| dotenv | 16.x | Env config |

---

## Design System (summary — full spec in MASTER.md)

- Style: Warm Minimalism — earthy neutrals, single warm accent
- Brand accent: `#D4572A`
- Page background: `#F7F6F3`
- Fonts: Bricolage Grotesque (display), Inter (body), JetBrains Mono (numbers)
- Card radius: 12px | Input radius: 20px | Button radius: 8px

---

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/conversational/stream` | SSE streaming pipeline (primary) |
| `POST` | `/api/conversational` | Non-streaming fallback |
| `POST` | `/api/query` | Raw BigQuery access |
| `POST` | `/api/chat` | Direct LLM chat (no pipeline) |
| `POST` | `/api/catalog/refresh` | Manual catalog refresh |
