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

/** Allowed operations. */
export const LAYOUT_OPS = [
  'move', 'toggle', 'resize', 'density', 'style', 'reset',
  // Added in the registry refactor. Every one is bounded by its own enum below —
  // there is deliberately no op that accepts a free-form value.
  'split',       // chat <-> report ratio
  'focus',       // maximize one surface, collapse the rest
  'text_scale',  // accessibility text sizing
  'theme',       // light / dark / system
  'high_contrast',
  'preset',      // named bundle that expands to several of the above
] as const;
export type LayoutOp = (typeof LAYOUT_OPS)[number];

/** Which broad kind of surface a target is — drives grouping in the Customize menu. */
export const LAYOUT_CATEGORIES = ['panel', 'element', 'control'] as const;
export type LayoutCategory = (typeof LAYOUT_CATEGORIES)[number];

/**
 * One registered, customizable surface.
 *
 * THE REGISTRY IS THE CONTRACT. Natural language never reaches a DOM node or a CSS
 * property — it resolves to an `id` in this list, or it is refused. Adding a surface
 * here is the ONLY way to make it customizable, and every entry must have real
 * rendering behind it (see the frontend mirror in LayoutPrefsContext.tsx).
 *
 * `aliases` are what users actually say. They are matched case-insensitively on word
 * boundaries, so they need to be the natural phrasings ("profile icon", "avatar",
 * "bell"), not synonyms of the internal id.
 */
export interface LayoutTargetSpec {
  readonly id: string;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly category: LayoutCategory;
  readonly allowedOps: readonly LayoutOp[];
  readonly default: {
    readonly position: 'left' | 'right' | 'top' | 'bottom';
    readonly visible: boolean;
    readonly size: 'narrow' | 'default' | 'wide' | 'full';
  };
  /**
   * true => this surface is the user's escape hatch and can never be hidden.
   * Enforced in capabilityReason, so "hide everything" cannot lock anyone out.
   */
  readonly essential?: boolean;
}

export const LAYOUT_TARGET_REGISTRY = [
  // ── Panels — the major surfaces ────────────────────────────────────────────
  {
    id: 'right_panel', label: 'report panel', category: 'panel',
    aliases: ['report panel', 'right panel', 'preview panel', 'report', 'preview', 'side panel'],
    allowedOps: ['move', 'toggle', 'resize', 'style', 'density', 'focus', 'split'],
    default: { position: 'right', visible: true, size: 'default' },
  },
  {
    id: 'left_panel', label: 'history panel', category: 'panel',
    aliases: ['history panel', 'left panel', 'talk history', 'history', 'conversation list', 'sidebar'],
    allowedOps: ['toggle', 'resize', 'style'],
    default: { position: 'left', visible: true, size: 'default' },
  },
  {
    id: 'nav_rail', label: 'navigation rail', category: 'panel',
    aliases: ['navigation rail', 'nav rail', 'nav bar', 'icon rail', 'navigation', 'left rail'],
    allowedOps: ['toggle'],
    default: { position: 'left', visible: true, size: 'default' },
  },
  {
    id: 'chat_panel', label: 'chat panel', category: 'panel',
    aliases: ['chat panel', 'chat', 'conversation', 'workspace', 'main panel', 'talk panel'],
    allowedOps: ['toggle', 'style', 'density', 'focus', 'split'],
    default: { position: 'left', visible: true, size: 'default' },
  },
  {
    id: 'header', label: 'header', category: 'panel',
    aliases: ['header', 'top bar', 'toolbar', 'app bar', 'title bar'],
    allowedOps: ['move', 'toggle'],
    default: { position: 'top', visible: true, size: 'default' },
  },

  // ── Elements — individual controls inside the chrome ───────────────────────
  {
    id: 'header_logo', label: 'logo', category: 'element',
    aliases: ['logo', 'brand', 'product mark', 'report hub logo', 'wordmark'],
    allowedOps: ['toggle'],
    default: { position: 'left', visible: true, size: 'default' },
  },
  {
    id: 'header_search', label: 'search bar', category: 'element',
    aliases: ['search bar', 'search', 'search box', 'search field', 'global search'],
    allowedOps: ['toggle'],
    default: { position: 'top', visible: true, size: 'default' },
  },
  {
    id: 'profile', label: 'profile icon', category: 'element',
    aliases: ['profile icon', 'profile', 'avatar', 'user icon', 'account icon', 'account', 'user avatar', 'my profile'],
    allowedOps: ['toggle'],
    default: { position: 'right', visible: true, size: 'default' },
  },
  {
    id: 'notifications', label: 'notifications', category: 'element',
    aliases: ['notifications', 'notification icon', 'notification bell', 'bell', 'alerts', 'alert icon'],
    allowedOps: ['toggle'],
    default: { position: 'right', visible: true, size: 'default' },
  },
  {
    id: 'persona_selector', label: 'persona selector', category: 'element',
    aliases: ['persona selector', 'persona switcher', 'persona picker', 'persona', 'role selector', 'role switcher'],
    allowedOps: ['toggle'],
    default: { position: 'right', visible: true, size: 'default' },
  },

  // ── Controls ───────────────────────────────────────────────────────────────
  {
    id: 'mode_toggle', label: 'Static/LLM toggle', category: 'control',
    aliases: ['mode toggle', 'static llm toggle', 'llm toggle', 'response mode', 'static toggle', 'mode pill'],
    allowedOps: ['toggle'],
    default: { position: 'bottom', visible: true, size: 'default' },
  },
  {
    id: 'layout_controls', label: 'layout controls', category: 'control',
    aliases: ['layout controls', 'customize button', 'customise button', 'reset layout', 'layout button', 'customize menu'],
    // Deliberately NO 'toggle': this is the control that undoes everything else.
    // Hiding it is how a user locks themselves out of their own UI.
    allowedOps: [],
    default: { position: 'bottom', visible: true, size: 'default' },
    essential: true,
  },
] as const satisfies readonly LayoutTargetSpec[];

export type LayoutTarget = (typeof LAYOUT_TARGET_REGISTRY)[number]['id'];

/** Ordered id list — kept for the Ajv enum and for callers that just want the ids. */
export const LAYOUT_TARGETS = LAYOUT_TARGET_REGISTRY.map(t => t.id) as readonly LayoutTarget[];

export const TARGET_BY_ID: Record<LayoutTarget, LayoutTargetSpec> =
  Object.fromEntries(LAYOUT_TARGET_REGISTRY.map(t => [t.id, t])) as unknown as Record<LayoutTarget, LayoutTargetSpec>;

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

/** style — which visual property a style directive changes. */
export const LAYOUT_STYLE_PROPS = ['background', 'text'] as const;
export type LayoutStyleProp = (typeof LAYOUT_STYLE_PROPS)[number];

/** style — a bounded palette of safe named colors (no free-form hex, so a surface
 *  can never be set to an unreadable or invisible combination). "default" restores
 *  the surface's original color. */
export const LAYOUT_COLORS = ['white', 'black', 'light', 'dark', 'neutral', 'transparent', 'default'] as const;
export type LayoutColor = (typeof LAYOUT_COLORS)[number];

/** split — the REPORT panel's share of the chat/report split, as a percentage step.
 *  Strings, not numbers, so the value set stays a closed enum Ajv can police. */
export const LAYOUT_SPLITS = ['30', '50', '70'] as const;
export type LayoutSplit = (typeof LAYOUT_SPLITS)[number];

/** focus — which surface is maximized. 'none' leaves focus mode. Only the two
 *  primary work surfaces can be focused; focusing a header element is meaningless. */
export const LAYOUT_FOCUS_TARGETS = ['chat_panel', 'right_panel', 'none'] as const;
export type LayoutFocusTarget = (typeof LAYOUT_FOCUS_TARGETS)[number];

/** text_scale — accessibility text sizing. Named steps, never a px value. */
export const LAYOUT_TEXT_SCALES = ['small', 'default', 'large', 'xl'] as const;
export type LayoutTextScale = (typeof LAYOUT_TEXT_SCALES)[number];

/** theme — 'system' follows the OS setting. */
export const LAYOUT_THEMES = ['light', 'dark', 'system'] as const;
export type LayoutTheme = (typeof LAYOUT_THEMES)[number];

/** high_contrast / other on-off switches. 'toggle' flips the current value. */
export const LAYOUT_SWITCHES = ['on', 'off', 'toggle'] as const;
export type LayoutSwitch = (typeof LAYOUT_SWITCHES)[number];

/** preset — a named bundle. The expansion lives in LAYOUT_PRESETS below so chat
 *  commands and UI clicks produce byte-identical state. */
export const LAYOUT_PRESETS_IDS = ['default', 'compact', 'focus', 'presentation', 'reading', 'analyst'] as const;
export type LayoutPresetId = (typeof LAYOUT_PRESETS_IDS)[number];

/** Surfaces whose density can be set independently of the global setting. */
export const DENSITY_SCOPES = ['chat_panel', 'right_panel'] as const;
export type DensityScope = (typeof DENSITY_SCOPES)[number];

// Discriminated union — one directive = one atomic layout change.
export type LayoutDirective =
  | { op: 'move'; target: LayoutTarget; position: LayoutPosition }
  | { op: 'toggle'; target: LayoutTarget; visibility: LayoutVisibility }
  | { op: 'resize'; target: LayoutTarget; size: LayoutSize }
  // density with no target is global; with a target it scopes to that surface.
  | { op: 'density'; density: LayoutDensity; target?: DensityScope }
  | { op: 'style'; target: LayoutTarget; property: LayoutStyleProp; color: LayoutColor }
  | { op: 'split'; ratio: LayoutSplit }
  | { op: 'focus'; target: LayoutFocusTarget }
  | { op: 'text_scale'; scale: LayoutTextScale }
  | { op: 'theme'; theme: LayoutTheme }
  | { op: 'high_contrast'; value: LayoutSwitch }
  | { op: 'preset'; preset: LayoutPresetId }
  | { op: 'reset' }; // restore every surface to its default layout

/**
 * Named presets, expressed AS DIRECTIVES rather than as raw preference blobs.
 *
 * That is the important part: a preset is just a scripted sequence of the same
 * operations a user could issue by hand, so it cannot express anything the normal
 * contract forbids, and it flows through the identical validate → apply path. Adding
 * a preset can never widen the security surface.
 *
 * Every preset starts from `reset` so it is absolute, not relative to whatever the
 * user had before — "compact preset" means the same thing twice in a row.
 */
export const LAYOUT_PRESETS: Record<LayoutPresetId, LayoutDirective[]> = {
  default: [{ op: 'reset' }],
  compact: [
    { op: 'reset' },
    { op: 'density', density: 'compact' },
    { op: 'text_scale', scale: 'small' },
    { op: 'resize', target: 'left_panel', size: 'narrow' },
  ],
  focus: [
    { op: 'reset' },
    { op: 'focus', target: 'chat_panel' },
    { op: 'toggle', target: 'left_panel', visibility: 'hide' },
    { op: 'toggle', target: 'nav_rail', visibility: 'hide' },
  ],
  presentation: [
    { op: 'reset' },
    { op: 'focus', target: 'right_panel' },
    { op: 'toggle', target: 'left_panel', visibility: 'hide' },
    { op: 'toggle', target: 'nav_rail', visibility: 'hide' },
    { op: 'text_scale', scale: 'large' },
    { op: 'density', density: 'spacious' },
  ],
  reading: [
    { op: 'reset' },
    { op: 'text_scale', scale: 'large' },
    { op: 'density', density: 'spacious' },
    { op: 'toggle', target: 'header_search', visibility: 'hide' },
    { op: 'toggle', target: 'notifications', visibility: 'hide' },
  ],
  analyst: [
    { op: 'reset' },
    { op: 'split', ratio: '70' },
    { op: 'resize', target: 'right_panel', size: 'wide' },
    { op: 'density', density: 'compact', target: 'right_panel' },
  ],
};

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
    properties: {
      op: { const: 'density' },
      density: { type: 'string', enum: [...LAYOUT_DENSITIES] },
      // Optional: absent = global, present = scoped to that one surface.
      target: { type: 'string', enum: [...DENSITY_SCOPES] },
    },
    required: ['op', 'density'],
    additionalProperties: false,
  },
  split: {
    type: 'object',
    properties: { op: { const: 'split' }, ratio: { type: 'string', enum: [...LAYOUT_SPLITS] } },
    required: ['op', 'ratio'],
    additionalProperties: false,
  },
  focus: {
    type: 'object',
    properties: { op: { const: 'focus' }, target: { type: 'string', enum: [...LAYOUT_FOCUS_TARGETS] } },
    required: ['op', 'target'],
    additionalProperties: false,
  },
  text_scale: {
    type: 'object',
    properties: { op: { const: 'text_scale' }, scale: { type: 'string', enum: [...LAYOUT_TEXT_SCALES] } },
    required: ['op', 'scale'],
    additionalProperties: false,
  },
  theme: {
    type: 'object',
    properties: { op: { const: 'theme' }, theme: { type: 'string', enum: [...LAYOUT_THEMES] } },
    required: ['op', 'theme'],
    additionalProperties: false,
  },
  high_contrast: {
    type: 'object',
    properties: { op: { const: 'high_contrast' }, value: { type: 'string', enum: [...LAYOUT_SWITCHES] } },
    required: ['op', 'value'],
    additionalProperties: false,
  },
  preset: {
    type: 'object',
    properties: { op: { const: 'preset' }, preset: { type: 'string', enum: [...LAYOUT_PRESETS_IDS] } },
    required: ['op', 'preset'],
    additionalProperties: false,
  },
  style: {
    type: 'object',
    properties: {
      op: { const: 'style' },
      target: targetEnum,
      property: { type: 'string', enum: [...LAYOUT_STYLE_PROPS] },
      color: { type: 'string', enum: [...LAYOUT_COLORS] },
    },
    required: ['op', 'target', 'property', 'color'],
    additionalProperties: false,
  },
  reset: {
    type: 'object',
    properties: { op: { const: 'reset' } },
    required: ['op'],
    additionalProperties: false,
  },
};

// Compiled from the schema table itself, so adding an op to LAYOUT_OPS + OP_SCHEMAS
// is all it takes — there is no third place to forget.
const OP_VALIDATORS: Record<LayoutOp, ValidateFunction> =
  Object.fromEntries(
    LAYOUT_OPS.map(op => [op, ajv.compile(OP_SCHEMAS[op])]),
  ) as Record<LayoutOp, ValidateFunction>;

// ── Per-surface capabilities ───────────────────────────────────────────────────
// Which ops each surface ACTUALLY renders. A directive that is schema-valid but names
// an op a surface cannot perform is rejected here with a clear reason — so the chat
// never says "Done" for something that would not visibly change (the phantom-success
// bug: "move the nav rail to the right" claimed success but did nothing).
// Both maps now come straight off the registry, so a new surface cannot be half-registered.
const TARGET_OPS: Record<LayoutTarget, readonly LayoutOp[]> =
  Object.fromEntries(LAYOUT_TARGET_REGISTRY.map(t => [t.id, t.allowedOps])) as unknown as Record<LayoutTarget, readonly LayoutOp[]>;

const TARGET_LABEL_FOR_REASON: Record<LayoutTarget, string> =
  Object.fromEntries(LAYOUT_TARGET_REGISTRY.map(t => [t.id, t.label])) as unknown as Record<LayoutTarget, string>;

const OP_VERB: Partial<Record<LayoutOp, string>> = {
  toggle: 'shown/hidden', move: 'moved', resize: 'resized', style: 'restyled',
  density: 'made denser/roomier', focus: 'focused', split: 'split with the chat',
};

/** Ops that carry no `target` field at all — global switches. */
const GLOBAL_OPS: readonly LayoutOp[] = ['density', 'reset', 'split', 'text_scale', 'theme', 'high_contrast', 'preset'];

// Returns a rejection reason if the surface cannot perform this op, else null.
function capabilityReason(d: LayoutDirective): string | null {
  // 'focus' carries a target, but from its own enum (incl. 'none') rather than the
  // registry, so it is checked separately below.
  if (d.op === 'focus') {
    if (d.target === 'none') return null;
    const spec = TARGET_BY_ID[d.target as LayoutTarget];
    if (!spec?.allowedOps.includes('focus')) return `the ${spec?.label ?? d.target} cannot be focused`;
    return null;
  }
  if (d.op === 'density' && d.target) {
    const spec = TARGET_BY_ID[d.target as LayoutTarget];
    if (!spec?.allowedOps.includes('density')) {
      return `the ${spec?.label ?? d.target} does not have its own spacing setting`;
    }
    return null;
  }
  if (GLOBAL_OPS.includes(d.op)) return null; // global, no target to check

  const target = (d as { target: LayoutTarget }).target;
  const spec = TARGET_BY_ID[target];
  if (!spec) return `"${String(target)}" is not a customizable surface`;

  // ANTI-LOCKOUT. An essential surface is the user's way back — hiding it strands
  // them with no way to undo. Refused before the allowedOps check so the message is
  // specific rather than a generic capability complaint.
  if (spec.essential && d.op === 'toggle' && d.visibility !== 'show') {
    return `the ${spec.label} can't be hidden — it's how you undo layout changes`;
  }

  if (!spec.allowedOps.includes(d.op)) {
    if (spec.allowedOps.length === 0) return `the ${spec.label} can't be customized`;
    const verbs = spec.allowedOps.map(o => OP_VERB[o] ?? o);
    return `the ${spec.label} can only be ${joinList(Array.from(new Set(verbs)))} — not ${d.op}d`;
  }
  if (d.op === 'move' && target === 'header' && (d.position === 'left' || d.position === 'right')) {
    return `the header can only dock to the top or bottom, not the ${d.position}`;
  }
  return null;
}

// ── NL → registry resolution ──────────────────────────────────────────────────
// Longest alias first, so "report panel" wins over the bare alias "report" and
// "profile icon" is not shadowed by "profile".
const ALIAS_INDEX: { alias: string; id: LayoutTarget }[] = LAYOUT_TARGET_REGISTRY
  .flatMap(t => [t.label, ...t.aliases].map(a => ({ alias: a.toLowerCase(), id: t.id as LayoutTarget })))
  .sort((a, b) => b.alias.length - a.alias.length);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolve a natural-language phrase to a registered target id, or null.
 * Matching is on word boundaries so "search" does not fire inside "research".
 */
export function resolveTargetFromText(text: string): LayoutTarget | null {
  const q = text.toLowerCase();
  for (const { alias, id } of ALIAS_INDEX) {
    if (new RegExp(`\\b${escapeRe(alias)}\\b`).test(q)) return id;
  }
  return null;
}

/**
 * What to say when the user asks for something we do not register. Listing the real
 * options turns a dead end into a discoverable one — the difference between "no" and
 * "not that, but here is what I can do".
 */
export function supportedTargetsMessage(): string {
  const byCategory = (c: LayoutCategory) =>
    LAYOUT_TARGET_REGISTRY.filter(t => t.category === c && t.allowedOps.length > 0).map(t => t.label);
  return [
    "I can't customize that yet. Here's what I can change:",
    `• Panels: ${byCategory('panel').join(', ')}`,
    `• Header items: ${byCategory('element').join(', ')}`,
    `• Controls: ${byCategory('control').join(', ') || '—'}`,
    `• Global: spacing (compact/comfortable/spacious), text size, light/dark theme, high contrast, chat/report split`,
    `• Presets: ${LAYOUT_PRESETS_IDS.join(', ')}`,
  ].join('\n');
}

/**
 * Validate one directive against the constrained schema, then against what the target
 * surface can actually render. Pure; never throws.
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
    const directive = raw as LayoutDirective;
    const capReason = capabilityReason(directive);
    if (capReason) return { valid: false, reason: capReason };
    return { valid: true, directive };
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
  /\b(panel|panels|sidebar|side\s?bar|side\s?panel|rail|nav(?:igation)?\s?(?:rail|bar)?|pane|layout|density|spacing|screen\s?layout|workspace|history\s?(?:panel|list|sidebar)|headers?|top\s?bar|tool\s?bar|mode\s?toggle|response\s?mode|static\s?\/?\s?llm|logo|brand(?:mark|ing)?|word\s?mark|search\s?(?:bar|box|field|input)|chat|conversation|background|backdrop|profile|avatar|user\s?icon|account|notifications?|bell|alerts?|persona|theme|dark\s?mode|light\s?mode|contrast|text\s?size|font\s?size|split|focus|preset)\b/i;

// Layout action verbs. Includes bare comparatives ("wider", "smaller") so
// "make the panel wider" is recognized even with a noun between verb and adjective.
const ACTION_RE =
  /\b(move|reposition|relocate|dock|put|place|shift|send|hide|show|collapse|expand|open|close|minimi[sz]e|maximi[sz]e|resize|widen|wider|wide|narrow|narrower|shrink|shrunk|enlarge|enlarged|grow|bigger|smaller|larger|compact|comfortable|spacious|denser?|roomier|remove|get\s+rid|delete|dismiss|restore|reveal|unhide|bring\s+back|change|set|recolou?r|paint|colou?r)\b/i;

// Density-only phrasing that needs no surface noun.
const DENSITY_RE = /\b(compact|comfortable|spacious|densit(?:y|ies)|denser|roomier|more\s+(?:compact|spacious|dense))\b/i;

// Global-preference phrasing that needs no surface noun and often no verb either:
// theme, text size, contrast, focus, split and the named presets. Deliberately
// specific — a bare "focus" or "split" would be too broad, so each requires the
// vocabulary that actually accompanies it in a layout command.
const GLOBAL_PREF_RE = new RegExp(
  '\\b(?:' +
  'dark\\s?mode|light\\s?mode|dark\\s?theme|light\\s?theme|system\\s?theme|' +
  'high[-\\s]?contrast|' +
  '(?:text|font)\\s*(?:size|scale)?\\s*(?:bigger|larger|smaller|small|large|huge)|' +
  '(?:bigger|larger|smaller)\\s+(?:text|font)|' +
  'text\\s?size|font\\s?size|' +
  'focus\\s+(?:the\\s+)?(?:chat|report|panel)|(?:exit|leave|end)\\s+focus|focus\\s?mode|' +
  '(?:chat|report)\\s*\\/?\\s*(?:report|chat)?\\s*split|split\\s+(?:the\\s+)?(?:screen|view|layout)|' +
  '(?:' + LAYOUT_PRESETS_IDS.join('|') + ')\\s*(?:preset|mode|layout|view)|' +
  'preset' +
  ')\\b',
  'i',
);

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

  // Bare GLOBAL-PREFERENCE command. Same shape as the density clause above and for
  // the same reason: these phrasings name a setting, not a surface, and often carry
  // no action verb at all ("dark mode", "high contrast", "presentation mode").
  // Requiring surface+action sent every one of them to the data pipeline, which then
  // ran a BigQuery query for "dark mode" — observed, not hypothetical.
  if (GLOBAL_PREF_RE.test(q) && !mentionsReportContent) {
    matched.push('global-pref');
    return { isLayout: true, confidence: 0.85, matched };
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
  // Phrasings the registry aliases can't express cleanly, checked FIRST because they
  // carry negative context a plain alias match would get wrong.
  //   - "search" must not fire on "search for revenue"
  //   - header sub-elements must beat the bar itself ("the logo in the header")
  if (/\bsearch\s?(?:bar|box|field|input)\b/i.test(q)) return 'header_search';
  if (/\b(?:the\s+)?search\b(?!\s+for\b)/i.test(q)) return 'header_search';

  // Registry aliases, longest first. This is what makes a newly registered surface
  // addressable in natural language without touching the parser.
  const fromRegistry = resolveTargetFromText(q);
  if (fromRegistry) return fromRegistry;

  // Legacy phrasings kept as a safety net, plus the bare-noun defaults.
  if (/\bmode\s?toggle\b|\bresponse\s?mode\b|\bstatic\s?\/?\s?llm\b|\bllm\s?\/?\s?static\b|\b(static|llm)\s+(?:mode\s+)?(?:toggle|switch|pill)\b/i.test(q)) return 'mode_toggle';
  if (/\bbrand(?:mark|ing)?\b|\bword\s?mark\b|\bproduct\s?mark\b|\breport\s?hub\s+(?:logo|mark|name)\b/i.test(q)) return 'header_logo';
  if (/\b(report|preview|right)\b.*\bpanel\b/i.test(q)) return 'right_panel';
  if (/\b(history|talk|left)\b.*\b(panel|sidebar|list)\b/i.test(q)) return 'left_panel';
  if (/\bnav(?:igation)?\s?(?:rail|bar)?\b|\brail\b|\bicon\s?(?:rail|bar)\b/i.test(q)) return 'nav_rail';
  if (/\bmain\s?(panel|area|column)\b/i.test(q)) return 'chat_panel';
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

  // preset — a named bundle; like reset it is absolute, so it wins outright.
  //
  // Three preset names collide with ordinary op vocabulary: "compact" is a density
  // value, "focus" is an op, "default" is a size. For those the word "preset" is
  // REQUIRED, otherwise "compact layout" (a density command since day one) would be
  // silently reinterpreted as a preset — caught by the existing test.
  const AMBIGUOUS: readonly string[] = ['compact', 'focus', 'default'];
  const preset = LAYOUT_PRESETS_IDS.find(p =>
    AMBIGUOUS.includes(p)
      ? new RegExp(`\\b${p}\\b[\\s-]*preset\\b|\\bpreset\\b[\\s-]*${p}\\b`, 'i').test(q)
      : new RegExp(`\\b${p}\\b\\s*(?:preset|layout|mode|view)\\b|\\b(?:apply|switch\\s+to|use)\\s+(?:the\\s+)?${p}\\b`, 'i').test(q));
  if (preset) return [{ op: 'preset', preset }];

  const target = resolveTarget(q);

  // density — global unless the query also names a surface that has its own spacing.
  if (DENSITY_RE.test(q)) {
    const density = resolveDensity(q);
    if (density) {
      const scoped = (DENSITY_SCOPES as readonly string[]).includes(target as string)
        ? (target as DensityScope) : undefined;
      out.push(scoped ? { op: 'density', density, target: scoped } : { op: 'density', density });
    }
  }

  // theme — "dark mode", "light theme", "follow my system"
  if (/\b(dark|light|system)\s*(mode|theme)\b|\bswitch\s+to\s+(dark|light)\b/i.test(q)) {
    const theme: LayoutTheme | null =
      /\bdark\b/i.test(q) ? 'dark' : /\blight\b/i.test(q) ? 'light' : /\bsystem\b/i.test(q) ? 'system' : null;
    if (theme) out.push({ op: 'theme', theme });
  }

  // high contrast — checked before text_scale so "high contrast" isn't read as sizing.
  if (/\bhigh[-\s]?contrast\b/i.test(q)) {
    out.push({ op: 'high_contrast', value: /\b(off|disable|remove|stop|no)\b/i.test(q) ? 'off' : 'on' });
  }

  // text_scale — only when the query is explicitly about TEXT, so "make the panel
  // bigger" stays a resize rather than silently changing the font size.
  if (/\b(text|font|type|letters?)\b/i.test(q)) {
    const scale: LayoutTextScale | null =
      /\b(xl|extra\s?large|much\s+bigger|hugest?)\b/i.test(q) ? 'xl'
      : /\b(bigger|larger|large|increase|bump|grow)\b/i.test(q) ? 'large'
      : /\b(smaller|small|tiny|decrease|reduce|shrink)\b/i.test(q) ? 'small'
      : /\b(default|normal|reset)\b/i.test(q) ? 'default' : null;
    if (scale) out.push({ op: 'text_scale', scale });
  }

  // focus — "focus the report", "just show the chat", "exit focus"
  if (/\bfocus\b|\bfocus\s+mode\b|\bjust\s+(?:the\s+)?(chat|report)\b|\bonly\s+(?:the\s+)?(chat|report)\b/i.test(q)) {
    if (/\b(exit|leave|end|stop|off|un)\s*focus\b|\bfocus\s+off\b|\bshow\s+everything\b/i.test(q)) {
      out.push({ op: 'focus', target: 'none' });
    } else if (target === 'right_panel' || target === 'chat_panel') {
      out.push({ op: 'focus', target });
    }
  }

  // split — the ratio is the REPORT's share.
  if (/\bsplit\b|\bratio\b|\bside[-\s]?by[-\s]?side\b/i.test(q)) {
    const m = /\b(30|50|70)\b/.exec(q);
    if (m) out.push({ op: 'split', ratio: m[1] as LayoutSplit });
    else if (/\b(even|equal|half)\b/i.test(q)) out.push({ op: 'split', ratio: '50' });
  }

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

  // style — background / text color from the safe palette
  if (target) {
    const color = resolveColor(q);
    const isText = /\b(text|font|foreground)\b/i.test(q);
    const isBg = /\b(background|bg|backdrop|fill)\b/i.test(q);
    if (color && (isBg || isText || /\bcolou?r\b/i.test(q))) {
      out.push({ op: 'style', target, property: isText ? 'text' : 'background', color });
    }
  }

  // De-dupe (a query like "hide the panel" shouldn't emit twice).
  return dedupe(out);
}

// Map free-text color words → the bounded palette. Returns null if none named.
function resolveColor(q: string): LayoutColor | null {
  if (/\btransparent|see-through|clear\b/i.test(q)) return 'transparent';
  if (/\bwhite\b/i.test(q)) return 'white';
  if (/\bblack\b/i.test(q)) return 'black';
  if (/\b(dark|darker|charcoal)\b/i.test(q)) return 'dark';
  if (/\b(light|lighter|pale)\b/i.test(q)) return 'light';
  if (/\b(neutral|gr[ae]y|beige|cream)\b/i.test(q)) return 'neutral';
  if (/\b(default|original|reset)\s+(colou?r|background)\b/i.test(q)) return 'default';
  return null;
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
5. Recolor a surface (background or text) from a bounded palette:
   { "op": "style", "target": <TARGET>, "property": "background" | "text",
     "color": "white" | "black" | "light" | "dark" | "neutral" | "transparent" | "default" }
   Only "right_panel", "left_panel", "chat_panel" support style. Map an arbitrary color
   the user names to the CLOSEST palette value (e.g. "grey"→"neutral"); "default" restores
   the original. There is no free-form hex — if no palette value fits, omit the directive.
6. Reset the whole layout to defaults (no target — "reset the layout", "restore defaults",
   "undo my changes", "put everything back"):
   { "op": "reset" }
7. Spacing for ONE surface only ("make the chat spacious", "compact report panel"):
   { "op": "density", "density": "compact" | "comfortable" | "spacious",
     "target": ${DENSITY_SCOPES.map(s => `"${s}"`).join(' | ')} }
8. Chat/report split — the number is the REPORT's share ("give the report more room" → "70"):
   { "op": "split", "ratio": ${LAYOUT_SPLITS.map(s => `"${s}"`).join(' | ')} }
9. Focus one surface and collapse the rest ("focus the report", "just the chat");
   "none" leaves focus mode ("exit focus", "show everything again"):
   { "op": "focus", "target": ${LAYOUT_FOCUS_TARGETS.map(s => `"${s}"`).join(' | ')} }
10. Text size ("make the text bigger", "smaller font"):
   { "op": "text_scale", "scale": ${LAYOUT_TEXT_SCALES.map(s => `"${s}"`).join(' | ')} }
11. Theme ("dark mode", "light theme", "follow my system"):
   { "op": "theme", "theme": ${LAYOUT_THEMES.map(s => `"${s}"`).join(' | ')} }
12. High contrast ("high contrast", "turn off high contrast"):
   { "op": "high_contrast", "value": ${LAYOUT_SWITCHES.map(s => `"${s}"`).join(' | ')} }
13. A named preset ("compact preset", "presentation mode", "reading layout"):
   { "op": "preset", "preset": ${LAYOUT_PRESETS_IDS.map(s => `"${s}"`).join(' | ')} }

<TARGET> is one of:
${LAYOUT_TARGET_REGISTRY.filter(t => t.allowedOps.length > 0)
  .map(t => `  "${t.id}" — ${t.label} (also called: ${t.aliases.slice(0, 3).join(', ')}); supports: ${t.allowedOps.join(', ')}`)
  .join('\n')}

Name the most SPECIFIC surface the user meant: an element inside the header (logo, search,
profile, notifications, persona selector) targets that element, not "header".
Never emit a target that is not in the list above, and never emit an op a target does not support.

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
5. Recolor a surface:         { "op": "style", "target": <TARGET>, "property": "background" | "text", "color": "white" | "black" | "light" | "dark" | "neutral" | "transparent" | "default" }
   (only right_panel / left_panel / chat_panel; map arbitrary colors to the closest value; no hex)
6. Reset layout to defaults:  { "op": "reset" }   // "reset the layout", "restore defaults", "undo my changes"

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
  /\b(panel|panels|sidebar|side\s?bar|rail|nav|navigation|header|top\s?bar|tool\s?bar|toolbar|layout|screen|density|spacing|workspace|pane|chrome|column|toggle|switch|pill|button|control|response\s?mode|static\s?\/?\s?llm|logo|brand|word\s?mark|search\s?(?:bar|box|field|input)|chat|conversation|background|backdrop)\b/i;
const MAYBE_LAYOUT_VERB_RE =
  /\b(move|reposition|relocate|dock|shift|hide|show|collapse|expand|minimi[sz]e|maximi[sz]e|resize|widen|wider|wide|narrow|shrink|enlarge|bigger|smaller|larger|compact|spacious|comfortable|denser|roomier|remove|get\s+rid|delete|dismiss|recolou?r|paint|colou?r)\b/i;
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
// Labels come from the registry — one place to rename a surface.
const TARGET_LABEL: Record<LayoutTarget, string> = TARGET_LABEL_FOR_REASON;

function describe(d: LayoutDirective): string {
  switch (d.op) {
    case 'move': return `moved the ${TARGET_LABEL[d.target]} to the ${d.position}`;
    case 'toggle': return `${d.visibility === 'hide' ? 'hid' : d.visibility === 'show' ? 'showed' : 'toggled'} the ${TARGET_LABEL[d.target]}`;
    case 'resize': return `set the ${TARGET_LABEL[d.target]} to ${d.size} width`;
    case 'density': return d.target
      ? `made the ${TARGET_LABEL[d.target as LayoutTarget]} ${d.density}`
      : `switched to a ${d.density} layout`;
    case 'style': return d.color === 'default'
      ? `restored the ${TARGET_LABEL[d.target]} ${d.property === 'text' ? 'text color' : 'background'}`
      : `set the ${TARGET_LABEL[d.target]} ${d.property === 'text' ? 'text' : 'background'} to ${d.color}`;
    case 'split': return `set the chat/report split to ${100 - Number(d.ratio)}/${d.ratio}`;
    case 'focus': return d.target === 'none'
      ? 'left focus mode'
      : `focused the ${TARGET_LABEL[d.target as LayoutTarget]}`;
    case 'text_scale': return d.scale === 'default'
      ? 'restored the default text size'
      : `set the text size to ${d.scale}`;
    case 'theme': return `switched to the ${d.theme} theme`;
    case 'high_contrast': return `${d.value === 'off' ? 'turned off' : d.value === 'on' ? 'turned on' : 'toggled'} high contrast`;
    case 'preset': return `applied the ${d.preset} preset`;
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
