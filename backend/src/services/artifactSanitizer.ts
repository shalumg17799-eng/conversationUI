// Allowlist sanitizer + CSP policy for the rich-artifact node types
// ('html-artifact' / 'svg-artifact'). BACKEND copy.
//
// This file is duplicated at src/app/components/artifactSanitizer.ts because the
// two tsconfig roots can't share one module (same constraint documented in
// backend/src/services/sceneTiming.ts). scripts/test_artifacts.ts fails the build
// if the copies drift — edit BOTH identically.
//
// Design note: this sanitizer is defence-in-depth, NOT the primary control. The
// primary control is the renderer's sandboxed, isolated-origin iframe (no
// allow-scripts => the browser refuses to execute script from any vector) plus
// the CSP below. The sanitizer exists so that (a) unsafe content is stripped
// before it ever reaches the client, and (b) the backend can decide to downgrade
// an artifact to plain text without a DOM.
//
// Allowlist, not blocklist: anything not explicitly permitted is dropped.

export type ArtifactKind = 'html' | 'svg';

export const ARTIFACT_RENDER_TYPES = ['html-artifact', 'svg-artifact'] as const;

export function isArtifactRenderType(t: unknown): boolean {
  return t === 'html-artifact' || t === 'svg-artifact';
}

export function artifactKindOf(renderType: string): ArtifactKind {
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
  const hasContent = safe.replace(/<[^>]*>/g, '').trim().length > 0 ||
    (kind === 'svg' && /<(path|circle|rect|line|polyline|polygon|ellipse)/i.test(safe));
  const usable = safeLength > 0 && hasContent && retention >= MIN_RETENTION_RATIO;

  return { safe, removed, originalLength, safeLength, retention, oversized: false, usable };
}

/**
 * Wrap sanitized artifact content in a full document for iframe `srcdoc`,
 * carrying the artifact-scoped CSP. The CSP is the second layer; the iframe's
 * `sandbox` attribute (set by the renderer) is the first.
 */
export function buildArtifactSrcDoc(safe: string, kind: ArtifactKind): string {
  const base = 'margin:0;padding:12px;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:#1a1a1a;background:transparent;';
  const body = kind === 'svg'
    ? `<div style="display:flex;justify-content:center">${safe}</div>`
    : safe;
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}">`,
    `<style>html,body{${base}}img,svg{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #E5E3DF;padding:4px 8px}</style>`,
    '</head><body>', body, '</body></html>',
  ].join('');
}
