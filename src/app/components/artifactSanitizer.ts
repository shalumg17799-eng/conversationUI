// Allowlist sanitizer + CSP policy for the rich-artifact node types
// ('html-artifact' / 'svg-artifact' / 'mermaid-artifact'). FRONTEND copy.
//
// This file is duplicated from backend/src/services/artifactSanitizer.ts because
// the two tsconfig roots can't share one module (same constraint documented in
// src/remotion/timing.ts). scripts/test_artifacts.ts fails the build if the
// copies drift — edit BOTH identically.
//
// Design note: this sanitizer is defence-in-depth, NOT the primary control. The
// primary control is UITreeRenderer's sandboxed, isolated-origin iframe (no
// allow-scripts => the browser refuses to execute script from any vector) plus
// the CSP below.
//
// Allowlist, not blocklist: anything not explicitly permitted is dropped.

// 'mermaid' is a rendering kind, not a payload format: by the time content reaches
// this module it is already SVG (compiled by mermaid.js in MermaidArtifact.tsx).
// It exists as a separate kind only so the wrapper document can carry the
// app-authored Mermaid stylesheet — see MERMAID_CSS in buildArtifactSrcDoc.
// The mermaid SOURCE is checked by a different module, mermaidGuard.ts.
export type ArtifactKind = 'html' | 'svg' | 'mermaid';

export const ARTIFACT_RENDER_TYPES = ['html-artifact', 'svg-artifact', 'mermaid-artifact'] as const;

export function isArtifactRenderType(t: unknown): boolean {
  return t === 'html-artifact' || t === 'svg-artifact' || t === 'mermaid-artifact';
}

export function artifactKindOf(renderType: string): ArtifactKind {
  if (renderType === 'mermaid-artifact') return 'mermaid';
  return renderType === 'svg-artifact' ? 'svg' : 'html';
}

// Hard ceiling on artifact payloads. Anything larger is refused outright (never
// sanitized, never rendered) so a giant payload can't be used as a DoS vector.
export const MAX_ARTIFACT_BYTES = 100_000;

// If sanitizing removes more than this share of the payload, the artifact is no
// longer what the model intended -> downgrade to plain text rather than render a
// gutted, misleading fragment.
export const MIN_RETENTION_RATIO = 0.6;

// CSP applied ONLY inside the artifact iframe (via a meta http-equiv in srcdoc).
// Scoped to the artifact render context; it is not a global/app-level policy.
// 'none' by default: no script, no external anything. style-src allows inline so
// the wrapper's own typography block works (author styles are stripped anyway).
export const ARTIFACT_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const HTML_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup',
  'dd', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'li', 'ol', 'p', 'pre', 'q', 's', 'small',
  'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr', 'u', 'ul',
]);

const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'rect', 'text', 'tspan', 'defs', 'lineargradient', 'radialgradient', 'stop',
  'title', 'desc', 'marker', 'symbol', 'clippath', 'mask', 'pattern',
]);

// Deliberately absent from both allowlists, and called out so a future reader
// doesn't "helpfully" add them back:
//   script, style        - direct execution / CSS exfiltration via url()
//   iframe, object, embed - nested browsing contexts
//   link, meta, base     - external loads, CSP override, base-href hijack
//   form, input, button  - credential capture
//   foreignObject        - the classic SVG-to-HTML script escape hatch
//   animate, set, animateTransform - SVG SMIL can set attributes post-parse
//   image, use           - external/xlink resource loads

const COMMON_ATTRS = new Set(['class', 'id', 'title', 'lang', 'dir', 'role']);

const HTML_ATTRS = new Set([
  'href', 'alt', 'width', 'height', 'colspan', 'rowspan', 'scope', 'span',
  'datetime', 'cite',
]);

const SVG_ATTRS = new Set([
  'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-opacity', 'fill-opacity', 'fill-rule', 'cx', 'cy',
  'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'width',
  'height', 'points', 'transform', 'viewbox', 'xmlns', 'opacity', 'font-size',
  'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'offset',
  'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform',
  'patternunits', 'clip-path', 'mask', 'marker-end', 'marker-start', 'marker-mid',
  'preserveaspectratio', 'clip-rule',
  // <marker> geometry (arrowheads on flow/topology diagrams — the primary
  // svg-artifact use case). Pure inert geometry: no URL, script or style vector.
  'markerwidth', 'markerheight', 'markerunits', 'refx', 'refy', 'orient',
  // Text layout, added for mermaid-artifact. Mermaid positions every label with
  // these; without them labels sit off their baseline. Same inert-presentation
  // test as the marker attributes above: no URL, script or style vector.
  'alignment-baseline', 'font-style', 'transform-origin',
]);

// Schemes that may appear in an href. Everything else (javascript:, data:,
// vbscript:, file:, and any unknown scheme) is dropped. External origins are
// permitted only if the caller explicitly whitelists them.
const SAFE_RELATIVE = /^(?:#|\/(?!\/)|\.{1,2}\/)/;

export interface SanitizeOptions {
  allowedOrigins?: string[];
}

export interface SanitizeResult {
  safe: string;
  removed: string[];
  originalLength: number;
  safeLength: number;
  retention: number;
  oversized: boolean;
  usable: boolean;
}

// Escape bare markup characters WITHOUT double-escaping character references the
// author already wrote. Escaping '&' unconditionally turns a legitimate '&nbsp;'
// into '&amp;nbsp;', which then renders as the literal text "&nbsp;" — the same
// for '&lt;56%' etc. So only a '&' that does not begin a well-formed reference is
// escaped. This is safe: a decoded entity is text, never re-parsed as markup, and
// entity-encoded URL schemes are still rejected by isSafeUrl's allowlist.
const BARE_AMP = /&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});)/g;

function escapeText(s: string): string {
  return s.replace(BARE_AMP, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isSafeUrl(raw: string, allowedOrigins: string[]): boolean {
  const v = raw.replace(/[\u0000-\u0020]/g, '').toLowerCase();
  if (v === '') return false;
  if (SAFE_RELATIVE.test(v)) return true;
  for (const origin of allowedOrigins) {
    if (v.startsWith(origin.toLowerCase())) return true;
  }
  return false;
}

// Attribute parser for a single tag's attribute string. Returns only the
// attributes that survive the allowlist.
function sanitizeAttrs(
  attrSrc: string,
  kind: ArtifactKind,
  allowedOrigins: string[],
  removed: string[],
): string {
  const out: string[] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrSrc)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (name.startsWith('on')) { removed.push(`attr:${name}`); continue; }
    if (name === 'style') { removed.push('attr:style'); continue; }
    if (name.startsWith('xlink:') || name === 'xmlns:xlink') { removed.push(`attr:${name}`); continue; }
    const allowed =
      COMMON_ATTRS.has(name) ||
      (kind === 'html' ? HTML_ATTRS.has(name) : SVG_ATTRS.has(name));
    if (!allowed) { removed.push(`attr:${name}`); continue; }
    if (name === 'href' || name === 'src') {
      if (!isSafeUrl(value, allowedOrigins)) { removed.push(`url:${name}`); continue; }
    }
    out.push(value === '' ? name : `${name}="${escapeText(value).replace(/"/g, '&quot;')}"`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

/**
 * Allowlist-sanitize an artifact payload. Pure, DOM-free, dependency-free, so it
 * runs identically in Node (validation/telemetry) and the browser (render).
 * Never throws — malformed input yields an empty/unusable result, not an error.
 */
export function sanitizeArtifact(
  content: unknown,
  kind: ArtifactKind,
  opts: SanitizeOptions = {},
): SanitizeResult {
  const allowedOrigins = opts.allowedOrigins ?? [];
  const src = typeof content === 'string' ? content : '';
  const originalLength = src.length;
  const removed: string[] = [];

  if (originalLength > MAX_ARTIFACT_BYTES) {
    return {
      safe: '', removed: ['oversized'], originalLength, safeLength: 0,
      retention: 0, oversized: true, usable: false,
    };
  }

  // 'mermaid' deliberately falls through to SVG_TAGS: its payload IS SVG at this
  // point, so it gets exactly the same allowlist as a hand-authored svg-artifact.
  // No Mermaid-specific element is admitted.
  const tags = kind === 'html' ? HTML_TAGS : SVG_TAGS;
  let out = '';
  let i = 0;
  const openStack: string[] = [];

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) { out += escapeText(src.slice(i)); break; }
    out += escapeText(src.slice(i, lt));

    // Comments / CDATA / doctype: drop wholesale.
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      removed.push('comment');
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      removed.push('cdata');
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) {
      const end = src.indexOf('>', lt);
      removed.push('directive');
      i = end === -1 ? src.length : end + 1;
      continue;
    }

    const gt = src.indexOf('>', lt);
    if (gt === -1) { removed.push('unterminated-tag'); break; }

    const rawTag = src.slice(lt + 1, gt);
    const isClose = rawTag.startsWith('/');
    const body = isClose ? rawTag.slice(1) : rawTag;
    const nameMatch = /^([a-zA-Z][a-zA-Z0-9:-]*)/.exec(body.trim());

    if (!nameMatch) { removed.push('malformed-tag'); i = gt + 1; continue; }
    const name = nameMatch[1].toLowerCase();
    const selfClosing = body.trimEnd().endsWith('/');

    if (!tags.has(name)) {
      // Disallowed element. For elements whose *content* is also unsafe (script,
      // style) skip the whole subtree rather than leaking the body as text.
      removed.push(`tag:${name}`);
      if (!isClose && (name === 'script' || name === 'style' || name === 'foreignobject')) {
        const closeRe = new RegExp(`</\\s*${name}\\s*>`, 'i');
        const rest = src.slice(gt + 1);
        const cm = closeRe.exec(rest);
        i = cm ? gt + 1 + cm.index + cm[0].length : src.length;
        continue;
      }
      i = gt + 1;
      continue;
    }

    if (isClose) {
      const idx = openStack.lastIndexOf(name);
      if (idx !== -1) { openStack.splice(idx, 1); out += `</${name}>`; }
      i = gt + 1;
      continue;
    }

    const attrSrc = body.slice(nameMatch[1].length).replace(/\/\s*$/, '');
    const attrs = sanitizeAttrs(attrSrc, kind, allowedOrigins, removed);
    const voidish = name === 'br' || name === 'hr' || name === 'col' ||
      name === 'path' || name === 'circle' || name === 'ellipse' ||
      name === 'line' || name === 'polyline' || name === 'polygon' ||
      name === 'rect' || name === 'stop' || name === 'use';
    if (selfClosing || voidish) {
      out += `<${name}${attrs}/>`;
    } else {
      openStack.push(name);
      out += `<${name}${attrs}>`;
    }
    i = gt + 1;
  }

  // Close anything the payload left dangling so the iframe can't inherit an
  // unbalanced tree.
  for (let k = openStack.length - 1; k >= 0; k--) out += `</${openStack[k]}>`;

  const safe = out.trim();
  const safeLength = safe.length;
  const retention = originalLength === 0 ? 0 : safeLength / originalLength;
  // `kind !== 'html'` rather than `kind === 'svg'`: a shape-only vector payload has
  // no text nodes, so without the geometry test it would be judged empty. That
  // applies to Mermaid output too (e.g. a diagram whose labels all failed to
  // survive), so both vector kinds must take this branch.
  const hasContent = safe.replace(/<[^>]*>/g, '').trim().length > 0 ||
    (kind !== 'html' && /<(path|circle|rect|line|polyline|polygon|ellipse)/i.test(safe));

  // The retention ratio does NOT gate Mermaid, and that is deliberate.
  //
  // MIN_RETENTION_RATIO exists to catch MODEL-AUTHORED markup that sanitizing
  // gutted — if 40% of an html-artifact disappears, what is left misrepresents what
  // the model meant, so we downgrade rather than show a fragment.
  //
  // A mermaid-artifact is not that. Its SVG is emitted by our own trusted renderer
  // from guarded source; nothing in it is model-authored markup. What the sanitizer
  // strips there is Mermaid's bookkeeping — `style` attributes (replaced wholesale
  // by MERMAID_CSS), `data-id`/`data-edge`/`data-look`, `aria-*`, drop-shadow
  // filters. A perfectly good diagram can be mostly bookkeeping by byte count:
  // measured across the nine committed fixtures, legitimate retention runs from
  // 0.50 to 0.96, straddling the 0.6 floor. Gating on it means a denser diagram is
  // likelier to be refused than a sparse one, which is backwards — and it produced
  // exactly that: a valid 18-node flowchart downgraded to "too much content was
  // removed" while a 5-node one rendered.
  //
  // So for Mermaid the honest question is "did a diagram survive?", answered by
  // hasContent (shapes or text present). Security is untouched: the allowlist strip
  // above already ran, and the sandbox + CSP are unchanged. `retention` is still
  // computed and reported for telemetry.
  const usable = safeLength > 0 && hasContent &&
    (kind === 'mermaid' || retention >= MIN_RETENTION_RATIO);

  return { safe, removed, originalLength, safeLength, retention, oversized: false, usable };
}

// Trusted, app-authored CSS for Mermaid's stable class names.
//
// WHY THIS EXISTS. Mermaid styles its output almost entirely through a <style>
// block inside the <svg>, not through presentation attributes. That block is
// removed twice over — MermaidArtifact.tsx strips it before sanitizing, and
// `style` is absent from SVG_TAGS anyway — so without a replacement a Mermaid
// diagram renders as unstyled black shapes. This is the replacement.
//
// It is NEVER derived from model output. Author-supplied classDef/style/linkStyle
// statements are permitted in the source but have no effect, by design: their
// only channel to the frame was the <style> block we deleted. Theming is ours,
// deterministic, and matches the app palette. ARTIFACT_CSP already allows
// style-src 'unsafe-inline' for this wrapper stylesheet, so no CSP change.
//
// Class names are version-coupled to the pinned Mermaid release. Treat an upgrade
// as a security-relevant change and re-run `npm run test:mermaid`, whose fixtures
// are version-stamped.
//
// Two properties of this stylesheet are load-bearing:
//
//   1. Every shape rule is ELEMENT-QUALIFIED (`rect.actor`, not `.actor`). Mermaid
//      reuses the same class on a container and its label, so an unqualified class
//      selector would beat the element-level text rule below and paint labels the
//      same colour as their box — invisible text.
//   2. It does NOT set font-size on `text`. Mermaid measures and positions every
//      label at render time, then relies on its stylesheet to reproduce those exact
//      sizes. Overriding them (e.g. with a `font:` shorthand) desynchronises the
//      text from the geometry that was computed for it. The LAYOUT block at the end
//      therefore mirrors Mermaid's own generated sizes and anchors verbatim.
const MERMAID_CSS = [
  'svg{font-family:ui-sans-serif,system-ui,sans-serif;font-size:16px}',
  // Node / entity / state containers.
  '.node rect,.node circle,.node ellipse,.node polygon,.node path,',
  '.classGroup rect,.statediagram-state rect,rect.entityBox,rect.actor,',
  '.mindmap-node rect,.mindmap-node circle,.mindmap-node polygon,.mindmap-node path,',
  '.timeline-node rect,.timeline-node circle',
  '{fill:#EFF6FF;stroke:#2563EB;stroke-width:1.5px}',
  '.cluster rect,rect.attributeBoxOdd,rect.attributeBoxEven,rect.labelBox,rect.note',
  '{fill:#F4F2EF;stroke:#E5E3DF;stroke-width:1px}',
  // The [*] start/end markers read as solid dots, matching Mermaid's own theme.
  '.state-start,.node circle.state-start,.state-end{fill:#1C1917;stroke:#1C1917}',
  // Edges — after nodes, deliberately: an edge is a <path>, and so are some node
  // shapes, so these must win at equal specificity.
  '.edgePath path,path.flowchart-link,path.relation,path.transition,',
  '.er.relationshipLine,line.messageLine0,line.messageLine1,line.actor-line',
  '{stroke:#8A8785;stroke-width:1.5px;fill:none}',
  'line.messageLine1{stroke-dasharray:3 3}',
  '.arrowheadPath,marker path,marker.marker path,.marker path',
  '{fill:#8A8785;stroke:#8A8785}',
  // Text colour — element-level, so the qualified shape rules above never apply.
  'text,tspan{fill:#1C1917;stroke:none}',
  '.edgeLabel rect,.edgeLabel .label-container{fill:#FFFFFF;stroke:none}',
  '.cluster text{fill:#6B6965}',
  // ── LAYOUT — mirrors Mermaid's generated rules; re-check on every upgrade ────
  // Labels carry no text-anchor attribute, so anchoring comes entirely from the
  // stylesheet we strip. Each rule below reproduces one Mermaid rule at the SAME
  // scope Mermaid applies it.
  //
  // The scoping is not incidental. Mermaid emits `.node .label text
  // {text-anchor:middle}` ONLY for flowcharts (root class "flowchart", which also
  // covers `graph`). Applying it globally left-shifts classDiagram members, which
  // UML anchors at start — observed as text hanging outside the class box.
  'svg.flowchart .node .label text,svg.flowchart .rough-node .label text',
  '{text-anchor:middle}',
  '.mindmap-node-label{text-anchor:middle;dominant-baseline:middle}',
  '.classTitleText,.flowchartTitleText,.statediagramTitleText',
  '{text-anchor:middle;font-size:18px}',
  '.classLabel .label,g.classGroup text{font-size:10px}',
  '.edgeTerminals{font-size:11px}',
].join('');

/**
 * Wrap sanitized artifact content in a full document for iframe `srcdoc`,
 * carrying the artifact-scoped CSP. The CSP is the second layer; the iframe's
 * `sandbox` attribute (set by the renderer) is the first.
 */
export function buildArtifactSrcDoc(safe: string, kind: ArtifactKind): string {
  const base = 'margin:0;padding:12px;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:#1a1a1a;background:transparent;';
  // Both vector kinds centre; only 'html' flows as a block.
  const body = kind !== 'html'
    ? `<div style="display:flex;justify-content:center">${safe}</div>`
    : safe;
  const extra = kind === 'mermaid' ? MERMAID_CSS : '';
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}">`,
    `<style>html,body{${base}}img,svg{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #E5E3DF;padding:4px 8px}${extra}</style>`,
    '</head><body>', body, '</body></html>',
  ].join('');
}
