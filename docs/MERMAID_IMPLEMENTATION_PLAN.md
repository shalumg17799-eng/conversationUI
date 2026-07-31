# Mermaid — Implementation Plan

**Status:** proposed, not started
**Target branch:** `P2-SK-Adaptive_UI`
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
3. **Should the guard live behind an env flag** (`MERMAID_ENABLED`), following the `KAG_ENABLED` / governor-mode precedent? Given the phase-6 kill switch is already one line, probably unnecessary — but worth a decision before phase 6.
