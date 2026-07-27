# Generative UI — Architecture & Phase 2 Overview

*Companion to the Phase 2 PRD. Grounded in the live `conversationUI` / Report Hub codebase (July 2026).*

This document is the source-of-truth narrative for your slides. It covers: what the project is, the full architecture, how the pipeline works end-to-end, what changed from Phase 1 → Phase 2, and a deep-dive on the three requirements now delivered — **Model Upgrade & Tool-Use Adapter, Document & Deck Export, and Generative Video.**

---

## 1. One-line pitch

> **A conversational analytics engine that turns a plain-English question into a validated UI Type Tree, then fans that one contract out to many renderers — an interactive dashboard, a PDF/Word/PowerPoint export, and a narrated video.**

---

## 2. The Phase 2 thesis — *one contract, many renderers*

This is the single most important idea for the whole deck.

| | Phase 1 | Phase 2 |
|---|---|---|
| **Generation** | One question → one validated **UI Type Tree** | *Unchanged* — same tree, same generation |
| **Rendering** | The tree drives **one** renderer: React components in the chat surface | The **same** validated tree fans out to **additional** renderers |
| **Outputs** | Chat DOM only | Chat DOM **+ documents (PDF/Excel/PPTX) + narrated video** |

The guardrail-validated tree is the asset **already proven in Phase 1**. Each new output format in Phase 2 is an **adapter on that one contract — not a second generation pass.** The exporters and the video compiler literally walk the same `{ renderType, props, children }` node tree the on-screen renderer uses (verified: `exportReport.ts`, `videoScript.ts`, and `UITreeRenderer.tsx` all consume the identical node shape).

**Slide takeaway:** *Generate once, render everywhere.*

---

## 3. System architecture (the big picture)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            BROWSER (React + Vite)                          │
│                                                                            │
│   Conversational_new.tsx  ──►  UITreeRenderer  ──►  31 components          │
│         │                          │                (charts/KPIs/tables)   │
│         │                          ├──► ExportMenu  ──► PDF · XLSX · PPTX   │  ◄─ NEW P2
│         │                          └──► VideoJobs   ──► narrated MP4        │  ◄─ NEW P2
│         │                                                                  │
│         │  POST /api/conversational/stream  (SSE: text/event-stream)       │
└─────────┼──────────────────────────────────────────────────────────────────┘
          │
┌─────────▼──────────────────────────────────────────────────────────────────┐
│                        BACKEND — Express (:3001)                            │
│                                                                            │
│   runStreamingPipeline  ──►  [ 5-layer pipeline + governance stack ]        │
│                                                                            │
│   Provider Adapter  ─────────────┐        Video Renderer (Remotion) ◄─ NEW  │
│   resolveProvider('gemma'|'sonnet')        headless Chrome + ffmpeg → 1080p │
└──────────┬───────────────────────┴──────────────┬───────────────┬──────────┘
           │                                       │               │
   ┌───────▼────────┐   ┌───────────────┐   ┌──────▼──────┐  ┌─────▼──────┐
   │  Google Gemma  │   │ Anthropic     │   │  BigQuery   │  │ ElevenLabs │  ◄─ NEW
   │ gemma-4-31b-it │   │ Claude Sonnet │   │ 8 tables    │  │ TTS voice  │
   │ (internal)     │   │ (client) ◄NEW │   │             │  │ + Pixabay  │
   └────────────────┘   └───────────────┘   └─────────────┘  └────────────┘
```

**Stack at a glance**

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 6, Tailwind 4, Radix UI, Recharts, MUI, Remotion Player |
| Backend | Node + Express, TypeScript |
| LLM | **Gemma `gemma-4-31b-it`** (`@google/genai`) · **Claude Sonnet** (`@anthropic-ai/sdk`) |
| Data | Google BigQuery (8 fact/view tables + catalog tables) |
| Export | `jspdf` + `jspdf-autotable` (PDF), `xlsx`/SheetJS (Excel), `pptxgenjs` (PowerPoint) |
| Video | **Remotion** (render), **ElevenLabs** (TTS), **Pixabay** (B-roll) |
| Transport | Server-Sent Events (SSE) for streaming generation |

---

## 4. How the pipeline works — end to end

The engine is a **five-layer pipeline**. Phase 1 built layers 1–5. Phase 2 wrapped them in a **governance stack** (registry → output-mode → validator → constraints → governor) and added a **provider adapter** in front and **output adapters** behind.

### 4.1 The five-layer pipeline (Phase 1, still live)

| Layer | What it does | Key implementation |
|---|---|---|
| **Context Engine** | Component Registry (schema), data-source map, domain semantics | `componentRegistry.ts`, `dataSourceMap.ts`, `catalogRefresher.ts` |
| **L1 · Intent & Retrieval** | Classifies intent, routes to a BigQuery table, retrieves rows | `analyzeQuery`, `queryEngine`, `bigqueryService` |
| **L2 · Data Shape Analyzer** | Row count, column types, cardinality, time-series vs measures/dimensions | `dataShapeAnalyzer.ts` (deterministic) |
| **L3 · Selection & Composition** | Deterministic rules for obvious cases; LLM for ambiguity + composition | `componentSelector`, `llmHandler.generateReport` |
| **Contract · UI Type Tree** | Typed hierarchical JSON; every node references a registered component | `types/index.ts`, `hydrateTree` |
| **L4 · Validator (guardrail)** | Schema discipline, column-casing fixes, deterministic fallbacks | `uiValidator`, `fixColumnCasing`, governed fallback |
| **L5 · Renderer (adapter)** | Recursive React renderer maps `renderType → component` | `UITreeRenderer.tsx` (31 component types) |

### 4.2 Request flow (streaming)

```
User types query
   │
   ▼  POST /api/conversational/stream   (SSE)
[0] Cache check (5-min TTL, keyed on query+persona+clarification+context)
[1] Intent classification — analyzeQuery()   → route | clarify
       └─ clarify → emit clarification card, STOP
[2] Follow-up/edit handler — classifyAndEditReport()  (single fused LLM call)
       └─ edit_structural | edit_data_change | qa_answer | new_report | clarify
[3] BigQuery execution — executeQuery()       → rows + metadata
[4] Data-shape analysis — analyzeDataShape()  → ShapeSignature
[5] Pre-aggregation — preaggregateRows()      → 20 clean sample rows
[6] Report generation — generateReport()      → LLMReport { cards, title, ... }
        ── GOVERNANCE STACK (Phase 2) ──
        resolveOutputMode()   → freeze the output_mode token
        deriveConstraints()   → allowed components + budget (advisory)
        shadowValidate()      → Ajv structural check (passive)
        governReport()        → validate → retry → trim → fallback (gated)
[7] Column-casing fix — fixColumnCasing()     → match BQ schema exactly
[8] Data hydration — hydrateTree()            → attach real BQ rows to each node
[9] Stream + cache
        emit meta → component (×N) → followUp → done
```

Each `component` event streams to the browser and renders **incrementally** as it arrives. The finished, hydrated tree is what the export and video adapters later consume — no re-generation.

### 4.3 SSE event protocol

`status` · `meta` · `component` · `followUp` · `clarification` · `qa_answer` · `acknowledgment` · `bq_debug` · `error` · `done`

---

## 5. Phase 1 → Phase 2 — what changed

| Area | Phase 1 (before) | Phase 2 (now) |
|---|---|---|
| **Model** | Google Gemma only, called directly, no abstraction | **Provider adapter** — Gemma *or* Claude Sonnet, chosen per user role |
| **Component selection** | Free-form generation with defensive patches | Registry-backed governance stack (output-mode → constraints → validator → governor) |
| **Registry** | 12 documented vs ~33 rendered types (**~21 undrifted**) | **31 types, reconciled + CI-enforced parity gate** |
| **Guardrail** | Ad-hoc column-casing + fallback-card patches | Ajv shadow validator + deterministic **Governor** (off / shadow / enforce) |
| **Output surface** | Chat DOM only | Chat DOM **+ PDF/Excel/PPTX + narrated video** |
| **Observability** | None | 4 live telemetry endpoints (output-mode, validation, constraints, governor) |
| **Release comms** | Manual | **CHANGELOG-triggered "what's new" videos** auto-rendered in CI |

**The registry-drift fix (worth a slide).** The old gap — renderer supported ~33 types but only 12 were documented — is closed. There is now a single **31-component registry** (`componentRegistry.ts`) as the source of truth, and a CI gate (`scripts/checkRegistryParity.js`, `npm run check:registry`) that fails the build if the registry and the frontend renderer ever drift. Current status: **✅ 31 components in sync** (7 metric · 10 chart · 3 table · 6 narrative · 5 layout).

---

## 6. Requirement 1 — Model Upgrade & Tool-Use Adapter *(delivered)*

**Goal:** wrap the LLM layer behind a provider-agnostic interface so the app can switch models without rewriting application logic, and move component selection toward a structured, registry-bound contract.

### What was built
- **Provider abstraction** in `llmHandler.ts`: `type LLMProvider = 'gemma' | 'sonnet'`, with `resolveProvider()` selecting per request and a single choke point `modelGenerate(provider, opts)` giving both backends one `(system, user) → text` contract.
- **Role-bound providers** (`index.ts` `/api/auth/verify`): the **internal** user maps to **Gemma**; the **client** user maps to **Claude Sonnet**. Credentials live only in backend env, never shipped to the client.
- **Dual Sonnet transport:** `ANTHROPIC_API_KEY` set → Anthropic API (`claude-sonnet-4-6`, with prompt-caching on the system block); no key → local `claude` CLI (subscription/OAuth) as a documented interim path.
- **Governance stack** built on the registry (see §8) that removes the need for the old free-form defensive patches.

### Honest status (so the deck stays credible)
- The provider abstraction is **real and shipping** — this is what powers the two-role login.
- Structured **tool-use is partially there**: Google-style tool declarations exist, but the live path uses **JSON-mode generation** (function-calling was unreliable on Gemma). Component selection is still driven by a **prose "available components" menu in the prompt**, not yet a JSON schema auto-derived from the registry. The registry is the source of truth for **validation and governance today**; binding it as the **generation tool schema** is the remaining step.

**Slide takeaway:** *One adapter, many models. Gemma for internal, Claude Sonnet for client — swappable without touching app logic.*

---

## 7. Requirement 2 — Document & Deck Export *(delivered)*

**Goal:** give every report a one-click path to a polished, shareable document — the first proof of "many renderers."

### How it works
- **100% client-side**, no backend rendering. Triggered from the **`ExportMenu`** ("Export as ▾") that appears on every finished report message.
- Consumes the **same hydrated component tree** as the on-screen renderer (provider-agnostic — works identically for Gemma and Sonnet reports). Two tree-walkers map nodes → format: `collect()` (flat, for PDF/Excel) and `collectRich()` (typed blocks, for PPTX).

| Format | Library | What you get |
|---|---|---|
| **PDF** | `jspdf` + `jspdf-autotable` | Programmatic layout (not a DOM screenshot): accent bar, title/description, KPI table, one striped table per dataset (≤200 rows) |
| **Excel** | `xlsx` / SheetJS | Summary sheet (title + KPIs) + one sheet per table/chart dataset, with Excel-safe sheet names |
| **PowerPoint** | `pptxgenjs` | A **templated deck** with **native, editable charts** (`slide.addChart`, not images) |

### PPTX deck structure (the impressive one)
Cover → executive summary (narrative + key metrics) → **one slide per chart** with **native editable PowerPoint charts** reconstructed from the underlying data → auto-generated data-derived talking points (peak/low/trend/average/total) → paginated data tables (12 rows/slide) → "Key Takeaways" closing slide. Chart palette is mirrored from the in-app chart theme so decks match the product.

> **Note for the PRD wording:** the requirement lists *PDF, DOCX, PPTX*. The implementation delivers **PDF, Excel (XLSX), and PPTX**. **Word (DOCX) is not yet implemented** (no `docx` dependency present). Recommend either adding DOCX or restating the requirement as "PDF, Excel, PowerPoint."

**Slide takeaway:** *Same report, three shareable formats — and PowerPoint charts are native/editable, not screenshots.*

---

## 8. The governance stack (the engineering story behind R1)

Five progressive layers turn the registry from inert metadata into an enforceable contract. Each is independently gated and **passive by default** — telemetry first, enforcement later.

| Layer | File | Role | Status |
|---|---|---|---|
| **Registry** | `componentRegistry.ts` | Single source of truth: 31 specs with `family`, `tier`, `requiredProps`, `dataNeeds`, `outputModes`, `shapeConstraints` | Enforced via CI parity gate |
| **Output-mode** | `outputMode.ts` | A frozen governance token (7 modes) resolved by *keyword > LLM proposal > intent fallback* | Observed |
| **Constraints** | `componentSelector.ts` | `outputMode ⊕ shape ⊕ registry → allowed components + card budget` | Advisory |
| **Validator** | `uiValidator.ts` | Registry-driven **Ajv** structural check (missing props, wrong types, unknown types) | Shadow / passive |
| **Governor** | `governor.ts` | *First component allowed to modify output:* validate → retry once → trim to budget → registry-valid fallback | Gated: off / shadow / enforce |

Every layer emits **telemetry** exposed at `GET /api/metrics/{output-mode|validation|constraints|governor}`, so behavior can be measured in production before it's switched from *shadow* to *enforce*. This is how the old defensive patches (column-casing hacks, ad-hoc fallback cards) get retired safely.

---

## 9. Requirement 4 — Generative Video (Remotion) *(delivered)*

**Goal:** turn any report into a short, narrated explainer video — the most ambitious "renderer" on the contract.

### Pipeline (end to end)
```
compile script (client)  →  enqueue  →  polish narration (Claude)  →
B-roll (Pixabay)  →  voiceover (ElevenLabs) + retime scenes  →
Remotion 1080p render (headless Chrome + ffmpeg)  →  MP4 on disk
```

- **Client compile** (`videoScript.ts`): deterministically walks the **same UINode tree** as the exporters and emits ordered scenes — cover → KPIs → one per chart → insights → table → outro — each with data-derived narration. Scene model mirrors the product's 4-column shape: **Scene · Visual · On-screen text · Narration.**
- **Job queue** (`videoJobs.ts`): async, one render at a time (CPU-heavy). Live status `queued → polishing → voicing → rendering → ready`, polled every 2s. Finished jobs get a JSON sidecar so the library survives restart.
- **Narration** (`llmHandler.writeVideoNarration`, Claude Sonnet): rewrites deterministic lines into one cohesive spoken story; falls back to deterministic text on any failure.
- **TTS** (`ttsService.ts`, **ElevenLabs** `eleven_turbo_v2_5`, Rachel voice): synthesizes per-scene MP3s. `sceneTiming.ts` **retimes each scene to the measured audio length** so visuals stay up exactly as long as narration plays — the same timing math is shared byte-for-byte between the in-app preview and the final render, so they never drift.
- **B-roll** (`pixabayService.ts`): Claude picks abstract footage queries; applied only to hero scenes (cover/insight/outro); entirely best-effort (validated by magic bytes, stripped and re-rendered on OOM).
- **Render** (`videoRenderer.ts`, **Remotion**): bundles the shared composition once (warmed at startup), renders 1080p H.264 (CRF 18). The composition (`ReportVideo.tsx`) is React-to-video — same components, rendered per frame.

### UI
- **Video tray** (`VideoJobsMenu.tsx`) in the header: live progress bars, cancel, play/download/delete.
- **Instant preview** (`VideoPreviewModal.tsx`): in-browser `@remotion/player` before committing to a full render.

### Bonus track — CHANGELOG-triggered "what's new" videos
A second pipeline reuses the same Remotion + ElevenLabs stack, fully decoupled from BI data:
- Add `- feature: <title> | <summary> | <bullets…>` under **Unreleased** in `CHANGELOG.md` as part of a PR.
- On merge to `main`, a **GitHub Action** (`release-note.yml`) parses the entries, renders **one video per feature** (Claude writes the script → ElevenLabs narrates → Remotion renders), batches them into a dated release, and commits the metadata back.
- The sidebar **Help** panel surfaces the latest release with a notification dot; `GET /api/releases/latest`. *(The three Phase 2 features shipped with exactly these auto-generated videos.)*

**Slide takeaway:** *The report you're reading can narrate itself — and shipping a feature auto-produces its own explainer video.*

---

## 10. API surface (reference)

| Endpoint | Purpose |
|---|---|
| `POST /api/conversational/stream` | **Primary** — SSE generative pipeline |
| `POST /api/conversational` | Non-streaming fallback |
| `POST /api/auth/verify` | Role + provider gate (internal→Gemma, client→Sonnet) |
| `POST /api/chat` | Direct LLM chat (no pipeline) |
| `POST /api/query` | Raw BigQuery access |
| `POST /api/video` · `GET /api/videos` · `GET /api/video/:id` · `.../download` · `.../cancel` · `DELETE` | Report-video job lifecycle |
| `POST /api/video/narration` | Narration polish |
| `GET /api/releases/latest` · `GET /api/releases` | "What's new" release videos |
| `GET /api/metrics/{output-mode\|validation\|constraints\|governor}` | Governance telemetry |
| `POST /api/catalog/refresh` | Manual catalog refresh (24h auto) |

---

## 11. What's next (Phase 2 remaining)

| # | Requirement | Status |
|---|---|---|
| 1 | Model Upgrade & Tool-Use Adapter | ✅ Delivered (adapter live; full registry-bound tool schema is the follow-on) |
| 2 | Document & Deck Export | ✅ Delivered (PDF/Excel/PPTX; DOCX optional) |
| 3 | Rich Artifacts (HTML/SVG) + Registry Reconciliation | Registry reconciled ✅; sandboxed HTML/SVG artifact path pending |
| 4 | Generative Video (Remotion) | ✅ Delivered |
| 5 | Adaptive UI (Conversational Personalization) | ✅ Delivered — NL layout directives live (typed contract: 5 targets × 4 ops, backend intent detection + Ajv validation + telemetry, frontend prefs store persisted to localStorage). All five surfaces render: right panel (move/resize/hide), left panel (resize/hide with chat reflow), nav rail (hide), chat panel (hide), header/top bar (dock top or bottom + hide, with top/bottom reflow), global density. Repositioning of nav rail / left / chat is intentionally a no-op; the report panel repositions freely and the header docks top/bottom. |

---

## 12. Slide-ready summary lines

- **Overview:** *A conversational analytics engine — question in, validated UI Type Tree out, then rendered as dashboard, document, or video.*
- **Thesis:** *One contract, many renderers. Generate once, render everywhere.*
- **Three delivered:** *Model adapter (Gemma ⇄ Claude Sonnet) · Document export (PDF/Excel/PPTX) · Narrated video (Remotion + ElevenLabs).*
- **Foundation fix:** *31-component registry, CI-enforced, replacing the old 12-vs-33 drift.*
- **Safety:** *A five-layer governance stack — passive telemetry today, enforcement when proven.*

---

*Generated from the live codebase. Key files: `backend/src/pipeline/runStreamingPipeline.ts`, `backend/src/services/llmHandler.ts`, `backend/src/registry/componentRegistry.ts`, `backend/src/services/{governor,componentSelector,outputMode,uiValidator}.ts`, `src/lib/exportReport.ts`, `src/lib/videoScript.ts`, `backend/src/services/{videoJobs,videoRenderer,ttsService}.ts`, `src/app/components/UITreeRenderer.tsx`.*
</content>
</invoke>
