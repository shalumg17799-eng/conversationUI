// Source-level allowlist guard for the 'mermaid-artifact' node type. BACKEND copy.
//
// This file is duplicated at src/app/components/mermaidGuard.ts because the two
// tsconfig roots can't share one module (same constraint as artifactSanitizer.ts).
// scripts/test_mermaid.ts fails the build if the copies drift — edit BOTH identically.
//
// WHAT THIS IS FOR. Unlike the other two artifact kinds, a mermaid-artifact's
// `content` is not markup — it is Mermaid SOURCE, which the frontend compiles to
// SVG by RUNNING mermaid.js in the parent document. That render step is the one
// place in the artifact pipeline that is not inside the sandboxed iframe, so the
// source is checked BEFORE it is ever handed to mermaid.render().
//
// The rendered SVG still travels the normal path afterwards (sanitizeArtifact ->
// buildArtifactSrcDoc -> <iframe sandbox="">), so this guard is one layer of
// several, not the only control. Its job is narrower: keep Mermaid itself from
// being steered into behaviour we don't want (config overrides, click handlers,
// embedded markup) while it runs in the parent document.
//
// EVERY RULE IS A REFUSAL, NOT A STRIP. A half-guarded diagram is worse than no
// diagram: silently deleting a `click` line changes what the author meant without
// telling anyone. On refusal the renderer downgrades to ArtifactFallback and shows
// the source as text, which is honest and debuggable.

export const MAX_MERMAID_BYTES = 20_000;

// Diagram types we support. Anything else is refused rather than rendered, so a
// new Mermaid release cannot silently widen the surface: adding a header here is
// a deliberate review step (does its syntax admit URLs, scripts, or config?).
//
// STRUCTURAL TYPES ONLY. `pie`, `gantt` and `journey` are deliberately excluded
// on two independent grounds:
//
//   1. They are charts, and this codebase already has real chart components
//      (PieChart, TimelineCard, ProgressBar) that carry data through the normal
//      hydration path. An artifact showing measured values would bypass all of it.
//   2. They render incorrectly here anyway. Mermaid colours their segments through
//      generated per-index CSS classes (.pieCircle:nth-of-type, .section-type-N)
//      emitted into the <style> block that this pipeline strips. Without it every
//      slice/bar collapses to a single fill — an unreadable chart, which is worse
//      than no chart. Verified visually, not assumed.
//
// Adding one back means solving (2) as well as arguing past (1).
export const ALLOWED_HEADERS = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'stateDiagram-v2', 'erDiagram', 'mindmap', 'timeline',
] as const;

export interface MermaidGuardResult {
  /** true => safe to hand to mermaid.render(). */
  ok: boolean;
  /** Human-readable first failure; undefined when ok. Surfaced in the fallback card. */
  reason?: string;
  /** Every guard class that fired, for telemetry. Empty when ok. */
  removed: string[];
  /** Trimmed source; '' when !ok, so a refused payload can't be used by accident. */
  code: string;
}

// ── Rule patterns ─────────────────────────────────────────────────────────────

// %%{ init: { ... } }%% — Mermaid's inline config directive. It can set
// securityLevel, htmlLabels, and themeVariables (which reach CSS), i.e. it can
// undo the render-time hardening in MermaidArtifact.tsx. Refused outright.
const INIT_DIRECTIVE = /%%\{[\s\S]*?\}%%/;

// `click` is Mermaid's interaction statement (`click A href "..."`,
// `click A call fn()`). It only ever appears at the start of a statement, so
// anchoring to line-start avoids refusing a node labelled "Click-through rate".
const CLICK_STATEMENT = /^[ \t]*click\b/im;

// Config keys that would relax the render-time posture if they reached Mermaid by
// any route. None is legitimate diagram content.
const CONFIG_KEYWORD = /\b(?:linkTarget|securityLevel|htmlLabels)\b/i;

// A tag-open: '<' followed by a name char, '/', '!' or '?'.
//
// DELIBERATELY NARROWER THAN "no angle brackets". Mermaid's edge syntax is built
// from angle brackets — `A --> B`, `A <--> B`, `A <|-- B`, `A ->> B` — so a blanket
// ban on '<' and '>' would refuse essentially every diagram. Every one of those
// forms has '<' followed by '-', '|' or '<', never by a name char, so this pattern
// separates arrows from markup cleanly.
//
// Known, accepted cost: classDiagram annotations (`<<interface>>`) are refused,
// because '<<i' is indistinguishable from a tag-open by this rule. That is a
// narrow feature loss on a rarely-used syntax, taken in exchange for a rule that
// is trivially auditable.
const TAG_OPEN = /<[a-zA-Z/!?]/;

// Belt-and-braces scheme check. `href` can only arrive via `click` (already
// refused) or a config directive (already refused), so this should be unreachable
// — which is exactly why it is cheap to keep.
const DANGEROUS_SCHEME = /\b(?:javascript|vbscript)\s*:|\bdata\s*:\s*[a-z]+\//i;

/**
 * Extract the diagram-type header: the first line that is neither blank nor a
 * `%%` comment. Returned lowercased and stripped of its arguments (`flowchart TD`
 * -> `flowchart`) so it can be matched against ALLOWED_HEADERS.
 */
function headerOf(src: string): string {
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('%%')) continue;
    // `stateDiagram-v2` keeps its hyphen; `flowchart TD` loses its direction.
    const m = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(line);
    return m ? m[1].toLowerCase() : '';
  }
  return '';
}

const HEADER_SET = new Set<string>(ALLOWED_HEADERS.map((h) => h.toLowerCase()));

/**
 * Check Mermaid source against the allowlist. Pure, DOM-free, dependency-free, so
 * it runs identically in Node (validation/telemetry) and the browser (render).
 * Never throws — malformed input yields `ok: false`, not an error.
 */
export function guardMermaid(content: unknown): MermaidGuardResult {
  if (typeof content !== 'string' || content.trim() === '') {
    return { ok: false, reason: 'content missing or not a string', removed: ['shape'], code: '' };
  }

  const code = content.trim();

  // Size is checked before anything else: Mermaid's layout cost grows superlinearly
  // in node count, and layout runs on the main thread of the parent document.
  if (code.length > MAX_MERMAID_BYTES) {
    return { ok: false, reason: 'oversized', removed: ['oversized'], code: '' };
  }

  // Content rules are all evaluated (not short-circuited) so `removed` reports
  // every class that fired — a payload tripping four rules is a different signal
  // from one tripping a single rule.
  const removed: string[] = [];
  const reasons: string[] = [];

  const header = headerOf(code);
  if (!HEADER_SET.has(header)) {
    removed.push('header');
    reasons.push(header ? `unsupported diagram type: ${header}` : 'no diagram type header');
  }
  if (INIT_DIRECTIVE.test(code)) {
    removed.push('init-directive');
    reasons.push('%%{init}%% directives are not permitted');
  }
  if (CLICK_STATEMENT.test(code)) {
    removed.push('click');
    reasons.push('click/interaction statements are not permitted');
  }
  if (CONFIG_KEYWORD.test(code)) {
    removed.push('config-keyword');
    reasons.push('configuration keywords are not permitted');
  }
  if (TAG_OPEN.test(code)) {
    removed.push('tag-open');
    reasons.push('markup is not permitted in diagram source');
  }
  if (DANGEROUS_SCHEME.test(code)) {
    removed.push('scheme');
    reasons.push('script/data URI schemes are not permitted');
  }

  if (removed.length) {
    return { ok: false, reason: reasons[0], removed, code: '' };
  }

  // NOTE: classDef / style / linkStyle statements are permitted but INERT. They
  // (see also escapeLabelAngles below, which the renderer applies to `code`.)
  // make Mermaid emit a <style> block, which MermaidArtifact.tsx strips before
  // sanitizing and replaces with app-authored CSS. So author-chosen colours are
  // silently ignored by design — do NOT "fix" missing colours by re-admitting
  // <style> through the sanitizer; that would put model-influenced CSS back into
  // the frame, which is the thing this pipeline exists to prevent.
  return { ok: true, removed: [], code };
}

/**
 * Entity-escape '>' inside double-quoted labels.
 *
 * WHY THIS EXISTS — it fixes SILENT SEMANTIC CORRUPTION, not cosmetics.
 * Mermaid uses '>' as node-shape syntax (`A>text]`), so a raw '>' inside a label
 * is swallowed by its parser rather than rejected. A real generated diagram asked
 * for `B{"Return Rate > 4%?"}` and rendered "Return Rate 4%?" — a different
 * condition, displayed with no error anywhere. That is the worst possible failure
 * mode: a confidently wrong diagram.
 *
 * '&gt;' round-trips correctly (verified in a browser: raw '>' is dropped, '&gt;'
 * renders as '>', '#62;' renders literally). '<' is left alone — it already
 * renders correctly, and anything genuinely dangerous ('<' followed by a name
 * char) was refused by guardMermaid before this ever runs.
 *
 * This is a RENDERING normalization and deliberately NOT part of the guard's
 * refuse-don't-strip contract: it changes no meaning, it preserves the meaning
 * Mermaid would otherwise destroy. Run it on guard-approved source only.
 *
 * Scope is limited to double-quoted spans, where arrows never appear — so `A -->
 * B` and `U->>S: msg` pass through untouched. An unquoted label containing '>'
 * is a Mermaid syntax error, which surfaces visibly as a fallback card.
 */
export function escapeLabelAngles(code: string): string {
  return code.replace(/"([^"\n]*)"/g, (_m, inner: string) =>
    // The alternation matches an existing '&gt;' BEFORE a bare '>', so an already
    // escaped entity rewrites to itself instead of becoming '&gt&gt;'. Ordering
    // here is the whole trick — a plain />/g would double-escape.
    `"${inner.replace(/&gt;|>/g, '&gt;')}"`);
}
