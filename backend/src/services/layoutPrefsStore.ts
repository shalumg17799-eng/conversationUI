// Adaptive UI (Requirement 5) — server-side persistence for per-user layout prefs.
//
// Feature: "Save and restore each user's layout preferences." The frontend keeps a
// localStorage cache for instant load/offline, but the backend is the source of
// truth so a user's layout follows them across sessions and devices, not just one
// browser. File-backed (data/layoutPrefs.json) so it also survives a server restart,
// matching the releaseStore / videoJobs persistence pattern.

import { promises as fs } from 'fs';
import path from 'path';
import {
  LAYOUT_TARGET_REGISTRY, LAYOUT_POSITIONS, LAYOUT_SIZES, LAYOUT_DENSITIES,
  LAYOUT_COLORS, LAYOUT_SPLITS, LAYOUT_FOCUS_TARGETS, LAYOUT_TEXT_SCALES, LAYOUT_THEMES,
  LayoutTarget, LayoutPosition, LayoutSize, LayoutDensity, LayoutColor,
  LayoutSplit, LayoutFocusTarget, LayoutTextScale, LayoutTheme, DensityScope,
} from './layoutDirective';

const STORE_FILE = path.resolve(process.cwd(), 'data', 'layoutPrefs.json');

interface PanelPrefs {
  position: LayoutPosition;
  visible: boolean;
  size: LayoutSize;
  /** Style overrides — undefined means "use the stylesheet default". */
  background?: LayoutColor;
  text?: LayoutColor;
  /** Per-surface spacing override; undefined falls back to the global density. */
  density?: LayoutDensity;
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

// DERIVED FROM THE REGISTRY, not hand-listed. The previous hand-written map was the
// reason adding a target meant editing four places and forgetting one — this cannot
// drift from LAYOUT_TARGET_REGISTRY by construction.
//
// The frontend DEFAULT_PREFS must stay in lockstep; scripts/test_layout.ts compares
// the two and fails the build if they diverge.
export const DEFAULT_PREFS: LayoutPrefs = {
  panels: Object.fromEntries(
    LAYOUT_TARGET_REGISTRY.map(t => [t.id, { ...t.default }]),
  ) as unknown as Record<LayoutTarget, PanelPrefs>,
  density: 'comfortable',
  split: '50',
  focus: 'none',
  textScale: 'default',
  theme: 'system',
  highContrast: false,
};

// Filesystem-safe user id segment.
const seg = (s: string): string => (s || 'default').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'default';

type Store = Record<string, LayoutPrefs>;

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? (obj as Store) : {};
  } catch {
    return {}; // no store yet
  }
}

async function writeStore(store: Store): Promise<void> {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

// ── Validation / coercion ─────────────────────────────────────────────────────
// Never trust the client blob. Coerce every field to the allowed set, dropping
// anything invalid back to its default — so a malformed PUT can never poison state.
const inEnum = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** Optional enum field: undefined stays undefined; anything invalid is dropped. */
const optEnum = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

function coercePanel(raw: any, def: PanelPrefs, essential: boolean): PanelPrefs {
  return {
    position: inEnum(raw?.position, LAYOUT_POSITIONS, def.position),
    size: inEnum(raw?.size, LAYOUT_SIZES, def.size),
    // ANTI-LOCKOUT, enforced at the persistence layer too. A hand-edited store file
    // or a stale client must not be able to hide the user's way back in.
    visible: essential ? true : (typeof raw?.visible === 'boolean' ? raw.visible : def.visible),
    background: optEnum(raw?.background, LAYOUT_COLORS),
    text: optEnum(raw?.text, LAYOUT_COLORS),
    density: optEnum(raw?.density, LAYOUT_DENSITIES),
  };
}

export function coercePrefs(raw: any): LayoutPrefs {
  const panels = raw?.panels ?? {};
  return {
    density: inEnum(raw?.density, LAYOUT_DENSITIES, DEFAULT_PREFS.density),
    split: inEnum(raw?.split, LAYOUT_SPLITS, DEFAULT_PREFS.split),
    // FOCUS IS DELIBERATELY NOT PERSISTED — always coerced back to 'none'.
    //
    // Focus collapses every surface but one, so a persisted focus state means the
    // next login lands on a screen with no composer and no history. Observed in
    // testing: it is reachable (the reset control is pinned) but startling, and it
    // is not what "save my layout" means to a user — focus is a momentary mode,
    // like maximizing a window, not a preference.
    //
    // Forced here as well as on the client so a hand-crafted PUT cannot pin another
    // session into focus mode.
    focus: 'none',
    textScale: inEnum(raw?.textScale, LAYOUT_TEXT_SCALES, DEFAULT_PREFS.textScale),
    theme: inEnum(raw?.theme, LAYOUT_THEMES, DEFAULT_PREFS.theme),
    highContrast: typeof raw?.highContrast === 'boolean' ? raw.highContrast : DEFAULT_PREFS.highContrast,
    // Registry-driven: every registered target is coerced, unknown keys are dropped.
    panels: Object.fromEntries(
      LAYOUT_TARGET_REGISTRY.map(t => [
        t.id,
        coercePanel(panels[t.id], DEFAULT_PREFS.panels[t.id as LayoutTarget], !!(t as { essential?: boolean }).essential),
      ]),
    ) as unknown as Record<LayoutTarget, PanelPrefs>,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function getPrefs(userId: string): Promise<LayoutPrefs | null> {
  const store = await readStore();
  const prefs = store[seg(userId)];
  return prefs ? coercePrefs(prefs) : null;
}

export async function savePrefs(userId: string, raw: unknown): Promise<LayoutPrefs> {
  const prefs = coercePrefs(raw);
  const store = await readStore();
  store[seg(userId)] = prefs;
  await writeStore(store);
  return prefs;
}

export async function resetPrefs(userId: string): Promise<void> {
  const store = await readStore();
  delete store[seg(userId)];
  await writeStore(store);
}
