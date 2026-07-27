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

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

// ── Directive contract (mirrors the backend schema) ───────────────────────────
export type LayoutTarget = 'right_panel' | 'left_panel' | 'nav_rail' | 'chat_panel' | 'header' | 'header_logo' | 'header_search' | 'mode_toggle';
export type LayoutPosition = 'left' | 'right' | 'top' | 'bottom';
export type LayoutVisibility = 'show' | 'hide' | 'toggle';
export type LayoutSize = 'narrow' | 'default' | 'wide' | 'full';
export type LayoutDensity = 'compact' | 'comfortable' | 'spacious';
export type LayoutStyleProp = 'background' | 'text';
export type LayoutColor = 'white' | 'black' | 'light' | 'dark' | 'neutral' | 'transparent' | 'default';

export type LayoutDirective =
  | { op: 'move'; target: LayoutTarget; position: LayoutPosition }
  | { op: 'toggle'; target: LayoutTarget; visibility: LayoutVisibility }
  | { op: 'resize'; target: LayoutTarget; size: LayoutSize }
  | { op: 'density'; density: LayoutDensity }
  | { op: 'style'; target: LayoutTarget; property: LayoutStyleProp; color: LayoutColor }
  | { op: 'reset' };

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
}

const DEFAULT_PREFS: LayoutPrefs = {
  panels: {
    right_panel: { position: 'right', visible: true, size: 'default' },
    left_panel: { position: 'left', visible: true, size: 'default' },
    nav_rail: { position: 'left', visible: true, size: 'default' },
    chat_panel: { position: 'left', visible: true, size: 'default' },
    header: { position: 'top', visible: true, size: 'default' },
    header_logo: { position: 'left', visible: true, size: 'default' },
    header_search: { position: 'top', visible: true, size: 'default' },
    mode_toggle: { position: 'bottom', visible: true, size: 'default' },
  },
  density: 'comfortable',
};

const STORAGE_KEY = 'layout_prefs_v1';

function loadPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    // Merge defensively so a schema addition never breaks an old stored blob.
    return {
      density: parsed.density ?? DEFAULT_PREFS.density,
      panels: {
        right_panel: { ...DEFAULT_PREFS.panels.right_panel, ...parsed.panels?.right_panel },
        left_panel: { ...DEFAULT_PREFS.panels.left_panel, ...parsed.panels?.left_panel },
        nav_rail: { ...DEFAULT_PREFS.panels.nav_rail, ...parsed.panels?.nav_rail },
        chat_panel: { ...DEFAULT_PREFS.panels.chat_panel, ...parsed.panels?.chat_panel },
        header: { ...DEFAULT_PREFS.panels.header, ...parsed.panels?.header },
        header_logo: { ...DEFAULT_PREFS.panels.header_logo, ...parsed.panels?.header_logo },
        header_search: { ...DEFAULT_PREFS.panels.header_search, ...parsed.panels?.header_search },
        mode_toggle: { ...DEFAULT_PREFS.panels.mode_toggle, ...parsed.panels?.mode_toggle },
      },
    };
  } catch {
    return DEFAULT_PREFS;
  }
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
    case 'density':
      return { ...prefs, density: d.density };
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

// ── Context ────────────────────────────────────────────────────────────────────
interface Ctx {
  prefs: LayoutPrefs;
  applyDirectives: (directives: LayoutDirective[]) => void;
  resetPrefs: () => void;
  /** True when the user has customized any surface away from the defaults. */
  isCustomized: boolean;
}

const LayoutPrefsContext = createContext<Ctx | null>(null);

export function LayoutPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<LayoutPrefs>(loadPrefs);

  // Persist on every change.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* quota — ignore */ }
  }, [prefs]);

  // Reflect density globally so any surface can read it via CSS.
  useEffect(() => {
    document.documentElement.setAttribute('data-density', prefs.density);
  }, [prefs.density]);

  const applyDirectives = useCallback((directives: LayoutDirective[]) => {
    if (!directives?.length) return;
    setPrefs(prev => directives.reduce(applyDirective, prev));
  }, []);

  const resetPrefs = useCallback(() => setPrefs(DEFAULT_PREFS), []);

  const isCustomized = useMemo(
    () => JSON.stringify(prefs) !== JSON.stringify(DEFAULT_PREFS),
    [prefs],
  );

  const value = useMemo(
    () => ({ prefs, applyDirectives, resetPrefs, isCustomized }),
    [prefs, applyDirectives, resetPrefs, isCustomized],
  );
  return <LayoutPrefsContext.Provider value={value}>{children}</LayoutPrefsContext.Provider>;
}

export function useLayoutPrefs(): Ctx {
  const ctx = useContext(LayoutPrefsContext);
  if (!ctx) throw new Error('useLayoutPrefs must be used within a LayoutPrefsProvider');
  return ctx;
}
