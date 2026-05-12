# Chat Flow Architecture — conversationUI

---

## Overview

End-to-end flow: user types query → SSE streaming pipeline → LLM generates UI tree → BigQuery hydrates data → React renders components incrementally.

---

## System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                          │
│  Conversational_new.tsx  →  UITreeRenderer  →  Chart/Table/KPI  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ POST /api/conversational/stream
                                │ SSE (text/event-stream)
┌───────────────────────────────▼─────────────────────────────────┐
│                     BACKEND (Express :3001)                      │
│  index.ts → runStreamingPipeline → [services]                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
          ┌─────────────────────┴──────────────────┐
          │                                        │
┌─────────▼──────────┐                  ┌──────────▼──────────┐
│  Google Gemma LLM  │                  │  Google BigQuery     │
│  (gemma-4-31b-it)  │                  │  (8 fact/view tables)│
└────────────────────┘                  └─────────────────────┘
```

---

## 1. Frontend Entry & Routing

| File | Role |
|------|------|
| [src/main.tsx](src/main.tsx) | React DOM root mount |
| [src/app/App.tsx](src/app/App.tsx) | BrowserRouter — 15+ routes |
| [src/app/pages/Conversational_new.tsx](src/app/pages/Conversational_new.tsx) | Primary chat page (2700+ lines) |

**Key routes:**
- `/conversational` — main chat UI
- `/report-flow` — guided 5-step report creation
- `/migration` — dataset migration assistant

---

## 2. Chat UI Component Tree

```
Conversational_new.tsx
├── ConversationSidebar          — list of saved conversations
├── SuggestedPrompts             — context-aware quick prompts
├── MessageList
│   └── MessageBubble[]
│       ├── TextContent          — markdown-rendered text
│       ├── ClarificationCard    — follow-up question from LLM
│       └── UITreeRenderer       — generative charts/tables/metrics
│           ├── LineChart / BarChart / AreaChart / PieChart
│           ├── Table / GenerativeTable
│           └── KPICard / KPIGrid
├── ChatInput                    — textarea + send button
└── PersonaContext               — role-based quick actions
```

---

## 3. State Management

No external store (Redux/Zustand). All state lives in `Conversational_new.tsx` via `useState`.

| State Variable | Type | Purpose |
|---------------|------|---------|
| `messages` | `Message[]` | All messages in active conversation |
| `conversations` | `Conversation[]` | Sidebar conversation list |
| `activeConversationId` | `string` | Currently selected conversation |
| `flowState` | `enum` | `idle` / `clarifying` / `generating` / `error` |
| `clarificationHistory` | `ClarificationTurn[]` | Multi-turn clarification context |
| `createReportState` | `object` | Guided report creation wizard state |
| `migrationState` | `object` | Dataset migration workflow state |
| `isGenerating` | `boolean` | SSE stream in progress |

**Context:**
- [src/app/context/PersonaContext.tsx](src/app/context/PersonaContext.tsx) — persona (`marketing_director` / `power_user`) drives quick actions + intent cards

---

## 4. Message Send Flow (Frontend)

```
User hits Send
     │
     ▼
handleAsk(userQuery)
     │
     ├─ Append user message to messages[]
     ├─ Set flowState = 'generating'
     ├─ Append empty assistant message (streaming placeholder)
     │
     ▼
sendToLLM(userQuery, clarificationHistory, activeTableContext)
     │
     ▼
fetch POST /api/conversational/stream
     │
     ▼
streamReader loop (ReadableStream)
     │
     ├─ event: meta        → set message title/description
     ├─ event: component   → push UINode to message.components[]
     ├─ event: followUp    → set suggestedPrompts[]
     ├─ event: clarification → set flowState='clarifying', show ClarificationCard
     └─ event: error       → set flowState='error', show error message
     │
     ▼
setMessages() — incremental patch per event
     │
     ▼
UITreeRenderer renders each component as it arrives
```

---

## 5. Backend Pipeline — `runStreamingPipeline.ts`

```
POST /api/conversational/stream
     │
     ▼
[1] Check cache (cacheService, 5-min TTL)
     │ hit → stream cached components
     │ miss ↓
     │
     ▼
[2] intentClassifier.analyzeQuery(userQuery)
     │  → intent type: trend | comparison | metric_by_dimension | distribution
     │  → detected metrics (revenue, churn, performance...)
     │  → detected dimensions (region, product, territory...)
     │  → time range hint (quarterly, yearly, last_30_days...)
     │  → needs_clarification flag
     │
     ├─ if needs_clarification → sendEvent('clarification') → STOP
     │
     ▼
[3] queryEngine.buildAndRunQuery(intent)
     │  → maps intent to BigQuery table (dataSourceMap)
     │  → builds SQL (SELECT with filters, GROUP BY, ORDER BY)
     │  → executes via bigqueryClient
     │  → returns rows[] + queryMetadata
     │
     ▼
[4] dataShapeAnalyzer.analyzeShape(rows)
     │  → detects column types: numeric | categorical | datetime
     │  → identifies measures vs dimensions
     │  → calculates cardinality per column
     │  → detects time-series pattern
     │  → returns ShapeSignature
     │
     ▼
[5] llmHandler.generateReport(userQuery, shapeSignature, sampleRows[0..20])
     │  → Gemma-4-31b-it call
     │  → returns UITypeTree: { title, description, cards[] }
     │  → each card: { renderType, props, children[] }
     │  → retry on 429/500 (exponential backoff, max 3 attempts)
     │
     ▼
[6] fixColumnCasing(uiTree, actualColumns)
     │  → BigQuery returns UPPERCASE columns
     │  → LLM may lowercase them
     │  → aligns all column refs in UI tree to actual BQ schema
     │
     ▼
[7] hydrateTree(uiTree, rows)
     │  → attaches actual row data to each chart/table node
     │  → aggregates time-series (dedup x-axis labels)
     │  → deduplicates RankedList items
     │
     ▼
[8] Stream events to client
     │  sendEvent('meta',      { title, description })
     │  sendEvent('component', hydratedNode)   ← one per card
     │  sendEvent('followUp',  suggestedPrompts[])
     └─ cache result
```

---

## 6. SSE Event Protocol

All events sent as `text/event-stream` from Express to the browser fetch reader.

```
event: meta
data: { "title": "...", "description": "..." }

event: component
data: { "renderType": "LineChart", "props": {...}, "data": [...] }

event: followUp
data: { "prompts": ["...", "...", "..."] }

event: clarification
data: { "question": "...", "options": ["...", "..."] }

event: error
data: { "message": "..." }
```

Frontend parses each chunk:
```ts
const [eventLine, dataLine] = chunk.split('\n')
const eventType = eventLine.replace('event: ', '')
const payload = JSON.parse(dataLine.replace('data: ', ''))
```

---

## 7. LLM Integration — `llmHandler.ts`

Three LLM call types:

| Function | When | Model Input | Output |
|----------|------|-------------|--------|
| `analyzeQuery()` | Every message | query + catalog context | intent classification + clarification flag |
| `generateReport()` | After BQ query | query + data shape + 20 sample rows | UITypeTree (card layout) |
| `classifyAndEditReport()` | Follow-up edits | existing report + user edit request | modified UITypeTree (no new BQ call) |

**Retry logic:**
```
attempt 1 → if 429 or 500 → wait 1s → attempt 2 → wait 2s → attempt 3 → throw
```

---

## 8. BigQuery Data Sources — `dataSourceMap.ts`

| Table | Domain | Primary Metrics |
|-------|--------|----------------|
| `fact_sug_monthly_rollup` | Sales | revenue, units, quota attainment |
| `v_monthly_territory_performance` | Territory | rep performance, pipeline |
| `v_daily_sales_detail` | Transactions | daily orders, ASP |
| `v_churn_analysis` | Retention | churn rate, cohorts |
| `v_product_performance` | Product | SKU revenue, margin |
| `v_customer_segments` | CRM | segment breakdown |
| `v_forecast_vs_actual` | Planning | forecast accuracy |
| `v_marketing_attribution` | Marketing | channel ROI, leads |

Intent classifier maps user query → table via 50+ keyword synonyms.

---

## 9. UITreeRenderer — Component Dispatch

```
UITreeRenderer receives { renderType, props, data }
     │
     ├─ "LineChart"       → Recharts LineChart
     ├─ "BarChart"        → Recharts BarChart
     ├─ "AreaChart"       → Recharts AreaChart
     ├─ "PieChart"        → Recharts PieChart
     ├─ "Table"           → GenerativeTable (sort/filter)
     ├─ "KPICard"         → Metric card with delta badge
     ├─ "KPIGrid"         → Grid of KPICards
     └─ "RankedList"      → Sorted list with bar indicators
```

All chart types use design system tokens from MASTER.md (warm off-white surface, brand accent `#D4572A`, category colors).

---

## 10. Multi-Turn Clarification Flow

```
User query is ambiguous
     │
     ▼
LLM returns needs_clarification: true + question text
     │
     ▼
Backend sends event: clarification
     │
     ▼
Frontend sets flowState = 'clarifying'
Renders ClarificationCard with question + option chips
     │
User selects option or types answer
     │
     ▼
handleClarificationResponse(answer)
     │  → appends { question, answer } to clarificationHistory[]
     │  → calls sendToLLM() again with full clarificationHistory
     │
     ▼
Pipeline resumes from step [2] with enriched context
```

---

## 11. Follow-Up / Edit Flow

```
Report rendered on screen
     │
User sends follow-up ("show by region", "add last year comparison")
     │
     ▼
handleAsk() detects activeTableContext (existing report data)
     │
     ▼
Backend: classifyAndEditReport()
     │  → Single LLM call: classify as structural_edit OR data_change_edit
     │
     ├─ structural_edit:
     │    LLM modifies existing UITypeTree layout
     │    No new BigQuery call
     │    hydrateTree with cached rows
     │
     └─ data_change_edit:
          New BigQuery query with updated filters
          New LLM report generation
          Full pipeline re-runs
```

---

## 12. Caching — `cacheService.ts`

```
Key = stable hash of: userQuery + persona + conversationId
TTL = 5 minutes (default), 10 minutes (catalog)

On hit:  skip steps [3]–[7], stream cached components
On miss: run pipeline, store result after step [8]
```

Catalog refreshes every 24 hours at server startup via `catalogRefresher.ts`. Catalog = markdown of all BigQuery domains, table schemas, report inventory — injected as LLM system context.

---

## 13. Conversation Persistence

```
Conversation
├── id: uuid
├── title: string (auto-generated from first query)
├── status: 'draft' | 'active' | 'planned'
├── messages: Message[]
│   ├── role: 'user' | 'assistant'
│   ├── content: string
│   ├── components: UINode[]   ← hydrated chart/table data
│   └── suggestedPrompts: string[]
└── createdAt / updatedAt
```

Stored in component state; sidebar lists all conversations. Selecting conversation restores full message history including rendered components.

---

## 14. Error Handling

| Layer | Error | Handling |
|-------|-------|----------|
| LLM quota | 429 | Retry ×3 exponential backoff |
| LLM server error | 500 | Retry ×3 exponential backoff |
| LLM empty response | Empty cards | Fallback card generator runs |
| BQ query failure | SQL error | `event: error` to frontend |
| Column mismatch | LLM lowercase vs BQ uppercase | `fixColumnCasing()` normalizes |
| Network drop | SSE disconnect | Frontend shows error state, retry button |

---

## 15. Persona-Based Customization

`PersonaContext` provides role-specific defaults:

| Persona | Default Metrics | Quick Actions |
|---------|----------------|---------------|
| `marketing_director` | channel ROI, leads, campaign performance | "Show pipeline", "Compare channels" |
| `power_user` | all available, raw data access | "Run custom query", "Export BQ SQL" |

Injected into LLM system prompt so generated reports prioritize relevant metrics per role.

---

## Key File Index

| File | Purpose |
|------|---------|
| [src/app/pages/Conversational_new.tsx](src/app/pages/Conversational_new.tsx) | Chat UI + all frontend state |
| [src/app/components/UITreeRenderer.tsx](src/app/components/UITreeRenderer.tsx) | Renders all generative components |
| [src/app/context/PersonaContext.tsx](src/app/context/PersonaContext.tsx) | Role-based context |
| [backend/src/index.ts](backend/src/index.ts) | Express server + route definitions |
| [backend/src/pipeline/runStreamingPipeline.ts](backend/src/pipeline/runStreamingPipeline.ts) | Master orchestrator |
| [backend/src/services/llmHandler.ts](backend/src/services/llmHandler.ts) | Gemma LLM calls |
| [backend/src/services/intentClassifier.ts](backend/src/services/intentClassifier.ts) | Query intent + clarification |
| [backend/src/services/queryEngine.ts](backend/src/services/queryEngine.ts) | BigQuery SQL builder + executor |
| [backend/src/services/dataShapeAnalyzer.ts](backend/src/services/dataShapeAnalyzer.ts) | Column type + cardinality analysis |
| [backend/src/services/cacheService.ts](backend/src/services/cacheService.ts) | TTL in-memory cache |
| [backend/src/services/catalogRefresher.ts](backend/src/services/catalogRefresher.ts) | 24h catalog refresh |
| [backend/src/services/dataSourceMap.ts](backend/src/services/dataSourceMap.ts) | 8 BigQuery table definitions |
| [backend/src/lib/bigqueryClient.ts](backend/src/lib/bigqueryClient.ts) | BQ connection + query execution |
| [backend/src/types/index.ts](backend/src/types/index.ts) | Shared TypeScript interfaces |
