import React from 'react';
import { createPortal } from 'react-dom';
import { ArtifactKind } from './artifactSanitizer';
import { FB, FI, SHADOW_DEFAULT, CARD_BASE, CARD_HOVER } from './uiTokens';

// ════════════════════════════════════════════════════════════════════════════
// RICH ARTIFACTS — the sandboxed frame, and the downgrade card
// ════════════════════════════════════════════════════════════════════════════
// Extracted from UITreeRenderer so that EVERY artifact kind — html, svg, and the
// client-compiled mermaid — mounts through the same <iframe> element. There must
// be exactly one copy of these attributes in the codebase: a second copy is how an
// `allow-scripts` regression eventually gets introduced into one path and not the
// other. If you are about to write another <iframe> for artifact content, use the
// SandboxFrame component below instead.
//
// Artifact content is rendered ONLY inside a sandboxed, isolated-origin iframe —
// never via dangerouslySetInnerHTML, and never as raw injected markup.
//
// Layered controls, outermost first:
//   1. sandbox=""        — empty value = every sandbox restriction applied. No
//                          allow-scripts and no allow-same-origin, so the frame
//                          is an opaque origin that cannot execute script,
//                          navigate the top frame, submit forms, or reach our
//                          storage/cookies. This is the primary control.
//   2. CSP (ARTIFACT_CSP) — script-src 'none' + default-src 'none' in the srcdoc
//                          document. Scoped to this frame only, not app-global.
//   3. sanitizeArtifact() — allowlist strip before the payload is ever embedded.
//   4. referrerPolicy / no allow-popups — no outbound signal on render.
//
// If any layer refuses the content, we downgrade to plain text rather than render
// a misleading fragment. See ArtifactFallback.

export function ArtifactFallback({ title, reason, text }: any) {
  return (
    <div className="rounded-[12px] border border-[#E5E3DF] px-5 py-4" style={{ background: '#F4F2EF' }}>
      {title && <p className="text-[13px] font-semibold text-[#1C1917] mb-1" style={FB}>{title}</p>}
      {text
        ? <p className="text-[13px] text-[#6B6965] leading-relaxed whitespace-pre-wrap" style={FI}>{text}</p>
        : <p className="text-[12px] text-[#8A8785] leading-relaxed" style={FI}>
            This content could not be displayed safely.
          </p>}
      <p className="text-[11px] text-[#8A8785] mt-2" style={FI}>Rich content unavailable ({reason}).</p>
    </div>
  );
}

const FRAME_TITLE: Record<ArtifactKind, string> = {
  html: 'HTML artifact',
  svg: 'SVG artifact',
  mermaid: 'Diagram artifact',
};

// Fallback heights, used only when the caller cannot state an intrinsic size.
// HTML documents flow and need more room; vector output is centred and squarer.
const FRAME_HEIGHT: Record<ArtifactKind, number> = {
  html: 420,
  svg: 320,
  mermaid: 380,
};

const MIN_FRAME = 180;
// Generic cap for a frame sized from an intrinsic size but WITHOUT the zoom
// viewer (i.e. any future caller that passes `intrinsic` for a non-zoomable
// kind). Beyond it the frame scrolls. Mermaid no longer reaches this path — see
// VIEWPORT_MAX and the note above ZoomableDiagram.
const MAX_FRAME = 1200;
// buildArtifactSrcDoc pads the document body by 12px on every side.
const FRAME_PADDING = 24;

// ════════════════════════════════════════════════════════════════════════════
// THE ONE IFRAME
// ════════════════════════════════════════════════════════════════════════════
// Every artifact frame in the app is this element. It exists as a component so
// that the plain path and the zoom viewer (which mounts a second frame for the
// fullscreen overlay) cannot drift apart on the security attributes.
//
// `style` and `className` are the ONLY things a caller may vary. There is
// deliberately no prop that can reach `sandbox`.
function SandboxFrame({
  srcDoc, kind, title, className, style,
}: {
  srcDoc: string;
  kind: ArtifactKind;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <iframe
      // sandbox="" is intentional and load-bearing: an empty token list applies
      // ALL restrictions. Do not add allow-scripts or allow-same-origin — either
      // one re-enables the script execution this whole path exists to prevent.
      // This holds for mermaid too: Mermaid's JS runs in the PARENT document and
      // only its inert SVG output is placed here, so the frame stays script-free.
      sandbox=""
      srcDoc={srcDoc}
      title={title || FRAME_TITLE[kind]}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className ?? 'w-full block border-0'}
      style={style}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ZOOM / PAN VIEWER (mermaid only)
// ════════════════════════════════════════════════════════════════════════════
// WHY THIS REPLACED THE SCROLL CUTOFF.
//
// The frame used to be sized to the diagram's natural height and capped at
// MAX_FRAME, past which it scrolled. The comment here used to argue that
// scaling to fit was not an alternative, because a 564x1704 flowchart fitted
// into 720px of height renders at 42% and every label becomes unreadable.
//
// That argument was correct *while 42% was a dead end*. With zoom it is a
// starting point: the whole diagram is visible at a glance, and reading it is a
// scroll-wheel or one button away. A capped scrolling box and a zoomable canvas
// solve the same problem, so only one ships — this one.
//
// HOW IT WORKS, AND WHY IT LOOKS LIKE THIS.
//
// The frame is `sandbox=""`: no scripts, by design, as the primary XSS control.
// So the iframe cannot participate in its own pan/zoom, and nothing here adds a
// script, a handler, or a sandbox token to it. Instead the parent treats the
// frame as an OPAQUE BOX and applies `transform: translate() scale()` to it,
// with wheel/pointer/keyboard handlers on the wrapper OUTSIDE the frame. This
// is the same approach embed viewers use for content they cannot script.
//
// `pointer-events: none` on the frame is what makes that work: an iframe would
// otherwise swallow every pointer event into a document we are not allowed to
// listen to. The frame's content is a static SVG with no interactive elements,
// so nothing is lost by making it inert to the pointer.
//
// The frame is sized to the diagram's NATURAL pixel size and scaled from there,
// rather than being resized on every zoom step. Two consequences worth knowing:
// the SVG inside is always rasterised from a 1:1 layout (so zooming out from
// fit is exact, and zooming back in to 100% is pixel-crisp), but past 100% a
// transformed iframe is composited as a layer and can go slightly soft. That is
// the accepted cost of not re-laying-out the frame during a gesture, and it
// lands on the rarer direction of travel: the case this feature exists for is a
// big diagram sitting BELOW natural size, where zooming in stays inside the
// crisp range.
//
// No pan/zoom dependency is used. The maths is a dozen lines and the codebase
// already prefers that trade (see artifactSanitizer, written instead of pulling
// in DOMPurify).

/** Tallest the inline canvas gets. Fullscreen is the answer for anything bigger. */
const VIEWPORT_MAX = 720;
/** Above natural size a transformed iframe softens; 3x is where it stops being useful. */
const ZOOM_MAX = 3;
/**
 * Floor for deliberate zoom-out. The effective minimum is min(this, fitScale) —
 * a diagram whose fit scale is 0.42 must still be able to return to 0.42, and a
 * bound that forbade its own fit level would be a trap rather than a guard.
 */
const ZOOM_MIN = 0.5;
const ZOOM_STEP = 1.25;
/** Arrow-key pan distance, in viewport pixels. */
const KEY_PAN = 60;

const REDUCED_MOTION = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Measure an element's box. Width drives fit; height is only read in the overlay. */
function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = React.useRef<T | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only publish a genuinely different box. The observed element's HEIGHT is
    // driven by the viewport this measurement sizes, so emitting a fresh object
    // on every callback would feed a height change back into the fit maths as a
    // new identity and re-render for nothing.
    const publish = (w: number, h: number) =>
      setSize((prev) => (Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5 ? prev : { w, h }));
    const r = el.getBoundingClientRect();
    publish(r.width, r.height);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      publish(box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size];
}

interface Geometry {
  /** Frame box at natural size, padding included. */
  contentW: number;
  contentH: number;
  /** Scale at which the whole diagram is visible in the viewport. */
  fitScale: number;
  /** Height the canvas should occupy. */
  viewportH: number;
}

/**
 * Fit geometry for a diagram of known intrinsic size.
 *
 * Pure, and deliberately preserves the pre-existing behaviour for the common
 * case: a diagram that already fitted under the cap gets exactly the height and
 * scale it had before the viewer existed, so ordinary small diagrams are
 * visually unchanged. Only the ones that used to be cut off take the new path.
 */
export function computeGeometry(
  intrinsic: { w: number; h: number },
  availWidth: number,
  maxHeight: number,
  fill = false,
): Geometry {
  const contentW = intrinsic.w + FRAME_PADDING;
  const contentH = intrinsic.h + FRAME_PADDING;
  const avail = Math.max(0, availWidth);

  // Width fit only — never upscale past 1. This is what the wrapper stylesheet
  // used to do inside the frame.
  const widthFit = avail > 0 ? Math.min(1, avail / contentW) : 1;
  const naturalH = contentH * widthFit;

  // Fullscreen always fills its box; inline shrinks to the diagram.
  if (fill) {
    const scale = Math.min(widthFit, maxHeight / contentH);
    return { contentW, contentH, fitScale: scale, viewportH: maxHeight };
  }

  if (naturalH <= maxHeight) {
    return {
      contentW, contentH,
      fitScale: widthFit,
      viewportH: Math.round(Math.max(MIN_FRAME, naturalH)),
    };
  }

  return {
    contentW, contentH,
    fitScale: Math.min(widthFit, maxHeight / contentH),
    viewportH: maxHeight,
  };
}

interface Transform { s: number; x: number; y: number }

/**
 * Keep the diagram inside the viewport.
 *
 * An axis smaller than the viewport is centred and cannot be panned; a larger
 * one is clamped so an edge can never be dragged past the frame. Without this
 * a user can pan the diagram off-screen and be left staring at blank canvas
 * with no obvious way back.
 */
function clampPan(t: Transform, g: Geometry, viewportW: number, viewportH: number): Transform {
  const sw = g.contentW * t.s;
  const sh = g.contentH * t.s;
  const x = sw <= viewportW ? (viewportW - sw) / 2 : clamp(t.x, viewportW - sw, 0);
  const y = sh <= viewportH ? (viewportH - sh) / 2 : clamp(t.y, viewportH - sh, 0);
  return { s: t.s, x, y };
}

// ── Controls ─────────────────────────────────────────────────────────────────
// Hand-rolled 14px icons. Stroke-only, currentColor, so one button style covers
// all of them and no icon dependency is pulled in for five glyphs.

const ICON = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const IconMinus = () => <svg {...ICON}><path d="M3 7h8" /></svg>;
const IconPlus = () => <svg {...ICON}><path d="M7 3v8M3 7h8" /></svg>;
const IconFit = () => <svg {...ICON}><path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9" /></svg>;
const IconExpand = () => <svg {...ICON}><path d="M8.5 2H12v3.5M12 2 8.5 5.5M5.5 12H2V8.5M2 12l3.5-3.5" /></svg>;
const IconClose = () => <svg {...ICON}><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" /></svg>;

const CTRL_BTN =
  'flex items-center justify-center w-7 h-7 rounded-[6px] text-[#4B4945] ' +
  'transition-colors duration-150 hover:bg-[#EDEAE5] hover:text-[#1C1917] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1 ' +
  'focus-visible:ring-offset-white disabled:opacity-35 disabled:hover:bg-transparent ' +
  'disabled:cursor-default';

function ZoomControls({
  scale, min, max, onZoom, onFit, onExpand, onClose, expanded,
}: {
  scale: number;
  min: number;
  max: number;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onExpand?: () => void;
  onClose?: () => void;
  expanded: boolean;
}) {
  return (
    <div
      // Bottom-right overlay so it never competes with the card's title. Kept at
      // reduced opacity until the card is hovered or something inside it takes
      // focus — present enough to be discovered, quiet enough to ignore.
      //
      // The marker is load-bearing, not a styling hook: the viewport calls
      // setPointerCapture on pointerdown, which retargets the rest of the
      // gesture — INCLUDING the pointerup a click is synthesised from — to the
      // viewport. Captured on a button press, that swallows the click outright.
      // The viewport's pointer and double-click handlers bail out on this
      // attribute so the controls keep working. Verified in a browser: without
      // it, every button is inert.
      data-zoom-controls=""
      className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-[8px] border border-[#E5E3DF]
                 bg-white/95 backdrop-blur-sm px-1 py-1 opacity-60 transition-opacity duration-150
                 hover:opacity-100 focus-within:opacity-100 group-hover:opacity-100"
      style={{ boxShadow: SHADOW_DEFAULT }}
    >
      <button type="button" className={CTRL_BTN} onClick={() => onZoom(1 / ZOOM_STEP)}
              disabled={scale <= min + 0.001} aria-label="Zoom out" title="Zoom out (−)">
        <IconMinus />
      </button>

      {/* A polite live region rather than aria-hidden decoration: a keyboard user
          pressing +/- gets no other confirmation that anything happened. Screen
          readers coalesce rapid updates, so a wheel gesture announces once. */}
      <span
        className="min-w-[42px] text-center text-[11px] tabular-nums text-[#6B6965] select-none"
        style={FI}
        role="status"
        aria-live="polite"
        title="Zoom level"
      >
        {Math.round(scale * 100)}%
      </span>

      <button type="button" className={CTRL_BTN} onClick={() => onZoom(ZOOM_STEP)}
              disabled={scale >= max - 0.001} aria-label="Zoom in" title="Zoom in (+)">
        <IconPlus />
      </button>

      <span className="mx-0.5 h-4 w-px bg-[#E5E3DF]" aria-hidden="true" />

      <button type="button" className={CTRL_BTN} onClick={onFit}
              aria-label="Fit diagram to view" title="Fit to view (0)">
        <IconFit />
      </button>

      {onExpand && (
        <button type="button" className={CTRL_BTN} onClick={onExpand}
                aria-label="Expand diagram to fullscreen" title="Expand">
          <IconExpand />
        </button>
      )}
      {expanded && onClose && (
        <button type="button" className={CTRL_BTN} onClick={onClose}
                aria-label="Close fullscreen" title="Close (Esc)">
          <IconClose />
        </button>
      )}
    </div>
  );
}

// ── The canvas ───────────────────────────────────────────────────────────────

function ZoomableDiagram({
  srcDoc, kind, title, intrinsic, maxHeight, fill = false, expanded = false, onExpand, onClose, autoFocus = false,
}: {
  srcDoc: string;
  kind: ArtifactKind;
  title?: string;
  intrinsic: { w: number; h: number };
  maxHeight: number;
  fill?: boolean;
  expanded?: boolean;
  onExpand?: () => void;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const [wrapRef, wrapSize] = useElementSize<HTMLDivElement>();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);

  const geo = React.useMemo(
    () => computeGeometry(intrinsic, wrapSize.w, maxHeight, fill),
    [intrinsic, wrapSize.w, maxHeight, fill],
  );

  const minScale = Math.min(ZOOM_MIN, geo.fitScale);
  const viewportW = wrapSize.w;
  const viewportH = geo.viewportH;

  const [t, setT] = React.useState<Transform>(() => ({ s: geo.fitScale, x: 0, y: 0 }));
  // True once the user has zoomed or panned. It is what stops a resize from
  // yanking the view back to fit while someone is reading a corner of the
  // diagram — a resize re-clamps, it does not re-fit.
  const [touched, setTouched] = React.useState(false);
  const [smooth, setSmooth] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  // Re-fit on geometry change while untouched; otherwise just re-clamp.
  React.useEffect(() => {
    setT((prev) => clampPan(touched ? prev : { s: geo.fitScale, x: 0, y: 0 }, geo, viewportW, viewportH));
  }, [geo, viewportW, viewportH, touched]);

  React.useEffect(() => {
    if (autoFocus) viewportRef.current?.focus();
  }, [autoFocus]);

  const animate = React.useCallback((fn: () => void) => {
    if (!REDUCED_MOTION) setSmooth(true);
    fn();
  }, []);

  /** Zoom about a point in viewport coordinates, keeping that point fixed. */
  const zoomAt = React.useCallback((px: number, py: number, factor: number) => {
    setTouched(true);
    setT((prev) => {
      const s = clamp(prev.s * factor, minScale, ZOOM_MAX);
      const k = s / prev.s;
      if (k === 1) return prev;
      return clampPan(
        { s, x: px - (px - prev.x) * k, y: py - (py - prev.y) * k },
        geo, viewportW, viewportH,
      );
    });
  }, [geo, viewportW, viewportH, minScale]);

  const zoomCentre = React.useCallback((factor: number) => {
    animate(() => zoomAt(viewportW / 2, viewportH / 2, factor));
  }, [animate, zoomAt, viewportW, viewportH]);

  const fit = React.useCallback(() => {
    animate(() => {
      setTouched(false);
      setT(clampPan({ s: geo.fitScale, x: 0, y: 0 }, geo, viewportW, viewportH));
    });
  }, [animate, geo, viewportW, viewportH]);

  const panBy = React.useCallback((dx: number, dy: number) => {
    setTouched(true);
    setT((prev) => clampPan({ s: prev.s, x: prev.x + dx, y: prev.y + dy }, geo, viewportW, viewportH));
  }, [geo, viewportW, viewportH]);

  // ── Wheel ──────────────────────────────────────────────────────────────────
  // Ctrl/Cmd + wheel zooms; a plain wheel is left to the page.
  //
  // Two reasons, not one: a card in a long scrolling report must never trap the
  // scroll of someone passing it, and browsers already send ctrlKey with
  // trackpad pinch — so honouring the modifier gets pinch-to-zoom on laptops
  // for free rather than as a special case.
  //
  // Registered natively because React routes wheel through a passive root
  // listener, where preventDefault() is a no-op and the browser would zoom the
  // whole page instead.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setSmooth(false);
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.002));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ── Pointer: drag to pan, two-finger pinch to zoom ─────────────────────────
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<{ dist: number; mx: number; my: number } | null>(null);

  const scaledW = geo.contentW * t.s;
  const scaledH = geo.contentH * t.s;
  const canPan = scaledW > viewportW + 1 || scaledH > viewportH + 1;

  /** True for events originating on the controls overlay — see data-zoom-controls. */
  const onControls = (e: React.SyntheticEvent) =>
    !!(e.target as HTMLElement | null)?.closest?.('[data-zoom-controls]');

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (onControls(e)) return;
    const el = viewportRef.current;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el?.setPointerCapture(e.pointerId);
    setSmooth(false);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
    } else if (canPan) {
      setDragging(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const r = viewportRef.current!.getBoundingClientRect();
      // Pan by the midpoint drift as well as zooming, so a pinch that also
      // moves across the screen tracks the fingers instead of fighting them.
      panBy(mx - pinch.current.mx, my - pinch.current.my);
      if (pinch.current.dist > 0) zoomAt(mx - r.left, my - r.top, dist / pinch.current.dist);
      pinch.current = { dist, mx, my };
      return;
    }

    if (dragging) panBy(e.clientX - prev.x, e.clientY - prev.y);
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    // releasePointerCapture THROWS (InvalidPointerId) when this element never
    // captured the pointer — the normal case for a press that started on the
    // controls, since onPointerDown bails out before capturing there. The
    // uncaught DOMException fires inside React's handler and wedges the next
    // interaction, so the capture check is required, not defensive noise.
    const el = viewportRef.current;
    if (el?.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case '+': case '=': zoomCentre(ZOOM_STEP); break;
      case '-': case '_': zoomCentre(1 / ZOOM_STEP); break;
      case '0': fit(); break;
      case 'ArrowLeft':  setSmooth(false); panBy(KEY_PAN, 0); break;
      case 'ArrowRight': setSmooth(false); panBy(-KEY_PAN, 0); break;
      case 'ArrowUp':    setSmooth(false); panBy(0, KEY_PAN); break;
      case 'ArrowDown':  setSmooth(false); panBy(0, -KEY_PAN); break;
      default: return;
    }
    e.preventDefault();
  };

  // One finger scrolls the page while the diagram is at fit, and pans it once
  // zoomed in. Without the switch a touch user either cannot scroll past the
  // card or cannot pan a zoomed diagram — there is no single value that serves
  // both states.
  const touchAction = canPan ? 'none' : 'pan-y';

  return (
    <div ref={wrapRef} className="w-full group">
      <div
        ref={viewportRef}
        tabIndex={0}
        role="group"
        aria-label={`${title || 'Diagram'} — zoomable. Plus and minus zoom, arrow keys pan, zero fits to view.`}
        className="relative w-full overflow-hidden rounded-[8px] bg-transparent outline-none
                   focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1"
        style={{ height: viewportH, touchAction, cursor: dragging ? 'grabbing' : canPan ? 'grab' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={(e) => { if (!onControls(e)) fit(); }}
        onKeyDown={onKeyDown}
      >
        <SandboxFrame
          srcDoc={srcDoc}
          kind={kind}
          title={title}
          className="block border-0 origin-top-left"
          style={{
            width: geo.contentW,
            height: geo.contentH,
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
            transformOrigin: '0 0',
            // The frame is an opaque box: it must not eat the pointer events
            // this whole viewer is built on. Its content is a static SVG with
            // nothing to click, so nothing is lost.
            pointerEvents: 'none',
            willChange: 'transform',
            transition: smooth ? 'transform 140ms cubic-bezier(0.4,0,0.2,1)' : undefined,
            background: 'transparent',
          }}
        />
        <ZoomControls
          scale={t.s}
          min={minScale}
          max={ZOOM_MAX}
          onZoom={zoomCentre}
          onFit={fit}
          onExpand={onExpand}
          onClose={onClose}
          expanded={expanded}
        />
      </div>
    </div>
  );
}

// ── Fullscreen overlay ───────────────────────────────────────────────────────
// The same srcDoc string is handed to a second SandboxFrame. That re-parses an
// already-built static SVG document; it does NOT re-run mermaid.render(), which
// happened once in MermaidArtifact and produced this string.

function DiagramOverlay({
  srcDoc, kind, title, intrinsic, onClose,
}: {
  srcDoc: string;
  kind: ArtifactKind;
  title?: string;
  intrinsic: { w: number; h: number };
  onClose: () => void;
}) {
  const [boxRef, box] = useElementSize<HTMLDivElement>();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(2px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title} — fullscreen` : 'Diagram — fullscreen'}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="m-4 flex flex-1 min-h-0 flex-col overflow-hidden rounded-[12px] border border-[#E5E3DF] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5E3DF] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#1C1917] truncate" style={FB}>
            {title || 'Diagram'}
          </p>
          <button type="button" className={CTRL_BTN} onClick={onClose} aria-label="Close fullscreen" title="Close (Esc)">
            <IconClose />
          </button>
        </div>
        <div ref={boxRef} className="flex-1 min-h-0 p-2">
          {box.h > 0 && (
            <ZoomableDiagram
              srcDoc={srcDoc} kind={kind} title={title} intrinsic={intrinsic}
              maxHeight={Math.round(box.h)} fill expanded onClose={onClose} autoFocus
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface ArtifactShellProps {
  /** A complete srcdoc document from buildArtifactSrcDoc — never raw content. */
  srcDoc: string;
  kind: ArtifactKind;
  title?: string;
  caption?: string;
  explanation?: string;
  /** 'bare' renders the frame alone, without the surrounding card. */
  variant?: string;
  /**
   * Natural pixel size of the embedded vector, when the caller knows it.
   *
   * An iframe cannot size itself to its content, and this one is deliberately
   * cross-origin (`sandbox=""` with no allow-same-origin), so the parent can
   * never measure inside it. Without this the frame falls back to a fixed height
   * and any taller diagram is silently cut off — a real Mermaid flowchart came
   * out 1704px tall in a 380px frame, with 78% of it invisible.
   *
   * For `kind === 'mermaid'` it additionally drives the fit scale of the zoom
   * viewer, which is why that viewer degrades to a plain frame without it.
   */
  intrinsic?: { w: number; h: number };
}

export function ArtifactShell({
  srcDoc, kind, title, caption, explanation, variant, intrinsic,
}: ArtifactShellProps) {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [availWidth, setAvailWidth] = React.useState(0);
  const [expanded, setExpanded] = React.useState(false);

  const hasIntrinsic = !!intrinsic && intrinsic.w > 0 && intrinsic.h > 0;
  // Only mermaid opts in today: it is the kind that computes an intrinsic size
  // and the kind that produces genuinely oversized output. svg-artifact could
  // join once it measures its own payload; html-artifact should not — a
  // document that reflows wants scrolling, not a zoomable canvas.
  const zoomable = kind === 'mermaid' && hasIntrinsic;

  // Width is measured rather than assumed because the card is responsive and the
  // wrapper stylesheet scales the SVG down (never up) to fit. Height has to track
  // that same scale factor or the frame over- or under-shoots.
  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || zoomable) return;
    setAvailWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setAvailWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoomable]);

  const height = React.useMemo(() => {
    if (!hasIntrinsic) return FRAME_HEIGHT[kind];
    const usable = availWidth - FRAME_PADDING;
    const scale = usable > 0 ? Math.min(1, usable / intrinsic!.w) : 1;
    const wanted = intrinsic!.h * scale + FRAME_PADDING;
    return Math.round(Math.min(MAX_FRAME, Math.max(MIN_FRAME, wanted)));
  }, [intrinsic, hasIntrinsic, availWidth, kind]);

  const body = zoomable
    ? (
      <ZoomableDiagram
        srcDoc={srcDoc} kind={kind} title={title} intrinsic={intrinsic!}
        maxHeight={VIEWPORT_MAX} onExpand={() => setExpanded(true)}
      />
    )
    : (
      <SandboxFrame srcDoc={srcDoc} kind={kind} title={title} style={{ height, background: 'transparent' }} />
    );

  // The ref wraps the frame in BOTH variants — it is what the height calculation
  // measures, so it must not be conditional.
  const measured = <div ref={wrapRef} className="w-full">{body}</div>;

  const overlay = expanded && zoomable
    ? <DiagramOverlay srcDoc={srcDoc} kind={kind} title={title} intrinsic={intrinsic!} onClose={() => setExpanded(false)} />
    : null;

  if (variant === 'bare') return <>{measured}{overlay}</>;

  return (
    <div className={`${CARD_BASE} ${CARD_HOVER}`} style={{ boxShadow: SHADOW_DEFAULT }}>
      <div className="p-5">
        {title && <h4 className="text-[14px] font-semibold text-[#1C1917] mb-3 leading-snug" style={FB}>{title}</h4>}
        {explanation && <p className="text-[11px] text-[#8A8785] mb-4 leading-relaxed" style={FI}>{explanation}</p>}
        {measured}
        {caption && <p className="text-[11px] text-[#8A8785] mt-3 leading-relaxed" style={FI}>{caption}</p>}
      </div>
      {overlay}
    </div>
  );
}
