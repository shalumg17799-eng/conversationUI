import React from 'react';
import {
  Settings2, RotateCcw, Undo2, X, Check, Minimize2,
  PanelLeft, PanelRight, PanelTop, PanelBottom, Eye, EyeOff,
} from 'lucide-react';
import {
  useLayoutPrefs, LayoutDirective, LayoutTarget, LayoutDensity,
  LayoutTextScale, LayoutTheme, LayoutPresetId, LayoutSize, LayoutPosition,
  ESSENTIAL_TARGETS,
} from '../context/LayoutPrefsContext';

// ════════════════════════════════════════════════════════════════════════════
// ADAPTIVE UI — the direct-manipulation controls
// ════════════════════════════════════════════════════════════════════════════
// Chat is the accelerator; clicking is the primary path. Both must produce the
// SAME state, which is why nothing in this file holds layout state of its own:
// every control below builds a LayoutDirective and hands it to applyDirectives,
// the identical reducer the chat pipeline feeds. There is no second code path to
// keep in sync, and no way for a click to express something chat cannot.
//
// The only local state here is which menu is open.

/**
 * The customizable surfaces, mirrored from LAYOUT_TARGET_REGISTRY.
 *
 * Duplicated rather than imported because the backend registry lives in the other
 * tsconfig root. scripts/test_layout.ts fails if the two drift, so a surface added
 * to the registry cannot silently go missing from this menu.
 *
 * `layout_controls` is deliberately absent: it is the essential surface, and
 * offering a checkbox that refuses to work would be worse than offering nothing.
 */
const SURFACES: { id: LayoutTarget; label: string; group: 'Panels' | 'Header' | 'Controls' }[] = [
  { id: 'right_panel', label: 'Report panel', group: 'Panels' },
  { id: 'left_panel', label: 'History panel', group: 'Panels' },
  { id: 'nav_rail', label: 'Navigation rail', group: 'Panels' },
  { id: 'chat_panel', label: 'Chat panel', group: 'Panels' },
  { id: 'header', label: 'Header', group: 'Panels' },
  { id: 'header_logo', label: 'Logo', group: 'Header' },
  { id: 'header_search', label: 'Search bar', group: 'Header' },
  { id: 'profile', label: 'Profile icon', group: 'Header' },
  { id: 'notifications', label: 'Notifications', group: 'Header' },
  { id: 'persona_selector', label: 'Persona selector', group: 'Header' },
  { id: 'mode_toggle', label: 'Static/LLM toggle', group: 'Controls' },
];

/** Surfaces that can be repositioned, and where to. Mirrors the registry's allowedOps. */
const MOVABLE: Partial<Record<LayoutTarget, LayoutPosition[]>> = {
  right_panel: ['left', 'right', 'top', 'bottom'],
  header: ['top', 'bottom'],
};
const RESIZABLE: LayoutTarget[] = ['right_panel', 'left_panel'];
const FOCUSABLE: LayoutTarget[] = ['chat_panel', 'right_panel'];

const DENSITIES: LayoutDensity[] = ['compact', 'comfortable', 'spacious'];
const TEXT_SCALES: LayoutTextScale[] = ['small', 'default', 'large', 'xl'];
const THEMES: LayoutTheme[] = ['light', 'dark', 'system'];
const SIZES: LayoutSize[] = ['narrow', 'default', 'wide', 'full'];
const PRESETS: LayoutPresetId[] = ['default', 'compact', 'focus', 'presentation', 'reading', 'analyst'];

// Shared focus ring. Every interactive element in this file uses it — an
// invisible focus state makes a keyboard-operable control unusable in practice.
const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4572A] focus-visible:ring-offset-1 focus-visible:ring-offset-white';

const POS_ICON: Record<LayoutPosition, React.ComponentType<{ className?: string }>> = {
  left: PanelLeft, right: PanelRight, top: PanelTop, bottom: PanelBottom,
};

// ── Small building blocks ────────────────────────────────────────────────────

function SegButton({ active, onClick, children, title }: {
  active: boolean; onClick: () => void; children: React.ReactNode; title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`px-2 py-1 rounded-[6px] text-[11px] font-medium transition-colors ${FOCUS_RING} ${
        active ? 'bg-[#1A1917] text-white' : 'bg-[#F4F2EF] text-[#5C5A57] hover:bg-[#EDEAE5]'
      }`}
    >
      {children}
    </button>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 border-t border-[#ECEAE6] first:border-t-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8A8785] mb-1.5">{title}</p>
      {children}
    </div>
  );
}

// ── Undo toast ───────────────────────────────────────────────────────────────
// Rendered for ANY layout change, from chat or from a click, because it reads the
// provider's undo state rather than being wired to the buttons in this file.

function UndoToast() {
  const { undoState, undo, dismissUndo } = useLayoutPrefs();
  const ref = React.useRef<HTMLDivElement | null>(null);

  // Auto-dismiss, but never while the user is inside it with the keyboard —
  // yanking a focused control out from under someone is how focus ends up on a
  // detached node and the tab order collapses to the document root.
  React.useEffect(() => {
    if (!undoState) return;
    const id = setTimeout(() => {
      if (ref.current?.contains(document.activeElement)) return;
      dismissUndo();
    }, 8000);
    return () => clearTimeout(id);
  }, [undoState, dismissUndo]);

  if (!undoState) return null;
  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 px-3.5 py-2.5 rounded-full bg-[#1A1917] text-white shadow-lg"
    >
      <span className="text-[12px]">Layout updated — {undoState.label}</span>
      <button
        type="button"
        onClick={undo}
        className={`flex items-center gap-1 px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 text-[12px] font-medium transition-colors ${FOCUS_RING}`}
      >
        <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
        Undo
      </button>
      <button
        type="button"
        onClick={dismissUndo}
        aria-label="Dismiss"
        className={`p-1 rounded-full hover:bg-white/15 transition-colors ${FOCUS_RING}`}
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Exit-focus pill ──────────────────────────────────────────────────────────
// Focus collapses every surface but one, so the way out must be on screen the
// whole time — not inside a menu that might itself be collapsed.

function ExitFocusPill() {
  const { prefs, applyDirectives } = useLayoutPrefs();
  if (prefs.focus === 'none') return null;
  return (
    <button
      type="button"
      onClick={() => applyDirectives([{ op: 'focus', target: 'none' }], 'exited focus')}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A1917] text-white text-[12px] font-medium shadow-lg hover:bg-[#333029] transition-colors ${FOCUS_RING}`}
    >
      <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
      Exit focus
    </button>
  );
}

// ── Edit-layout mode ─────────────────────────────────────────────────────────
// A per-surface control strip. Same directives as chat, one click instead of a
// sentence.

function EditLayoutPanel({ onClose }: { onClose: () => void }) {
  const { prefs, applyDirectives } = useLayoutPrefs();
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Move focus into the panel so a keyboard user is not left behind on the trigger.
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const emit = (d: LayoutDirective, label: string) => applyDirectives([d], label);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Edit layout"
      className="fixed bottom-16 left-4 z-[105] w-[340px] max-h-[70vh] overflow-y-auto rounded-[12px] bg-white border border-[#E5E3DF] shadow-xl"
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#ECEAE6] sticky top-0 bg-white">
        <p className="text-[12px] font-semibold text-[#1C1917]">Edit layout</p>
        <button type="button" onClick={onClose} aria-label="Close edit layout"
          className={`p-1 rounded hover:bg-[#F4F2EF] ${FOCUS_RING}`}>
          <X className="w-3.5 h-3.5 text-[#6B6965]" aria-hidden="true" />
        </button>
      </div>

      {SURFACES.map(s => {
        const panel = prefs.panels[s.id];
        return (
          <div key={s.id} className="px-3 py-2 border-t border-[#ECEAE6]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-[#1C1917]">{s.label}</span>
              <button
                type="button"
                onClick={() => emit(
                  { op: 'toggle', target: s.id, visibility: panel.visible ? 'hide' : 'show' },
                  `${panel.visible ? 'hid' : 'showed'} the ${s.label.toLowerCase()}`,
                )}
                aria-label={`${panel.visible ? 'Hide' : 'Show'} ${s.label}`}
                aria-pressed={panel.visible}
                className={`flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] transition-colors ${FOCUS_RING} ${
                  panel.visible ? 'bg-[#F4F2EF] text-[#5C5A57] hover:bg-[#EDEAE5]' : 'bg-[#FEF0EC] text-[#D4572A]'
                }`}
              >
                {panel.visible
                  ? <><Eye className="w-3 h-3" aria-hidden="true" /> Visible</>
                  : <><EyeOff className="w-3 h-3" aria-hidden="true" /> Hidden</>}
              </button>
            </div>

            {MOVABLE[s.id] && (
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] text-[#8A8785] w-10">Dock</span>
                {MOVABLE[s.id]!.map(pos => {
                  const Icon = POS_ICON[pos];
                  return (
                    <SegButton key={pos} active={panel.position === pos} title={`Dock ${pos}`}
                      onClick={() => emit({ op: 'move', target: s.id, position: pos }, `moved the ${s.label.toLowerCase()} ${pos}`)}>
                      <Icon className="w-3 h-3" aria-hidden="true" />
                      <span className="sr-only">{pos}</span>
                    </SegButton>
                  );
                })}
              </div>
            )}

            {RESIZABLE.includes(s.id) && (
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] text-[#8A8785] w-10">Size</span>
                {SIZES.map(size => (
                  <SegButton key={size} active={panel.size === size}
                    onClick={() => emit({ op: 'resize', target: s.id, size }, `set the ${s.label.toLowerCase()} to ${size}`)}>
                    {size}
                  </SegButton>
                ))}
              </div>
            )}

            {FOCUSABLE.includes(s.id) && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[#8A8785] w-10">Focus</span>
                <SegButton active={prefs.focus === s.id}
                  onClick={() => emit(
                    { op: 'focus', target: prefs.focus === s.id ? 'none' : (s.id as 'chat_panel' | 'right_panel') },
                    prefs.focus === s.id ? 'exited focus' : `focused the ${s.label.toLowerCase()}`,
                  )}>
                  {prefs.focus === s.id ? 'Focused' : 'Focus'}
                </SegButton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Customize menu ───────────────────────────────────────────────────────────

function CustomizeMenu({ onClose }: { onClose: () => void }) {
  const { prefs, applyDirectives, resetPrefs } = useLayoutPrefs();
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  const emit = (d: LayoutDirective, label: string) => applyDirectives([d], label);
  const groups = ['Panels', 'Header', 'Controls'] as const;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Customize"
      className="fixed bottom-16 left-4 z-[105] w-[300px] max-h-[70vh] overflow-y-auto rounded-[12px] bg-white border border-[#E5E3DF] shadow-xl"
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#ECEAE6] sticky top-0 bg-white">
        <p className="text-[12px] font-semibold text-[#1C1917]">Customize</p>
        <button type="button" onClick={onClose} aria-label="Close customize menu"
          className={`p-1 rounded hover:bg-[#F4F2EF] ${FOCUS_RING}`}>
          <X className="w-3.5 h-3.5 text-[#6B6965]" aria-hidden="true" />
        </button>
      </div>

      <MenuSection title="Presets">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(p => (
            <SegButton key={p} active={false}
              onClick={() => emit({ op: 'preset', preset: p }, `applied the ${p} preset`)}>
              {p}
            </SegButton>
          ))}
        </div>
      </MenuSection>

      {groups.map(g => (
        <MenuSection key={g} title={g}>
          <ul className="space-y-0.5">
            {SURFACES.filter(s => s.group === g).map(s => {
              const visible = prefs.panels[s.id].visible;
              return (
                <li key={s.id}>
                  <label className={`flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-[#F7F6F3] text-[12px] text-[#1C1917]`}>
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => emit(
                        { op: 'toggle', target: s.id, visibility: visible ? 'hide' : 'show' },
                        `${visible ? 'hid' : 'showed'} the ${s.label.toLowerCase()}`,
                      )}
                      className={`w-3.5 h-3.5 accent-[#D4572A] ${FOCUS_RING}`}
                    />
                    {s.label}
                  </label>
                </li>
              );
            })}
          </ul>
        </MenuSection>
      ))}

      <MenuSection title="Spacing">
        <div className="flex gap-1">
          {DENSITIES.map(d => (
            <SegButton key={d} active={prefs.density === d}
              onClick={() => emit({ op: 'density', density: d }, `set spacing to ${d}`)}>{d}</SegButton>
          ))}
        </div>
      </MenuSection>

      <MenuSection title="Text size">
        <div className="flex gap-1">
          {TEXT_SCALES.map(t => (
            <SegButton key={t} active={prefs.textScale === t}
              onClick={() => emit({ op: 'text_scale', scale: t }, `set text size to ${t}`)}>{t}</SegButton>
          ))}
        </div>
      </MenuSection>

      <MenuSection title="Theme">
        <div className="flex gap-1 mb-1.5">
          {THEMES.map(t => (
            <SegButton key={t} active={prefs.theme === t}
              onClick={() => emit({ op: 'theme', theme: t }, `switched to the ${t} theme`)}>{t}</SegButton>
          ))}
        </div>
        <label className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-[#F7F6F3] text-[12px] text-[#1C1917]">
          <input
            type="checkbox"
            checked={prefs.highContrast}
            onChange={() => emit(
              { op: 'high_contrast', value: prefs.highContrast ? 'off' : 'on' },
              `turned high contrast ${prefs.highContrast ? 'off' : 'on'}`,
            )}
            className={`w-3.5 h-3.5 accent-[#D4572A] ${FOCUS_RING}`}
          />
          High contrast
        </label>
      </MenuSection>

      <MenuSection title="Chat / report split">
        <div className="flex gap-1">
          {(['30', '50', '70'] as const).map(r => (
            <SegButton key={r} active={prefs.split === r}
              onClick={() => emit({ op: 'split', ratio: r }, `set the split to ${r}`)}>
              {100 - Number(r)}/{r}
            </SegButton>
          ))}
        </div>
      </MenuSection>

      <div className="px-3 py-2 border-t border-[#ECEAE6]">
        <button
          type="button"
          onClick={() => { resetPrefs(); onClose(); }}
          className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[8px] bg-[#F4F2EF] hover:bg-[#EDEAE5] text-[12px] font-medium text-[#1C1917] transition-colors ${FOCUS_RING}`}
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

// ── The mounted control surface ──────────────────────────────────────────────

export function LayoutControls() {
  const { prefs, isCustomized } = useLayoutPrefs();
  const [open, setOpen] = React.useState<'none' | 'edit' | 'customize'>('none');
  const gearRef = React.useRef<HTMLButtonElement | null>(null);
  const editRef = React.useRef<HTMLButtonElement | null>(null);

  // Return focus to whichever trigger opened the panel. Closing a dialog and
  // leaving focus on <body> silently resets a keyboard user to the top of the page.
  const close = React.useCallback((from: 'edit' | 'customize') => {
    setOpen('none');
    (from === 'edit' ? editRef : gearRef).current?.focus();
  }, []);

  // ── Keyboard escape hatch ────────────────────────────────────────────────
  // The controls are fixed to the bottom-left, which puts them LAST in the tab
  // order — measured at 35 tabs from the top of a default page. That is a poor
  // deal for the one control a keyboard user needs most when surfaces are hidden,
  // so Alt+L jumps straight to it. Alt-modified keys are not intercepted by the
  // composer, so this works while typing.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        gearRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ANTI-LOCKOUT: this control is the `layout_controls` surface and is pinned
  // visible by the registry, the store, and the reducer. Reading the flag here
  // keeps the render binding honest (scripts/test_layout.ts checks this file
  // references panels.layout_controls) without making it hideable.
  if (!prefs.panels.layout_controls.visible) return null;

  return (
    <>
      <ExitFocusPill />
      <UndoToast />

      {/* data-layout-controls marks the focus-rescue anchor: when hiding a surface
          strands keyboard focus on <body>, the provider moves it to the first button
          in here, which is guaranteed to exist. */}
      <div data-layout-controls className="fixed bottom-4 left-4 z-[100] flex items-center gap-1.5">
        <button
          ref={gearRef}
          type="button"
          onClick={() => setOpen(o => (o === 'customize' ? 'none' : 'customize'))}
          aria-expanded={open === 'customize'}
          aria-haspopup="dialog"
          aria-keyshortcuts="Alt+L"
          title="Customize the layout (Alt+L)"
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#1A1917] text-white text-[12px] font-medium shadow-lg hover:bg-[#333029] transition-colors ${FOCUS_RING}`}
        >
          <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
          Customize
        </button>

        <button
          ref={editRef}
          type="button"
          onClick={() => setOpen(o => (o === 'edit' ? 'none' : 'edit'))}
          aria-expanded={open === 'edit'}
          aria-haspopup="dialog"
          title="Edit each surface"
          className={`px-3 py-2 rounded-full bg-white border border-[#E5E3DF] text-[12px] font-medium text-[#1C1917] shadow hover:bg-[#F7F6F3] transition-colors ${FOCUS_RING}`}
        >
          Edit layout
        </button>

        {isCustomized && (
          <span className="px-2 py-1 rounded-full bg-[#FEF0EC] text-[#D4572A] text-[10px] font-medium">
            customized
          </span>
        )}
      </div>

      {open === 'edit' && <EditLayoutPanel onClose={() => close('edit')} />}
      {open === 'customize' && <CustomizeMenu onClose={() => close('customize')} />}
    </>
  );
}
