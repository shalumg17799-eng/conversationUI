# Mermaid — Jira backlog (ready to paste)

Source of truth for scope: `docs/MERMAID_IMPLEMENTATION_PLAN.md`.
Paths below are deliberately plain (not markdown links) so they survive a copy-paste into Jira.

**Summary:** 1 epic, 7 stories in scope (21 points), 1 story deferred to backlog (8 points).

| Key | Summary | Type | Pts | Component | Depends on |
|---|---|---|---|---|---|
| MER-1 | Replace ASCII architecture sketches with Mermaid diagrams | Task | 2 | Docs | — |
| MER-2 | Add `mermaidGuard` source allowlist (backend + frontend copies) | Story | 3 | Backend | — |
| MER-3 | Serialize the KAG graph to Mermaid for inspection | Story | 3 | Backend / KAG | MER-2 |
| MER-4 | Extend the artifact sanitizer with a `mermaid` kind | Story | 3 | Backend + Frontend | MER-2 |
| MER-5 | Register `mermaid-artifact` in registry, renderTypes and validator | Story | 2 | Backend | MER-2, MER-4 |
| MER-6 | Render `mermaid-artifact` in a sandboxed iframe | Story | 5 | Frontend | MER-4, MER-5 |
| MER-7 | Enable Mermaid diagram generation in the report prompt | Story | 3 | Backend / LLM | MER-6 |
| MER-8 | Export Mermaid diagrams to PDF / PPTX / video | Story | 8 | Frontend + Backend | MER-6 |

---

## EPIC — Mermaid diagram support

**Type:** Epic
**Labels:** `mermaid`, `adaptive-ui`, `phase-2`
**Components:** Frontend, Backend

### Description

The generative UI can already emit two rich-artifact types (`html-artifact`, `svg-artifact`), both rendered inside a sandboxed, opaque-origin iframe. Structural diagrams — flowcharts, sequence diagrams, escalation paths, data lineage — are currently only expressible as `svg-artifact`, which forces the model to hand-place every coordinate. Output quality is inconsistent and token cost is high.

This epic adds Mermaid, a text-to-diagram language, as a third artifact type. Mermaid source is rendered to SVG in the client bundle; only the inert SVG output enters the existing sandbox. **No new render path and no relaxation of the current sandbox/CSP posture.**

### Goals

- The model can answer "draw the escalation flow for T-007" with a real, legible diagram.
- The KAG graph (66 nodes / 106 edges) becomes inspectable without Neo4j Browser.
- Architecture docs carry rendered diagrams instead of ASCII art.

### Non-goals

- Rendering Mermaid inside chat message text (no markdown pipeline exists on that surface).
- Server-side / headless Mermaid rendering.
- Export parity — tracked separately as MER-8.

### Success criteria

- A diagram request produces a rendered `mermaid-artifact` card end to end.
- `npm run check:registry`, `test:artifacts`, `test:mermaid`, `test:validation`, `test:constraints` all green.
- Zero change to `ARTIFACT_CSP` or the `sandbox=""` iframe attributes.
- Mermaid ships as a separate Vite chunk, absent from the initial bundle.

---

## MER-1 — Replace ASCII architecture sketches with Mermaid diagrams

**Type:** Task · **Points:** 2 · **Priority:** Low · **Component:** Docs
**Labels:** `mermaid`, `documentation`

### Description

As a **developer new to the codebase**, I want the architecture documents to carry rendered diagrams, so that I can understand the request lifecycle without reconstructing it from ASCII art.

Zero application code. GitHub, the VS Code Markdown preview and most PR tools render ```` ```mermaid ```` fences natively.

### Scope

Author diagrams in:
- `ARCHITECTURE_PHASE2.md` — request lifecycle: query → `intentClassifier` → `queryEngine` → `dataShapeAnalyzer` → `outputMode` → `componentSelector` → `llmHandler` → `uiValidator` → `governor` → `UITreeRenderer`
- `CHAT_FLOW_ARCHITECTURE.md` — conversational flow and the clarify/generate branch
- `docs/KAG_IMPLEMENTATION_PLAN.md` — KAG node and relationship model
- `docs/track-a-b-artifact-export-gap.md` — artifact security layers (sandbox → CSP → sanitizer → fallback)

### Acceptance criteria

- [ ] Four diagrams authored; each renders correctly in the GitHub PR preview.
- [ ] Node labels match the actual module names in the repo.
- [ ] Each touched doc notes that Mermaid renders on GitHub but **not** in the PDF exports checked into the repo root — those are generated separately.
- [ ] The superseded ASCII blocks are removed, not left alongside.

### Notes

Independent of every other story. Safe to ship first as a warm-up.

---

## MER-2 — Add `mermaidGuard` source allowlist (backend + frontend copies)

**Type:** Story · **Points:** 3 · **Priority:** High · **Component:** Backend
**Labels:** `mermaid`, `security`

### Description

As a **platform owner**, I want model-authored Mermaid source validated against a strict allowlist before it is ever rendered, so that diagram generation cannot become an injection or DoS vector.

Mermaid's own syntax carries live features — `%%{init}%%` directives can override `securityLevel` and inject theme CSS; `click`/`href`/`call` statements bind navigation and page-function calls. These must be refused at the source level, before Mermaid's parser sees them.

### Scope

New file `backend/src/services/mermaidGuard.ts` with an identical copy at `src/app/components/mermaidGuard.ts`.

Pure, DOM-free, dependency-free, never throws — same contract as `artifactSanitizer.ts`.

```
export const MAX_MERMAID_BYTES = 20_000;
export interface MermaidGuardResult { ok: boolean; reason?: string; removed: string[]; code: string; }
export function guardMermaid(content: unknown): MermaidGuardResult;
```

Rules — each a **refusal**, not a strip:

| Rule | Rationale |
|---|---|
| non-empty string | shape check |
| `length <= MAX_MERMAID_BYTES` | DoS ceiling; layout cost is superlinear in node count |
| first non-comment line starts with an allowlisted diagram header | refuses unknown/future diagram types until reviewed |
| no `%%{ … }%%` init directive | can override `securityLevel` and reach CSS |
| no `click` statement | Mermaid's interaction syntax |
| no `href`, `call`, `callback`, `linkTarget` | same family |
| no `<` or `>` | blocks HTML-in-label vectors |
| no `script`, `javascript:`, `data:`, `vbscript:` | belt-and-braces |

Allowed headers: `flowchart`, `graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram`, `stateDiagram-v2`, `erDiagram`, `journey`, `gantt`, `pie`, `mindmap`, `timeline`.

### Acceptance criteria

- [ ] `guardMermaid` accepts one valid sample per allowlisted diagram type.
- [ ] `guardMermaid` refuses, with a distinct `reason`: init directive, `click` statement, angle brackets, oversized payload, unknown header (`sankey-beta`), empty input, non-string input.
- [ ] Never throws for any input, including `null`, `undefined`, numbers, objects.
- [ ] New `scripts/test_mermaid.ts`, wired as `npm run test:mermaid` in the root `package.json` (mirroring `test:artifacts`).
- [ ] A copy-parity test asserts the backend and frontend copies are logically identical, reusing the `logic()` reduction from `scripts/test_artifacts.ts`.
- [ ] Code comment records that `classDef` / `style` / `linkStyle` are permitted but **inert** (their `<style>` output is stripped downstream), so nobody later "fixes" missing colours by re-admitting `<style>`.

### Notes

Blocks MER-3, MER-4, MER-5. Nothing consumes the guard yet — pure additive, zero behaviour change.

---

## MER-3 — Serialize the KAG graph to Mermaid for inspection

**Type:** Story · **Points:** 3 · **Priority:** Medium · **Component:** Backend / KAG
**Labels:** `mermaid`, `kag`, `observability`

### Description

As a **developer working on KAG retrieval**, I want the assembled graph rendered as a diagram, so that I can see routing paths and orphaned nodes without standing up Neo4j Browser.

`backend/src/kag/kagBuilder.ts` assembles 66 nodes and 106 edges across 9 node types and 11 relationship types. Today that is inspectable only as JSON.

This is **code-generated** Mermaid, not model-generated, so it carries no trust question — but it must satisfy the same guard as model output, which makes it the cheapest available regression test for MER-2.

### Scope

New `backend/src/kag/graphToMermaid.ts`:

```
export interface MermaidGraphOptions {
  nodeTypes?: KagNodeType[];
  relTypes?: KagRelType[];
  rootId?: string;
  maxNodes?: number;   // default 60
}
export function graphToMermaid(g: KagGraph, opts?: MermaidGraphOptions): string;
```

- One `subgraph` per `Domain`; node shape by `KagNodeType`; edge label = `KagRelType`.
- Node ids reuse the existing stable slugs (`Metric:take-rate-pct`) with `:` → `_`, since Mermaid ids cannot contain `:`.
- Label text escaped.

Surfaces:
1. `GET /api/kag/graph.mmd?domain=…` in `backend/src/index.ts`, alongside the existing `GET /api/kag/stats`. Plain-text response.
2. `npm run kag:build` writes `backend/data/kag/graph.mmd` so the committed graph is diffable in PRs.

### Acceptance criteria

- [ ] `guardMermaid(graphToMermaid(assembledGraph))` returns `ok: true` — asserted in `scripts/test_mermaid.ts`.
- [ ] Output is deterministic: the same graph produces byte-identical Mermaid across runs (stable node ordering).
- [ ] `maxNodes` truncation is **stated in the output** as a `%% truncated: N of M edges shown` comment and logged — never silent.
- [ ] `nodeTypes` / `relTypes` / `rootId` filters each verified against the assembled graph.
- [ ] Endpoint returns `text/plain` and does not require Neo4j to be running (serializes the in-memory assembled graph).
- [ ] `backend/data/kag/graph.mmd` renders on GitHub.

### Notes

Independent of the frontend tracks; ships standalone.

---

## MER-4 — Extend the artifact sanitizer with a `mermaid` kind

**Type:** Story · **Points:** 3 · **Priority:** High · **Component:** Backend + Frontend
**Labels:** `mermaid`, `security`

### Description

As a **platform owner**, I want Mermaid's rendered SVG to travel the existing artifact sanitizer, so that diagrams inherit the same allowlist and iframe guarantees as `svg-artifact` with no second render path.

Two non-obvious problems must be solved together:

1. **Mermaid styles its SVG almost entirely via a `<style>` block**, which `SVG_TAGS` does not allow — a naive integration renders unstyled black shapes.
2. **Retention-ratio false downgrade** — a multi-kilobyte `<style>` block counted as *removed* pushes good diagrams under `MIN_RETENTION_RATIO = 0.6` and into `ArtifactFallback`.

Both are solved by pre-stripping `<style>` before sanitizing (which shrinks `originalLength` too, keeping the ratio honest) and substituting an app-authored stylesheet in the srcdoc wrapper. **This ordering is mandatory, not cosmetic.**

### Scope

`backend/src/services/artifactSanitizer.ts` **and** `src/app/components/artifactSanitizer.ts` — identical edits:

- `ArtifactKind` → `'html' | 'svg' | 'mermaid'`
- `ARTIFACT_RENDER_TYPES` / `isArtifactRenderType` / `artifactKindOf` extended for `mermaid-artifact`
- `hasContent`: `kind === 'svg'` → `kind !== 'html'`, so a shape-only diagram with no text nodes is not judged empty
- `buildArtifactSrcDoc`: inject `MERMAID_CSS` when `kind === 'mermaid'`; centering branch `kind === 'svg'` → `kind !== 'html'`
- Comment that `'mermaid'` intentionally falls through to `SVG_TAGS`

`MERMAID_CSS` is trusted, app-authored, and targets Mermaid's stable class names (`.node`, `.edgePath`, `.cluster`, `.label`, `.actor`) in the app palette.

### Acceptance criteria

- [ ] For each allowlisted diagram type, a checked-in **golden pre-rendered SVG fixture** goes through strip-`<style>` → `sanitizeArtifact(_, 'mermaid')` and satisfies `usable === true`, `retention >= MIN_RETENTION_RATIO`, and `assertInert()` from `scripts/test_artifacts.ts`.
- [ ] Retention regression test: the same fixture **with** its `<style>` intact falls below threshold, **without** it passes — this is the test that stops someone reordering the pipeline.
- [ ] Fixtures are version-stamped with the Mermaid version that produced them.
- [ ] `ARTIFACT_CSP` is unchanged (`style-src 'unsafe-inline'` already covers the wrapper stylesheet).
- [ ] Backend/frontend sanitizer copy-parity test still passes.
- [ ] `npm run test:artifacts` still green — no `html-artifact` / `svg-artifact` behaviour change.

### Notes

Fixtures are checked in so the test needs no browser. Depends on MER-2.

---

## MER-5 — Register `mermaid-artifact` in registry, renderTypes and validator

**Type:** Story · **Points:** 2 · **Priority:** High · **Component:** Backend
**Labels:** `mermaid`, `registry`

### Description

As a **developer**, I want `mermaid-artifact` to be an ordinary registry member, so that it flows through validation, constraint derivation and governance with no special-cased bypass.

### Scope

- `backend/src/registry/componentRegistry.ts` — new entry, `family: 'narrative'` (a novel family would never be allowed by any `MODE_POLICY` output mode and would be silently ungenerated), `tier: 'organism'`, `requiredProps: ['content']`, `dataNeeds: 'none'`, `outputModes: ['narrative','full_dashboard']`.
- `npm run registry:generate` to refresh `backend/src/registry/generated/componentRegistry.json`.
- `src/app/components/renderTypes.ts` — add `'mermaid-artifact'` to `RENDER_TYPES`.
- `backend/src/services/uiValidator.ts` — `assessArtifactNode` must **branch on kind**: for `'mermaid'`, call `guardMermaid(props.content)` instead of `sanitizeArtifact`. Mermaid `content` is diagram *source*, not markup; running the markup sanitizer over it yields meaningless `removed` classes and a bogus retention ratio.

### Acceptance criteria

- [ ] `npm run check:registry` passes (registry ↔ renderer ↔ generated JSON in sync).
- [ ] `assessArtifactNode({renderType:'mermaid-artifact', …})` takes the guard branch and never the markup branch.
- [ ] A refused Mermaid source produces an `unsafe_artifact_content` violation with the guard's reason.
- [ ] `deriveConstraints('narrative', shape).allowedComponents` includes `mermaid-artifact` — mirroring the existing `svg-artifact` assertion.
- [ ] No Ajv schema change required: `content` is already typed `string` in `PROP_TYPES`.
- [ ] `uiValidator` still only **reports** — no mutation, no rejection. Enforcement stays at render time.
- [ ] `tsc` fails on both roots until MER-6 adds the `COMPONENT_MAP` entry — this is the intended parity gate, not a bug.

### Notes

Depends on MER-2 and MER-4. Still no behaviour change: nothing emits the type yet.

---

## MER-6 — Render `mermaid-artifact` in a sandboxed iframe

**Type:** Story · **Points:** 5 · **Priority:** High · **Component:** Frontend
**Labels:** `mermaid`, `frontend`, `security`

### Description

As a **user**, I want Mermaid diagrams to appear as a card in my report, so that structural answers are legible rather than described in prose.

Mermaid renders in the **parent bundle**; only its inert SVG output enters the existing `sandbox=""` iframe. Mermaid's JavaScript must never run inside the artifact frame.

### Scope

New `src/app/components/MermaidArtifact.tsx`:

- Module-scope one-time init behind a dynamic `import('mermaid')`: `startOnLoad: false`, `securityLevel: 'strict'`, `theme: 'base'`, `flowchart: { htmlLabels: false, useMaxWidth: true }`.
- Render sequence: `guardMermaid(content)` → `mermaid.render(id, code)` → strip `<style>` → `sanitizeArtifact(_, 'mermaid')` → `buildArtifactSrcDoc(_, 'mermaid')` → existing iframe.
- `id` derived from a hash of the source — must be unique per call and must not collide across cards.
- Guard failure → `ArtifactFallback` with the guard reason and the raw source as text. Mermaid syntax error → `ArtifactFallback`, reason `'diagram syntax error'`.
- Async render: guard against setState-after-unmount.

Refactor: extract the frame JSX from `ArtifactFrame` in `src/app/components/UITreeRenderer.tsx` into a shared `ArtifactShell({ srcDoc, kind, title, caption, explanation, variant })`, so `sandbox=""` / `referrerPolicy` / CSP attributes live in exactly one place. **Do not duplicate the iframe element** — a second copy is how an `allow-scripts` regression eventually gets introduced.

Register `'mermaid-artifact': MermaidArtifact` in `COMPONENT_MAP` and wrap in `Suspense`, as `BigQueryDashboard` already is.

Add `mermaid` to the root `package.json` at a **pinned** version. Frontend-only — the backend never renders.

### Acceptance criteria

- [ ] Each allowlisted diagram type renders legibly in the app, themed to the app palette.
- [ ] `tsc` passes on both roots; `COMPONENT_MAP` parity restored.
- [ ] The iframe still carries `sandbox=""` with no `allow-scripts` and no `allow-same-origin`; verified after the `ArtifactShell` extraction.
- [ ] `npm run test:artifacts` green — `html-artifact` / `svg-artifact` rendering unchanged by the refactor.
- [ ] `vite build` emits Mermaid as a **separate chunk**; initial bundle size unchanged within noise.
- [ ] Manual: a card whose `content` contains `click A "x"` downgrades to `ArtifactFallback` rather than rendering.
- [ ] Manual: malformed Mermaid syntax downgrades rather than throwing or blanking the report.
- [ ] Code comment above the render call states explicitly that `mermaid.render()` executes in the **parent document** and briefly attaches to `document.body` — this is library execution, not model-authored script execution, and must not be mistaken for the iframe's zero-trust posture.

### Notes

Depends on MER-4 and MER-5. Still no user-visible change until MER-7 — nothing emits the type yet.

---

## MER-7 — Enable Mermaid diagram generation in the report prompt

**Type:** Story · **Points:** 3 · **Priority:** Medium · **Component:** Backend / LLM
**Labels:** `mermaid`, `prompt`

### Description

As a **user asking "draw the escalation flow for T-007"**, I want a real diagram back, so that structural questions get structural answers.

The `AVAILABLE COMPONENTS` catalogue in `backend/src/services/llmHandler.ts` is hand-maintained and **not** derived from the registry — registry membership alone will never make the model emit the type. This story is the switch that turns the feature on.

### Scope

Add a `mermaid-artifact` block under `RICH ARTIFACTS` in `REPORT_SYSTEM_PROMPT`, matching the deliberately restrictive tone of the existing entries:

- USE WHEN the query asks for a nodes-and-edges structural diagram (flow chart, process flow, escalation path, sequence diagram, state machine, org chart, data lineage, dependency map).
- `content` = Mermaid source only — no code fences, no prose; first line must be an allowlisted header.
- Ground node labels in real domain entities from the data sample.
- Simple alphanumeric node ids; readable text in the label.
- FORBIDDEN: `%%{init}%%`, `click`/`href`/`call`, and any `<` or `>`.
- PREFER `mermaid-artifact` over `svg-artifact` for nodes-and-edges; reserve `svg-artifact` for bespoke annotated drawings.
- NEVER as a substitute for a chart — measured values use `BarChart`/`LineChart`/`PieChart`.

Also amend the existing "Emit at most ONE artifact card per report" line to cover all three artifact types explicitly.

### Acceptance criteria

- [ ] "Draw the escalation flow for territory T-007" produces a rendered `mermaid-artifact` card end to end.
- [ ] "Show the sequence when a report is generated" produces a `sequenceDiagram`.
- [ ] Regression sweep: 10 ordinary BI queries (trend / comparison / KPI / table) produce **zero** Mermaid cards — the model does not displace charts with diagrams.
- [ ] Generated source passes `guardMermaid` on the first attempt in ≥ 8 of 10 diagram requests; guard reasons for any failures are captured for prompt tuning.
- [ ] Never more than one artifact card per report.

### Risk

Prompt wording is the **only** bound on how often the model reaches for diagrams: generation does not enforce the constraint set and the governor defaults to `off`. Weakened wording will let Mermaid displace real chart components on ordinary BI queries. Budget iteration time; this is the story most likely to need a second pass.

### Rollback

Delete the catalogue block. Generation stops immediately; MER-4/5/6 remain in place and inert. One-line, instantly revertible.

---

## MER-8 — Export Mermaid diagrams to PDF / PPTX / video

**Type:** Story · **Points:** 8 · **Priority:** Low · **Status:** Backlog / deferred
**Component:** Frontend + Backend · **Labels:** `mermaid`, `export`, `tech-debt`

### Description

As a **user exporting a report**, I want diagrams included in the output file, so that the exported document matches what I saw on screen.

`mermaid-artifact` inherits the pre-existing gap documented in `docs/track-a-b-artifact-export-gap.md`: `src/lib/exportReport.ts` dispatches on `renderType` and has no artifact case, so all artifacts are silently omitted from PDF, PPTX and XLSX. Video (`backend/src/services/videoRenderer.ts`) likewise has no artifact handling.

Mermaid is the **easiest** of the three artifact types to close, because the frontend already holds a complete standalone SVG string post-render — no headless browser needed.

### Scope

- **PDF** — rasterize the sanitized SVG to canvas and `jspdf.addImage`, or embed as vector.
- **PPTX** — `pptxgenjs` accepts an image data URI.
- **Video / Remotion** — the SVG string renders directly in a composition.

### Acceptance criteria

- [ ] A report containing a Mermaid card exports it to PDF and PPTX.
- [ ] Export consumes the **sanitized** SVG (`sanitizeArtifact` output), never raw model or raw Mermaid output.
- [ ] Reports containing `html-artifact` / `svg-artifact` still export successfully with those artifacts omitted — **do not** introduce a hard error, that would be a regression for reports that export fine today.
- [ ] No weakening of the renderer's sandbox/CSP posture to make export easier.

### Notes

Deferred deliberately. Not required for the epic to deliver value — matches today's `svg-artifact` behaviour exactly. Owned by Track A / Track B per the handoff document, not by this epic.
