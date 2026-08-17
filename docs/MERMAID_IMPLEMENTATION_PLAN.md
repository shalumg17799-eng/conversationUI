# Mermaid — Implementation Plan

**Status:** **Track M1 implemented** (phases 1 and 3–6). Tracks M2, M3, M4 not started.
**Target branch:** `P2-SK-Adaptive_UI`
**Read §12 first if you are reviewing the code** — five things in this plan turned out to be wrong or incomplete once real Mermaid output was measured, and the shipped implementation differs accordingly.
**Scope:** new `mermaid-artifact` render type (Track M1) + KAG graph serializer (Track M2) + docs diagrams (Track M3); export parity deferred (Track M4)
**Author's note:** this plan reuses the Phase 2 / Track D rich-artifact machinery end to end. It deliberately introduces **no new render path** — Mermaid becomes SVG on the client, and that SVG travels the existing sanitize → sandboxed-iframe pipeline.

---

## 1. What is actually being added

Mermaid is a text-to-diagram language (`flowchart TD; A --> B`). Three distinct things could be meant by "add Mermaid", and they have very different costs. This plan covers all three, ordered by value-per-hour:

| Track | What | Effort | Risk | Recommendation |
|---|---|---|---|---|
| **M3** | Mermaid fenced blocks in the repo's own `.md` docs | ~1 hr | none | **Do first** — zero code, GitHub renders natively |
| **M2** | Deterministic `KagGraph → Mermaid` serializer for the KAG debug surface | ~4 hrs | low | **Do second** — code-generated, not model-generated, so it sidesteps the trust question entirely |
| **M1** | `mermaid-artifact` as a first-class registry component the LLM can emit | ~2–3 days | medium | **The main body of this plan** |
| **M4** | Mermaid/SVG in PDF / PPTX / video export | ~2 days | medium | **Defer** — inherits the known gap in [docs/track-a-b-artifact-export-gap.md](track-a-b-artifact-export-gap.md) |

**Not recommended:** rendering ```` ```mermaid ```` fences inside chat message text. The conversational surface renders plain strings — there is no markdown pipeline in [Conversational_new.tsx](../src/app/pages/Conversational_new.tsx) — so this would mean adopting a markdown renderer purely to host Mermaid. The `mermaid-artifact` card (M1) already delivers the same user-visible outcome through a path that is validated, governed and exportable.

---

## 2. Track M1 — architecture decision

### 2.1 The chosen design

```
LLM emits                  backend                     frontend (lazy chunk)
┌───────────────────┐   ┌──────────────────┐   ┌──────────────────────────────────┐
│ mermaid-artifact  │   │ guardMermaid()   │   │ mermaid.render() → SVG string    │
│ props.content =   │──▶│ allowlist source │──▶│ strip <style>                    │
│ mermaid SOURCE    │   │ (report-only)    │   │ sanitizeArtifact(svg,'mermaid')  │
└───────────────────┘   └──────────────────┘   │ buildArtifactSrcDoc(...)         │
                                               │ <iframe sandbox=""> ← unchanged  │
                                               └──────────────────────────────────┘
```

The load-bearing property: **Mermaid's JavaScript never runs inside the artifact iframe.** It runs in the parent bundle (trusted, app-authored code), and only its *inert SVG output* is placed inside the `sandbox=""` opaque-origin frame. Every security guarantee documented at [UITreeRenderer.tsx:1070-1089](../src/app/components/UITreeRenderer.tsx#L1070-L1089) survives untouched — no `allow-scripts`, no CSP relaxation, no `dangerouslySetInnerHTML`.

### 2.2 Alternatives rejected

| Alternative | Why rejected |
|---|---|
| Load `mermaid.js` **inside** the artifact iframe | Requires `allow-scripts` + `script-src`, which is the exact thing the sandbox exists to prevent. Non-starter. |
| Server-side render via `@mermaid-js/mermaid-cli` | Pulls Puppeteer/headless Chromium into the backend for a rendering concern. `playwright` is already a backend devDependency, but promoting a browser to the request hot path for diagram rendering is a large operational cost for no user-visible gain. Reconsider only for M4 (export). |
| Ask the LLM for raw SVG (status quo: `svg-artifact`) | Already exists and works, but the model must hand-place every coordinate. Mermaid gives layout for free and produces far more reliable diagrams from a fraction of the tokens. The two coexist: `svg-artifact` for bespoke/annotated visuals, `mermaid-artifact` for structured graphs. |
| Mermaid's own `securityLevel: 'sandbox'` | Mermaid then renders into an iframe *it* controls. We would be nesting its frame inside ours and inheriting its policy instead of enforcing our own. Use `'strict'` and keep our frame. |

### 2.3 Three real obstacles, and the fix for each

**(a) The sanitizer strips `<style>`, and Mermaid's SVG is styled almost entirely by a `<style>` block.**
`SVG_TAGS` in [artifactSanitizer.ts:62-66](../backend/src/services/artifactSanitizer.ts#L62-L66) has no `style`, and the tag handler skips the whole `<style>` subtree. Mermaid emits `.node rect { fill: … }` rules, not presentation attributes — so a naively sanitized Mermaid SVG renders as unstyled black shapes.

*Fix:* strip the `<style>` block **before** sanitizing, and have `buildArtifactSrcDoc` inject an **app-authored, trusted** stylesheet for `kind === 'mermaid'`. Mermaid's class names (`.node`, `.edgePath`, `.label`, `.actor`, `.cluster`) are stable and the sanitizer already preserves `class`. Result: theming is ours, deterministic, matches the app palette, and no model-supplied CSS is ever admitted. `ARTIFACT_CSP` already permits `style-src 'unsafe-inline'` for exactly this wrapper stylesheet — no CSP change.

**(b) Retention-ratio false downgrade.**
`MIN_RETENTION_RATIO = 0.6` compares `safeLength / originalLength`. A multi-kilobyte `<style>` block counted as *removed* can push a perfectly good diagram under the threshold and trigger `ArtifactFallback`. Pre-stripping the style block (fix (a)) shrinks `originalLength` too, so the ratio stays honest. **This ordering is mandatory, not cosmetic.**

**(c) Bundle size.**
Mermaid is a heavy dependency (hundreds of KB) and must not enter the initial bundle. Load it with a dynamic `import('mermaid')` inside the component, behind `React.lazy` + `Suspense` (the pattern `BigQueryDashboard` already uses at [UITreeRenderer.tsx:1225-1231](../src/app/components/UITreeRenderer.tsx#L1225-L1231)). Vite emits a separate chunk fetched only when a report actually contains a Mermaid card.

---

## 3. Track M1 — file-by-file changes

> **Dual-copy rule.** `artifactSanitizer.ts` exists twice — [backend](../backend/src/services/artifactSanitizer.ts) and [frontend](../src/app/components/artifactSanitizer.ts) — and `scripts/test_artifacts.ts` fails the build if they drift. The same applies to the new `mermaidGuard.ts`. **Edit both copies identically.**

### 3.1 Sanitizer — extend `ArtifactKind` (both copies)

```ts
export type ArtifactKind = 'html' | 'svg' | 'mermaid';

export const ARTIFACT_RENDER_TYPES = ['html-artifact', 'svg-artifact', 'mermaid-artifact'] as const;

export function isArtifactRenderType(t: unknown): boolean {
  return t === 'html-artifact' || t === 'svg-artifact' || t === 'mermaid-artifact';
}

export function artifactKindOf(renderType: string): ArtifactKind {
  if (renderType === 'mermaid-artifact') return 'mermaid';
  return renderType === 'svg-artifact' ? 'svg' : 'html';
}
```

Two follow-on edits inside `sanitizeArtifact`:

- `const tags = kind === 'html' ? HTML_TAGS : SVG_TAGS;` — already correct, `'mermaid'` falls to `SVG_TAGS`. No change, but add a comment saying so deliberately.
- `hasContent`: change `(kind === 'svg' && /<(path|circle|…)/…)` to `(kind !== 'html' && …)`, otherwise a shape-only Mermaid diagram with no text nodes is judged empty.

In `buildArtifactSrcDoc`, add the Mermaid stylesheet:

```ts
// Trusted, app-authored CSS for Mermaid's stable class names. Substitutes for the
// <style> block the sanitizer removes; never derived from model output.
const MERMAID_CSS = `
  .node rect,.node circle,.node polygon,.node path{fill:#EFF6FF;stroke:#2563EB;stroke-width:1.5px}
  .cluster rect{fill:#F4F2EF;stroke:#E5E3DF}
  .edgePath path,.flowchart-link{stroke:#8A8785;stroke-width:1.5px;fill:none}
  .arrowheadPath,marker path{fill:#8A8785;stroke:none}
  .label,.nodeLabel,.edgeLabel,text{fill:#1C1917;font:12px ui-sans-serif,system-ui,sans-serif}
  .edgeLabel rect{fill:#FFFFFF}
  .actor{fill:#EFF6FF;stroke:#2563EB} .messageText{fill:#1C1917}
`;
```

...appended to the wrapper `<style>` when `kind === 'mermaid'`, and the SVG centering branch changed from `kind === 'svg'` to `kind !== 'html'`.

### 3.2 New — `mermaidGuard.ts` (both copies)

Backend at `backend/src/services/mermaidGuard.ts`, frontend copy at `src/app/components/mermaidGuard.ts`. Pure, DOM-free, dependency-free, never throws — same contract as the sanitizer.

```ts
export const MAX_MERMAID_BYTES = 20_000;

// Diagram types we support. Anything else is refused rather than rendered.
const ALLOWED_HEADERS = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'stateDiagram-v2', 'erDiagram', 'journey', 'gantt', 'pie', 'mindmap', 'timeline',
];

export interface MermaidGuardResult {
  ok: boolean;
  reason?: string;      // populated when ok === false
  removed: string[];    // guard classes that fired, for telemetry
  code: string;         // trimmed source; '' when !ok
}

export function guardMermaid(content: unknown): MermaidGuardResult;
```

Rules, in order — each is a **refusal**, not a strip, because a half-guarded diagram is worse than none:

| Rule | Rationale |
|---|---|
| `typeof content === 'string'` and non-empty | shape check |
| `length <= MAX_MERMAID_BYTES` | DoS ceiling; Mermaid layout is superlinear in node count |
| first non-comment, non-blank line starts with an allowlisted header | refuses unknown/future diagram types until reviewed |
| no `%%{ … }%%` init directive | can override `securityLevel`, inject `themeVariables`, and reach CSS |
| no `click ` statement | Mermaid's interaction syntax → `href` navigation / `call` into page functions |
| no `href`, `call`, `callback`, `linkTarget` | same family as above |
| no `<` or `>` characters | blocks HTML-in-label vectors; also honest, since `htmlLabels:false` means such labels would not render anyway |
| no `script`, `javascript:`, `data:`, `vbscript:` (case-insensitive) | belt-and-braces |

`classDef` / `style` / `linkStyle` statements are **permitted but inert** — the `<style>` block they produce is stripped and replaced by `MERMAID_CSS`. Document this so nobody later "fixes" the missing colours by re-admitting `<style>`.

### 3.3 Registry — `backend/src/registry/componentRegistry.ts`

Add alongside the two existing artifacts (same `family: 'narrative'` — the comment at [componentRegistry.ts:82-89](../backend/src/registry/componentRegistry.ts#L82-L89) explains why a novel family would be silently ungenerated by `MODE_POLICY`):

```ts
{ type: 'mermaid-artifact', tier: 'organism', family: 'narrative',
  requiredProps: ['content'], optionalProps: ['title','variant','caption','explanation'],
  dataNeeds: 'none', outputModes: ['narrative','full_dashboard'],
  whenToUse: 'Structural diagram from Mermaid source — flowchart, sequence, state, ER, or org/dependency graph. Prefer over svg-artifact whenever the diagram is a graph of nodes and edges rather than a bespoke annotated drawing.' },
```

Then `npm run registry:generate` to refresh `backend/src/registry/generated/componentRegistry.json` — `npm run check:registry` fails CI otherwise ([checkRegistryParity.js:39-49](../scripts/checkRegistryParity.js#L39-L49)).

### 3.4 Renderer parity — `src/app/components/renderTypes.ts`

Add `'mermaid-artifact'` to `RENDER_TYPES`. This is what makes `COMPONENT_MAP` fail to compile until 3.6 lands — intentional.

### 3.5 Validator — `backend/src/services/uiValidator.ts`

**This is the subtlest change in the plan.** `assessArtifactNode` currently calls `sanitizeArtifact(props.content, kind)`. For a Mermaid node, `props.content` is *Mermaid source*, not markup — running the markup sanitizer over it yields meaningless `removed` classes and a bogus retention ratio. The function must branch:

```ts
export function assessArtifactNode(node: ValidatableNode): ArtifactAssessment | null {
  if (!isArtifactRenderType(node?.renderType)) return null;
  const renderType = node.renderType as string;
  const kind = artifactKindOf(renderType);
  const props = (node.props ?? {}) as Record<string, unknown>;

  if (kind === 'mermaid') {
    const g = guardMermaid(props.content);
    return {
      renderType, kind, safe: g.code, removed: g.removed,
      retention: g.ok ? 1 : 0,
      oversized: g.reason === 'oversized',
      shouldDowngrade: !g.ok,
    };
  }
  // …existing markup path unchanged…
}
```

`content` is already in `PROP_TYPES` as `{ type: 'string' }` ([uiValidator.ts:77](../backend/src/services/uiValidator.ts#L77)), so the Ajv schema needs **no** change. Module contract is preserved: this still only *reports*; enforcement remains at render time.

### 3.6 Renderer — `src/app/components/UITreeRenderer.tsx`

New lazy component in its own file, `src/app/components/MermaidArtifact.tsx`:

```tsx
const mermaidReady = (async () => {
  const m = (await import('mermaid')).default;
  m.initialize({
    startOnLoad: false,
    securityLevel: 'strict',   // htmlLabels off, click handlers ignored, DOMPurify on
    theme: 'base',
    flowchart: { htmlLabels: false, useMaxWidth: true },
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  });
  return m;
})();   // module-scope: initialize exactly once per session
```

Component behaviour:

1. `guardMermaid(content)` — on failure render `ArtifactFallback` with the guard reason and the raw source as text. Never call `mermaid.render` on unguarded input.
2. `await (await mermaidReady).render(id, code)` inside an effect, with a stable `id` derived from a hash of the source (Mermaid ids must be unique per call and must not collide across cards).
3. On error (Mermaid throws on malformed syntax) → `ArtifactFallback`, reason `'diagram syntax error'`.
4. `svg.replace(/<style[\s\S]*?<\/style>/gi, '')` → `sanitizeArtifact(stripped, 'mermaid')` → `buildArtifactSrcDoc(safe, 'mermaid')` → the **existing** `<iframe sandbox="">`.
5. Guard against setState-after-unmount; the render is async.

The cleanest structural move is to extract the frame JSX from `ArtifactFrame` ([UITreeRenderer.tsx:1104-1150](../src/app/components/UITreeRenderer.tsx#L1104-L1150)) into a small `ArtifactShell({ srcDoc, kind, title, caption, explanation, variant })` shared by both, so the `sandbox=""` / `referrerPolicy` / CSP attributes live in exactly one place. **Do not duplicate the iframe element** — a second copy is how a `allow-scripts` regression eventually gets introduced.

Then register:

```tsx
'mermaid-artifact': MermaidArtifact,
```

and, because rendering is async and code-split, wrap it in `Suspense` in the dispatcher the same way `BigQueryDashboard` is.

### 3.7 Prompt — `backend/src/services/llmHandler.ts`

The `AVAILABLE COMPONENTS` catalogue is hand-maintained and is **not** derived from the registry ([llmHandler.ts:1154-1166](../backend/src/services/llmHandler.ts#L1154-L1166)) — registry membership alone will never make the model emit the type. Add under `RICH ARTIFACTS`, matching the deliberately restrictive tone of the existing entries:

```
  mermaid-artifact { content, title?, caption?, explanation? }
    USE WHEN the query asks for a STRUCTURAL diagram that is a graph of nodes and edges:
      "flow chart", "process flow", "escalation path", "sequence diagram", "state machine",
      "how does X connect to Y", "org chart", "data lineage", "dependency map".
    content = Mermaid source ONLY (no code fences, no prose). First line MUST be one of:
      flowchart TD | flowchart LR | sequenceDiagram | classDiagram | stateDiagram-v2 |
      erDiagram | journey | gantt | pie | mindmap | timeline
    Ground node labels in the real domain entities from the data sample.
    Node ids must be simple alphanumerics; put the readable text in the label: A["Territory T-007"].
    FORBIDDEN: %%{init}%% directives, click/href/call statements, and any < or > characters.
      Such content is refused and the card downgrades to plain text.
    PREFER mermaid-artifact over svg-artifact whenever the diagram is nodes-and-edges;
    reserve svg-artifact for bespoke annotated drawings Mermaid cannot express.
    NEVER as a substitute for a chart — measured values use BarChart/LineChart/PieChart/etc.
    A diagram shows STRUCTURE (how things connect or flow), never measured values.
```

Also amend the closing line at [llmHandler.ts:1327](../backend/src/services/llmHandler.ts#L1327) — "Emit at most ONE artifact card per report" — to cover all three types explicitly.

### 3.8 Dependency

Root `package.json`: `"mermaid": "^11.x"` (pin exactly; a Mermaid upgrade changes emitted SVG structure and class names, so treat it as a security-relevant change requiring a re-run of `test:mermaid`). Frontend-only — the backend needs **no** Mermaid dependency, because the backend only guards source text, never renders.

---

## 4. Track M2 — KAG graph → Mermaid

[backend/src/kag/](../backend/src/kag/) assembles a 66-node / 106-edge typed graph ([types.ts](../backend/src/kag/types.ts) defines 9 node types and 11 relationship types) that today can only be inspected as JSON or through Neo4j Browser. A deterministic serializer makes it readable in any Markdown viewer.

New file `backend/src/kag/graphToMermaid.ts`:

```ts
export interface MermaidGraphOptions {
  nodeTypes?: KagNodeType[];    // filter, e.g. ['Metric','Table']
  relTypes?: KagRelType[];
  rootId?: string;              // subgraph around one node
  maxNodes?: number;            // default 60 — Mermaid layout degrades badly past ~100
}
export function graphToMermaid(g: KagGraph, opts?: MermaidGraphOptions): string;
```

- One `subgraph` per `Domain`, node shape by `KagNodeType`, edge label = `KagRelType`.
- Node ids: reuse the existing stable slugs (`Metric:take-rate-pct`) with `:` → `_`, since Mermaid ids cannot contain `:`.
- Escape label text; `maxNodes` truncation must be **logged and stated in the output** (a `%% truncated: 40 of 106 edges shown` comment line), never silent.
- Pipe the output through `guardMermaid()` in the test — the serializer's own output must satisfy the same guard the model's does. This is the cheapest possible regression test for the guard.

Surface it two ways:
1. `GET /api/kag/graph.mmd?domain=…` in [backend/src/index.ts](../backend/src/index.ts), next to the existing `GET /api/kag/stats`. Text response.
2. `npm run kag:build` writes `backend/data/kag/graph.mmd` alongside the existing build artifacts, so the committed graph is diffable in PRs.

This track has **no** trust problem: the Mermaid source is generated by our own code from our own graph. It can ship before M1 and is genuinely useful on its own.

---

## 5. Track M3 — documentation diagrams

Zero code. Replace the ASCII pipeline sketches in [ARCHITECTURE_PHASE2.md](../ARCHITECTURE_PHASE2.md), [CHAT_FLOW_ARCHITECTURE.md](../CHAT_FLOW_ARCHITECTURE.md) and [docs/KAG_IMPLEMENTATION_PLAN.md](KAG_IMPLEMENTATION_PLAN.md) with ```` ```mermaid ```` fences. GitHub, VS Code (with the built-in Markdown preview extension) and most PR tools render these natively.

Highest-value diagrams to author:
- request lifecycle: query → `intentClassifier` → `queryEngine` → `dataShapeAnalyzer` → `outputMode` → `componentSelector` → `llmHandler` → `uiValidator` → `governor` → `UITreeRenderer`
- the governor's `off` / `shadow` / `enforce` state machine
- the KAG node/relationship model
- the artifact security layers (sandbox → CSP → sanitizer → fallback)

Caveat worth stating in each doc: these render on GitHub but **not** in the PDF exports checked into the repo root (`CHAT_FLOW_ARCHITECTURE.pdf`), which are generated separately.

---

## 6. Track M4 — export parity (deferred)

`mermaid-artifact` inherits the gap in [docs/track-a-b-artifact-export-gap.md](track-a-b-artifact-export-gap.md): [exportReport.ts](../src/lib/exportReport.ts) dispatches on `renderType` and has no artifact case, so artifacts are silently omitted from PDF/PPTX/XLSX. **Preserve that behaviour** — omit and complete, never error.

When it is picked up, Mermaid is the *easiest* of the three artifact types to close, because the frontend already holds a complete standalone SVG string post-render:

- **PDF** — rasterize the SVG to a canvas and `jspdf.addImage`, or embed as vector.
- **PPTX** — `pptxgenjs` accepts an image data URI.
- **Video / Remotion** — an SVG string can be rendered directly in a Remotion composition; no headless capture needed.

Constraint carried over verbatim: consume the **sanitized** SVG (`sanitizeArtifact` output), never raw model output or raw Mermaid output.

---

## 7. Security model — summary

| Layer | Control | Where |
|---|---|---|
| 1 | Source allowlist — diagram-type header, no init directives, no `click`/`href`, no angle brackets, size cap | `mermaidGuard.ts` (backend **and** frontend) |
| 2 | `securityLevel: 'strict'`, `htmlLabels: false` — Mermaid's own DOMPurify pass, click handlers ignored | `MermaidArtifact.tsx` init |
| 3 | `<style>` pre-strip — no model-influenced CSS reaches the frame | `MermaidArtifact.tsx` |
| 4 | `sanitizeArtifact(svg, 'mermaid')` — allowlist strip of the rendered SVG | existing, unchanged |
| 5 | `ARTIFACT_CSP` — `script-src 'none'`, `default-src 'none'` | existing, unchanged |
| 6 | `<iframe sandbox="">` opaque origin — no script execution, no same-origin access | existing, unchanged |
| 7 | Downgrade to `ArtifactFallback` when any layer refuses | existing, extended |

**The one genuinely new exposure:** `mermaid.render()` executes in the parent document, and it briefly attaches a temporary element to `document.body`. Mitigations: layer 1 runs first and refuses on any suspicious token; layer 2 is Mermaid's own strict mode; and the parent-document exposure is a *library* execution, not an execution of model-authored script. This must be called out explicitly in the code comment above the render call so it is not mistaken for the same zero-trust posture the iframe provides.

---

## 8. Tests and CI gates

New `scripts/test_mermaid.ts`, registered as `npm run test:mermaid` in root `package.json` (mirroring the existing `test:artifacts` wiring).

1. **Copy parity** — `mermaidGuard.ts` backend/frontend copies are logically identical (reuse the `logic()` reduction from [test_artifacts.ts:39-41](../scripts/test_artifacts.ts#L39-L41)).
2. **Guard accepts** one valid sample per allowlisted diagram type.
3. **Guard refuses** — `%%{init:{'securityLevel':'loose'}}%%`, `click A "https://evil"`, `A["<img onerror=…>"]`, oversized payload, unknown header (`sankey-beta`), empty/non-string.
4. **Round-trip** — for each diagram type, a *golden pre-rendered SVG fixture* (checked in, so the test needs no browser) goes through `strip<style>` → `sanitizeArtifact(_, 'mermaid')` and must satisfy: `usable === true`, `retention >= MIN_RETENTION_RATIO`, and `assertInert()` from `test_artifacts.ts`.
5. **Retention regression** — the specific failure mode from §2.3(b): assert a fixture *with* its `<style>` block intact would fall below threshold, and *without* it passes. This is the test that stops someone reordering the pipeline.
6. **Validator integration** — `assessArtifactNode({renderType:'mermaid-artifact', …})` takes the guard branch and never the markup branch; a refused source produces an `unsafe_artifact_content` violation.
7. **Constraint integration** — `deriveConstraints('narrative', shape).allowedComponents` includes `mermaid-artifact` (mirrors the existing assertion for `svg-artifact`).
8. **M2** — `guardMermaid(graphToMermaid(assembledGraph))` returns `ok: true`.

Existing gates that must stay green: `npm run check:registry` (needs `registry:generate` re-run), `npm run test:artifacts`, `npm run test:validation`, `npm run test:constraints`, `tsc` on both roots (the `RenderType` union is what enforces `COMPONENT_MAP` parity).

Manual verification, since no browser test harness exists here: run the app, issue "draw the escalation flow for territory T-007" and "show the sequence when a report is generated", confirm the diagram renders inside the iframe, then confirm the fallback path by hand-editing a card's `content` to include `click A "x"`.

---

## 9. Phasing

| Phase | Deliverable | Gate |
|---|---|---|
| **0** | Track M3 — Mermaid diagrams in the four architecture docs | renders on GitHub |
| **1** | `mermaidGuard.ts` (both copies) + tests 1–3 | `npm run test:mermaid` |
| **2** | Track M2 — `graphToMermaid.ts`, `/api/kag/graph.mmd`, `graph.mmd` build artifact | test 8 |
| **3** | Sanitizer `ArtifactKind` extension + `MERMAID_CSS` + tests 4–5 | `test:mermaid`, `test:artifacts` |
| **4** | Registry + `renderTypes` + validator branch + regenerate JSON | `check:registry`, tests 6–7, `tsc` |
| **5** | `MermaidArtifact.tsx`, `ArtifactShell` extraction, `COMPONENT_MAP` entry, lazy chunk | `tsc`, manual render check |
| **6** | Prompt catalogue entry in `llmHandler.ts` | end-to-end query check |
| **7** | *(deferred)* Track M4 export | — |

Phases 3–5 land the plumbing with **no behaviour change** — nothing emits `mermaid-artifact` until phase 6 adds the prompt entry. That ordering makes phase 6 a one-line, instantly revertible kill switch: delete the catalogue block and generation stops, with the renderer and validator left harmlessly in place.

---

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Mermaid's SVG class names change across versions, breaking `MERMAID_CSS` | medium | pin the version; test 4 fixtures are version-stamped; treat upgrades as security-relevant |
| Model over-reaches for diagrams on ordinary BI queries | medium | restrictive prompt wording (matching the existing artifact entries), which is the only bound — generation does not enforce the constraint set and the governor defaults to `off` |
| Sanitizer strips a camelCase SVG attribute Mermaid needs | medium | test 4 covers every supported diagram type; extend `SVG_ATTRS` only with inert geometry attributes, following the `markerwidth`/`refx` precedent |
| Bundle regression | low | dynamic import; verify the chunk is separate in `vite build` output |
| Mermaid layout hangs on a large graph | low | `MAX_MERMAID_BYTES`, plus `maxNodes` in the M2 serializer |
| Diagram silently missing from exports | certain until M4 | documented in §6; identical to today's `svg-artifact` behaviour |

**Rollback:** remove the `mermaid-artifact` block from the prompt catalogue (phase 6). Generation stops immediately; every other change is inert. Full removal is the reverse of phases 3–5 plus a `registry:generate`.

---

## 11. Open questions

1. **`svg-artifact` deprecation?** Once Mermaid covers flowcharts and topologies, `svg-artifact`'s remaining niche is bespoke annotated drawings. Keep both for now, but if telemetry shows Mermaid dominating, narrowing the `svg-artifact` prompt entry would reduce the model's choice surface.
2. **Per-diagram-type constraints?** `outputModes: ['narrative','full_dashboard']` treats all Mermaid diagrams alike. A `gantt` is arguably closer to a chart than a narrative. Revisit after seeing real usage.
3. **Should the guard live behind an env flag** (`MERMAID_ENABLED`), following the `KAG_ENABLED` / governor-mode precedent? Given the phase-6 kill switch is already one line, probably unnecessary — but worth a decision before phase 6. *(Resolved: no flag. The prompt-catalogue block remains the kill switch.)*

---

## 12. What actually shipped — corrections to this plan

Track M1 is implemented. Five things in §1–§11 above were wrong or incomplete, and were only visible once real Mermaid 11.16.0 output was generated and measured. They are recorded here rather than silently edited into the plan, because each one is a trap a future reader could fall back into.

### 12.1 The guard's angle-bracket rule (§3.2) would have refused every diagram

The plan specifies *"no `<` or `>` characters | blocks HTML-in-label vectors"*. Mermaid builds its edge syntax **out of** angle brackets — `A --> B`, `A <--> B`, `A <|-- B`, `A ->> B` — so that rule refuses essentially all valid input.

Shipped rule: refuse a **tag-open**, `<` followed by a name char, `/`, `!` or `?` (`TAG_OPEN = /<[a-zA-Z\/!?]/`). Every arrow form has `<` followed by `-`, `|` or `<`, so the two are cleanly separable. Accepted cost: classDiagram `<<interface>>` annotations are refused. `scripts/test_mermaid.ts` has an explicit regression test (`arrow syntax is not mistaken for markup`) so this cannot be "simplified" back.

### 12.2 `htmlLabels: false` on the flowchart config alone is not enough

The plan sets `flowchart: { htmlLabels: false }`. In Mermaid 11 that leaves node labels inside `<foreignObject>`, which the sanitizer strips as a whole subtree — every fixture still rendered, just with **no text in any node**. The failure is silent: retention stays healthy, `usable` stays true, and you get a diagram of empty boxes.

Shipped: **top-level** `htmlLabels: false` as well as the per-diagram flags. Guarded by the `node labels survive — the diagram is not a set of empty boxes` test, which asserts on real label strings.

### 12.3 `useMaxWidth: true` breaks sizing once `style` is stripped

Not anticipated at all. With `useMaxWidth: true` Mermaid emits `width="100%"` **plus an inline `style="max-width:<natural>px"`**. The sanitizer strips `style` attributes, so only `width="100%"` survives and every diagram stretches to fill the frame — a 222px class diagram was observed upscaling ~3.7×, text ballooning with it.

Shipped: `useMaxWidth: false` for every allowed diagram type, so Mermaid writes real `width`/`height` attributes (both already allowlisted) and the wrapper's `svg{max-width:100%;height:auto}` scales large diagrams down without ever scaling small ones up.

### 12.4 `MERMAID_CSS` (§2.3a) was under-specified in three ways

The plan's sketch covers fills and strokes only. What the stripped `<style>` block was actually carrying:

- **Text anchoring.** Node `<text>` elements have no `text-anchor` attribute. Without a replacement rule they render from the node's centre rightwards and overflow the box. The rule must also be **scoped**: Mermaid emits `.node .label text{text-anchor:middle}` *only* for flowcharts, and applying it globally left-shifts classDiagram members, which UML anchors at start. The shipped rule is scoped `svg.flowchart …`, mirroring Mermaid exactly.
- **Selector qualification.** Mermaid reuses the same class on a container and its label (`.actor`, `.slice`). Unqualified class selectors beat the element-level text rule and paint labels the same colour as their box. Every shipped shape rule is element-qualified (`rect.actor`, not `.actor`).
- **Font sizing.** The plan's sketch sets a `font:` shorthand on `text`. Mermaid measures and positions labels at render time and relies on its stylesheet to reproduce those exact sizes; overriding them desynchronises text from the geometry computed for it. Shipped CSS sets font-size only where Mermaid does.

Additionally, three inert text-layout attributes (`alignment-baseline`, `font-style`, `transform-origin`) were added to `SVG_ATTRS`, following the existing `markerwidth`/`refx` precedent.

**`themeVariables` are also required, and they are not CSS.** Mermaid bakes some colours into `fill`/`stroke` **presentation attributes**, which survive sanitizing untouched. Styling only through `MERMAID_CSS` produced flowcharts in the app palette next to class/timeline/mindmap diagrams in Mermaid's stock colours — one report, two visual languages. The shipped `initialize()` call passes `themeVariables`. This is not a hole in the `%%{init}%%` ban: that ban is on the **model** supplying theme config through diagram source.

### 12.5 `pie`, `gantt` and `journey` were removed from the allowlist

§3.2 allowlists twelve diagram types. Three were dropped, on two independent grounds:

1. They are **charts**, and the registry already has real chart components that carry data through the normal hydration path. The prompt's own rule — *"a diagram shows STRUCTURE, never measured values"* — argues against them.
2. They **render wrong here regardless**. Mermaid colours their segments through generated per-index classes (`.pieCircle:nth-of-type`, `.section-type-N`) emitted into the stripped `<style>` block. Verified visually: every pie slice collapsed to one fill and the legend swatches went black. An unreadable chart is worse than no chart.

Shipped allowlist is nine structural types. This also resolves open question §11.2.

### 12.6 Fixtures are real, not hand-authored

§8 calls for "golden pre-rendered SVG fixtures (checked in, so the test needs no browser)" without saying where they come from. `scripts/gen_mermaid_fixtures.mjs` bundles Mermaid with Vite and renders each sample in headless Chromium via the backend's existing `playwright` devDependency, writing `scripts/fixtures/mermaid/*.svg` plus a `VERSION` stamp. `npm run test:mermaid` asserts that stamp matches the installed Mermaid version, so an upgrade without regenerating fails the build rather than silently invalidating `MERMAID_CSS`.

Regenerate with `npm run mermaid:fixtures`. **Every defect in §12.2–§12.5 was found by looking at rendered output, not by reading code** — keep that loop when changing this path.

### 12.7 Measured retention (the §2.3b claim, confirmed)

The plan asserts the `<style>` pre-strip is mandatory rather than cosmetic. It is. With the pre-strip all nine fixtures pass; without it six fall below `MIN_RETENTION_RATIO`, `timeline` most dramatically at ≈0.20 against a 0.6 floor. `test_mermaid.ts` asserts both directions and names `timeline.svg` explicitly so the test cannot be satisfied by a marginal fixture.

### 12.8 Structural change not in the plan: `ArtifactShell`

§3.6 asks for the frame JSX to be extracted so the `sandbox=""` attributes live in one place. Because `MermaidArtifact` is lazy-loaded, that shell could not live in `UITreeRenderer` without an import cycle. It is now [`src/app/components/ArtifactShell.tsx`](../src/app/components/ArtifactShell.tsx), with the shared design tokens moved to [`src/app/components/uiTokens.ts`](../src/app/components/uiTokens.ts). All three artifact kinds mount through it.

### 12.9 A fixed frame height cut real diagrams in half

Found by running the app, not by any test. `ArtifactFrame` gave every artifact a fixed height (320/420px). That is fine for hand-authored SVG, where the model sizes its own viewBox, but Mermaid lays itself out — the live escalation flowchart came back **1704px tall in a 380px frame, with 78% of it invisible**. Nothing errored; the card just looked finished and wasn't.

An iframe cannot size itself to its content, and this one is deliberately cross-origin (`sandbox=""` with no `allow-same-origin`), so the parent can never measure inside it. The fix passes the size *outward*: `MermaidArtifact` reads the `width`/`height` off the sanitized `<svg>` open tag — available only because of §12.3's `useMaxWidth:false` — and hands it to `ArtifactShell` as `intrinsic`. `ArtifactShell` measures its own width with a `ResizeObserver` and derives the height from the same scale factor the wrapper stylesheet applies, clamped to [180, 1200].

Verified at two viewports: at 880px the diagram renders at full size; at 520px the SVG scales down and the frame follows it to 1177px, still showing everything.

### 12.10 Mermaid silently destroys `>` inside labels

The worst defect found, and invisible to every test that existed. The live model output contained `B{"Return Rate > 4%?"}`. It rendered as **"Return Rate 4%?"** — a different condition, displayed confidently, with no error at any layer.

The cause is Mermaid, not this pipeline: `>` is its node-shape syntax (`A>text]`), so a raw `>` in a label is swallowed by its parser. The sanitizer was verified innocent — it round-trips both `>` and `&gt;` correctly. Asymmetric, too: `<` renders fine, which is why "Take Rate < 60%" survived in the same diagram and made the loss easy to miss.

Browser-verified encodings: raw `>` → dropped; `&gt;` → renders `>`; `#62;` → renders literally.

Prompt guidance alone was judged insufficient for a silent-corruption bug, so the fix is deterministic: `escapeLabelAngles()` in `mermaidGuard.ts` (both copies) entity-escapes `>` inside double-quoted spans, where arrows never appear. It runs **after** the guard — the guard judges what the model wrote, then the source is repaired. It is explicitly *not* part of the refuse-don't-strip contract: it changes no meaning, it preserves the meaning Mermaid would otherwise destroy.

One trap worth naming: `&gt;` itself contains a `>`, so a naive `/>/g` rewrite produces `&gt&gt;`. The alternation `/&gt;|>/g` matches the existing entity first and rewrites it to itself, which makes the operation idempotent. There is a test for exactly this.

### 12.11 The clarification round-trip silently dropped the drawing request

Only reachable by driving the real chat UI. Asking *"draw the escalation flow for network territory T-007"* triggers a clarifying question ("which report should I base this flow on?"). Answering it produced a **KPI/chart dashboard, never a diagram** — while the identical request through the API produced a `mermaid-artifact` every time.

Isolated with four controlled runs against a live backend, varying only where the drawing words appear:

| Payload | Result |
|---|---|
| query has "draw…", no history | `mermaid-artifact` |
| query has "draw…" + clarification history | `mermaid-artifact` |
| query = the answer, "draw…" present in history | `mermaid-artifact` |
| query = the answer, "draw…" nowhere — **the real UI payload** | charts |

Cause: on a clarification answer the frontend sends the ANSWER as `query` and the Q/A pair as `clarificationHistory`. The original request appears in neither, so generation sees a bare report name. The wording does survive in `conversationHistory`, which was already being sent but only read on the edit path.

Fixed in `runStreamingPipeline` by recovering the most recent drawing request from `conversationHistory` when the enriched query has lost it. Scoped so it cannot fire on an ordinary flow. **This is a pre-existing gap that affected `svg-artifact` identically** — Mermaid only made it visible.

**A second bug surfaced while verifying the first:** the report cache key was `{query, provider, history, prior}` and omitted `conversationHistory`. Two requests differing only in that field shared a cache entry, so the fix appeared not to work — the drawing request was being served the earlier non-drawing report. The recovered request is now part of the key.

### 12.12 Dev-only: `504 (Outdated Optimize Dep)` on the first diagram

Mermaid is reached solely through a dynamic import, so Vite's dev server discovered it the first time a report contained a diagram, re-optimized mid-session, and killed the in-flight request — the card sat on its loading placeholder until a manual reload. `optimizeDeps.include: ['mermaid']` in `vite.config.ts` pre-bundles it at server start. Production builds were never affected, and this does **not** put mermaid in the initial bundle (verified: it remains a separate 608 KB chunk).

### 12.13 The retention floor was refusing valid diagrams — the wrong gate for machine-generated SVG

Reported from real use: an 18-node escalation flowchart came back as **"Rich content unavailable (too much content was removed)"**, showing its own source as text. Reproduced exactly — retention **0.501** against a 0.6 floor.

`MIN_RETENTION_RATIO` exists to catch **model-authored markup** that sanitizing gutted: if 40% of an `html-artifact` vanishes, what remains misrepresents the model's intent, so downgrading is right. **A `mermaid-artifact` is not that.** Its SVG comes from our own trusted renderer, driven by already-guarded source. What the sanitizer strips there is Mermaid's *bookkeeping* — `style` attributes (replaced wholesale by `MERMAID_CSS`), `data-id`/`data-edge`/`data-look`, `aria-*`, drop-shadow filters. Measured across the nine committed fixtures, legitimate retention runs **0.50 → 0.96**, straddling the floor.

The consequence is backwards: a **denser** diagram is more likely to be refused than a sparse one, purely because bookkeeping scales with node count while the floor does not. The user's 18-node chart was refused; a 5-node one rendered.

Fixed by making usability for `kind === 'mermaid'` depend on whether a diagram actually survived (`hasContent` — shapes or text present) rather than on a byte ratio. `retention` is still computed and reported for telemetry. **Security is untouched:** the allowlist strip already ran, and sandbox + CSP are unchanged. `html`/`svg` artifacts keep the retention gate, and a test asserts that contrast so nobody relaxes it for them by accident.

**Two diagnostic notes worth keeping**, because both cost time:

- My first repro showed 35 `<foreignObject>` elements and pointed at §12.2 recurring. It was a **stale Vite bundle in the repro harness** — re-running gave 0. I nearly "fixed" a bug that did not exist. Re-render before trusting a repro that contradicts a passing test.
- I then assumed the user's browser was serving stale code. It was not: fetching `/src/app/components/MermaidArtifact.tsx` from the running dev server showed the current module with `htmlLabels: false`. Checking that took one command and killed a wrong theory early.

As defence in depth, `MermaidArtifact` now checks the rendered SVG for `<foreignObject>` and fails with the accurate reason *"diagram labels could not be rendered safely"* rather than letting an unlabelled diagram through or blaming retention. That state should be unreachable given the config — which is exactly why it should be loud if it ever happens.

### 12.14 Verified, and not verified

**Verified:** all eight existing gates plus `npm run test:mermaid` (39 assertions); `tsc --noEmit` clean on the backend; code-splitting confirmed by a real Vite build (`MermaidArtifact` 4 KB and `mermaid.core` 594 KB as separate chunks, neither in the entry chunk); rendering fidelity checked against Mermaid's own styling side-by-side in Chromium for all nine diagram types.

**Verified end to end against a live backend.** The §8 manual check was run: a real backend on real BigQuery, asked *"draw the escalation flow for territory T-007"*, emitted a `mermaid-artifact` card whose labels carry actual measured values (55.7% take rate, 4.66% return rate, 82.6% RIS). That exact card was then mounted through the real `UITreeRenderer` in Chromium and confirmed to:

- load `MermaidArtifact` and `mermaid` as runtime chunks (lazy split works in practice, not just in a build listing);
- render inside `<iframe sandbox="">` containing `0` scripts and only inert SVG elements;
- downgrade to `ArtifactFallback` — never render — for a `click` statement, embedded markup, a `pie` header, and a Mermaid syntax error, each with a distinct, accurate reason string;
- raise no console or page errors.

This run is what surfaced §12.9 and §12.10. **Both were invisible to the whole test suite**, which is the lesson worth keeping: the fixture tests prove bytes survive sanitizing, not that a human can read the result.

**Verified in the real chat application.** Once the unrelated merge conflicts in `LayoutPrefsContext.tsx` / `Conversational_new.tsx` were resolved, the full flow was driven in Chromium: log in → persona → Talk → *"draw the escalation flow for network territory T-007"* → answer the clarifying question → the diagram renders inline in the conversation, in an `<iframe sandbox="">` containing `0` scripts, at 853px sized to its own content, with `MermaidArtifact` / `mermaidGuard` / `mermaid` fetched as runtime chunks and no page errors. Node labels carry live BigQuery values (55.7%, 4.66%), and `"Return Rate > 4%?"` keeps its `>` — §12.10's fix holding end to end.

`vite build` also succeeds: 3.29 MB app chunk with `mermaid.core` split out at 608 KB, containing no Mermaid internals.

**Not verified:** export (Track M4, deliberately deferred — see §6), and the `sonnet` provider path. All runs used `provider=gemma`, which is what the UI sends by default; both providers share `REPORT_SYSTEM_PROMPT`, so the catalogue entry is identical, but Sonnet was not exercised.

### 12.15 The same query drew a diagram in one browser and prose in another — and neither was a caching bug

Reported as a browser problem: *"the lifecycle of a support ticket"* rendered a flowchart in an InPrivate window and returned a bare paragraph in the normal profile. The earlier §12 note about stale disk cache made that the obvious suspect. It was wrong, and three things in the screenshots ruled it out before any code was read:

- the prose differed between the two runs, so the second was a fresh generation, not replayed bytes;
- no *"Unknown component: mermaid-artifact"* box appeared, which is what a pre-Mermaid bundle renders for an unrecognised `renderType` ([UITreeRenderer.tsx:1208-1216](../src/app/components/UITreeRenderer.tsx#L1208-L1216));
- replaying the identical query twice against the running backend returned a `clarification` both times. The server was fine.

**The actual cause: `"the lifecycle of a support ticket"` is a `DRAW_INTENT_RE` miss**, so no deterministic route existed and the outcome fell to whatever the front door decided that run. The user was watching a coin flip. Three separate defects sat behind it, each found only by driving the real pipeline:

**(a) The recovery was gated on the same regex that missed.** `runStreamingPipeline` recovers a dropped drawing request on the clarification-answer turn by re-running `detectDrawingIntent` over earlier turns — so a phrasing the regex cannot see is also one it cannot *recover*. §12.11's fix only ever worked for phrasings already enumerated. The answer turn reached generation as a bare report name, which is why the report narrated *"the flow below"* with nothing below it.

**(b) `analyzeQuery`'s free safety net cannot fire on that turn.** The `parsed.diagram` field ([llmHandler.ts:1404-1423](../backend/src/services/llmHandler.ts#L1404-L1423)) is the zero-cost semantic net, and its comment correctly warns that a separate classifier "would fire on EVERY ordinary question". But on a clarification answer, `"Agent Performance Report"` matches a catalog report and takes the `directSource` fast path — returning **before any LLM call**, so that field never exists.

**(c) `REPORT_SYSTEM_PROMPT` is a second, independent enumeration of English.** Even with (a) fixed — request recovered, `outputMode` overridden to `narrative`, `mermaid-artifact` in the allowed set, all confirmed in the log — the model returned a KPI grid, a bar chart and a table, because "lifecycle" is not on the catalogue entry's `USE WHEN` list either.

Shipped: [`drawIntentClassifier.ts`](../backend/src/services/drawIntentClassifier.ts) — a semantic classifier used **only where the regex has already missed and no other signal exists**, which is `recoverDrawRequest`. It never throws and never blocks: timeout, transport error, unparseable output or an unrecognised label all resolve to `none`, which is precisely the pre-existing behaviour. The LLM call is injected rather than imported, so every branch is testable with no network (12 new assertions in `test_drawIntent.ts`, 33 → 47). For (c), `generateReport` now takes the established `drawKind` and states it as an instruction instead of leaving the generator to re-derive it from wording.

**Measured, and worth keeping:**

- A classification costs **min 5.8s / median 7.8s / max 18.1s** against `gemma-4-31b-it`. It is API overhead, not generation — a passing call spends ~210 thinking tokens and ~15 answer tokens. `thinkingConfig.thinkingBudget` is rejected outright (*"Thinking budget is not supported for this model"*), so there is no knob that makes it quick. **That cost is why the classifier is not wired into the front door or the structure path**, and why the recovery scan runs its candidates concurrently rather than in a loop.
- The first version guessed a 6s timeout, which sat *under* the median. Every classification timed out and dutifully returned `none`, so a completely broken classifier looked exactly like a working one that kept deciding "not a diagram". Both failure paths now log. **A fail-closed fallback must be loud, or it is indistinguishable from a correct answer.**
- Accuracy on 14 hand-checked queries: 13 as expected, and the disagreement was arguably the model being right (`"how are outlets related to territories"` → `structure`, which KAG answers exactly). Every dangerous negative held: `"cash flow by month"`, `"flow rate by device group"` and `"sequence number by outlet"` all returned `none`.

Verified end to end: the exact failing flow — *"the lifecycle of a support ticket"* → domain → report — now returns a single `mermaid-artifact` over real HTTP, while `"take rate by territory"` still returns `KPIGrid, BarChart, RankedList, InsightCard` with no classifier involvement.
