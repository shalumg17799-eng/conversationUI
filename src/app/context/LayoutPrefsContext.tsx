// Adaptive UI (Requirement 5) — frontend preference store.
//
// Receives typed Layout Directives (produced + schema-validated by the backend
// intent layer, see backend/src/services/layoutDirective.ts) and reduces them into
// persisted UI-personalization state. The backend guarantees only valid directives
// reach here; this store applies them and remembers them across sessions.
//
// Scope note: the backend recognizes four targets (right_panel, left_panel, nav_rail,
// chat_panel) and four ops (move, toggle, resize, density). This store holds state for
// all of them and every surface is now rendered:
//   • right_panel — move (right/left/top/bottom), resize, show/hide (Conversational page)
//   • left_panel  — resize + show/hide, with left-edge reflow of the chat column
//   • nav_rail    — show/hide (shared Layout shell), content shifts left when hidden
//   • chat_panel  — show/hide
//   • density     — global, reflected on <html data-density> for any surface to read
// Repositioning (move) of the three secondary surfaces is intentionally a no-op — they
// stay docked; only the report (right) panel supports free repositioning.

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

// ── Directive contract (mirrors the backend schema) ───────────────────────────
export type LayoutTarget = 'right_panel' | 'left_panel' | 'nav_rail' | 'chat_panel';
export type LayoutPosition = 'left' | 'right' | 'top' | 'bottom';
export type LayoutVisibility = 'show' | 'hide' | 'toggle';
export type LayoutSize = 'narrow' | 'default' | 'wide' | 'full';
export type LayoutDensity = 'compact' | 'comfortable' | 'spacious';

export type LayoutDirective =
  | { op: 'move'; target: LayoutTarget; position: LayoutPosition }
  | { op: 'toggle'; target: LayoutTarget; visibility: LayoutVisibility }
  | { op: 'resize'; target: LayoutTarget; size: LayoutSize }
  | { op: 'density'; density: LayoutDensity };

// ── Persisted state ────────────────────────────────────────────────────────────
interface PanelPrefs {
  position: LayoutPosition;
  visible: boolean;
  size: LayoutSize;
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
      },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// ── Pure reducer: apply one directive to prefs ────────────────────────────────
export function applyDirective(prefs: LayoutPrefs, d: LayoutDirective): LayoutPrefs {
  switch (d.op) {
    case 'density':
      return { ...prefs, density: d.density };
    case 'move':
      return updatePanel(prefs, d.target, p => ({ ...p, position: d.position, visible: true }));
    case 'resize':
      return updatePanel(prefs, d.target, p => ({ ...p, size: d.size, visible: true }));
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

  const value = useMemo(() => ({ prefs, applyDirectives, resetPrefs }), [prefs, applyDirectives, resetPrefs]);
  return <LayoutPrefsContext.Provider value={value}>{children}</LayoutPrefsContext.Provider>;
}

export function useLayoutPrefs(): Ctx {
  const ctx = useContext(LayoutPrefsContext);
  if (!ctx) throw new Error('useLayoutPrefs must be used within a LayoutPrefsProvider');
  return ctx;
}
