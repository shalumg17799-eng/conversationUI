import Ajv, { ValidateFunction } from 'ajv';
import { modelGenerate, LLMProvider } from './llmHandler';

// ─────────────────────────────────────────────────────────────────────────────
// Adaptive UI — Requirement 5, Tasks 1 & 2
//
// This module is the single source of truth for the "Layout Directive" contract:
// the constrained, typed set of UI-personalization operations the user can drive
// with natural language ("move the right panel to the bottom", "hide the sidebar",
// "make the panel wider", "use a compact layout").
//
// It does two jobs, mirroring the governance-stack pattern used elsewhere in the
// codebase (keyword classifier > LLM proposal > deterministic fallback, then an
// Ajv schema check):
//
//   1. detectLayoutIntent(query)  — recognize a UI-personalization command DISTINCTLY
//      from data queries and report edits. This runs first in the pipeline so a
//      layout command is never misrouted into a new report or a structural edit.
//
//   2. parseLayoutDirective(...)  — turn a recognized command into one or more typed
//      LayoutDirective objects, then validate each against the constrained schema.
//      Unsupported operations are REJECTED with a clear, user-facing reason; only
//      schema-valid directives are ever emitted to the frontend.
//
// Nothing here renders anything — the frontend applies + persists valid directives.
// This module only classifies, parses, and validates.
// ─────────────────────────────────────────────────────────────────────────────

// ── The constrained allowed set ───────────────────────────────────────────────
// These enums ARE the contract. Anything outside them is rejected. Keep them small
// and deliberate — every value here must have a corresponding frontend behavior.

/** Which layout surface the operation targets. */
export const LAYOUT_TARGETS = [
  'right_panel',   // the report / preview panel (the "right panel" users refer to)
  'left_panel',    // the Talk-history secondary nav
  'nav_rail',      // the icon navigation rail
  'chat_panel',    // the main conversation column
  'header',        // the whole top bar (logo / search / persona) — dockable top or bottom
  'header_logo',   // just the "Report Hub" logo / product mark inside the header — show/hide
  'header_search', // just the global search bar inside the header — show/hide
  'mode_toggle',   // the floating Static/LLM response-mode pill — show/hide only
] as const;
export type LayoutTarget = (typeof LAYOUT_TARGETS)[number];

/** Allowed operations. */
export const LAYOUT_OPS = ['move', 'toggle', 'resize', 'density', 'reset'] as const;
export type LayoutOp = (typeof LAYOUT_OPS)[number];

/** move — where a panel is docked. */
export const LAYOUT_POSITIONS = ['left', 'right', 'top', 'bottom'] as const;
export type LayoutPosition = (typeof LAYOUT_POSITIONS)[number];

/** toggle — visibility action. */
export const LAYOUT_VISIBILITY = ['show', 'hide', 'toggle'] as const;
export type LayoutVisibility = (typeof LAYOUT_VISIBILITY)[number];

/** resize — named size steps (no free-form pixels; keeps the surface bounded). */
export const LAYOUT_SIZES = ['narrow', 'default', 'wide', 'full'] as const;
export type LayoutSize = (typeof LAYOUT_SIZES)[number];

/** density — global spacing. */
export const LAYOUT_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export type LayoutDensity = (typeof LAYOUT_DENSITIES)[number];

// Discriminated union — one directive = one atomic layout change.
export type LayoutDirective =
  | { op: 'move'; target: LayoutTarget; position: LayoutPosition }
  | { op: 'toggle'; target: LayoutTarget; visibility: LayoutVisibility }
  | { op: 'resize'; target: LayoutTarget; size: LayoutSize }
  | { op: 'density'; density: LayoutDensity }
  | { op: 'reset' }; // restore every surface to its default layout

export interface LayoutDirectiveBatch {
  directives: LayoutDirective[];
  /** One-sentence confirmation of what was applied (for the chat surface). */
  acknowledgment: string;
}

// A directive the parser produced but the schema rejected — surfaced to the user
// so unsupported requests get a clear response instead of a silent drop.
export interface RejectedDirective {
  raw: unknown;
  reason: string;
}

// ── Ajv schema (mirrors uiValidator.ts — Ajv, additive) ────────────────────────
// One schema per op, so validation errors are deterministic and precise (the op is
// already known before we validate, so there is no branch ambiguity to resolve).
const ajv = new Ajv({ allErrors: true, strict: false });

const targetEnum = { type: 'string', enum: [...LAYOUT_TARGETS] };

const OP_SCHEMAS: Record<LayoutOp, object> = {
  move: {
    type: 'object',
    properties: { op: { const: 'move' }, target: targetEnum, position: { type: 'string', enum: [...LAYOUT_POSITIONS] } },
    required: ['op', 'target', 'position'],
    additionalProperties: false,
  },
  toggle: {
    type: 'object',
    properties: { op: { const: 'toggle' }, target: targetEnum, visibility: { type: 'string', enum: [...LAYOUT_VISIBILITY] } },
    required: ['op', 'target', 'visibility'],
    additionalProperties: false,
  },
  resize: {
    type: 'object',
    properties: { op: { const: 'resize' }, target: targetEnum, size: { type: 'string', enum: [...LAYOUT_SIZES] } },
    required: ['op', 'target', 'size'],
    additionalProperties: false,
  },
  density: {
    type: 'object',
    properties: { op: { const: 'density' }, density: { type: 'string', enum: [...LAYOUT_DENSITIES] } },
    required: ['op', 'density'],
    additionalProperties: false,
  },
  reset: {
    type: 'object',
    properties: { op: { const: 'reset' } },
    required: ['op'],
    additionalProperties: false,
  },
};

const OP_VALIDATORS: Record<LayoutOp, ValidateFunction> = {
  move: ajv.compile(OP_SCHEMAS.move),
  toggle: ajv.compile(OP_SCHEMAS.toggle),
  resize: ajv.compile(OP_SCHEMAS.resize),
  density: ajv.compile(OP_SCHEMAS.density),
  reset: ajv.compile(OP_SCHEMAS.reset),
};

/**
 * Validate one directive against the constrained schema.
 * Pure; never throws. Returns a typed directive on success, or a clear reason.
 */
export function validateLayoutDirective(
  raw: unknown,
): { valid: true; directive: LayoutDirective } | { valid: false; reason: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: 'directive must be an object' };
  }
  const op = (raw as any).op;
  if (!LAYOUT_OPS.includes(op)) {
    return {
      valid: false,
      reason: `unsupported operation "${String(op)}" — allowed: ${LAYOUT_OPS.join(', ')}`,
    };
  }
  const validate = OP_VALIDATORS[op as LayoutOp];
  if (validate(raw)) {
    return { valid: true, directive: raw as LayoutDirective };
  }
  // Build a human-readable reason from the most meaningful Ajv error.
  const reason = summarizeAjvErrors(op, validate.errors ?? []);
  return { valid: false, reason };
}

function summarizeAjvErrors(op: string, errors: NonNullable<ValidateFunction['errors']>): string {
  // Priority: a bad value (enum) is more informative than a missing/extra field.
  const enumErr = errors.find(e => e.keyword === 'enum');
  if (enumErr) {
    const prop = enumErr.instancePath.replace(/^\//, '') || 'value';
    const allowed = (enumErr.params as any)?.allowedValues?.join(', ');
    return `invalid ${prop} for "${op}" — allowed: ${allowed}`;
  }
  const addlErr = errors.find(e => e.keyword === 'additionalProperties');
  if (addlErr) {
    return `"${op}" has an unsupported field "${(addlErr.params as any).additionalProperty}"`;
  }
  const reqErr = errors.find(e => e.keyword === 'required');
  if (reqErr) {
    return `"${op}" is missing required field "${(reqErr.params as any).missingProperty}"`;
  }
  return `"${op}" directive did not match the layout schema`;
}

// ── Task 1: intent recognition ────────────────────────────────────────────────
// A UI-personalization command must be recognized DISTINCTLY from:
//   - data queries      ("show me revenue by region")     → target is a metric, not a panel
//   - structural edits  ("hide the table", "remove chart") → target is a report component
//
// The discriminator: a layout command references a layout SURFACE (panel / sidebar /
// rail / layout / density) — never a metric or a report component (table/chart/kpi).
// We deliberately do NOT treat table/chart/kpi as layout targets so report edits keep
// flowing to the existing structural-edit path.

// Surface nouns that mean "a chrome/layout region", not report content.
const SURFACE_RE =
  /\b(panel|panels|sidebar|side\s?bar|side\s?panel|rail|nav(?:igation)?\s?(?:rail|bar)?|pane|layout|density|spacing|screen\s?layout|workspace|history\s?(?:panel|list|sidebar)|headers?|top\s?bar|tool\s?bar|mode\s?toggle|response\s?mode|static\s?\/?\s?llm|logo|brand(?:mark|ing)?|word\s?mark|search\s?(?:bar|box|field|input))\b/i;

// Layout action verbs. Includes bare comparatives ("wider", "smaller") so
// "make the panel wider" is recognized even with a noun between verb and adjective.
const ACTION_RE =
  /\b(move|reposition|relocate|dock|put|place|shift|send|hide|show|collapse|expand|open|close|minimi[sz]e|maximi[sz]e|resize|widen|wider|wide|narrow|narrower|shrink|shrunk|enlarge|enlarged|grow|bigger|smaller|larger|compact|comfortable|spacious|denser?|roomier|remove|get\s+rid|delete|dismiss|restore|reveal|unhide|bring\s+back)\b/i;

// Density-only phrasing that needs no surface noun.
const DENSITY_RE = /\b(compact|comfortable|spacious|densit(?:y|ies)|denser|roomier|more\s+(?:compact|spacious|dense))\b/i;

// Reset phrasing — restore every surface to its default. Recognized on its own
// (no surface noun needed): "reset the layout", "restore defaults", "undo my changes".
const RESET_RE =
  /\b(reset|restore|revert|undo)\b[\s\w]*\b(layout|ui|interface|defaults?|everything|changes|customi[sz]ations?|adaptive)\b|\breset\s+(?:the\s+)?(?:adaptive\s+)?(?:ui|layout|view)\b|\bdefault\s+layout\b|\bback\s+to\s+(?:the\s+)?defaults?\b|\bstart\s+over\b/i;

// Position phrasing ("to the bottom", "on the left").
const POSITION_RE = /\b(?:to\s+the\s+|on\s+the\s+|at\s+the\s+|move\s+.*\b)?(top|bottom|left|right)\b/i;

// Guard: report-content nouns that must NOT be treated as layout targets. If the
// query is clearly about report content and has no surface noun, it is not a layout
// command (e.g. "hide the table", "remove the revenue chart").
const REPORT_CONTENT_RE = /\b(table|chart|graph|kpi|metric|card|legend|axis|column\s+of\s+data|report|dashboard)\b/i;

export interface LayoutIntentSignal {
  isLayout: boolean;
  /** 0..1 heuristic confidence — informational only. */
  confidence: number;
  matched: string[];
}

/**
 * Fast, deterministic classifier: is this query a UI-personalization command?
 * Pure + synchronous. Deliberately conservative so it never steals a data query
 * or a report edit — it fires only when a layout SURFACE (or bare density) is named.
 */
export function detectLayoutIntent(query: string): LayoutIntentSignal {
  const q = (query ?? '').toLowerCase();
  const matched: string[] = [];

  // Reset is a standalone layout command — no surface noun required.
  if (RESET_RE.test(q)) { matched.push('reset'); return { isLayout: true, confidence: 0.9, matched }; }

  const hasSurface = SURFACE_RE.test(q);
  const hasAction = ACTION_RE.test(q);
  const hasDensity = DENSITY_RE.test(q);
  const mentionsReportContent = REPORT_CONTENT_RE.test(q) && !hasSurface;

  if (hasSurface) matched.push('surface');
  if (hasAction) matched.push('action');
  if (hasDensity) matched.push('density');

  // A report-content edit with no surface noun is NOT layout personalization.
  if (mentionsReportContent && !hasSurface && !hasDensity) {
    return { isLayout: false, confidence: 0, matched };
  }

  // Bare density command ("make it more compact", "use a spacious layout").
  if (hasDensity && !mentionsReportContent) {
    return { isLayout: true, confidence: hasSurface || hasAction ? 0.95 : 0.8, matched };
  }

  // Surface + action is the strong signal ("move the right panel to the bottom").
  if (hasSurface && hasAction) {
    return { isLayout: true, confidence: 0.95, matched };
  }

  // Surface alone with a position ("panel on the left") — still a layout command.
  if (hasSurface && POSITION_RE.test(q)) {
    matched.push('position');
    return { isLayout: true, confidence: 0.85, matched };
  }

  // Surface named with clear show/hide/close/open only.
  if (hasSurface && /\b(hide|show|close|open|collapse|expand)\b/i.test(q)) {
    return { isLayout: true, confidence: 0.85, matched };
  }

  return { isLayout: false, confidence: 0, matched };
}

// ── Task 2: parse into typed, validated directives ────────────────────────────

// Map free-text target phrases → canonical LayoutTarget.
function resolveTarget(q: string): LayoutTarget | null {
  if (/\bmode\s?toggle\b|\bresponse\s?mode\b|\bstatic\s?\/?\s?llm\b|\bllm\s?\/?\s?static\b|\b(static|llm)\s+(?:mode\s+)?(?:toggle|switch|pill)\b/i.test(q)) return 'mode_toggle';
  // Header SUB-elements must be checked before the whole header — "the logo in the
  // header" names the logo, not the bar.
  if (/\blogo\b|\bbrand(?:mark|ing)?\b|\bword\s?mark\b|\bproduct\s?mark\b|\breport\s?hub\s+(?:logo|mark|name)\b/i.test(q)) return 'header_logo';
  if (/\bsearch\s?(?:bar|box|field|input)\b|\bsearch\b(?=.*\b(?:bar|box|field|input|remove|hide|show)\b)/i.test(q)) return 'header_search';
  if (/\bheaders?\b|\btop\s?bar\b|\btool\s?bar\b/i.test(q)) return 'header';
  if (/\b(report|preview|right)\b.*\bpanel\b|\bright\s?panel\b|\breport\s?panel\b|\bpreview\s?panel\b/i.test(q)) return 'right_panel';
  if (/\b(history|talk|left)\b.*\b(panel|sidebar|list)\b|\bleft\s?panel\b|\bleft\s?sidebar\b|\bhistory\s?(panel|sidebar|list)\b/i.test(q)) return 'left_panel';
  if (/\bnav(?:igation)?\s?(?:rail|bar)?\b|\brail\b|\bicon\s?(?:rail|bar)\b/i.test(q)) return 'nav_rail';
  if (/\bchat\b|\bconversation\b|\bmain\s?(panel|area|column)\b/i.test(q)) return 'chat_panel';
  // Bare "panel"/"sidebar" defaults to the right panel — the one users reposition most.
  if (/\bside\s?bar\b|\bleft\b/i.test(q)) return 'left_panel';
  if (/\bpanel\b|\bpane\b/i.test(q)) return 'right_panel';
  return null;
}

function resolvePosition(q: string): LayoutPosition | null {
  // Prefer a position that follows a directional preposition ("to the bottom",
  // "on the left", "at the top") — this avoids picking the "right" in "right panel".
  const directed = q.match(/\b(?:to|at|on|in|into|toward|towards|dock(?:ed)?(?:\s+(?:at|to|in))?)\s+(?:the\s+)?(top|bottom|left|right)\b/i);
  if (directed) return directed[1].toLowerCase() as LayoutPosition;
  // Fall back to the LAST bare position word (target descriptors like "right panel"
  // come first; the destination usually comes last).
  const all = [...q.matchAll(/\b(top|bottom|left|right)\b/gi)];
  return all.length ? (all[all.length - 1][1].toLowerCase() as LayoutPosition) : null;
}

function resolveDensity(q: string): LayoutDensity | null {
  if (/\bcompact|denser?|tighter?\b/i.test(q)) return 'compact';
  if (/\bspacious|roomier|airy\b/i.test(q)) return 'spacious';
  if (/\bcomfortable|comfy|default\s+spacing\b/i.test(q)) return 'comfortable';
  return null;
}

/**
 * Deterministic parse for the common, unambiguous phrasings. Returns [] when it
 * cannot confidently produce a directive (caller then falls back to the LLM parse).
 */
export function deterministicParse(query: string): LayoutDirective[] {
  const q = (query ?? '').toLowerCase();
  const out: LayoutDirective[] = [];

  // reset — restore defaults; standalone, overrides everything else in the query.
  if (RESET_RE.test(q)) return [{ op: 'reset' }];

  // density — global, no target needed
  if (DENSITY_RE.test(q)) {
    const density = resolveDensity(q);
    if (density) out.push({ op: 'density', density });
  }

  const target = resolveTarget(q);

  // move — "move X to the bottom", "put the panel on the left"
  if (target && /\b(move|reposition|relocate|dock|put|place|shift|send)\b/i.test(q)) {
    const position = resolvePosition(q);
    if (position) out.push({ op: 'move', target, position });
  }

  // toggle — hide/show/collapse/expand
  if (target) {
    if (/\b(hide|collapse|close|minimi[sz]e|remove|get\s+rid\s+of|delete|dismiss)\b/i.test(q)) out.push({ op: 'toggle', target, visibility: 'hide' });
    else if (/\b(show|expand|open|reveal|maximi[sz]e|restore|unhide|bring\s+back)\b/i.test(q)) out.push({ op: 'toggle', target, visibility: 'show' });
    else if (/\btoggle\b/i.test(q)) out.push({ op: 'toggle', target, visibility: 'toggle' });
  }

  // resize — widen/narrow/wider/smaller
  if (target) {
    if (/\b(widen|wider|wide|enlarge|bigger|larger|grow|expand\s+width)\b/i.test(q)) out.push({ op: 'resize', target, size: 'wide' });
    else if (/\b(narrow|narrower|shrink|smaller|reduce\s+width)\b/i.test(q)) out.push({ op: 'resize', target, size: 'narrow' });
    else if (/\bfull\s?(width|screen)\b|\bfull\b|\bmaximi[sz]e\s+width\b/i.test(q)) out.push({ op: 'resize', target, size: 'full' });
    else if (/\b(reset|default)\s+(?:the\s+)?(?:size|width)\b/i.test(q)) out.push({ op: 'resize', target, size: 'default' });
  }

  // De-dupe (a query like "hide the panel" shouldn't emit twice).
  return dedupe(out);
}

function dedupe(directives: LayoutDirective[]): LayoutDirective[] {
  const seen = new Set<string>();
  return directives.filter(d => {
    const key = JSON.stringify(d);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const LLM_PARSE_SYSTEM = `You convert a natural-language UI-personalization command into a JSON array of layout directives.
You ONLY handle changes to the app's layout chrome — panels, sidebars, the nav rail, and spacing density.
You NEVER generate reports, answer data questions, or edit report content (tables/charts/KPIs).

Respond with JSON ONLY (no prose, no code fences): { "directives": [ ... ] }

Each directive is exactly ONE of these shapes. Do not invent fields or values.

1. Move/reposition a panel:
   { "op": "move", "target": <TARGET>, "position": "left" | "right" | "top" | "bottom" }
2. Show / hide a panel:
   { "op": "toggle", "target": <TARGET>, "visibility": "show" | "hide" | "toggle" }
3. Resize a panel:
   { "op": "resize", "target": <TARGET>, "size": "narrow" | "default" | "wide" | "full" }
4. Change spacing density (global — no target):
   { "op": "density", "density": "compact" | "comfortable" | "spacious" }
5. Reset the whole layout to defaults (no target — "reset the layout", "restore defaults",
   "undo my changes", "put everything back"):
   { "op": "reset" }

<TARGET> is one of: "right_panel" (report/preview panel), "left_panel" (talk history),
"nav_rail" (icon nav), "chat_panel" (main conversation), "header" (the WHOLE top bar),
"header_logo" (just the logo inside the header), "header_search" (just the search bar inside
the header), "mode_toggle" (the floating Static/LLM response-mode toggle — show/hide only).
If the user names an element inside the header (logo, search), target that element, not "header".

If the command asks for something outside this set, return { "directives": [] }.`;

/**
 * LLM-backed parse for phrasings the deterministic parser cannot resolve.
 * Output is validated by the caller — this only proposes.
 */
async function llmParse(query: string, provider: LLMProvider): Promise<unknown[]> {
  try {
    const raw = await modelGenerate(provider, {
      system: LLM_PARSE_SYSTEM,
      user: `Command: "${query}"`,
      temperature: 0,
      maxOutputTokens: 500,
    });
    const jsonText = extractJSON(stripThink(raw));
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed?.directives) ? parsed.directives : [];
  } catch (err) {
    console.warn('[layoutDirective] llmParse failed:', (err as Error).message);
    return [];
  }
}

// Local copies of the tiny llmHandler helpers (kept private there).
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
function extractJSON(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

export interface ParseResult {
  /** Schema-valid directives, ready to apply. */
  directives: LayoutDirective[];
  /** Proposals that failed schema validation — each with a clear reason. */
  rejected: RejectedDirective[];
  /** Which parser produced the directives. */
  source: 'deterministic' | 'llm' | 'none';
}

/**
 * Parse a recognized UI-personalization command into validated layout directives.
 *
 * Precedence mirrors the governance stack: deterministic parse first (fast, free,
 * unambiguous), LLM parse as a fallback. Every candidate — from either path — is
 * validated against the constrained schema. Unsupported operations are collected in
 * `rejected` with a clear reason rather than silently dropped.
 */
export async function parseLayoutDirective(
  query: string,
  provider: LLMProvider = 'gemma',
): Promise<ParseResult> {
  // 1. Deterministic first.
  const deterministic = deterministicParse(query);
  if (deterministic.length > 0) {
    const { directives, rejected } = partitionValid(deterministic);
    if (directives.length > 0) return { directives, rejected, source: 'deterministic' };
  }

  // 2. LLM fallback for the long tail.
  const proposals = await llmParse(query, provider);
  if (proposals.length > 0) {
    const { directives, rejected } = partitionValid(proposals);
    return { directives, rejected, source: directives.length > 0 ? 'llm' : 'none' };
  }

  return { directives: [], rejected: [], source: 'none' };
}

function partitionValid(candidates: unknown[]): { directives: LayoutDirective[]; rejected: RejectedDirective[] } {
  const directives: LayoutDirective[] = [];
  const rejected: RejectedDirective[] = [];
  for (const c of candidates) {
    const result = validateLayoutDirective(c);
    if (result.valid) directives.push(result.directive);
    else rejected.push({ raw: c, reason: result.reason });
  }
  return { directives: dedupe(directives), rejected };
}

// ── LLM-first path: classify intent AND parse in a single call ────────────────
// This is what lets novel phrasing work without a regex edit for every new verb,
// synonym, or surface ("shove the toolbar down low", "put everything on one side").
// The model is the authority on BOTH questions: is this a layout-chrome command at
// all, and if so, what are the directives. It self-gates by returning isLayout=false
// for data questions and report-content edits, so it can run on ambiguous messages
// without hijacking them.
const LLM_CLASSIFY_SYSTEM = `You are the UI-layout intent classifier + parser for a conversational analytics app.

Decide whether the user's message is a request to PERSONALIZE THE APP'S LAYOUT CHROME —
the panels, sidebars, navigation rail, header/top bar, or spacing density — as opposed to
a data question or a request to edit report CONTENT (tables, charts, KPIs, metrics, values).

Respond with JSON ONLY (no prose, no code fences): { "isLayout": true | false, "directives": [ ... ] }

- If the message is NOT about the layout chrome (it asks about data, or edits report content
  like "hide the revenue chart", "show sales by region"), return { "isLayout": false, "directives": [] }.
- If it IS a layout-chrome command, return { "isLayout": true, "directives": [ ...one per change... ] }.

Each directive is exactly ONE of these shapes. Do not invent fields or values.

1. Move/reposition a surface: { "op": "move", "target": <TARGET>, "position": "left" | "right" | "top" | "bottom" }
2. Show / hide a surface:     { "op": "toggle", "target": <TARGET>, "visibility": "show" | "hide" | "toggle" }
3. Resize a surface:          { "op": "resize", "target": <TARGET>, "size": "narrow" | "default" | "wide" | "full" }
4. Change spacing density:    { "op": "density", "density": "compact" | "comfortable" | "spacious" }
5. Reset layout to defaults:  { "op": "reset" }   // "reset the layout", "restore defaults", "undo my changes"

<TARGET> is one of: "right_panel" (the report / preview panel), "left_panel" (the Talk-history
sidebar), "nav_rail" (the icon navigation rail), "chat_panel" (the main conversation column),
"header" (the WHOLE top bar / toolbar), "header_logo" (JUST the "Report Hub" logo/wordmark
inside the header), "header_search" (JUST the global search bar inside the header),
"mode_toggle" (the floating Static/LLM response-mode toggle pill). The header only moves top
or bottom. header_logo, header_search and mode_toggle only show or hide (no move/resize).

IMPORTANT — element vs. container: if the user names a specific element INSIDE the header
(the logo, the search bar), target THAT element, NOT the whole header. "Remove the logo from
the header" means { "op": "toggle", "target": "header_logo", "visibility": "hide" } — it must
NOT hide the whole header. Only target "header" when the user means the entire bar.
"remove / get rid of / hide the Static/LLM toggle" means { "op": "toggle", "target":
"mode_toggle", "visibility": "hide" }.

Note: hiding a piece of app chrome (a toggle, a panel, the nav) IS a valid layout change —
it is not "modifying code" and you should NOT refuse it. Map the user's words to the closest
target and op by meaning, not by exact keyword. If they clearly want a layout change but it
maps to no supported op/target/value, return { "isLayout": true, "directives": [] } so the
app can tell them it is unsupported.`;

/** Loose, cheap pre-filter: could this plausibly be a layout command? Deliberately
 *  over-inclusive (favor a false positive → let the LLM decide) but rejects the bulk
 *  of pure data queries so the LLM is not called on every message. */
const MAYBE_UI_NOUN_RE =
  /\b(panel|panels|sidebar|side\s?bar|rail|nav|navigation|header|top\s?bar|tool\s?bar|toolbar|layout|screen|density|spacing|workspace|pane|chrome|column|toggle|switch|pill|button|control|response\s?mode|static\s?\/?\s?llm|logo|brand|word\s?mark|search\s?(?:bar|box|field|input))\b/i;
const MAYBE_LAYOUT_VERB_RE =
  /\b(move|reposition|relocate|dock|shift|hide|show|collapse|expand|minimi[sz]e|maximi[sz]e|resize|widen|wider|wide|narrow|shrink|enlarge|bigger|smaller|larger|compact|spacious|comfortable|denser|roomier|remove|get\s+rid|delete|dismiss)\b/i;
const MAYBE_DIRECTION_RE = /\b(top|bottom|left|right|side|up|down)\b/i;

export function mightBeLayout(query: string): boolean {
  const q = (query ?? '').toLowerCase();
  if (DENSITY_RE.test(q)) return true;
  if (MAYBE_UI_NOUN_RE.test(q)) return true;
  return MAYBE_LAYOUT_VERB_RE.test(q) && MAYBE_DIRECTION_RE.test(q);
}

/** Single Sonnet call that both classifies intent and proposes directives. */
export async function classifyLayoutIntent(
  query: string,
  provider: LLMProvider,
): Promise<{ isLayout: boolean; directives: unknown[] }> {
  try {
    const raw = await modelGenerate(provider, {
      system: LLM_CLASSIFY_SYSTEM,
      user: `Message: "${query}"`,
      temperature: 0,
      maxOutputTokens: 500,
    });
    const parsed = JSON.parse(extractJSON(stripThink(raw)));
    return {
      isLayout: parsed?.isLayout === true,
      directives: Array.isArray(parsed?.directives) ? parsed.directives : [],
    };
  } catch (err) {
    console.warn('[layoutDirective] classifyLayoutIntent failed:', (err as Error).message);
    return { isLayout: false, directives: [] };
  }
}

export interface LayoutResolution {
  isLayout: boolean;
  result: ParseResult;
}

const EMPTY_RESULT: ParseResult = { directives: [], rejected: [], source: 'none' };

/**
 * Single entry point for the pipeline. Fast-path first, LLM as the authority for
 * everything the fast-path cannot resolve:
 *
 *   1. Strict keyword gate + deterministic parse — zero latency, no LLM. Handles the
 *      common, unambiguous commands (and keeps the 37-case test surface green).
 *   2. Otherwise, a loose pre-filter: if the message could plausibly be a layout
 *      command, ask Sonnet to decide intent AND parse in one call. The model gates
 *      itself (isLayout=false ⇒ fall through to the normal pipeline).
 *   3. Otherwise, it is not a layout command and no LLM call is made.
 */
export async function resolveLayout(query: string, provider: LLMProvider = 'gemma'): Promise<LayoutResolution> {
  // 1. Confident deterministic fast-path.
  if (detectLayoutIntent(query).isLayout) {
    const result = await parseLayoutDirective(query, provider);
    return { isLayout: true, result };
  }

  // 2. Plausibly layout but not an obvious keyword match → let Sonnet decide.
  if (mightBeLayout(query)) {
    const cls = await classifyLayoutIntent(query, provider);
    if (!cls.isLayout) return { isLayout: false, result: EMPTY_RESULT };
    const { directives, rejected } = partitionValid(cls.directives);
    return { isLayout: true, result: { directives, rejected, source: directives.length ? 'llm' : 'none' } };
  }

  // 3. Not a layout command.
  return { isLayout: false, result: EMPTY_RESULT };
}

// ── User-facing acknowledgment builder ────────────────────────────────────────
const TARGET_LABEL: Record<LayoutTarget, string> = {
  right_panel: 'report panel',
  left_panel: 'history panel',
  nav_rail: 'navigation rail',
  chat_panel: 'chat panel',
  header: 'header',
  header_logo: 'logo',
  header_search: 'search bar',
  mode_toggle: 'Static/LLM toggle',
};

function describe(d: LayoutDirective): string {
  switch (d.op) {
    case 'move': return `moved the ${TARGET_LABEL[d.target]} to the ${d.position}`;
    case 'toggle': return `${d.visibility === 'hide' ? 'hid' : d.visibility === 'show' ? 'showed' : 'toggled'} the ${TARGET_LABEL[d.target]}`;
    case 'resize': return `set the ${TARGET_LABEL[d.target]} to ${d.size} width`;
    case 'density': return `switched to a ${d.density} layout`;
    case 'reset': return `reset the layout to its defaults`;
  }
}

/**
 * Build the chat-surface acknowledgment for a parse result. Confirms what was
 * applied and clearly reports anything unsupported (Task 2 acceptance criterion).
 */
export function buildAcknowledgment(result: ParseResult): string {
  const applied = result.directives.map(describe);
  const parts: string[] = [];
  if (applied.length > 0) {
    parts.push(`Done — ${joinList(applied)}.`);
  }
  if (result.rejected.length > 0) {
    const reasons = Array.from(new Set(result.rejected.map(r => r.reason)));
    parts.push(
      applied.length > 0
        ? `I couldn't apply everything: ${reasons.join('; ')}.`
        : `I can't do that — ${reasons.join('; ')}. I can move, show/hide, resize panels, or change density.`,
    );
  }
  if (parts.length === 0) {
    return `I understood that as a layout change, but couldn't map it to a supported action. I can move, show/hide, or resize the report, history, nav, or chat panels, or change the layout density.`;
  }
  return parts.join(' ');
}

function joinList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
