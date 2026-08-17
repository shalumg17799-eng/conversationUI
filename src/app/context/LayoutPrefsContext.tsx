// Adaptive UI (Requirement 5) — frontend preference store.
//
// Receives typed Layout Directives (produced + schema-validated by the backend
// intent layer, see backend/src/services/layoutDirective.ts) and reduces them into
// persisted UI-personalization state. The backend guarantees only valid directives
// reach here; this store applies them and remembers them across sessions.
//
// Scope note: the backend recognizes five targets (right_panel, left_panel, nav_rail,
// chat_panel, header) and four ops (move, toggle, resize, density). This store holds state
// for all of them and every surface is now rendered:
//   • right_panel — move (right/left/top/bottom), resize, show/hide (Conversational page)
//   • left_panel  — resize + show/hide, with left-edge reflow of the chat column
//   • nav_rail    — show/hide (shared Layout shell), content shifts left when hidden
//   • chat_panel  — show/hide
//   • header      — move (top/bottom) + show/hide (shared Layout shell); content reflows
//                   its top/bottom edge to follow the bar
//   • header_logo — show/hide JUST the "Report Hub" logo inside the header
//   • header_search — show/hide JUST the global search bar inside the header
//   • mode_toggle — show/hide the floating Static/LLM response-mode pill
//   • style       — background/text recolor (bounded palette) for right/left/chat panels
//   • density     — global, reflected on <html data-density> for any surface to read
// Repositioning (move) of nav_rail / left_panel / chat_panel is intentionally a no-op —
// they stay docked; the report panel repositions freely and the header docks top/bottom.

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';

// ── Directive contract (mirrors the backend schema) ───────────────────────────
// MIRROR OF backend/src/services/layoutDirective.ts. The two tsconfig roots cannot
// share a module, so this is a hand-kept copy — scripts/test_layout.ts reads this file
// and fails the build if a registered target is missing here, which is what stops the
// two halves drifting silently.
export type LayoutTarget =
  | 'right_panel' | 'left_panel' | 'nav_rail' | 'chat_panel' | 'header'
  | 'header_logo' | 'header_search' | 'profile' | 'notifications' | 'persona_selector'
  | 'mode_toggle' | 'layout_controls';
export type LayoutPosition = 'left' | 'right' | 'top' | 'bottom';
export type LayoutVisibility = 'show' | 'hide' | 'toggle';
export type LayoutSize = 'narrow' | 'default' | 'wide' | 'full';
export type LayoutDensity = 'compact' | 'comfortable' | 'spacious';
export type LayoutStyleProp = 'background' | 'text';
export type LayoutColor = 'white' | 'black' | 'light' | 'dark' | 'neutral' | 'transparent' | 'default';
export type LayoutSplit = '30' | '50' | '70';
export type LayoutFocusTarget = 'chat_panel' | 'right_panel' | 'none';
export type LayoutTextScale = 'small' | 'default' | 'large' | 'xl';
export type LayoutTheme = 'light' | 'dark' | 'system';
export type LayoutSwitch = 'on' | 'off' | 'toggle';
export type LayoutPresetId = 'default' | 'compact' | 'focus' | 'presentation' | 'reading' | 'analyst';
export type DensityScope = 'chat_panel' | 'right_panel';

export type LayoutDirective =
  | { op: 'move'; target: LayoutTarget; position: LayoutPosition }
  | { op: 'toggle'; target: LayoutTarget; visibility: LayoutVisibility }
  | { op: 'resize'; target: LayoutTarget; size: LayoutSize }
  | { op: 'density'; density: LayoutDensity; target?: DensityScope }
  | { op: 'style'; target: LayoutTarget; property: LayoutStyleProp; color: LayoutColor }
  | { op: 'split'; ratio: LayoutSplit }
  | { op: 'focus'; target: LayoutFocusTarget }
  | { op: 'text_scale'; scale: LayoutTextScale }
  | { op: 'theme'; theme: LayoutTheme }
  | { op: 'high_contrast'; value: LayoutSwitch }
  | { op: 'preset'; preset: LayoutPresetId }
  | { op: 'reset' };

/** Surfaces that can never be hidden — the user's way back. Mirrors `essential`. */
export const ESSENTIAL_TARGETS: readonly LayoutTarget[] = ['layout_controls'];

/**
 * Where each registered target is actually RENDERED.
 *
 * The failure this exists to prevent: a surface gets added to the backend registry, so
 * natural language resolves it, Ajv validates it and the server persists it — and
 * nothing on screen ever reads the flag. The user is told "Done", the state really did
 * change, and visibly nothing happens. That is worse than a refusal, because it is
 * indistinguishable from a rendering bug.
 *
 * This map is checked twice:
 *   • at dev runtime below — every target in DEFAULT_PREFS must have an entry;
 *   • in scripts/test_layout.ts — the named file must genuinely reference the target,
 *     so an entry here cannot be a lie.
 */
export const RENDER_BINDINGS: Record<LayoutTarget, string> = {
  // Geometry surfaces — owned by computeTalkLayout in this file.
  right_panel: 'src/app/context/LayoutPrefsContext.tsx',
  left_panel: 'src/app/context/LayoutPrefsContext.tsx',
  chat_panel: 'src/app/pages/Conversational_new.tsx',
  // Chrome surfaces — owned by the shared shell.
  nav_rail: 'src/app/components/ui/Layout.tsx',
  header: 'src/app/components/ui/Layout.tsx',
  header_logo: 'src/app/components/ui/Layout.tsx',
  header_search: 'src/app/components/ui/Layout.tsx',
  profile: 'src/app/components/ui/Layout.tsx',
  notifications: 'src/app/components/ui/Layout.tsx',
  persona_selector: 'src/app/components/ui/Layout.tsx',
  mode_toggle: 'src/app/components/ui/Layout.tsx',
  // Moved out of the shell when the controls were extracted — the binding check
  // caught the stale entry, which is the point of verifying it against the source.
  layout_controls: 'src/app/components/LayoutControls.tsx',
};

// (The dev-time assertion lives below DEFAULT_PREFS — it reads it, and a const in the
//  temporal dead zone would throw at module load.)

// Preset bundles, expressed as directives so a preset can never do anything a user
// could not do by hand. MUST match LAYOUT_PRESETS in layoutDirective.ts.
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

// Bounded palette → CSS. Keeps recoloring safe (no unreadable states). "default"
// clears the override so the surface falls back to its stylesheet color.
const BG_CSS: Record<LayoutColor, string | undefined> = {
  white: '#FFFFFF', black: '#1A1917', light: '#F7F6F3', dark: '#26241F',
  neutral: '#EDEAE5', transparent: 'transparent', default: undefined,
};
const TEXT_CSS: Record<LayoutColor, string | undefined> = {
  white: '#FFFFFF', black: '#1A1917', light: '#6B6965', dark: '#1A1917',
  neutral: '#6B6965', transparent: 'transparent', default: undefined,
};
export function colorToCss(color: LayoutColor | undefined, kind: LayoutStyleProp): string | undefined {
  if (!color) return undefined;
  return (kind === 'text' ? TEXT_CSS : BG_CSS)[color];
}

// ── Persisted state ────────────────────────────────────────────────────────────
interface PanelPrefs {
  position: LayoutPosition;
  visible: boolean;
  size: LayoutSize;
  /** Adaptive UI style overrides (undefined = use the stylesheet default). */
  background?: LayoutColor;
  text?: LayoutColor;
}

export interface LayoutPrefs {
  panels: Record<LayoutTarget, PanelPrefs>;
  density: LayoutDensity;
  split: LayoutSplit;
  focus: LayoutFocusTarget;
  textScale: LayoutTextScale;
  theme: LayoutTheme;
  highContrast: boolean;
}

// MUST match DEFAULT_PREFS in backend/src/services/layoutPrefsStore.ts, which derives
// it from the target registry. scripts/test_layout.ts enforces target coverage.
export const DEFAULT_PREFS: LayoutPrefs = {
  panels: {
    right_panel: { position: 'right', visible: true, size: 'default' },
    left_panel: { position: 'left', visible: true, size: 'default' },
    nav_rail: { position: 'left', visible: true, size: 'default' },
    chat_panel: { position: 'left', visible: true, size: 'default' },
    header: { position: 'top', visible: true, size: 'default' },
    header_logo: { position: 'left', visible: true, size: 'default' },
    header_search: { position: 'top', visible: true, size: 'default' },
    profile: { position: 'right', visible: true, size: 'default' },
    notifications: { position: 'right', visible: true, size: 'default' },
    persona_selector: { position: 'right', visible: true, size: 'default' },
    mode_toggle: { position: 'bottom', visible: true, size: 'default' },
    layout_controls: { position: 'bottom', visible: true, size: 'default' },
  },
  density: 'comfortable',
  split: '50',
  focus: 'none',
  textScale: 'default',
  theme: 'system',
  highContrast: false,
};

// Dev-time assertion. Cheap, runs once at module load, stripped from prod builds.
if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) {
  const unbound = (Object.keys(DEFAULT_PREFS.panels) as LayoutTarget[])
    .filter(t => !RENDER_BINDINGS[t]);
  if (unbound.length) {
    console.error(
      `[Adaptive UI] Registered but with no render binding: ${unbound.join(', ')}.\n` +
      `These will parse, validate and persist, but changing them does nothing on screen.\n` +
      `Add the render site to RENDER_BINDINGS in LayoutPrefsContext.tsx (and actually render it).`,
    );
  }
}

const STORAGE_KEY = 'layout_prefs_v1';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
/** Long enough to coalesce a preset's burst of directives, short enough to feel saved. */
const SAVE_DEBOUNCE_MS = 600;

/** The layout-prefs identity, written at login. null => not signed in, cache only. */
function layoutUserId(): string | null {
  try { return localStorage.getItem('auth_user_id') || null; } catch { return null; }
}

/**
 * Strip the session-only fields before anything is written down.
 *
 * `focus` is a momentary mode (like maximizing a window), not a preference: it
 * collapses every surface but one, so persisting it means the next login lands on a
 * screen with no composer. It stays in `prefs` so directives from chat and from the
 * UI still flow through the one reducer — it is simply excluded at the storage
 * boundary, both localStorage and the server.
 */
function persistable(prefs: LayoutPrefs): LayoutPrefs {
  return { ...prefs, focus: 'none' };
}

/** Fire-and-forget write-back. Failures are non-fatal — the cache still holds. */
async function pushPrefs(userId: string, prefs: LayoutPrefs): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/layout-prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ prefs: persistable(prefs) }),
    });
  } catch { /* offline — localStorage keeps it until the next successful write */ }
}

function loadPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return mergePrefs(parsed);
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Merge an arbitrary stored/server blob onto the defaults.
 *
 * Written as a loop over DEFAULT_PREFS.panels rather than a hand-listed object so
 * adding a target to the contract cannot leave a hole here — the previous hand-listed
 * version is exactly the kind of place a new surface gets forgotten.
 */
export function mergePrefs(parsed: any): LayoutPrefs {
  const panels = {} as Record<LayoutTarget, PanelPrefs>;
  for (const key of Object.keys(DEFAULT_PREFS.panels) as LayoutTarget[]) {
    panels[key] = { ...DEFAULT_PREFS.panels[key], ...(parsed?.panels?.[key] ?? {}) };
    // ANTI-LOCKOUT: an essential surface is forced visible however it was stored.
    if (ESSENTIAL_TARGETS.includes(key)) panels[key].visible = true;
  }
  return {
    panels,
    density: parsed?.density ?? DEFAULT_PREFS.density,
    split: parsed?.split ?? DEFAULT_PREFS.split,
    // Always 'none' on load, whatever the blob says. persistable() strips focus on
    // write, but a blob stored before that rule existed can still carry one, and the
    // whole point is that a session never STARTS focused.
    focus: 'none',
    textScale: parsed?.textScale ?? DEFAULT_PREFS.textScale,
    theme: parsed?.theme ?? DEFAULT_PREFS.theme,
    highContrast: typeof parsed?.highContrast === 'boolean' ? parsed.highContrast : DEFAULT_PREFS.highContrast,
  };
}

// ── Chrome (header) offsets ───────────────────────────────────────────────────
// The top bar is 52px. It docks top (default) or bottom, or hides. Everything that
// was pinned to the top edge reads these so it reflows around the bar wherever it is.
export const HEADER_HEIGHT = 52;
export interface ChromeOffsets { top: number; bottom: number; headerBottom: boolean; }
export function chromeOffsets(prefs: LayoutPrefs): ChromeOffsets {
  const h = prefs.panels.header;
  if (!h.visible) return { top: 0, bottom: 0, headerBottom: false };
  return h.position === 'bottom'
    ? { top: 0, bottom: HEADER_HEIGHT, headerBottom: true }
    : { top: HEADER_HEIGHT, bottom: 0, headerBottom: false };
}

// ── Pure reducer: apply one directive to prefs ────────────────────────────────
export function applyDirective(prefs: LayoutPrefs, d: LayoutDirective): LayoutPrefs {
  switch (d.op) {
    case 'reset':
      return DEFAULT_PREFS;
    case 'preset':
      // A preset is just a scripted sequence of ordinary directives, replayed through
      // this same reducer. That is what keeps chat commands, UI clicks and presets on
      // one code path — there is no second way to mutate prefs.
      return (LAYOUT_PRESETS[d.preset] ?? []).reduce(applyDirective, prefs);
    case 'density':
      // No target = global; with a target it scopes to that one surface.
      return d.target
        ? updatePanel(prefs, d.target, p => ({ ...p, density: d.density }))
        : { ...prefs, density: d.density };
    case 'split':
      return { ...prefs, split: d.ratio };
    case 'focus':
      return { ...prefs, focus: d.target };
    case 'text_scale':
      return { ...prefs, textScale: d.scale };
    case 'theme':
      return { ...prefs, theme: d.theme };
    case 'high_contrast':
      return {
        ...prefs,
        highContrast: d.value === 'on' ? true : d.value === 'off' ? false : !prefs.highContrast,
      };
    case 'move':
      return updatePanel(prefs, d.target, p => ({ ...p, position: d.position, visible: true }));
    case 'resize':
      return updatePanel(prefs, d.target, p => ({ ...p, size: d.size, visible: true }));
    case 'style':
      return updatePanel(prefs, d.target, p => ({
        ...p,
        // "default" clears the override.
        [d.property]: d.color === 'default' ? undefined : d.color,
      }));
    case 'toggle':
      // ANTI-LOCKOUT, final line of defence. The backend refuses this directive and
      // the UI never offers it, but the reducer is the one place EVERY path converges,
      // so the invariant is asserted here too rather than assumed upstream.
      if (ESSENTIAL_TARGETS.includes(d.target) && d.visibility !== 'show') return prefs;
      return updatePanel(prefs, d.target, p => ({
        ...p,
        visible: d.visibility === 'show' ? true : d.visibility === 'hide' ? false : !p.visible,
      }));
    default:
      return prefs;
  }
}

function updatePanel(prefs: LayoutPrefs, target: LayoutTarget, fn: (p: PanelPrefs) => PanelPrefs): LayoutPrefs {
  return { ...prefs, panels: { ...prefs.panels, [target]: fn(prefs.panels[target]) } };
}

// ── Layout engine: prefs → concrete geometry ──────────────────────────────────
// THE single source of truth for Talk surface geometry. Every fixed-position
// surface on the page — nav rail, Talk history, chat workspace, report panel,
// dataset panel — takes its box from this one function.
//
// That is not a style preference, it is the correctness requirement. These
// surfaces are all `position: fixed`, so each one's box is computed, not laid
// out by flow: nothing pushes anything. If two of them derive their edges from
// different arithmetic, a directive moves one and not the other, and the result
// is a gap or an overlap — the "changes partially" failure. The page previously
// ran two engines with different constants (one size-aware for the history
// panel, one hardcoded at 240; one header-aware, one pinned to a 52px top), and
// the workspace reflowed only for a right-docked panel, so "move the report
// panel to the bottom" dropped the panel on top of the chat.
//
// Adding a surface? Return its box from here. Do not compute one at the call site.
export const RAIL_W = 64;      // icon nav rail width
export const DATASET_W = 480;  // dataset details panel (fixed, not personalizable)
const REPORT_HEIGHT = '46vh';  // height of a top/bottom-docked report panel
// Personalizable widths. resize directives ("make the panel wider") index these.
export const HISTORY_WIDTHS: Record<LayoutSize, number> = { narrow: 200, default: 240, wide: 320, full: 400 };
export const REPORT_WIDTHS: Record<LayoutSize, number> = { narrow: 380, default: 480, wide: 640, full: 760 };

export interface TalkLayout {
  navRailVisible: boolean;
  historyVisible: boolean;
  chatPanelVisible: boolean;
  historyStyle: React.CSSProperties;
  workspaceStyle: React.CSSProperties;
  datasetPanelStyle: React.CSSProperties;
  reportPanel: { className: string; style: React.CSSProperties };
  reportDock: LayoutPosition;
  reportVisible: boolean;
}

export function computeTalkLayout(
  prefs: LayoutPrefs,
  ctx: { reportPanelActive: boolean; datasetPanelActive: boolean },
): TalkLayout {
  // Header offsets come from chromeOffsets so a hidden or bottom-docked header
  // reflows every surface at once, instead of only the ones that remembered to ask.
  const chrome = chromeOffsets(prefs);
  const rp = prefs.panels.right_panel;
  const dock = rp.position;

  // ── focus: maximize one surface, collapse the rest ────────────────────────
  // Applied HERE rather than by mutating prefs, so focus is a VIEW of the saved
  // layout, not a destructive edit of it. Leaving focus mode restores exactly what
  // the user had — no need to remember and replay their previous visibility.
  const focus = prefs.focus;
  const focusChat = focus === 'chat_panel';
  const focusReport = focus === 'right_panel';

  const navRailVisible = prefs.panels.nav_rail.visible && focus === 'none';
  const historyVisible = prefs.panels.left_panel.visible && focus === 'none';
  // Focusing the chat collapses the report even when a report is open, and vice versa.
  const reportVisible = focusChat ? false : (ctx.reportPanelActive && rp.visible) || focusReport;

  const railW = navRailVisible ? RAIL_W : 0;
  const histW = historyVisible ? (HISTORY_WIDTHS[prefs.panels.left_panel.size] ?? HISTORY_WIDTHS.default) : 0;

  // ── split: the report's share of the chat/report row ──────────────────────
  // Only meaningful for a side dock — a top/bottom-docked report is a horizontal
  // band whose height is REPORT_HEIGHT, and a ratio there would fight that.
  // Expressed as a percentage of the space left after the rail/history, so the
  // chat and report always tile it exactly with no gap.
  const sideDock = dock === 'left' || dock === 'right';
  const baseLeft = railW + histW;         // where workspace content starts
  const datasetW = ctx.datasetPanelActive ? DATASET_W : 0;
  const px = (n: number) => `${n}px`;

  // ── The report's occupied width, as ONE css length ────────────────────────
  // Everything downstream (workspace inset AND panel width) derives from this
  // single expression, which is what guarantees the two abut exactly. Three cases:
  //
  //   focus=right_panel → the report takes the whole row after the rail/history
  //   split ≠ 50        → a percentage of that row, so chat and report tile it
  //   otherwise         → the named REPORT_WIDTHS step (the pre-existing behaviour)
  //
  // Percentages are of the ROW, not the viewport, so the rail and history are
  // subtracted first — a 70% report means 70% of the space actually available.
  const rowMinus = `${px(baseLeft)} + ${px(datasetW)}`;
  const namedReportW = REPORT_WIDTHS[rp.size] ?? REPORT_WIDTHS.default;
  const reportExtent: string =
    focusReport ? `calc(100% - ${rowMinus})`
    : (sideDock && prefs.split !== '50') ? `calc((100% - ${rowMinus}) * ${Number(prefs.split) / 100})`
    : px(namedReportW);

  // Workspace insets: start from the base frame, then carve out room on whichever
  // edge the report panel docks. The dataset panel always holds the right edge, so
  // a right-docked report stacks inboard of it rather than underneath it.
  let left: string = px(baseLeft);
  let right: string = px(datasetW);
  let top = px(chrome.top);
  let bottom = px(chrome.bottom);
  if (reportVisible) {
    if (dock === 'right') right = `calc(${px(datasetW)} + ${reportExtent})`;
    else if (dock === 'left') left = `calc(${px(baseLeft)} + ${reportExtent})`;
    else if (dock === 'top') top = `calc(${px(chrome.top)} + ${REPORT_HEIGHT})`;
    else if (dock === 'bottom') bottom = `calc(${px(chrome.bottom)} + ${REPORT_HEIGHT})`;
  }

  const workspaceStyle: React.CSSProperties = {
    position: 'fixed', left, right, top, bottom, overflow: 'hidden',
    // Focusing the report collapses the chat to nothing. `display:none` rather than a
    // zero-width box so its content can't produce a scrollbar or steal a tab stop.
    ...(focusReport ? { display: 'none' } : null),
  };

  // Report panel geometry — same frame as the workspace, so the two abut exactly.
  const panelBase = 'fixed bg-white z-30 flex flex-col shadow-xl transition-all duration-300';
  let reportPanel: { className: string; style: React.CSSProperties };
  switch (dock) {
    case 'bottom':
      reportPanel = {
        className: `${panelBase} border-t border-[var(--border)]`,
        style: { left: px(baseLeft), right: px(datasetW), bottom: px(chrome.bottom), height: REPORT_HEIGHT },
      };
      break;
    case 'top':
      reportPanel = {
        className: `${panelBase} border-b border-[var(--border)]`,
        style: { left: px(baseLeft), right: px(datasetW), top: px(chrome.top), height: REPORT_HEIGHT },
      };
      break;
    case 'left':
      reportPanel = {
        className: `${panelBase} border-r border-[var(--border)]`,
        style: { left: px(baseLeft), top: px(chrome.top), bottom: px(chrome.bottom), width: reportExtent },
      };
      break;
    case 'right':
    default:
      reportPanel = {
        className: `${panelBase} border-l border-[var(--border)]`,
        style: { right: px(datasetW), top: px(chrome.top), bottom: px(chrome.bottom), width: reportExtent },
      };
      break;
  }

  // ── ANTI-LOCKOUT, as a RENDER invariant ───────────────────────────────────
  // The parse layer refuses lockout directives and the store coerces them, but this
  // is the last gate before pixels and the only one a stale localStorage blob, a
  // hand-edited store file or a future code path cannot route around.
  //
  // "Locked out" = no primary work surface on screen. With the chat hidden AND the
  // report either hidden or inapplicable, the user faces an empty frame; if the
  // header and rail are hidden too there is nothing left to click. So the chat is
  // forced back rather than trusted.
  const chatPanelVisible = focusReport
    ? false                                    // deliberate: the report IS the surface
    : prefs.panels.chat_panel.visible || !reportVisible;

  return {
    navRailVisible,
    historyVisible,
    chatPanelVisible,
    historyStyle: {
      position: 'fixed', left: px(railW), width: px(histW),
      top: px(chrome.top), bottom: px(chrome.bottom),
    },
    workspaceStyle,
    datasetPanelStyle: {
      position: 'fixed', right: 0, width: px(DATASET_W),
      top: px(chrome.top), bottom: px(chrome.bottom),
    },
    reportPanel,
    reportDock: dock,
    reportVisible,
  };
}

// Adaptive UI: style for the report while it renders INLINE in the chat stream
// (i.e. not docked into the movable panel). Carries the right_panel recolor +
// visibility so "make the report dark" / "hide the report" still act on the
// answer the user is looking at even when no side panel is open.
export interface InlineReportStyle {
  visible: boolean;
  styled: boolean;
  style: React.CSSProperties;
}
export function computeInlineReportStyle(prefs: LayoutPrefs): InlineReportStyle {
  const rp = prefs.panels.right_panel;
  const bg = colorToCss(rp.background, 'background');
  const fg = colorToCss(rp.text, 'text');
  const style: React.CSSProperties = {};
  if (bg) style.background = bg;
  if (fg) style.color = fg;
  return { visible: rp.visible, styled: !!bg || !!fg, style };
}

// ── Context ────────────────────────────────────────────────────────────────────
interface Ctx {
  prefs: LayoutPrefs;
  /**
   * THE one way to change the layout. Chat directives and every UI control go
   * through here, so the two can never diverge into parallel state.
   * `label` is only for the Undo toast's wording.
   */
  applyDirectives: (directives: LayoutDirective[], label?: string) => void;
  resetPrefs: () => void;
  /** True when the user has customized any surface away from the defaults. */
  isCustomized: boolean;
  /** Most recent reversible change, or null. Drives the Undo toast. */
  undoState: { prefs: LayoutPrefs; label: string } | null;
  undo: () => void;
  dismissUndo: () => void;
}

/** Short human phrase for a batch of directives, used in the Undo toast. */
function describeBatch(ds: LayoutDirective[]): string {
  if (ds.length === 1) {
    const d = ds[0];
    switch (d.op) {
      case 'toggle': return `${d.visibility === 'hide' ? 'hid' : d.visibility === 'show' ? 'showed' : 'toggled'} a surface`;
      case 'move': return 'moved a panel';
      case 'resize': return 'resized a panel';
      case 'density': return `set spacing to ${d.density}`;
      case 'style': return 'recolored a surface';
      case 'split': return `set the split to ${d.ratio}`;
      case 'focus': return d.target === 'none' ? 'exited focus' : 'focused a surface';
      case 'text_scale': return `set text size to ${d.scale}`;
      case 'theme': return `switched to the ${d.theme} theme`;
      case 'high_contrast': return 'changed high contrast';
      case 'preset': return `applied the ${d.preset} preset`;
      case 'reset': return 'reset the layout';
    }
  }
  const preset = ds.find(d => d.op === 'preset');
  if (preset && preset.op === 'preset') return `applied the ${preset.preset} preset`;
  return 'changed the layout';
}

const LayoutPrefsContext = createContext<Ctx | null>(null);

export function LayoutPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<LayoutPrefs>(loadPrefs);
  // Gates the write-back so the first render (and the in-flight GET) cannot PUT
  // defaults over the server copy before it has arrived.
  const hydratedRef = useRef(false);
  // Lets the hydration effect read the latest prefs without depending on them — it
  // must run exactly once, not on every preference change.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  // Set by resetPrefs so the state change it causes does not immediately re-save.
  const skipNextSaveRef = useRef(false);

  // Persist on every change.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable(prefs))); } catch { /* quota — ignore */ }
  }, [prefs]);

  // ── Root-level preferences ────────────────────────────────────────────────
  // density / text scale / theme / contrast are app-WIDE concerns, not panel
  // geometry, so they are published as attributes on <html> and consumed by CSS
  // (see theme.css). Any surface can then respond without prop-drilling, and a
  // surface added later picks them up for free.
  useEffect(() => {
    document.documentElement.setAttribute('data-density', prefs.density);
  }, [prefs.density]);

  useEffect(() => {
    document.documentElement.setAttribute('data-text-scale', prefs.textScale);
  }, [prefs.textScale]);

  useEffect(() => {
    document.documentElement.setAttribute('data-contrast', prefs.highContrast ? 'high' : 'normal');
  }, [prefs.highContrast]);

  // Theme drives the `.dark` class the app's existing Tailwind dark variant already
  // keys off (`@custom-variant dark (&:is(.dark *))`) rather than inventing a second
  // mechanism. 'system' subscribes to the OS setting and keeps following it, so a
  // user who changes their OS theme at 6pm sees the app follow without a reload.
  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => root.classList.toggle('dark', dark);

    if (prefs.theme !== 'system') {
      apply(prefs.theme === 'dark');
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [prefs.theme]);

  // ── Server hydration ──────────────────────────────────────────────────────
  // localStorage is a CACHE (instant first paint, works offline); the server is the
  // source of truth, which is what makes a layout follow the user to another device.
  //
  // Ordering matters: the cached value is already in state from useState's
  // initializer, so the user never sees an unstyled flash. The server response then
  // reconciles. A 404/500/offline leaves the cache in place rather than resetting
  // someone's layout because the network blipped.
  useEffect(() => {
    const userId = layoutUserId();
    if (!userId) return;                  // not logged in — cache only
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/layout-prefs`, { headers: { 'X-User-Id': userId } });
        if (!res.ok || !alive) return;
        const body = await res.json();
        if (!alive) return;
        if (body?.prefs) {
          // Merge onto defaults so a blob saved by an older contract version gains
          // any newly added field instead of rendering with it undefined.
          setPrefs(mergePrefs(body.prefs));
        } else {
          // Never saved server-side. Push the local cache up so this device's layout
          // becomes the user's layout everywhere, rather than being silently local.
          hydratedRef.current = true;
          void pushPrefs(userId, prefsRef.current);
        }
      } catch { /* offline — the cache stands */ }
      finally { if (alive) hydratedRef.current = true; }
    })();
    return () => { alive = false; };
  }, []);

  // ── Debounced write-back ──────────────────────────────────────────────────
  // Optimistic by construction: state already changed and rendered before this runs.
  // Debounced because dragging a resize control or replaying a preset produces a
  // burst of directives, and each one would otherwise be its own PUT.
  useEffect(() => {
    // Don't write during the first render or before hydration has settled, or we
    // would overwrite the server copy with defaults before it ever arrives.
    if (!hydratedRef.current) return;
    // A reset just DELETEd the row. Without this, the state change it caused would
    // immediately PUT the defaults straight back and recreate it — turning "this user
    // has no saved layout" into "this user has explicitly saved today's defaults",
    // which is the one distinction resetPrefs exists to preserve. Observed in testing.
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    const userId = layoutUserId();
    if (!userId) return;
    const id = setTimeout(() => { void pushPrefs(userId, prefs); }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [prefs]);

  // ── Undo ──────────────────────────────────────────────────────────────────
  // One step, snapshot-based. Deliberately NOT an inverse-directive stack: a batch
  // like a preset is six directives, several of them lossy (a `reset` cannot be
  // inverted from the directive alone), so replaying inverses would be both complex
  // and wrong. Snapshotting the whole prefs object before each change is exact.
  //
  // It lives HERE, not in the controls, because chat and clicks both land in this
  // reducer — putting undo in the UI would silently miss every chat-driven change.
  const [undoState, setUndoState] = useState<{ prefs: LayoutPrefs; label: string } | null>(null);

  const applyDirectives = useCallback((directives: LayoutDirective[], label?: string) => {
    if (!directives?.length) return;
    setPrefs(prev => {
      const next = directives.reduce(applyDirective, prev);
      // Skip no-op batches (e.g. a refused essential-target toggle) so Undo never
      // offers to revert something that did not change.
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
      setUndoState({ prefs: prev, label: label ?? describeBatch(directives) });
      return next;
    });
  }, []);

  // ── Focus rescue ──────────────────────────────────────────────────────────
  // Hiding a surface unmounts whatever had keyboard focus inside it. The browser
  // then drops focus to <body>, which silently sends the user back to the top of
  // the tab order with no visible cursor — the classic "where did my keyboard go"
  // bug. After every layout change, if focus ended up nowhere, put it somewhere
  // deliberate: the layout controls, which are always present by construction.
  useEffect(() => {
    const active = document.activeElement;
    const stranded = !active || active === document.body || !document.contains(active);
    if (!stranded) return;
    // rAF so the DOM has settled after the layout change that caused this.
    const id = requestAnimationFrame(() => {
      const anchor = document.querySelector<HTMLElement>('[data-layout-controls] button');
      anchor?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [prefs]);

  const undo = useCallback(() => {
    setUndoState(current => {
      if (!current) return null;
      setPrefs(current.prefs);
      return null;
    });
  }, []);

  const dismissUndo = useCallback(() => setUndoState(null), []);

  const resetPrefs = useCallback(() => {
    skipNextSaveRef.current = true;
    setPrefs(prev => {
      if (JSON.stringify(prev) !== JSON.stringify(DEFAULT_PREFS)) {
        setUndoState({ prefs: prev, label: 'reset the layout' });
      }
      return DEFAULT_PREFS;
    });
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    const userId = layoutUserId();
    if (!userId) return;
    // DELETE, not "PUT the defaults". The distinction is real: a deleted row means
    // "this user has no saved layout", so a later contract change gives them the NEW
    // defaults. A stored copy of today's defaults would pin them to today's forever.
    void fetch(`${API_BASE}/api/layout-prefs`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId },
    }).catch(() => { /* best effort; local state is already reset */ });
  }, []);

  const isCustomized = useMemo(
    () => JSON.stringify(prefs) !== JSON.stringify(DEFAULT_PREFS),
    [prefs],
  );

  const value = useMemo(
    () => ({ prefs, applyDirectives, resetPrefs, isCustomized, undoState, undo, dismissUndo }),
    [prefs, applyDirectives, resetPrefs, isCustomized, undoState, undo, dismissUndo],
  );
  return <LayoutPrefsContext.Provider value={value}>{children}</LayoutPrefsContext.Provider>;
}

export function useLayoutPrefs(): Ctx {
  const ctx = useContext(LayoutPrefsContext);
  if (!ctx) throw new Error('useLayoutPrefs must be used within a LayoutPrefsProvider');
  return ctx;
}
